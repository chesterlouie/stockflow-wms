import { getSession } from "../../../../lib/auth";
import { type BillingCycle, isPlanId, paymongoPlanId } from "../../../../lib/billing";
import { db, withTenant } from "../../../../lib/db";
import { createCustomer, createSubscription, updateSubscriptionPlan } from "../../../../lib/paymongo";

function billingUrl(request: Request, query: string) { return new URL(`/app/billing?${query}`, request.url); }

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.redirect(new URL("/signin", request.url), 303);
  if (!["owner", "admin"].includes(session.role)) return new Response("Forbidden", { status: 403 });
  const form = Object.fromEntries(await request.formData());
  const plan = String(form.plan || "");
  const cycle: BillingCycle = form.cycle === "annual" ? "annual" : "monthly";
  if (!isPlanId(plan)) return Response.redirect(billingUrl(request, "error=plan"), 303);

  const requestId = await withTenant(session.companyId, async (client) => {
    await client.query("UPDATE subscription_change_requests SET status='cancelled',updated_at=now() WHERE company_id=$1 AND status='pending_payment'", [session.companyId]);
    const change = (await client.query<{ id: string }>("INSERT INTO subscription_change_requests(company_id,requested_plan,billing_cycle,requested_by) VALUES($1,$2,$3,$4) RETURNING id", [session.companyId, plan, cycle, session.userId])).rows[0];
    await client.query("INSERT INTO audit_logs(company_id,user_id,action,entity_type,entity_id,details) VALUES($1,$2,'subscription_change_requested','subscription',$3,$4::jsonb)", [session.companyId, session.userId, change.id, JSON.stringify({ plan, cycle, status: "pending_payment" })]);
    return change.id;
  });

  if (plan === "enterprise") return Response.redirect(billingUrl(request, "consultation=1"), 303);
  const providerPlanId = paymongoPlanId(plan, cycle);
  if (!process.env.PAYMONGO_SECRET_KEY || !providerPlanId) return Response.redirect(billingUrl(request, "error=provider_setup"), 303);

  try {
    const account = (await db().query<{ name: string; external_customer_id: string | null; external_subscription_id: string | null; subscription_status: string; display_name: string }>("SELECT c.name,c.external_customer_id,c.external_subscription_id,c.subscription_status,u.display_name FROM companies c JOIN users u ON u.id=$2 WHERE c.id=$1", [session.companyId, session.userId])).rows[0];
    let customerId = account.external_customer_id;
    if (!customerId) {
      const customer = await createCustomer({ email: session.email, name: account.display_name || account.name, companyId: session.companyId });
      customerId = customer.id;
      await db().query("UPDATE companies SET payment_provider='paymongo',external_customer_id=$2,updated_at=now() WHERE id=$1", [session.companyId, customerId]);
    }
    const subscription = account.external_subscription_id && ["active", "past_due"].includes(account.subscription_status)
      ? await updateSubscriptionPlan({ subscriptionId: account.external_subscription_id, planId: providerPlanId, requestId })
      : await createSubscription({ customerId, planId: providerPlanId, requestId, companyId: session.companyId });
    const checkoutUrl = subscription.attributes.setup_intent?.next_action_url || null;
    await withTenant(session.companyId, async (client) => {
      await client.query("UPDATE subscription_change_requests SET provider_checkout_id=$2,checkout_url=$3,provider_status=$4,updated_at=now() WHERE id=$1", [requestId, subscription.id, checkoutUrl, subscription.attributes.status]);
      await client.query("UPDATE companies SET payment_provider='paymongo',external_subscription_id=$2,billing_cycle=$3,updated_at=now() WHERE id=$1", [session.companyId, subscription.id, cycle]);
    });
    if (!checkoutUrl) return Response.redirect(billingUrl(request, "pending=1"), 303);
    return Response.redirect(checkoutUrl, 303);
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 300) : "Payment provider request failed";
    await withTenant(session.companyId, (client) => client.query("UPDATE subscription_change_requests SET status='failed',failure_reason=$2,updated_at=now() WHERE id=$1", [requestId, reason]));
    return Response.redirect(billingUrl(request, "error=checkout"), 303);
  }
}
