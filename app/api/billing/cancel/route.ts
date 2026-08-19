import { getSession } from "../../../../lib/auth";
import { db, withTenant } from "../../../../lib/db";
import { cancelSubscription } from "../../../../lib/paymongo";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.redirect(new URL("/signin", request.url), 303);
  if (!["owner", "admin"].includes(session.role)) return new Response("Forbidden", { status: 403 });
  const company = (await db().query<{ external_subscription_id: string | null }>("SELECT external_subscription_id FROM companies WHERE id=$1", [session.companyId])).rows[0];
  if (!company?.external_subscription_id || !process.env.PAYMONGO_SECRET_KEY) return Response.redirect(new URL("/app/billing?error=no_subscription", request.url), 303);
  try {
    await cancelSubscription(company.external_subscription_id);
    await withTenant(session.companyId, async (client) => {
      await client.query("UPDATE companies SET subscription_status='cancelled',billing_access_suspended=true,access_status='frozen',subscription_ends_at=current_date,updated_at=now() WHERE id=$1", [session.companyId]);
      await client.query("INSERT INTO audit_logs(company_id,user_id,action,entity_type,entity_id,details) VALUES($1,$2,'subscription_cancelled','subscription',$1,$3::jsonb)", [session.companyId, session.userId, JSON.stringify({ provider: "paymongo" })]);
    });
    return Response.redirect(new URL("/app/billing?cancelled=1", request.url), 303);
  } catch {
    return Response.redirect(new URL("/app/billing?error=cancel_failed", request.url), 303);
  }
}
