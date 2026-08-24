import { getSession } from "../../../lib/auth";
import { planAmount, planList as plans } from "../../../lib/billing";
import { tenantRows } from "../../../lib/db";

type Billing = { name: string; subscription_plan: string; subscription_status: string; subscription_ends_at: string | null; max_users: number; billing_email: string | null; billing_cycle: "monthly" | "annual"; users: string; external_subscription_id: string | null; payment_failure_count: number; payment_grace_ends_at: string | null };
type Invoice = { id: string; invoice_number: string; amount: string; currency: string; status: string; invoice_url: string | null; period_start: string | null; period_end: string | null; due_date: string | null; created_at: string };
type Change = { requested_plan: string; billing_cycle: string; created_at: string; checkout_url: string | null; provider_status: string | null; failure_reason: string | null };

export const metadata = { title: "Subscription & billing" };
export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ consultation?: string; pending?: string; cancelled?: string; error?: string }> }) {
  const session = await getSession();
  const params = await searchParams;
  const company = (session ? await tenantRows<Billing>(session.companyId, `SELECT c.name,c.subscription_plan,c.subscription_status,c.subscription_ends_at::text,c.max_users,c.billing_email,c.billing_cycle,c.external_subscription_id,c.payment_failure_count,c.payment_grace_ends_at::text,count(m.user_id)::text AS users FROM companies c LEFT JOIN company_members m ON m.company_id=c.id WHERE c.id=$1 GROUP BY c.id`, [session.companyId]) : [])[0];
  const invoices = session ? await tenantRows<Invoice>(session.companyId, "SELECT id,invoice_number,amount::text,currency,status,invoice_url,period_start::text,period_end::text,due_date::text,created_at::text FROM billing_invoices WHERE company_id=$1 ORDER BY created_at DESC LIMIT 20", [session.companyId]) : [];
  const pending = (session ? await tenantRows<Change>(session.companyId, "SELECT requested_plan,billing_cycle,created_at::text,checkout_url,provider_status,failure_reason FROM subscription_change_requests WHERE company_id=$1 AND status='pending_payment' ORDER BY created_at DESC LIMIT 1", [session.companyId]) : [])[0];
  const canManage = Boolean(session && ["owner", "admin"].includes(session.role));
  const providerReady = Boolean(process.env.PAYMONGO_SECRET_KEY && process.env.PAYMONGO_WEBHOOK_SECRET);
  const errorMessage = params.error === "provider_setup" ? "Online subscriptions are ready in Warevanta, but PayMongo activation and plan IDs must be configured before checkout can open." : params.error === "checkout" ? "PayMongo could not start checkout. No plan change was applied; please try again or contact support." : params.error === "cancel_failed" ? "The subscription could not be cancelled. Please try again or contact support." : params.error === "no_subscription" ? "There is no connected online subscription to cancel." : params.error ? "Please select a valid subscription plan." : null;

  return <div className="app-content billing-page">
    <div className="page-heading"><div><span className="eyebrow">Subscription & payment</span><h1>Billing that grows with your warehouse</h1><p>Review your plan, capacity, renewal details, and invoices.</p></div><span className={`subscription-state ${company?.subscription_status || "trial"}`}>{(company?.subscription_status || "trial").replace("_", " ")}</span></div>
    {params.consultation && <div className="success-banner">Enterprise consultation requested. A Warevanta representative can now follow up with your billing contact.</div>}
    {params.pending && <div className="success-banner">Your subscription was created and is waiting for PayMongo payment authorization.</div>}
    {params.cancelled && <div className="success-banner">The subscription has been cancelled and recurring billing has stopped.</div>}
    {errorMessage && <div className="form-error">{errorMessage}</div>}
    {!providerReady && <div className="pending-payment"><div><strong>PayMongo activation required</strong><small>The billing workflow is installed. Add test credentials and PayMongo plan IDs to enable secure checkout.</small></div><span className="badge warn">Setup</span></div>}
    {company?.subscription_status === "past_due" && <div className="form-error">Payment is past due. PayMongo will retry automatically. Update the payment method before {company.payment_grace_ends_at ? new Date(company.payment_grace_ends_at).toLocaleDateString() : "the grace period ends"} to avoid access suspension.</div>}

    <section className="billing-summary">
      <article><small>Current plan</small><strong>{company?.subscription_plan || "starter"}</strong><span>{company?.billing_cycle || "monthly"} billing</span></article>
      <article><small>User capacity</small><strong>{company?.users || 0} / {company?.max_users || 10}</strong><span>company users</span></article>
      <article><small>Subscription end</small><strong>{company?.subscription_ends_at ? new Date(company.subscription_ends_at).toLocaleDateString() : "Not scheduled"}</strong><span>{company?.subscription_ends_at ? "Access remains active through this date" : "Managed by subscription status"}</span></article>
      <article><small>Billing contact</small><strong className="billing-email">{company?.billing_email || session?.email}</strong><span>{company?.name}</span></article>
    </section>

    {pending && <section className="pending-payment"><div><strong>Payment pending for {pending.requested_plan} plan</strong><small>Requested {new Date(pending.created_at).toLocaleString()} · {pending.billing_cycle} billing{pending.provider_status ? ` · ${pending.provider_status.replaceAll("_", " ")}` : ""}</small></div>{pending.checkout_url ? <a className="button button-primary" href={pending.checkout_url}>Resume secure payment</a> : <span className="badge warn">Awaiting checkout</span>}</section>}

    <section className="pricing-heading"><div><h2>Choose the right plan</h2><p>Starter, Growth, and Business cost ₱1,200 per active user monthly. Annual billing includes two months at no additional cost.</p></div><div className="payment-safety">Card and wallet details are handled securely by PayMongo</div></section>
    <section className="plan-grid">{plans.map((plan) => { const isCurrent = company?.subscription_plan === plan.id && company?.subscription_status === "active"; return <article key={plan.id} className={`plan-card ${"featured" in plan && plan.featured ? "featured" : ""} ${isCurrent ? "current" : ""}`}>
      <div className="plan-card-top"><div><h3>{plan.name}</h3><p>{plan.detail}</p></div>{isCurrent && <span className="badge">Current</span>}</div>
      <div className="plan-price">{plan.price === null ? <strong>Let&apos;s talk</strong> : <><small>₱</small><strong>{plan.price.toLocaleString()}</strong><span>/ user / month</span></>}</div>
      <ul><li>{plan.users ? `Up to ${plan.users} users` : "Custom user capacity"}</li><li>{plan.warehouses}</li><li>Mobile barcode scanning</li><li>Inventory API access</li></ul>
      {canManage ? <form method="post" action="/api/billing/plan"><input type="hidden" name="plan" value={plan.id}/><label className="billing-cycle-label">Billing cycle<select name="cycle" defaultValue={company?.billing_cycle || "monthly"}><option value="monthly">Monthly{planAmount(plan.id, "monthly") ? ` · ₱${planAmount(plan.id, "monthly")?.toLocaleString()} per user` : ""}</option><option value="annual">Annual{planAmount(plan.id, "annual") ? ` · ₱${planAmount(plan.id, "annual")?.toLocaleString()} per user` : ""}</option></select></label><button className={`button ${"featured" in plan && plan.featured ? "button-primary" : "button-secondary"}`} type="submit" disabled={isCurrent}>{isCurrent ? "Current plan" : plan.id === "enterprise" ? "Request consultation" : "Continue to PayMongo"}</button></form> : <p className="form-note">Only company owners and administrators can change the plan.</p>}
    </article>})}</section>

    {canManage && company?.external_subscription_id && company.subscription_status !== "cancelled" && <section className="panel"><div className="panel-heading"><div><h2>Cancel subscription</h2><p>Cancellation stops recurring billing immediately and suspends the company workspace. Contact support before cancelling if inventory exports are still needed.</p></div><form method="post" action="/api/billing/cancel"><button className="button button-secondary" type="submit">Cancel recurring subscription</button></form></div></section>}

    <section className="panel billing-history"><div className="panel-heading"><div><h2>Billing history</h2><p>PayMongo invoices and payment outcomes appear here automatically.</p></div></div><div className="admin-table-wrap"><table className="data-table"><thead><tr><th>Invoice</th><th>Billing period</th><th>Amount</th><th>Status</th><th>Issued</th></tr></thead><tbody>{invoices.length ? invoices.map((invoice) => <tr key={invoice.id}><td>{invoice.invoice_url ? <a className="table-link" href={invoice.invoice_url} target="_blank" rel="noreferrer">{invoice.invoice_number}</a> : invoice.invoice_number}</td><td>{invoice.period_start || "—"} – {invoice.period_end || invoice.due_date || "—"}</td><td>{invoice.currency} {Number(invoice.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td><td><span className="badge">{invoice.status}</span></td><td>{new Date(invoice.created_at).toLocaleDateString()}</td></tr>) : <tr><td colSpan={5} className="empty-cell">No invoices yet.</td></tr>}</tbody></table></div></section>
  </div>;
}
