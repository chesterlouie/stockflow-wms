export const plans = {
  starter: { name: "Starter", monthly: 1490, users: 5, warehouses: "1 warehouse", detail: "Core receiving, inventory, picking, and counts." },
  growth: { name: "Growth", monthly: 4990, users: 25, warehouses: "5 warehouses", detail: "Advanced operations, reports, and ERP APIs.", featured: true },
  business: { name: "Business", monthly: 12990, users: 75, warehouses: "15 warehouses", detail: "Higher limits, priority support, and audit controls." },
  enterprise: { name: "Enterprise", monthly: null, users: null, warehouses: "Custom scale", detail: "Custom limits, onboarding, and service agreement." },
} as const;

export type PlanId = keyof typeof plans;
export type BillingCycle = "monthly" | "annual";
export const planList = Object.entries(plans).map(([id, plan]) => ({ id: id as PlanId, ...plan, price: plan.monthly }));

export function isPlanId(value: string): value is PlanId { return value in plans; }
export function planAmount(plan: PlanId, cycle: BillingCycle) {
  const monthly = plans[plan].monthly;
  return monthly === null ? null : cycle === "annual" ? monthly * 10 : monthly;
}
export function paymongoPlanId(plan: PlanId, cycle: BillingCycle) {
  return process.env[`PAYMONGO_PLAN_${plan.toUpperCase()}_${cycle.toUpperCase()}`];
}
