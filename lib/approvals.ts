import type {Client} from 'pg';

export async function requestApproval(c:Client,input:{companyId:string;userId:string;operationType:string;entityType:string;entityId:string;metric:number;payload:unknown}){
  const rule=(await c.query(`SELECT * FROM approval_rules WHERE company_id=$1 AND operation_type=$2 AND active=true AND (threshold_quantity IS NULL OR $3>=threshold_quantity) ORDER BY threshold_quantity DESC NULLS LAST LIMIT 1`,[input.companyId,input.operationType,Math.abs(input.metric)])).rows[0];
  if(!rule)return null;
  const request=(await c.query(`INSERT INTO approval_requests(company_id,rule_id,operation_type,entity_type,entity_id,metric_quantity,payload,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING id`,[input.companyId,rule.id,input.operationType,input.entityType,input.entityId,input.metric,JSON.stringify(input.payload),input.userId])).rows[0];
  await c.query(`INSERT INTO approval_notifications(company_id,request_id,user_id,message) SELECT $1,$2,m.user_id,$3 FROM company_members m JOIN approval_rule_steps rs ON rs.rule_id=$4 AND rs.step_no=1 AND rs.approver_role=m.role WHERE m.company_id=$1 ON CONFLICT DO NOTHING`,[input.companyId,request.id,`${input.operationType.replaceAll('_',' ')} requires approval`,rule.id]);
  await c.query(`INSERT INTO audit_logs(company_id,user_id,action,entity_type,entity_id,details) VALUES($1,$2,'approval_requested','approval_request',$3,$4::jsonb)`,[input.companyId,input.userId,request.id,JSON.stringify({operationType:input.operationType,entityId:input.entityId})]);
  return request.id;
}

export async function requestSubstitutionApproval(c:Client,input:{companyId:string;userId:string;orderId:string;relationshipId:string;quantity:number;payload:Record<string,unknown>}){
  let rule=(await c.query(`SELECT id FROM approval_rules WHERE company_id=$1 AND operation_type='item_substitution' AND active=true ORDER BY created_at LIMIT 1`,[input.companyId])).rows[0];
  if(!rule){
    rule=(await c.query(`INSERT INTO approval_rules(company_id,name,operation_type,required_steps,escalation_hours,created_by) VALUES($1,'Controlled item substitutions','item_substitution',1,4,$2) ON CONFLICT(company_id,name) DO UPDATE SET active=true RETURNING id`,[input.companyId,input.userId])).rows[0];
    const approver=(await c.query(`SELECT CASE WHEN EXISTS(SELECT 1 FROM company_members WHERE company_id=$1 AND role='manager') THEN 'manager' ELSE 'owner' END AS role`,[input.companyId])).rows[0].role;
    await c.query(`INSERT INTO approval_rule_steps(company_id,rule_id,step_no,approver_role) VALUES($1,$2,1,$3) ON CONFLICT(rule_id,step_no) DO NOTHING`,[input.companyId,rule.id,approver]);
  }
  const existing=(await c.query(`SELECT id FROM approval_requests WHERE company_id=$1 AND operation_type='item_substitution' AND entity_id=$2 AND status='pending'`,[input.companyId,input.orderId])).rows[0];
  if(existing)return existing.id;
  const payload={...input.payload,relationshipId:input.relationshipId,orderId:input.orderId};
  const request=(await c.query(`INSERT INTO approval_requests(company_id,rule_id,operation_type,entity_type,entity_id,metric_quantity,payload,requested_by) VALUES($1,$2,'item_substitution','sales_order',$3,$4,$5::jsonb,$6) RETURNING id`,[input.companyId,rule.id,input.orderId,input.quantity,JSON.stringify(payload),input.userId])).rows[0];
  await c.query(`INSERT INTO approval_notifications(company_id,request_id,user_id,message) SELECT $1,$2,m.user_id,'Item substitution requires approval' FROM company_members m JOIN approval_rule_steps s ON s.rule_id=$3 AND s.step_no=1 AND s.approver_role=m.role WHERE m.company_id=$1 ON CONFLICT DO NOTHING`,[input.companyId,request.id,rule.id]);
  await c.query(`INSERT INTO audit_logs(company_id,user_id,action,entity_type,entity_id,details) VALUES($1,$2,'approval_requested','approval_request',$3,$4::jsonb)`,[input.companyId,input.userId,request.id,JSON.stringify({operationType:'item_substitution',orderId:input.orderId,relationshipId:input.relationshipId})]);
  return request.id;
}
