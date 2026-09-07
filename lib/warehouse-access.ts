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

export function warehouseAccessMessage(code:string){
  return code===WAREHOUSE_ACCESS_ERROR?'You are not assigned to this warehouse. Ask an Owner or Administrator to update Users and access.':null;
}
