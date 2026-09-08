import { getSession } from "../../../../../lib/auth";
import { withTenant } from "../../../../../lib/db";
import { requestSubstitutionApproval } from "../../../../../lib/approvals";
import { assertWarehouseAccess } from "../../../../../lib/warehouse-access";
import {splitVkitBackorder} from "../../../../../lib/vkit-backorders";

type Demand={itemId:string;quantity:number;method:string;kit:boolean};

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const s=await getSession();if(!s)return Response.redirect(new URL('/signin',request.url),303);
  const form=await request.formData(),allowPartial=form.get('allowPartial')==='1';
  const {id}=await params;
  let approvalId='';
  try{
    await withTenant(s.companyId,async c=>{
      const order=(await c.query(`SELECT * FROM sales_orders WHERE company_id=$1 AND id=$2 AND status='new' AND (store_id IS NULL OR (store_approval_status='approved' AND warehouse_review_status='accepted')) FOR UPDATE`,[s.companyId,id])).rows[0];
      if(!order)throw new Error('INVALID_ORDER');
      await assertWarehouseAccess(c,s,order.warehouse_id);
      const packing=(await c.query(`SELECT id FROM locations WHERE company_id=$1 AND warehouse_id=$2 AND type='packing' AND active=true ORDER BY code LIMIT 1`,[s.companyId,order.warehouse_id])).rows[0];
      if(!packing)throw new Error('NO_PACKING');
      const lines=(await c.query(`SELECT l.*,i.item_type,i.allocation_method,i.base_uom FROM sales_order_lines l JOIN items i ON i.company_id=l.company_id AND i.id=l.item_id WHERE l.company_id=$1 AND l.order_id=$2`,[s.companyId,id])).rows;
      for(const line of lines){
        if(line.item_type==='virtual_kit'&&allowPartial){const split=await splitVkitBackorder(c,{companyId:s.companyId,order,line,userId:s.userId});line.ordered_quantity=split.releaseQuantity}
        let demands:Demand[]=[{itemId:line.item_id,quantity:Number(line.ordered_quantity),method:line.allocation_method,kit:false}];
        if(line.item_type==='virtual_kit'){
          const components=(await c.query(`SELECT x.component_item_id,x.quantity,i.allocation_method FROM item_kit_components x JOIN items i ON i.company_id=x.company_id AND i.id=x.component_item_id WHERE x.company_id=$1 AND x.kit_item_id=$2 AND x.active AND NOT x.optional ORDER BY i.sku`,[s.companyId,line.item_id])).rows;
          if(!components.length)throw new Error('KIT_EMPTY');
          demands=components.map(x=>({itemId:x.component_item_id,quantity:Number(line.ordered_quantity)*Number(x.quantity),method:x.allocation_method,kit:true}));
        }
        for(const demand of demands){
          let remaining=demand.quantity;
          const substitutes=(await c.query(`SELECT r.target_item_id AS item_id,r.conversion_ratio,true AS substitute FROM item_relationships r JOIN items i ON i.company_id=r.company_id AND i.id=r.target_item_id AND i.status='active' WHERE r.company_id=$1 AND r.source_item_id=$2 AND r.relationship_type IN('substitute','reciprocal_substitute','superseded_by') AND r.active AND (NOT r.approval_required OR EXISTS(SELECT 1 FROM order_substitution_approvals osa WHERE osa.company_id=r.company_id AND osa.order_id=$3 AND osa.relationship_id=r.id)) AND (r.effective_from IS NULL OR r.effective_from<=current_date) AND (r.effective_to IS NULL OR r.effective_to>=current_date) ORDER BY CASE WHEN EXISTS(SELECT 1 FROM vkit_backorder_substitution_intents v WHERE v.company_id=r.company_id AND v.order_id=$3 AND v.relationship_id=r.id AND v.status='approved') THEN 0 ELSE 1 END,r.priority,r.created_at`,[s.companyId,demand.itemId,id])).rows;
          const candidates=[{item_id:demand.itemId,conversion_ratio:1,substitute:false},...substitutes];
          for(const candidate of candidates){
            if(remaining<=0)break;
            const ratio=Number(candidate.conversion_ratio);
            const lots=(await c.query(`SELECT a.location_id,a.lot_number,a.expiry_date,a.available_to_promise AS available FROM inventory_availability a JOIN locations loc ON loc.company_id=a.company_id AND loc.id=a.location_id WHERE a.company_id=$1 AND a.warehouse_id=$2 AND a.item_id=$3 AND a.stock_status='available' AND a.available_to_promise>0 AND loc.type IN('storage','picking') ORDER BY CASE WHEN $4='lifo' THEN a.expiry_date END DESC NULLS LAST,CASE WHEN $4<>'lifo' THEN a.expiry_date END ASC NULLS LAST`,[s.companyId,order.warehouse_id,candidate.item_id,demand.method])).rows;
            for(const lot of lots){
              if(remaining<=0)break;
              const actualQty=Math.min(remaining*ratio,Number(lot.available));
              const fulfilled=actualQty/ratio;
              const kind=candidate.substitute?(demand.kit?'kit_component_substitute':'substitute'):(demand.kit?'kit_component':'exact');
              const allocation=(await c.query(`INSERT INTO stock_allocations(company_id,order_line_id,location_id,lot_number,expiry_date,quantity,allocated_item_id,demand_item_id,demand_quantity,allocation_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[s.companyId,line.id,lot.location_id,lot.lot_number,lot.expiry_date,actualQty,candidate.item_id,demand.itemId,fulfilled,kind])).rows[0];
              const actualUom=(await c.query(`SELECT base_uom FROM items WHERE company_id=$1 AND id=$2`,[s.companyId,candidate.item_id])).rows[0].base_uom;
              await c.query(`INSERT INTO pick_tasks(company_id,allocation_id,item_id,from_location_id,to_location_id,quantity,uom,lot_number,expiry_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[s.companyId,allocation.id,candidate.item_id,lot.location_id,packing.id,actualQty,actualUom,lot.lot_number,lot.expiry_date]);
              remaining-=fulfilled;
            }
          }
          if(remaining>0.000001){
            const controlled=(await c.query(`SELECT r.id,r.target_item_id,r.conversion_ratio,source.sku AS requested_sku,target.sku AS substitute_sku FROM item_relationships r JOIN items source ON source.company_id=r.company_id AND source.id=r.source_item_id JOIN items target ON target.company_id=r.company_id AND target.id=r.target_item_id AND target.status='active' WHERE r.company_id=$1 AND r.source_item_id=$2 AND r.relationship_type IN('substitute','reciprocal_substitute','superseded_by') AND r.active AND r.approval_required AND (r.effective_from IS NULL OR r.effective_from<=current_date) AND (r.effective_to IS NULL OR r.effective_to>=current_date) AND (SELECT coalesce(sum(a.available_to_promise),0) FROM inventory_availability a WHERE a.company_id=r.company_id AND a.warehouse_id=$3 AND a.item_id=r.target_item_id AND a.stock_status='available') >= $4*r.conversion_ratio ORDER BY r.priority LIMIT 1`,[s.companyId,demand.itemId,order.warehouse_id,remaining])).rows[0];
            if(controlled){
              await c.query(`DELETE FROM pick_tasks WHERE allocation_id IN(SELECT a.id FROM stock_allocations a JOIN sales_order_lines ol ON ol.id=a.order_line_id WHERE ol.order_id=$1)`,[id]);
              await c.query(`DELETE FROM stock_allocations WHERE order_line_id IN(SELECT id FROM sales_order_lines WHERE order_id=$1)`,[id]);
              await c.query(`UPDATE sales_order_lines SET allocated_quantity=0 WHERE order_id=$1`,[id]);
              approvalId=await requestSubstitutionApproval(c,{companyId:s.companyId,userId:s.userId,orderId:id,relationshipId:controlled.id,quantity:remaining,payload:{requestedSku:controlled.requested_sku,substituteSku:controlled.substitute_sku,conversionRatio:controlled.conversion_ratio,requiredQuantity:remaining}});
              return;
            }
            throw new Error('INSUFFICIENT_STOCK');
          }
        }
        await c.query(`UPDATE sales_order_lines SET allocated_quantity=ordered_quantity WHERE id=$1`,[line.id]);
      }
      if(!approvalId){await c.query(`UPDATE vkit_backorder_substitution_intents SET status='applied',updated_at=now() WHERE company_id=$1 AND order_id=$2 AND status='approved'`,[s.companyId,id]);await c.query(`UPDATE sales_orders SET status='allocated',backorder_status=CASE WHEN parent_order_id IS NOT NULL THEN 'released' ELSE backorder_status END WHERE id=$1`,[id])}
    });
    return Response.redirect(new URL(approvalId?`/app/approvals?requested=${approvalId}`:`/app/orders/${id}?allocated=1`,request.url),303);
  }catch(e){const m=e instanceof Error?e.message:'';const code=m==='INSUFFICIENT_STOCK'?'stock':m==='KIT_EMPTY'?'kit':'allocate';return Response.redirect(new URL(`/app/orders/${id}?error=${code}`,request.url),303)}
}
