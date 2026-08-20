import {getSession} from '../../../../../lib/auth';
import {withTenant} from '../../../../../lib/db';
import {requestApproval} from '../../../../../lib/approvals';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const s=await getSession();if(!s)return Response.redirect(new URL('/signin',request.url),303);
  if(!['owner','admin','manager'].includes(s.role))return new Response('Forbidden',{status:403});
  const {id}=await params;
  try{let pending=false;await withTenant(s.companyId,async c=>{
    const count=(await c.query(`SELECT * FROM inventory_counts WHERE company_id=$1 AND id=$2 AND status='counted' FOR UPDATE`,[s.companyId,id])).rows[0];if(!count)throw new Error('INVALID');
    const lines=(await c.query(`SELECT * FROM inventory_count_lines WHERE company_id=$1 AND count_id=$2 FOR UPDATE`,[s.companyId,id])).rows;
    const variance=lines.reduce((n,l)=>n+Math.abs(Number(l.counted_quantity)-Number(l.system_quantity)),0);
    const approval=await requestApproval(c,{companyId:s.companyId,userId:s.userId,operationType:'count_variance',entityType:'inventory_count',entityId:id,metric:variance,payload:{}});
    if(approval){pending=true;return}
    for(const line of lines){const current=Number((await c.query(`SELECT coalesce(sum(quantity),0) AS q FROM inventory_ledger WHERE company_id=$1 AND item_id=$2 AND location_id=$3 AND lot_number IS NOT DISTINCT FROM $4 AND expiry_date IS NOT DISTINCT FROM $5::date`,[s.companyId,line.item_id,line.location_id,line.lot_number,line.expiry_date])).rows[0].q);if(current!==Number(line.system_quantity))throw new Error('STALE');const delta=Number(line.counted_quantity)-current;if(delta!==0)await c.query(`INSERT INTO inventory_ledger(company_id,warehouse_id,location_id,item_id,movement_type,quantity,uom,lot_number,expiry_date,reference_type,reference_id,created_by,transaction_group_id,reason_code,note) VALUES($1,$2,$3,$4,'count_adjustment',$5,$6,$7,$8,'inventory_count',$9,$10,$11,'COUNT_VARIANCE','Approved count variance')`,[s.companyId,count.warehouse_id,line.location_id,line.item_id,delta,line.uom,line.lot_number,line.expiry_date,id,s.userId,crypto.randomUUID()]);await c.query(`UPDATE inventory_count_lines SET status='approved' WHERE id=$1`,[line.id])}
    await c.query(`UPDATE inventory_counts SET status='approved',approved_at=now(),approved_by=$1 WHERE id=$2`,[s.userId,id]);
  });return Response.redirect(new URL(pending?'/app/approvals?requested=1':`/app/counts/${id}?approved=1`,request.url),303)}catch(e){const code=e instanceof Error&&e.message==='STALE'?'stale':'approve';return Response.redirect(new URL(`/app/counts/${id}?error=${code}`,request.url),303)}
}
