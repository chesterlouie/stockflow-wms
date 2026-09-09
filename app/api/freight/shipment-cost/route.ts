import { z } from 'zod';
import { getSession } from '../../../../lib/auth';
import { withTenant } from '../../../../lib/db';
import { assertWarehouseAccess } from '../../../../lib/warehouse-access';

const optionalAmount = z.preprocess(v => v === '' ? undefined : v, z.coerce.number().min(0).optional());
const schema = z.object({
  shipmentId:z.string().uuid(), rateCardId:z.string().uuid(), actualWeight:z.coerce.number().min(0),
  length:z.coerce.number().min(0), width:z.coerce.number().min(0), height:z.coerce.number().min(0),
  declaredValue:z.coerce.number().min(0), remote:z.string().optional(), cod:z.string().optional(),
  actualAmount:optionalAmount, invoiceReference:z.string().trim().max(100).optional(),
  overrideReason:z.string().trim().max(300).optional(),
});

export async function POST(request:Request){
  const session=await getSession();
  if(!session)return Response.redirect(new URL('/signin',request.url),303);
  if(!['owner','admin','manager'].includes(session.role))return new Response('Forbidden',{status:403});
  const parsed=schema.safeParse(Object.fromEntries(await request.formData()));
  if(!parsed.success)return Response.redirect(new URL('/app/freight?error=cost',request.url),303);
  try{
    await withTenant(session.companyId,async client=>{
      const d=parsed.data;
      const x=(await client.query(`SELECT sh.id,o.warehouse_id,rc.*,greatest($4,$5*$6*$7/rc.volumetric_divisor) chargeable
        FROM shipments sh JOIN sales_orders o ON o.id=sh.order_id
        JOIN carrier_rate_cards rc ON rc.company_id=sh.company_id AND rc.id=$3 AND rc.carrier_service_id=sh.carrier_service_id
        WHERE sh.company_id=$1 AND sh.id=$2 AND rc.active
        AND current_date BETWEEN rc.effective_from AND coalesce(rc.effective_to,current_date)`,
        [session.companyId,d.shipmentId,d.rateCardId,d.actualWeight,d.length,d.width,d.height])).rows[0];
      if(!x)throw new Error('rate_not_applicable');
      await assertWarehouseAccess(client,session,x.warehouse_id);
      const chargeable=Number(x.chargeable);
      if(chargeable<Number(x.minimum_weight_kg)||(x.maximum_weight_kg!==null&&chargeable>Number(x.maximum_weight_kg)))throw new Error('weight_band');
      const base=Number(x.base_charge)+Number(x.per_kg_charge)*chargeable;
      const surcharge=base*Number(x.fuel_surcharge_percent)/100+(d.remote?Number(x.remote_area_charge):0)+Number(x.handling_charge)+d.declaredValue*Number(x.insurance_percent)/100+(d.cod?d.declaredValue*Number(x.cod_percent)/100:0);
      const estimate=Math.round((base+surcharge)*100)/100,actual=d.actualAmount??null;
      if(actual!==null&&!d.invoiceReference)throw new Error('invoice');
      const threshold=Number((await client.query(`SELECT freight_variance_threshold_percent FROM companies WHERE id=$1`,[session.companyId])).rows[0].freight_variance_threshold_percent);
      const highVariance=actual!==null&&estimate>0&&Math.abs(actual-estimate)/estimate*100>threshold;
      if(highVariance&&!d.overrideReason)throw new Error('variance_reason');
      const cost=(await client.query(`INSERT INTO shipment_freight_costs(company_id,shipment_id,carrier_rate_card_id,currency,actual_weight_kg,volumetric_weight_kg,chargeable_weight_kg,base_amount,surcharge_amount,estimated_amount,actual_amount,carrier_invoice_reference,override_reason,calculated_by,actual_recorded_at,actual_recorded_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,CASE WHEN $11::numeric IS NOT NULL THEN now() END,CASE WHEN $11::numeric IS NOT NULL THEN $14::uuid END)
        ON CONFLICT(company_id,shipment_id) DO UPDATE SET carrier_rate_card_id=excluded.carrier_rate_card_id,actual_weight_kg=excluded.actual_weight_kg,volumetric_weight_kg=excluded.volumetric_weight_kg,chargeable_weight_kg=excluded.chargeable_weight_kg,base_amount=excluded.base_amount,surcharge_amount=excluded.surcharge_amount,estimated_amount=excluded.estimated_amount,actual_amount=excluded.actual_amount,carrier_invoice_reference=excluded.carrier_invoice_reference,override_reason=excluded.override_reason,actual_recorded_at=excluded.actual_recorded_at,actual_recorded_by=excluded.actual_recorded_by RETURNING id`,
        [session.companyId,d.shipmentId,d.rateCardId,x.currency,d.actualWeight,d.length*d.width*d.height/Number(x.volumetric_divisor),chargeable,base,surcharge,estimate,actual,d.invoiceReference||null,d.overrideReason||null,session.userId])).rows[0];
      await client.query(`DELETE FROM freight_cost_allocations WHERE shipment_freight_cost_id=$1`,[cost.id]);
      await client.query(`INSERT INTO freight_cost_allocations(company_id,shipment_freight_cost_id,order_line_id,item_id,allocated_amount,allocation_basis)
        SELECT $1,$2,l.id,l.item_id,round($3*l.shipped_quantity/nullif(sum(l.shipped_quantity)over(),0),2),'quantity'
        FROM sales_order_lines l JOIN shipments sh ON sh.order_id=l.order_id WHERE sh.id=$4`,[session.companyId,cost.id,actual??estimate,d.shipmentId]);
      if(highVariance)await client.query(`INSERT INTO operational_exceptions(company_id,domain,entity_type,entity_id,order_id,warehouse_id,store_id,category,severity,summary,recommended_action,sla_due_at)
        SELECT $1,'dispatch','freight_cost',$2,sh.order_id,o.warehouse_id,o.store_id,'freight_cost_variance','high',sh.shipment_no||' freight cost exceeded the configured variance.','Validate carrier invoice and approve or dispute the variance.',now()+interval '2 days'
        FROM shipments sh JOIN sales_orders o ON o.id=sh.order_id WHERE sh.id=$3
        ON CONFLICT(company_id,domain,entity_type,entity_id,category) WHERE status<>'resolved' DO UPDATE SET summary=excluded.summary,updated_at=now()`,[session.companyId,cost.id,d.shipmentId]);
    });
    return Response.redirect(new URL('/app/freight?savedCost=1',request.url),303);
  }catch(error){return Response.redirect(new URL(`/app/freight?error=${error instanceof Error?error.message:'cost'}`,request.url),303)}
}
