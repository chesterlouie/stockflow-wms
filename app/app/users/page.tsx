import Link from "next/link";
import { getSession } from "../../../lib/auth";
import { plans, type PlanId } from "../../../lib/billing";
import { tenantRows } from "../../../lib/db";
import UserLimitPrompt from "../../components/UserLimitPrompt";

export const metadata = { title: "Users and access" };
export const dynamic = "force-dynamic";
type User = { id: string; email: string; display_name: string; role: string; must_change_password: boolean; email_verified_at: string | null; active_sessions: string };
type Invite = { id: string; email: string; display_name: string; role: string; expires_at: string; created_at: string };
type Audit = { action: string; entity_type: string; details: string | null; created_at: string; actor: string | null };
type Company = { subscription_plan: PlanId; max_users: number };

export default async function Users({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string }> }) {
  const session = await getSession();
  const params = await searchParams;
  const users = session ? await tenantRows<User>(session.companyId, `SELECT u.id,u.email,u.display_name,u.email_verified_at::text,m.role,u.must_change_password,count(a.id) FILTER(WHERE a.expires_at>now())::text AS active_sessions FROM company_members m JOIN users u ON u.id=m.user_id LEFT JOIN auth_sessions a ON a.company_id=m.company_id AND a.user_id=m.user_id WHERE m.company_id=$1 GROUP BY u.id,m.role ORDER BY m.role='owner' DESC,u.display_name`, [session.companyId]) : [];
  const invites = session ? await tenantRows<Invite>(session.companyId, `SELECT id,email,display_name,role,expires_at::text,created_at::text FROM user_invitations WHERE company_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL ORDER BY created_at DESC`, [session.companyId]) : [];
  const audit = session ? await tenantRows<Audit>(session.companyId, `SELECT a.action,a.entity_type,a.details::text,a.created_at::text,u.email AS actor FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id WHERE a.company_id=$1 ORDER BY a.created_at DESC LIMIT 30`, [session.companyId]) : [];
  const company = (session ? await tenantRows<Company>(session.companyId, "SELECT subscription_plan,max_users FROM companies WHERE id=$1", [session.companyId]) : [])[0];
  const plan = company && company.subscription_plan in plans ? plans[company.subscription_plan] : plans.starter;
  const limit = company?.max_users ?? plan.users ?? 3;
  const pending = invites.filter((invite) => Date.parse(invite.expires_at) > Date.now()).length;
  const used = users.length + pending;
  const atLimit = used >= limit;
  const canManage = Boolean(session && ["owner", "admin"].includes(session.role));
  const errorMessage = params.error === "limit" ? `${plan.name} allows ${limit} users. Active users and unexpired pending invitations currently reserve all available slots.` : params.error === "exists" ? "That email already belongs to an existing Warevanta user." : params.error ? "The invitation could not be completed. Check the entered details." : null;

  return <div className="app-content">
    <div className="page-heading"><div><h1>Users and access</h1><p>Manage warehouse roles, invitations, sessions, and security history.</p></div><Link className="button button-secondary" href="/app/billing">Review plan</Link></div>
    {params.updated && <div className="success-banner">The user or invitation was updated successfully.</div>}
    {errorMessage && <div className="form-error">{errorMessage}</div>}
    {atLimit && <div className="warehouse-limit-banner" role="alert"><div><strong>{plan.name} user limit reached</strong><span>{used} of {limit} slots reserved · {users.length} active user{users.length === 1 ? "" : "s"} · {pending} pending invitation{pending === 1 ? "" : "s"}.</span></div><Link href="/app/billing" className="button button-primary">Review upgrade options</Link></div>}
    <div className="form-layout">
      <section className="panel"><div className="panel-heading"><div><h2>Company users</h2><p>{used} of {limit} plan slots reserved</p></div><span className={`badge ${atLimit ? "warn" : ""}`}>{atLimit ? "Limit reached" : `${limit - used} available`}</span></div><table className="data-table"><thead><tr><th>User</th><th>Role</th><th>Email</th><th>Sessions</th><th>Actions</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.display_name}</strong><br /><small>{user.email}</small></td><td>{user.role === "owner" ? <span className="badge">Owner</span> : canManage ? <form method="post" action={`/api/users/${user.id}/role`}><select name="role" defaultValue={user.role}><option>admin</option><option>manager</option><option>operator</option><option>viewer</option></select><button className="signout-button">Save</button></form> : user.role}</td><td>{user.email_verified_at ? "Verified" : "Pending"}</td><td>{user.active_sessions}</td><td>{canManage && user.role !== "owner" && <form method="post" action={`/api/users/${user.id}/reset-password`}><button className="signout-button">Reset password</button></form>}</td></tr>)}</tbody></table></section>
      {canManage && <aside className="panel"><h2>Invite company user</h2><form className="form-stack compact-form" method="post" action="/api/users"><div className="field"><label>Full name</label><input name="name" required disabled={atLimit} /></div><div className="field"><label>Work email</label><input name="email" type="email" required disabled={atLimit} /></div><div className="field"><label>Role</label><select name="role" disabled={atLimit}><option value="operator">Operator</option><option value="viewer">Viewer</option><option value="manager">Manager</option><option value="admin">Administrator</option></select></div><p className="form-note">Warevanta sends a secure 72-hour invitation link. Pending, unexpired invitations reserve a plan user slot.</p>{atLimit ? <UserLimitPrompt planName={plan.name} used={used} limit={limit} pending={pending} /> : <button className="button button-primary">Send invitation</button>}</form></aside>}
    </div>
    {canManage && <section className="panel inventory-history"><h2>Pending invitations</h2><table className="data-table"><thead><tr><th>Invitee</th><th>Role</th><th>Status</th><th>Expires</th><th>Controls</th></tr></thead><tbody>{invites.length ? invites.map((invite) => <tr key={invite.id}><td><strong>{invite.display_name}</strong><br /><small>{invite.email}</small></td><td>{invite.role}</td><td>{Date.parse(invite.expires_at) > Date.now() ? "Pending · slot reserved" : "Expired · no slot"}</td><td>{new Date(invite.expires_at).toLocaleString()}</td><td><div className="inline-actions"><form method="post" action={`/api/invitations/${invite.id}/resend`}><button className="signout-button">Resend</button></form><form method="post" action={`/api/invitations/${invite.id}/revoke`}><button className="signout-button">Revoke</button></form></div></td></tr>) : <tr><td colSpan={5} className="empty-cell">No pending invitations.</td></tr>}</tbody></table></section>}
    <section className="panel inventory-history"><h2>Security audit history</h2><table className="data-table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>{audit.length ? audit.map((event, index) => <tr key={index}><td>{new Date(event.created_at).toLocaleString()}</td><td>{event.actor || "System"}</td><td>{event.action.replaceAll("_", " ")}</td><td>{event.entity_type}</td><td>{event.details || "—"}</td></tr>) : <tr><td colSpan={5} className="empty-cell">No security events yet.</td></tr>}</tbody></table></section>
  </div>;
}
