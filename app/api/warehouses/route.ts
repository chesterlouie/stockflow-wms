import { getSession } from "../../../lib/auth";
import { plans, type PlanId } from "../../../lib/billing";
import { withTenant } from "../../../lib/db";
import { warehouseSchema } from "../../../lib/validation";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.redirect(new URL("/signin", request.url), 303);
  if (!["owner", "admin"].includes(session.role)) return new Response("Forbidden", { status: 403 });
  const parsed = warehouseSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return Response.redirect(new URL("/app/setup?error=warehouse-invalid", request.url), 303);
  try {
    await withTenant(session.companyId, async (client) => {
      const company = (await client.query<{ subscription_plan: PlanId; warehouses: number }>(
        `SELECT c.subscription_plan,count(w.id)::int AS warehouses FROM companies c LEFT JOIN warehouses w ON w.company_id=c.id WHERE c.id=$1 GROUP BY c.id`,
        [session.companyId],
      )).rows[0];
      if (!company || !(company.subscription_plan in plans)) throw new Error("INVALID_PLAN");
      const limit = plans[company.subscription_plan].warehouseLimit;
      if (limit !== null && company.warehouses >= limit) throw new Error("WAREHOUSE_LIMIT");
      const warehouse = (await client.query<{ id: string }>(
        `INSERT INTO warehouses(company_id,code,name,timezone) VALUES($1,$2,$3,$4) RETURNING id`,
        [session.companyId, parsed.data.code, parsed.data.name, parsed.data.timezone],
      )).rows[0];
      await client.query(`INSERT INTO audit_logs(company_id,user_id,action,entity_type,entity_id,details) VALUES($1,$2,'warehouse_created','warehouse',$3,$4::jsonb)`, [session.companyId, session.userId, warehouse.id, JSON.stringify({ code: parsed.data.code, name: parsed.data.name })]);
    });
    return Response.redirect(new URL("/app/setup?warehouseCreated=1", request.url), 303);
  } catch (error) {
    const reason = error instanceof Error && error.message === "WAREHOUSE_LIMIT" ? "warehouse-limit" : typeof error === "object" && error !== null && "code" in error && error.code === "23505" ? "warehouse-duplicate" : "warehouse-invalid";
    return Response.redirect(new URL(`/app/setup?error=${reason}`, request.url), 303);
  }
}
