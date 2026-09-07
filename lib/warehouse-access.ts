import type {Client} from 'pg';
import type {Session} from './auth';

export const WAREHOUSE_ACCESS_ERROR='WAREHOUSE_ACCESS';

export async function assertWarehouseAccess(client:Client,session:Session,warehouseId:string){
  if(session.role==='owner')return;
  const allowed=await client.query(`SELECT 1 FROM user_warehouse_assignments WHERE company_id=$1 AND user_id=$2 AND warehouse_id=$3`,[session.companyId,session.userId,warehouseId]);
  if(!allowed.rowCount)throw new Error(WAREHOUSE_ACCESS_ERROR);
}

export async function assertLocationAccess(client:Client,session:Session,locationId:string){
  const location=(await client.query<{warehouse_id:string}>(`SELECT warehouse_id FROM locations WHERE company_id=$1 AND id=$2`,[session.companyId,locationId])).rows[0];
  if(!location)throw new Error(WAREHOUSE_ACCESS_ERROR);
  await assertWarehouseAccess(client,session,location.warehouse_id);
  return location.warehouse_id;
}

async function assertEntityWarehouseAccess(client:Client,session:Session,sql:string,id:string){
  const row=(await client.query<{warehouse_id:string}>(sql,[session.companyId,id])).rows[0];
  if(!row)throw new Error(WAREHOUSE_ACCESS_ERROR);
  await assertWarehouseAccess(client,session,row.warehouse_id);
}

export async function assertOrderAccess(client:Client,session:Session,orderId:string){
  await assertEntityWarehouseAccess(client,session,`SELECT warehouse_id FROM sales_orders WHERE company_id=$1 AND id=$2`,orderId);
}

export async function assertPickAccess(client:Client,session:Session,pickId:string){
  await assertEntityWarehouseAccess(client,session,`SELECT l.warehouse_id FROM pick_tasks p JOIN locations l ON l.company_id=p.company_id AND l.id=p.from_location_id WHERE p.company_id=$1 AND p.id=$2`,pickId);
}

export async function assertCartonAccess(client:Client,session:Session,cartonId:string){
  await assertEntityWarehouseAccess(client,session,`SELECT o.warehouse_id FROM packing_cartons pc JOIN sales_orders o ON o.company_id=pc.company_id AND o.id=pc.order_id WHERE pc.company_id=$1 AND pc.id=$2`,cartonId);
}

export async function assertShipmentAccess(client:Client,session:Session,shipmentId:string){
  await assertEntityWarehouseAccess(client,session,`SELECT o.warehouse_id FROM shipments sh JOIN sales_orders o ON o.company_id=sh.company_id AND o.id=sh.order_id WHERE sh.company_id=$1 AND sh.id=$2`,shipmentId);
}

export function warehouseAccessMessage(code:string){
  return code===WAREHOUSE_ACCESS_ERROR?'You are not assigned to this warehouse. Ask an Owner or Administrator to update Users and access.':null;
}
