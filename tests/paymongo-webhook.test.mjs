import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import pg from "pg";

const secret = "whsec_warevanta_test_only";
process.env.PAYMONGO_WEBHOOK_SECRET = secret;
const admin = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await admin.connect();
const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const subscriptionId = `subs_warevanta_${stamp}`;
const eventId = `evt_warevanta_${stamp}`;
let companyId;

function signedRequest(payload, valid = true) {
  const raw = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", valid ? secret : "wrong-secret").update(`${timestamp}.${raw}`).digest("hex");
  return new Request("http://localhost/api/webhooks/paymongo", { method: "POST", headers: { "content-type": "application/json", "paymongo-signature": `t=${timestamp},te=${signature},li=` }, body: raw });
}

try {
  companyId = (await admin.query("INSERT INTO companies(name,slug,external_subscription_id,access_status,billing_access_suspended) VALUES($1,$2,$3,'frozen',true) RETURNING id", ["Billing Webhook Test", `billing-webhook-${stamp}`, subscriptionId])).rows[0].id;
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", stamp);
  const { default: worker } = await import(workerUrl.href);
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };

  await test("rejects a forged PayMongo webhook", async () => {
    const response = await worker.fetch(signedRequest({ data: { id: `${eventId}-forged`, attributes: { type: "subscription.updated", data: {} } } }, false), env, context);
    assert.equal(response.status, 401);
  });

  await test("activates billing and records a paid PayMongo invoice once", async () => {
    const payload = { data: { id: eventId, attributes: { type: "subscription.updated", livemode: false, data: { id: subscriptionId, type: "subscription", attributes: { status: "active", next_billing_schedule: "2026-09-19", latest_invoice: { id: `inv_${stamp}`, amount: 149000, currency: "PHP", status: "paid", due_date: "2026-08-19" } } } } } };
    const first = await worker.fetch(signedRequest(payload), env, context);
    assert.equal(first.status, 200);
    const second = await worker.fetch(signedRequest(payload), env, context);
    assert.equal(second.status, 200);
    const company = (await admin.query("SELECT subscription_status,access_status,billing_access_suspended,payment_failure_count FROM companies WHERE id=$1", [companyId])).rows[0];
    assert.deepEqual(company, { subscription_status: "active", access_status: "active", billing_access_suspended: false, payment_failure_count: 0 });
    const invoices = await admin.query("SELECT amount::text,status FROM billing_invoices WHERE company_id=$1", [companyId]);
    assert.equal(invoices.rowCount, 1);
    assert.deepEqual(invoices.rows[0], { amount: "1490.00", status: "paid" });
  });
} finally {
  if (companyId) await admin.query("DELETE FROM companies WHERE id=$1", [companyId]);
  await admin.query("DELETE FROM payment_webhook_events WHERE provider_event_id LIKE $1", [`evt_warevanta_${stamp}%`]);
  await admin.end();
}
