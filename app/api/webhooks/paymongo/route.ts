import { plans, type PlanId } from "../../../../lib/billing";
import { db, withTransaction } from "../../../../lib/db";
import { verifyPaymongoWebhook } from "../../../../lib/paymongo";

type EventPayload = {
  data?: {
    id?: string;
    attributes?: { type?: string; livemode?: boolean; data?: unknown };
  };
};

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function text(value: unknown) { return typeof value === "string" ? value : null; }

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!(await verifyPaymongoWebhook(rawBody, request.headers.get("paymongo-signature") || request.headers.get("x-paymongo-signature")))) {
    return Response.json({ received: false }, { status: 401 });
  }

  let payload: EventPayload;
  try { payload = JSON.parse(rawBody) as EventPayload; }
  catch { return Response.json({ received: false }, { status: 400 }); }
  const eventId = payload.data?.id;
  const eventType = payload.data?.attributes?.type;
  if (!eventId || !eventType) return Response.json({ received: false }, { status: 400 });

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawBody));
  const payloadHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const embedded = object(payload.data?.attributes?.data);
  const resource = object(embedded.data || embedded);
  const attributes = object(resource.attributes || resource);
  const subscription = object(attributes.subscription);
  const subscriptionId = text(resource.id) || text(subscription.id);
  if (!subscriptionId) {
    await db().query("INSERT INTO payment_webhook_events(provider_event_id,event_type,payload_hash,status,processed_at) VALUES($1,$2,$3,'ignored',now()) ON CONFLICT DO NOTHING", [eventId, eventType, payloadHash]);
    return Response.json({ received: true });
  }

  const company = (await db().query<{ id: string }>("SELECT id FROM companies WHERE external_subscription_id=$1", [subscriptionId])).rows[0];
  if (!company) {
    await db().query("INSERT INTO payment_webhook_events(provider_event_id,event_type,payload_hash,status,processed_at) VALUES($1,$2,$3,'ignored',now()) ON CONFLICT DO NOTHING", [eventId, eventType, payloadHash]);
    return Response.json({ received: true });
  }

  try {
    const processed = await withTransaction(async (client) => {
      const claimed = await client.query("INSERT INTO payment_webhook_events(provider_event_id,event_type,payload_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING provider_event_id", [eventId, eventType, payloadHash]);
      if (!claimed.rowCount) return false;
      await client.query("SELECT set_config('app.company_id',$1,true)", [company.id]);
      const latestChange = (await client.query<{ id: string; requested_plan: PlanId; billing_cycle: string }>("SELECT id,requested_plan,billing_cycle FROM subscription_change_requests WHERE company_id=$1 AND provider_checkout_id=$2 ORDER BY created_at DESC LIMIT 1", [company.id, subscriptionId])).rows[0];
      const resourceStatus = text(attributes.status) || text(subscription.status);
      const status = eventType === "subscription.past_due" || eventType === "subscription.invoice.payment_failed" ? "past_due" : eventType === "subscription.unpaid" ? "unpaid" : resourceStatus;

      if (status === "active" || eventType === "subscription.invoice.paid") {
        const maxUsers = latestChange ? plans[latestChange.requested_plan].users : null;
        await client.query(`UPDATE companies SET subscription_status='active',subscription_plan=COALESCE($2,subscription_plan),billing_cycle=COALESCE($3,billing_cycle),max_users=COALESCE($4,max_users),subscription_ends_at=COALESCE($5::date,subscription_ends_at),payment_failure_count=0,payment_grace_ends_at=NULL,access_status=CASE WHEN admin_access_frozen THEN 'frozen' ELSE 'active' END,billing_access_suspended=false,updated_at=now() WHERE id=$1`, [company.id, latestChange?.requested_plan || null, latestChange?.billing_cycle || null, maxUsers, text(attributes.next_billing_schedule)]);
        if (latestChange) await client.query("UPDATE subscription_change_requests SET status='completed',provider_status='active',updated_at=now() WHERE id=$1", [latestChange.id]);
      } else if (status === "past_due") {
        await client.query("UPDATE companies SET subscription_status='past_due',payment_failure_count=payment_failure_count+1,payment_grace_ends_at=COALESCE(payment_grace_ends_at,current_date+7),updated_at=now() WHERE id=$1", [company.id]);
      } else if (["unpaid", "incomplete_cancelled", "cancelled"].includes(status || "")) {
        await client.query("UPDATE companies SET subscription_status='cancelled',billing_access_suspended=true,access_status='frozen',subscription_ends_at=current_date,updated_at=now() WHERE id=$1", [company.id]);
      }

      const invoice = eventType.startsWith("subscription.invoice.") ? attributes : object(attributes.latest_invoice);
      const invoiceId = text(resource.id)?.startsWith("inv_") ? text(resource.id) : text(invoice.id);
      if (invoiceId) {
        const amount = Number(invoice.amount || 0) / 100;
        const invoiceStatus = text(invoice.status) || (eventType.endsWith(".paid") ? "paid" : eventType.endsWith("payment_failed") ? "open" : "draft");
        const allowedStatus = ["draft", "open", "paid", "void"].includes(invoiceStatus || "") ? invoiceStatus : "open";
        await client.query(`INSERT INTO billing_invoices(company_id,invoice_number,amount,currency,status,period_start,period_end,paid_at,provider_invoice_id,due_date) VALUES($1,$2,$3,$4,$5,current_date,COALESCE($6::date,current_date),CASE WHEN $5='paid' THEN now() END,$2,$6::date) ON CONFLICT(provider_invoice_id) WHERE provider_invoice_id IS NOT NULL DO UPDATE SET amount=excluded.amount,currency=excluded.currency,status=excluded.status,paid_at=COALESCE(billing_invoices.paid_at,excluded.paid_at),due_date=excluded.due_date`, [company.id, invoiceId, amount, text(invoice.currency) || "PHP", allowedStatus, text(invoice.due_date)]);
      }
      await client.query("UPDATE payment_webhook_events SET status='processed',processed_at=now() WHERE provider_event_id=$1", [eventId]);
      return true;
    });
    return Response.json({ received: true, duplicate: !processed });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Webhook processing failed";
    await db().query("UPDATE payment_webhook_events SET status='failed',error_message=$2,processed_at=now() WHERE provider_event_id=$1", [eventId, message]).catch(() => undefined);
    return Response.json({ received: false }, { status: 500 });
  }
}
