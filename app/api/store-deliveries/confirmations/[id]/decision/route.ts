import { z } from 'zod';
import { getSession } from '../../../../../../lib/auth';
import { withTenant } from '../../../../../../lib/db';

const schema=z.object({decision:z.enum(['approved','rejected']),note:z.string().trim().min(2).max(500)});

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const session=await getSession();
  if(!session)return Response.redirect(new URL('/signin',request.url),303);
  const returnPath=['owner','admin','manager'].includes(session.role)?'/app/delivery-tracking':'/store-portal/deliveries';
  const{id}=await params,parsed=schema.safeParse(Object.fromEntries(await request.formData()));
  if(!parsed.success)return Response.redirect(new URL(`${returnPath}?error=decision`,request.url),303);
  try{
    await withTenant(session.companyId,async client=>{
      const confirmation=(await client.query(`SELECT dc.*,sh.shipment_no,o.warehouse_id FROM shipment_delivery_confirmations dc JOIN shipments sh ON sh.id=dc.shipment_id JOIN sales_orders o ON o.id=sh.order_id WHERE dc.company_id=$1 AND dc.id=$2 AND dc.status='pending_review' AND dc.submitted_by<>$4 AND ($3 IN('owner','admin') OR ($3='manager' AND EXISTS(SELECT 1 FROM user_warehouse_assignments w WHERE w.company_id=dc.company_id AND w.user_id=$4 AND w.warehouse_id=o.warehouse_id)) OR EXISTS(SELECT 1 FROM store_user_assignments a WHERE a.company_id=dc.company_id AND a.user_id=$4 AND a.store_id=dc.store_id AND a.store_role='store_manager')) FOR UPDATE OF dc`,[session.companyId,id,session.role,session.userId])).rows[0];
      if(!confirmation)throw new Error('authority');
      const next=parsed.data.decision==='approved'?'closed':'rejected';
      await client.query(`UPDATE shipment_delivery_confirmations SET status=$1,reviewed_by=$2,reviewed_at=now(),review_note=$3 WHERE id=$4`,[next,session.userId,parsed.data.note,id]);
      await client.query(`INSERT INTO shipment_delivery_confirmation_events(company_id,confirmation_id,event_type,from_status,to_status,note,created_by) VALUES($1,$2,$3,'pending_review',$4,$5,$6)`,[session.companyId,id,parsed.data.decision,next,parsed.data.note,session.userId]);
      await client.query(`INSERT INTO store_notifications(company_id,user_id,store_id,event_key,notification_type,title,message,link_path,entity_type,entity_id) VALUES($1,$2,$3,$4,$5,$6,$7,'/store-portal/deliveries','shipment_delivery_confirmation',$8) ON CONFLICT DO NOTHING`,[session.companyId,confirmation.submitted_by,confirmation.store_id,`delivery-confirmation:${id}:${next}`,parsed.data.decision,`Delivery confirmation ${parsed.data.decision}`,`${confirmation.shipment_no}: ${parsed.data.note}`,id]);
      await client.query(`INSERT INTO audit_logs(company_id,user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,'shipment_delivery_confirmation',$4,$5::jsonb)`,[session.companyId,session.userId,`shipment_delivery_confirmation_${parsed.data.decision}`,id,JSON.stringify({note:parsed.data.note})]);
    });
    return Response.redirect(new URL(`${returnPath}?updated=1`,request.url),303);
  }catch{return Response.redirect(new URL(`${returnPath}?error=decision`,request.url),303)}
}
