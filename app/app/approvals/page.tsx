import { getSession } from "../../../lib/auth";
import { tenantRows } from "../../../lib/db";
export const dynamic = "force-dynamic";
type Q = {
  id: string;
  operation_type: string;
  entity_id: string;
  metric_quantity: string | null;
  status: string;
  current_step: string;
  requested_at: string;
  requester: string;
  approver_role: string;
  rule_name: string;
  escalation_hours: string;
  overdue:boolean;
  can_approve:boolean;
};
type Rule = {
  id: string;
  name: string;
  operation_type: string;
  required_steps: string;
  active: boolean;
};
type User={id:string;display_name:string;role:string};
type Delegation={id:string;delegator:string;delegate:string;starts_at:string;ends_at:string};
type Notification={id:string;message:string;created_at:string};
export default async function Approvals() {
  const s = await getSession();
  const rows = s
    ? await tenantRows<Q>(
        s.companyId,
        `SELECT q.id,q.operation_type,q.entity_id,q.metric_quantity::text,q.status,q.current_step::text,q.requested_at::text,u.display_name requester,rs.approver_role,r.name rule_name,r.escalation_hours::text,(q.status='pending' AND q.requested_at+(r.escalation_hours||' hours')::interval<now()) overdue,(rs.approver_role=$3 OR EXISTS(SELECT 1 FROM approval_delegations d JOIN company_members dm ON dm.company_id=d.company_id AND dm.user_id=d.delegator_id WHERE d.company_id=q.company_id AND d.delegate_id=$2 AND d.active=true AND now() BETWEEN d.starts_at AND d.ends_at AND dm.role=rs.approver_role)) can_approve FROM approval_requests q JOIN approval_rules r ON r.id=q.rule_id JOIN approval_rule_steps rs ON rs.rule_id=r.id AND rs.step_no=q.current_step LEFT JOIN users u ON u.id=q.requested_by WHERE q.company_id=$1 ORDER BY q.status='pending' DESC,q.requested_at`,
        [s.companyId,s.userId,s.role],
      )
    : [];
  const rules = s
    ? await tenantRows<Rule>(
        s.companyId,
        `SELECT id,name,operation_type,required_steps::text,active FROM approval_rules WHERE company_id=$1 ORDER BY name`,
        [s.companyId],
      )
    : [];
  const admin = Boolean(s && ["owner", "admin"].includes(s.role));
  const users=s?await tenantRows<User>(s.companyId,`SELECT u.id,u.display_name,m.role FROM company_members m JOIN users u ON u.id=m.user_id WHERE m.company_id=$1 AND u.id<>$2 ORDER BY u.display_name`,[s.companyId,s.userId]):[];
  const delegations=s?await tenantRows<Delegation>(s.companyId,`SELECT d.id,a.display_name delegator,b.display_name delegate,d.starts_at::text,d.ends_at::text FROM approval_delegations d JOIN users a ON a.id=d.delegator_id JOIN users b ON b.id=d.delegate_id WHERE d.company_id=$1 AND d.active=true AND d.ends_at>now() AND (d.delegator_id=$2 OR $3 IN('owner','admin')) ORDER BY d.starts_at`,[s.companyId,s.userId,s.role]):[];
  const notifications=s?await tenantRows<Notification>(s.companyId,`SELECT id,message,created_at::text FROM approval_notifications WHERE company_id=$1 AND user_id=$2 AND read_at IS NULL ORDER BY created_at DESC`,[s.companyId,s.userId]):[];
  return (
    <div className="app-content">
      <div className="page-heading">
        <div>
          <h1>Approval workflows</h1>
          <p>
            Risk-based requests, multi-step decisions, and complete audit
            history.
          </p>
        </div>
      </div>
      {notifications.length>0&&<section className="attention-banner"><span className="attention-icon">!</span><div><strong>{notifications.length} approval notification{notifications.length===1?'':'s'}</strong><small>{notifications[0].message}</small></div><form method="post" action="/api/approvals/notifications/read"><button className="signout-button">Mark all read</button></form></section>}
      <div className="form-layout">
        <section className="panel">
          <h2>Approval inbox</h2>
          {rows.length ? (
            rows.map((q) => (
              <article className="pick-card exception-card" key={q.id}>
                <div>
                  <span className={`badge ${q.overdue?'warn':''}`}>{q.overdue?'overdue':q.status}</span>
                  <strong>
                    {q.operation_type.replaceAll("_", " ")} · {q.entity_id}
                  </strong>
                  <small>
                    {q.rule_name} · Step {q.current_step} ·{" "}
                    {q.requester || "User"}
                  </small>
                  <small>
                    {q.metric_quantity && `Quantity ${q.metric_quantity} · `}
                    {new Date(q.requested_at).toLocaleString()}
                  </small>
                </div>
                {q.status === "pending" && q.can_approve && (
                  <form
                    className="form-stack compact-form"
                    method="post"
                    action={`/api/approvals/${q.id}/decision`}
                  >
                    <input
                      name="comment"
                      placeholder="Required for rejection or correction"
                    />
                    <div className="form-row">
                      <button
                        name="decision"
                        value="approved"
                        className="button button-primary"
                      >
                        Approve
                      </button>
                      <button
                        name="decision"
                        value="returned"
                        className="button button-secondary"
                      >
                        Return
                      </button>
                      <button
                        name="decision"
                        value="rejected"
                        className="button button-secondary"
                      >
                        Reject
                      </button>
                    </div>
                  </form>
                )}
              </article>
            ))
          ) : (
            <p className="empty-cell">No approval requests.</p>
          )}
        </section>
        {admin && (
          <aside className="panel">
            <h2>Create approval rule</h2>
            <form
              className="form-stack"
              method="post"
              action="/api/approvals/rules"
            >
              <input
                name="name"
                placeholder="Large adjustment approval"
                required
              />
              <select name="operationType">
                <option value="inventory_adjustment">
                  Inventory adjustment
                </option>
                <option value="count_variance">Count variance</option>
                <option value="order_cancel">Order cancellation</option>
                <option value="order_reopen">Order reopening</option>
                <option value="dispatch_reversal">Dispatch reversal</option>
                <option value="return_reversal">Return reversal</option>
                <option value="forecast_replenishment">
                  Forecast replenishment
                </option>
                <option value="purchase_order_release">
                  Purchase order release
                </option>
              </select>
              <input
                name="thresholdQuantity"
                type="number"
                min="0"
                step="any"
                placeholder="Quantity threshold (optional)"
              />
              <select name="requiredSteps" defaultValue="1">
                <option value="1">1 approval step</option>
                <option value="2">2 approval steps</option>
              </select>
              <select name="step1Role">
                <option value="manager">Manager</option>
                <option value="admin">Administrator</option>
                <option value="owner">Owner</option>
              </select>
              <select name="step2Role">
                <option value="owner">Owner</option>
                <option value="admin">Administrator</option>
              </select>
              <input
                name="escalationHours"
                type="number"
                min="1"
                max="720"
                defaultValue="24"
              />
              <button className="button button-primary">Create rule</button>
            </form>
            <h2>Active rules</h2>
            {rules.map((r) => (
              <div className="task" key={r.id}>
                <span>
                  <strong>{r.name}</strong>
                  <small>
                    {r.operation_type.replaceAll("_", " ")} · {r.required_steps}{" "}
                    step(s)
                  </small>
                </span>
              </div>
            ))}
            <h2>Delegate my approvals</h2>
            <form className="form-stack" method="post" action="/api/approvals/delegations"><select name="delegateId" required>{users.map(u=><option key={u.id} value={u.id}>{u.display_name} · {u.role}</option>)}</select><div className="field"><label>Starts</label><input name="startsAt" type="datetime-local" required/></div><div className="field"><label>Ends</label><input name="endsAt" type="datetime-local" required/></div><button className="button button-secondary" disabled={!users.length}>Create delegation</button></form>
            <h2>Active delegations</h2>{delegations.length?delegations.map(d=><div className="task" key={d.id}><span><strong>{d.delegator} → {d.delegate}</strong><small>{new Date(d.starts_at).toLocaleString()} – {new Date(d.ends_at).toLocaleString()}</small></span><form method="post" action={`/api/approvals/delegations/${d.id}/revoke`}><button className="signout-button">Revoke</button></form></div>):<p className="empty-cell">No active delegations.</p>}
          </aside>
        )}
      </div>
    </div>
  );
}
