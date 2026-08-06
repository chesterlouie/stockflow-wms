import { getSession } from "../../../lib/auth";
import { withTenant } from "../../../lib/db";
import { locationSchema } from "../../../lib/validation";

export async function POST(request:Request){
  const session=await getSession(); if(!session)return Response.redirect(new URL('/signin',request.url),303);
  if(!['owner','admin','manager'].includes(session.role))return new Response('Forbidden',{status:403});
  const parsed=locationSchema.safeParse(Object.fromEntries(await request.formData()));
  if(!parsed.success)return Response.redirect(new URL('/app/setup?error=invalid',request.url),303);
  try{await withTenant(session.companyId,async client=>{await client.query(`INSERT INTO locations(company_id,warehouse_id,code,type) VALUES($1,$2,$3,$4)`,[session.companyId,parsed.data.warehouseId,parsed.data.code,parsed.data.type])});return Response.redirect(new URL('/app/setup?created=1',request.url),303)}catch{return Response.redirect(new URL('/app/setup?error=duplicate',request.url),303)}
}
