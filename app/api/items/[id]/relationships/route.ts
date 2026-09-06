import {getSession} from '../../../../../lib/auth';
import {withTenant} from '../../../../../lib/db';
import {itemRelationshipSchema} from '../../../../../lib/validation';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const session=await getSession();
  if(!session)return Response.redirect(new URL('/signin',request.url),303);
  if(!['owner','admin','manager'].includes(session.role))return new Response('Forbidden',{status:403});
  const {id}=await params;
  const parsed=itemRelationshipSchema.safeParse(Object.fromEntries(await request.formData()));
  if(!parsed.success||id===parsed.data?.targetItemId)return Response.redirect(new URL(`/app/items/${id}?error=relationship`,request.url),303);
  try{
    await withTenant(session.companyId,async client=>{
      const items=await client.query('SELECT id FROM items WHERE company_id=$1 AND id=ANY($2::uuid[]) AND status<>\'discontinued\'',[session.companyId,[id,parsed.data.targetItemId]]);
      if(items.rowCount!==2)throw new Error('INVALID_ITEMS');
      const values=[session.companyId,id,parsed.data.targetItemId,parsed.data.relationshipType,parsed.data.conversionRatio,parsed.data.priority,parsed.data.effectiveFrom||null,parsed.data.effectiveTo||null,Boolean(parsed.data.approvalRequired),parsed.data.notes||null];
      await client.query(`INSERT INTO item_relationships(company_id,source_item_id,target_item_id,relationship_type,conversion_ratio,priority,effective_from,effective_to,approval_required,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(company_id,source_item_id,target_item_id,relationship_type) DO UPDATE SET conversion_ratio=excluded.conversion_ratio,priority=excluded.priority,effective_from=excluded.effective_from,effective_to=excluded.effective_to,approval_required=excluded.approval_required,notes=excluded.notes,active=true`,values);
      if(parsed.data.relationshipType==='reciprocal_substitute')await client.query(`INSERT INTO item_relationships(company_id,source_item_id,target_item_id,relationship_type,conversion_ratio,priority,effective_from,effective_to,approval_required,notes) VALUES($1,$3,$2,$4,1/$5,$6,$7,$8,$9,$10) ON CONFLICT(company_id,source_item_id,target_item_id,relationship_type) DO UPDATE SET conversion_ratio=excluded.conversion_ratio,priority=excluded.priority,effective_from=excluded.effective_from,effective_to=excluded.effective_to,approval_required=excluded.approval_required,notes=excluded.notes,active=true`,values);
    });
    return Response.redirect(new URL(`/app/items/${id}?relationshipSaved=1`,request.url),303);
  }catch{return Response.redirect(new URL(`/app/items/${id}?error=relationship`,request.url),303)}
}
