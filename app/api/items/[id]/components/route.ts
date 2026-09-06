import {getSession} from '../../../../../lib/auth';
import {withTenant} from '../../../../../lib/db';
import {kitComponentSchema} from '../../../../../lib/validation';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const session=await getSession();
  if(!session)return Response.redirect(new URL('/signin',request.url),303);
  if(!['owner','admin','manager'].includes(session.role))return new Response('Forbidden',{status:403});
  const {id}=await params;
  const parsed=kitComponentSchema.safeParse(Object.fromEntries(await request.formData()));
  if(!parsed.success)return Response.redirect(new URL(`/app/items/${id}?error=component`,request.url),303);
  try{
    await withTenant(session.companyId,async client=>{
      const kit=(await client.query<{item_type:string}>('SELECT item_type FROM items WHERE company_id=$1 AND id=$2 AND status<>\'discontinued\'',[session.companyId,id])).rows[0];
      const component=(await client.query<{base_uom:string}>('SELECT base_uom FROM items WHERE company_id=$1 AND id=$2 AND status=\'active\'',[session.companyId,parsed.data.componentItemId])).rows[0];
      if(!kit||!['virtual_kit','stocked_kit'].includes(kit.item_type)||!component||component.base_uom!==parsed.data.uom||id===parsed.data.componentItemId)throw new Error('INVALID_COMPONENT');
      await client.query(`INSERT INTO item_kit_components(company_id,kit_item_id,component_item_id,quantity,uom,optional) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(company_id,kit_item_id,component_item_id) DO UPDATE SET quantity=excluded.quantity,uom=excluded.uom,optional=excluded.optional,active=true`,[session.companyId,id,parsed.data.componentItemId,parsed.data.quantity,parsed.data.uom,Boolean(parsed.data.optional)]);
    });
    return Response.redirect(new URL(`/app/items/${id}?componentSaved=1`,request.url),303);
  }catch{return Response.redirect(new URL(`/app/items/${id}?error=component`,request.url),303)}
}
