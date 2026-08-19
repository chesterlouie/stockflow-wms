const API_BASE = "https://api.paymongo.com/v1";

type Resource<T> = { id: string; type: string; attributes: T };
type ApiResponse<T> = { data: Resource<T>; errors?: Array<{ detail?: string }> };

function secretKey() {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) throw new Error("PAYMONGO_NOT_CONFIGURED");
  return key;
}

export function paymongoConfigured() {
  return Boolean(process.env.PAYMONGO_SECRET_KEY && process.env.PAYMONGO_WEBHOOK_SECRET);
}

export async function paymongoRequest<T>(path: string, init: RequestInit = {}, idempotencyKey?: string) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${btoa(`${secretKey()}:`)}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      ...init.headers,
    },
  });
  const body = await response.json() as ApiResponse<T>;
  if (!response.ok || !body.data) throw new Error(body.errors?.[0]?.detail || `PayMongo request failed (${response.status})`);
  return body.data;
}

export async function createCustomer(input: { email: string; name: string; companyId: string }) {
  const parts = input.name.trim().split(/\s+/);
  const firstName = parts.shift() || "Warehouse";
  const lastName = parts.join(" ") || "Administrator";
  return paymongoRequest<{ email: string }>("/customers", {
    method: "POST",
    body: JSON.stringify({ data: { attributes: { first_name: firstName, last_name: lastName, email: input.email, metadata: { warevanta_company_id: input.companyId } } } }),
  }, `warevanta-customer-${input.companyId}`);
}

export async function createSubscription(input: { customerId: string; planId: string; requestId: string; companyId: string }) {
  return paymongoRequest<{ status: string; setup_intent?: { next_action_url?: string }; latest_invoice?: { id: string; amount: number; currency: string; status: string; due_date?: string } }>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({ data: { attributes: { plan_id: input.planId, customer_id: input.customerId, metadata: { warevanta_company_id: input.companyId, warevanta_request_id: input.requestId } } } }),
  }, `warevanta-subscription-${input.requestId}`);
}

export async function updateSubscriptionPlan(input: { subscriptionId: string; planId: string; requestId: string }) {
  return paymongoRequest<{ status: string; plan?: { id: string } }>(`/subscriptions/${encodeURIComponent(input.subscriptionId)}/plan`, {
    method: "PUT",
    body: JSON.stringify({ data: { attributes: { plan_id: input.planId } } }),
  }, `warevanta-plan-change-${input.requestId}`);
}

export async function cancelSubscription(subscriptionId: string) {
  return paymongoRequest<{ status: string }>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "DELETE" });
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function verifyPaymongoWebhook(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  const parts = Object.fromEntries(signatureHeader.split(",").map((part) => part.trim().split("=", 2)));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts.t}.${rawBody}`));
  const expected = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [parts.te, parts.li].filter(Boolean).some((signature) => safeEqual(expected, signature));
}
