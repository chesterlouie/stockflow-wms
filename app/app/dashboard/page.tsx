import Link from "next/link";
import { getSession } from "../../../lib/auth";
import { tenantRows } from "../../../lib/db";
export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";
type Metrics = {
  units: string;
  skus: string;
  orders: string;
  open_counts: string;
  expiring: string;
  accuracy: string;
};
type Ops = {
  received: string;
  picked: string;
  shipped: string;
  adjusted: string;
};
type Activity = {
  movement_type: string;
  quantity: string;
  uom: string;
  sku: string;
  location: string;
  reference_id: string;
  occurred_at: string;
};
type Controls={pending_approvals:string;overdue_approvals:string;exceptions:string;ready_dispatch:string;counted:string;inbound:string};
export default async function Dashboard() {
  const s = await getSession();
  const m = (s
    ? await tenantRows<Metrics>(
        s.companyId,
        `SELECT (SELECT coalesce(sum(quantity),0)::text FROM inventory_balances WHERE company_id=$1) AS units,(SELECT count(DISTINCT item_id)::text FROM inventory_balances WHERE company_id=$1 AND quantity>0) AS skus,(SELECT count(*)::text FROM sales_orders WHERE company_id=$1 AND status<>'dispatched') AS orders,(SELECT count(*)::text FROM inventory_counts WHERE company_id=$1 AND status IN('open','counted')) AS open_counts,(SELECT count(*)::text FROM inventory_balances WHERE company_id=$1 AND expiry_date<=current_date+30) AS expiring,(SELECT coalesce(round(100-100*sum(abs(counted_quantity-system_quantity))/nullif(sum(abs(system_quantity)),0),1),100)::text FROM inventory_count_lines WHERE company_id=$1 AND status='approved') AS accuracy`,
        [s.companyId],
      )
    : [])[0] || {
    units: "0",
    skus: "0",
    orders: "0",
    open_counts: "0",
    expiring: "0",
    accuracy: "100",
  };
  const o = (s
    ? await tenantRows<Ops>(
        s.companyId,
        `SELECT coalesce(sum(quantity) FILTER(WHERE movement_type IN('receipt','inspection_accepted','inspection_hold','inspection_damaged')),0)::text AS received,coalesce(sum(quantity) FILTER(WHERE movement_type='pick_in'),0)::text AS picked,coalesce(-sum(quantity) FILTER(WHERE movement_type='shipment_issue'),0)::text AS shipped,coalesce(sum(abs(quantity)) FILTER(WHERE movement_type IN('adjustment','count_adjustment')),0)::text AS adjusted FROM inventory_ledger WHERE company_id=$1 AND occurred_at>=current_date`,
        [s.companyId],
      )
    : [])[0] || { received: "0", picked: "0", shipped: "0", adjusted: "0" };
  const activities = s
    ? await tenantRows<Activity>(
        s.companyId,
        `SELECT m.movement_type,m.quantity::text,m.uom,i.sku,l.code AS location,m.reference_id,m.occurred_at::text FROM inventory_ledger m JOIN items i ON i.id=m.item_id JOIN locations l ON l.id=m.location_id WHERE m.company_id=$1 ORDER BY m.occurred_at DESC LIMIT 4`,
        [s.companyId],
      )
    : [];
  const controls=(s?await tenantRows<Controls>(s.companyId,`SELECT (SELECT count(*)::text FROM approval_requests WHERE company_id=$1 AND status='pending') pending_approvals,(SELECT count(*)::text FROM approval_requests q JOIN approval_rules r ON r.id=q.rule_id WHERE q.company_id=$1 AND q.status='pending' AND q.requested_at+(r.escalation_hours||' hours')::interval<now()) overdue_approvals,(SELECT count(*)::text FROM fulfillment_exceptions WHERE company_id=$1 AND status='open') exceptions,(SELECT count(*)::text FROM sales_orders WHERE company_id=$1 AND status='packed') ready_dispatch,(SELECT count(*)::text FROM inventory_counts WHERE company_id=$1 AND status='counted') counted,(SELECT count(*)::text FROM inbound_receipts WHERE company_id=$1 AND status IN('expected','partial','inspected','putaway')) inbound`,[s.companyId]):[])[0]||{pending_approvals:'0',overdue_approvals:'0',exceptions:'0',ready_dispatch:'0',counted:'0',inbound:'0'};
  const attention=Number(m.expiring)+Number(controls.overdue_approvals)+Number(controls.exceptions)+Number(controls.counted);
  const max = Math.max(
    Number(o.received),
    Number(o.picked),
    Number(o.shipped),
    Number(o.adjusted),
    1,
  );
  const bars = [
    ["Received", o.received],
    ["Picked", o.picked],
    ["Shipped", o.shipped],
    ["Adjusted", o.adjusted],
  ];
  return (
    <div className="app-content dashboard-page">
      <div className="page-heading dashboard-welcome">
        <div>
          <h1>Warehouse overview</h1>
          <p>Live operations and inventory health for your company space.</p>
        </div>
      </div>
      <section className="attention-banner">
        <span className="attention-icon">!</span>
        <div>
          <strong>{attention} items need attention</strong>
          <small>
            {controls.overdue_approvals} overdue approvals, {controls.exceptions} fulfillment exceptions, {controls.counted} counts awaiting approval, and {m.expiring} expiring lots.
          </small>
        </div>
        <Link href={Number(controls.overdue_approvals)?'/app/approvals':Number(controls.exceptions)?'/app/exceptions':'/app/counts'}>Review items →</Link>
      </section>
      <div className="warehouse-kpis">
        <article className="warehouse-kpi">
          <div className="kpi-top">
            <span>Units on hand</span>
            <i>↗</i>
          </div>
          <strong>{Number(m.units).toLocaleString()}</strong>
          <small>Across all active locations</small>
        </article>
        <article className="warehouse-kpi">
          <div className="kpi-top">
            <span>SKUs in stock</span>
            <i>▦</i>
          </div>
          <strong>{Number(m.skus).toLocaleString()}</strong>
          <small>Distinct stocked products</small>
        </article>
        <article className="warehouse-kpi">
          <div className="kpi-top">
            <span>Orders to fulfill</span>
            <i className="warm">↗</i>
          </div>
          <strong>{m.orders}</strong>
          <small>
            <em>Awaiting dispatch</em>
          </small>
        </article>
        <article className="warehouse-kpi">
          <div className="kpi-top">
            <span>Stock accuracy</span>
            <i>◎</i>
          </div>
          <strong>{m.accuracy}%</strong>
          <small>Based on approved counts</small>
          <div className="kpi-progress">
            <span
              style={{
                width: `${Math.max(0, Math.min(100, Number(m.accuracy)))}%`,
              }}
            />
          </div>
        </article>
      </div>
      <section className="warehouse-panel dashboard-controls"><div className="panel-heading"><div><h2>Operational control center</h2><p>Live queues requiring warehouse action</p></div><Link href="/app/approvals">Approval inbox →</Link></div><div className="quick-grid"><Link href="/app/approvals"><strong>{controls.pending_approvals} pending approvals</strong><small>{controls.overdue_approvals} overdue</small></Link><Link href="/app/exceptions"><strong>{controls.exceptions} fulfillment exceptions</strong><small>Short picks and controlled orders</small></Link><Link href="/app/counts"><strong>{controls.counted} counts awaiting approval</strong><small>{m.open_counts} total active counts</small></Link><Link href="/app/dispatch/mobile"><strong>{controls.ready_dispatch} orders ready to dispatch</strong><small>Packed and ready for carrier handoff</small></Link><Link href="/app/receiving"><strong>{controls.inbound} inbound receipts</strong><small>Expected through putaway</small></Link><Link href="/app/reports?type=expiry"><strong>{m.expiring} expiring balances</strong><small>Within the next 30 days</small></Link></div></section>
      <div className="operations-layout">
        <section className="warehouse-panel operations-panel">
          <div className="panel-heading">
            <div>
              <h2>Today's operations</h2>
              <p>Live warehouse activity</p>
            </div>
          </div>
          <div className="operation-bars">
            {bars.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{Number(value).toLocaleString()}</strong>
                <i>
                  <b
                    className={label === "Adjusted" ? "amber" : ""}
                    style={{
                      width: `${Math.max(3, (Number(value) / max) * 100)}%`,
                    }}
                  />
                </i>
                <small>units</small>
              </div>
            ))}
          </div>
        </section>
        <section className="warehouse-panel">
          <div className="panel-heading">
            <div>
              <h2>Quick actions</h2>
              <p>Common warehouse tasks</p>
            </div>
          </div>
          <div className="warehouse-actions">
            <Link href="/app/receiving">
              <i>↓</i>
              <strong>Receive</strong>
              <small>Inbound stock</small>
            </Link>
            <Link href="/app/orders">
              <i>↗</i>
              <strong>Pick order</strong>
              <small>Fulfill order</small>
            </Link>
            <Link href="/app/counts">
              <i>◎</i>
              <strong>Start count</strong>
              <small>Verify stock</small>
            </Link>
            <Link href="/app/approvals">
              <i>✓</i>
              <strong>Approvals</strong>
              <small>{controls.pending_approvals} pending</small>
            </Link>
          </div>
        </section>
      </div>
      <section className="warehouse-panel activity-panel">
        <div className="panel-heading">
          <div>
            <h2>Recent activity</h2>
            <p>Latest movements across the warehouse</p>
          </div>
          <Link href="/app/reports?type=movements">View all →</Link>
        </div>
        {activities.length ? (
          activities.map((a) => (
            <div
              className="activity-row"
              key={`${a.occurred_at}-${a.reference_id}-${a.location}`}
            >
              <i>⇄</i>
              <span>
                <strong>{a.movement_type.replaceAll("_", " ")}</strong>
                <small>
                  {a.sku} · {a.location} · {a.reference_id}
                </small>
              </span>
              <b>
                {Number(a.quantity) > 0 ? "+" : ""}
                {a.quantity} {a.uom}
              </b>
              <time>
                {new Date(a.occurred_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          ))
        ) : (
          <div className="empty-cell">No warehouse activity yet.</div>
        )}
      </section>
    </div>
  );
}
