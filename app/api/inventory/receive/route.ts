import { getSession } from "../../../../lib/auth";
import { withTenant } from "../../../../lib/db";
import { receiptSchema } from "../../../../lib/validation";

export async function POST(request:Request){
  const session=await getSession(); if(!session)return Response.redirect(new URL('/signin',request.url),303);
  if(!['owner','admin','manager','operator'].includes(session.role))return new Response('Forbidden',{status:403});
  const parsed=receiptSchema.safeParse(Object.fromEntries(await request.formData()));
  if(!parsed.success)return Response.redirect(new URL('/app/receiving?error=invalid',request.url),303);
  try{await withTenant(session.companyId,async client=>{
    const valid=await client.query(`SELECT 1 FROM warehouses w JOIN locations l ON l.company_id=w.company_id AND l.warehouse_id=w.id JOIN items i ON i.company_id=w.company_id WHERE w.company_id=$1 AND w.id=$2 AND l.id=$3 AND i.id=$4`,[session.companyId,parsed.data.warehouseId,parsed.data.locationId,parsed.data.itemId]);
    if(!valid.rowCount)throw new Error('INVALID_SCOPE');
    await client.query(`INSERT INTO inventory_ledger(company_id,warehouse_id,location_id,item_id,movement_type,quantity,uom,lot_number,expiry_date,reference_type,reference_id,created_by) VALUES($1,$2,$3,$4,'receipt',$5,$6,$7,$8,'manual_receipt',$9,$10)`,[session.companyId,parsed.data.warehouseId,parsed.data.locationId,parsed.data.itemId,parsed.data.quantity,parsed.data.uom,parsed.data.lotNumber||null,parsed.data.expiryDate||null,parsed.data.referenceId,session.userId]);
  });return Response.redirect(new URL('/app/inventory?received=1',request.url),303)}catch{return Response.redirect(new URL('/app/receiving?error=scope',request.url),303)}
}
