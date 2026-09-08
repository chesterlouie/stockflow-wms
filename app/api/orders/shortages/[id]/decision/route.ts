import {z} from "zod";
import {getSession} from "../../../../../../lib/auth";
import {withTenant} from "../../../../../../lib/db";
import {assertWarehouseAccess} from "../../../../../../lib/warehouse-access";

const schema=z.object({decision:z.enum(["accept","reject"]),note:z.string().trim().min(2).max(500),quantity:z.coerce.number().positive().optional(),supplierId:z.string().optional(),expectedDate:z.string().optional()});
async function reference(c:any,companyId:string,scopeId:string,type:string,prefix:string){const period=new Date().toISOString().slice(0,7).replace("-","");const values=[companyId,scopeId,type,period];let row=(await c.query(`UPDATE document_sequences SET next_value=next_value+1 WHERE company_id=$1 AND scope_id=$2 AND document_type=$3 AND period=$4 RETURNING next_value-1 issued`,values)).rows[0];if(!row)row=(await c.query(`INSERT INTO document_sequences(company_id,scope_id,document_type,period,next_value) VALUES($1,$2,$3,$4,2) RETURNING 1 issued`,values)).rows[0];return `${prefix}-${period}-${String(row.issued).padStart(6,"0")}`}

export async function POST(r:Request,{params}:{params:Promise<{id:string}>}){
 const s=await getSession();if(!s)return Response.redirect(new URL("/signin",r.url),303);if(!["owner","admin","manager"].includes(s.role))return new Response("Forbidden",{status:403});
 const{id}=await params,p=schema.safeParse(Object.fromEntries(await r.formData()));if(!p.success)return Response.redirect(new URL("/app/orders/shortage-sourcing?error=decision",r.url),303);
 try{await withTenant(s.companyId,async c=>{
  const x=(await c.query(`SELECT r.*,i.sku,o.order_no,o.store_id,o.created_by FROM shortage_sourcing_recommendations r JOIN items i ON i.company_id=r.company_id AND i.id=r.item_id JOIN sales_orders o ON o.company_id=r.company_id AND o.id=r.order_id WHERE r.company_id=$1 AND r.id=$2 AND r.status='pending' FOR UPDATE OF r`,[s.companyId,id])).rows[0];if(!x)throw new Error("state");await assertWarehouseAccess(c,s,x.warehouse_id);
  const quantity=p.data.quantity||Number(x.recommended_quantity);if(quantity>Number(x.shortage_quantity)||(x.recommended_action!=="purchase_order"&&quantity>Number(x.recommended_quantity)))throw new Error("quantity");
  if(p.data.decision==="reject"){await c.query(`UPDATE shortage_sourcing_recommendations SET status='rejected',reviewed_by=$1,reviewed_at=now(),review_note=$2,updated_at=now() WHERE id=$3`,[s.userId,p.data.note,id]);await c.query(`INSERT INTO audit_logs(company_id,user_id,action,entity_type,entity_id,details) VALUES($1,$2,'shortage_sourcing_rejected','shortage_sourcing_recommendation',$3,$4::jsonb)`,[s.companyId,s.userId,id,JSON.stringify({note:p.data.note})]);return}
  let documentType="",documentId:string|null=null,documentReference="";
  if(x.recommended_action==="purchase_order"){
   if(!p.data.supplierId)throw new Error("supplier");documentReference=await reference(c,s.companyId,x.warehouse_id,"sourcing_po","PO-SRC");
   const po=(await c.query(`INSERT INTO purchase_orders(company_id,warehouse_id,supplier_id,po_no,expected_date,created_by) SELECT $1,$2,s.id,$4,$5,$6 FROM suppliers s WHERE s.company_id=$1 AND s.id=$3 AND s.status='active' RETURNING id`,[s.companyId,x.warehouse_id,p.data.supplierId,documentReference,p.data.expectedDate||null,s.userId])).rows[0];if(!po)throw new Error("supplier");
   await c.query(`INSERT INTO purchase_order_lines(company_id,purchase_order_id,item_id,line_no,ordered_quantity,uom) VALUES($1,$2,$3,1,$4,$5)`,[s.companyId,po.id,x.item_id,quantity,x.uom]);documentType="purchase_order";documentId=po.id;
  }else if(x.recommended_action==="await_purchase_order"){
   const po=(await c.query(`SELECT po_no FROM purchase_orders WHERE company_id=$1 AND id=$2`,[s.companyId,x.source_purchase_order_id])).rows[0];if(!po)throw new Error("po");documentType="purchase_order";documentId=x.source_purchase_order_id;documentReference=po.po_no;
  }else{
   documentReference=await reference(c,s.companyId,x.warehouse_id,"shortage_transfer","STR");const transfer=(await c.query(`INSERT INTO shortage_supply_transfers(company_id,transfer_no,destination_warehouse_id,item_id,quantity,uom,source_type,source_warehouse_id,source_store_id,sourcing_recommendation_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,[s.companyId,documentReference,x.warehouse_id,x.item_id,quantity,x.uom,x.recommended_action==="store_transfer"?"store":"warehouse",x.source_warehouse_id,x.source_store_id,id,s.userId])).rows[0];documentType="shortage_supply_transfer";documentId=transfer.id;
  }
  await c.query(`UPDATE shortage_sourcing_recommendations SET status='converted',recommended_quantity=$1,reviewed_by=$2,reviewed_at=now(),review_note=$3,document_type=$4,document_id=$5,document_reference=$6,updated_at=now() WHERE id=$7`,[quantity,s.userId,p.data.note,documentType,documentId,documentReference,id]);
  await c.query(`INSERT INTO audit_logs(company_id,user_id,action,entity_type,entity_id,details) VALUES($1,$2,'shortage_sourcing_converted','shortage_sourcing_recommendation',$3,$4::jsonb)`,[s.companyId,s.userId,id,JSON.stringify({action:x.recommended_action,quantity,documentType,documentId,documentReference,note:p.data.note})]);
  if(x.store_id)await c.query(`INSERT INTO store_notifications(company_id,user_id,store_id,event_key,notification_type,title,message,entity_type,entity_id) SELECT $1,u.user_id,$2,'shortage-source:'||$3||':converted','approved','Supply action approved',$4,'sales_order',$5 FROM (SELECT $6::uuid user_id UNION SELECT a.user_id FROM store_user_assignments a WHERE a.company_id=$1 AND a.store_id=$2 AND a.store_role='store_manager')u ON CONFLICT DO NOTHING`,[s.companyId,x.store_id,id,`${x.order_no}: ${documentReference} was created for ${quantity} ${x.uom} of ${x.sku}.`,x.order_id,x.created_by]);
 });return Response.redirect(new URL(`/app/orders/shortage-sourcing?decided=${p.data.decision}`,r.url),303)}catch{return Response.redirect(new URL("/app/orders/shortage-sourcing?error=decision",r.url),303)}
}
