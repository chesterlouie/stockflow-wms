import Link from "next/link";
import { db } from "../../../lib/db";
import { hashToken } from "../../../lib/tokens";

export const dynamic = "force-dynamic";
export default async function Invite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string; created?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const invitation = (await db().query<{ email: string; display_name: string; company: string }>(`SELECT email,display_name,company FROM resolve_user_invitation($1)`, [await hashToken(token)])).rows[0];
  return <main className="auth-page"><section className="auth-brand-panel"><div className="brand"><span className="brand-mark">W</span><span>Warevanta</span></div><div className="auth-message"><h1>Join your warehouse team.</h1><p>Secure invitations expire after 72 hours and can only be used once.</p></div><small>Private company workspace</small></section><section className="auth-form-side"><div className="auth-card">{invitation ? <><h2>{query.created ? "Invitation ready" : "Accept invitation"}</h2>{query.created && <div className="success-banner">Copy this page address and send it securely to {invitation.email}. <Link href="/app/users">Return to users</Link></div>}<p>{invitation.display_name}, you were invited to <strong>{invitation.company}</strong> as {invitation.email}.</p>{query.error && <div className="form-error">This invitation is unavailable, or the passwords did not match the requirements.</div>}<form className="form-stack" method="post" action={`/api/invitations/${token}/accept`}><div className="field"><label>Password</label><input name="password" type="password" minLength={10} required /></div><div className="field"><label>Confirm password</label><input name="confirmPassword" type="password" minLength={10} required /></div><button className="button button-primary">Create my account</button></form></> : <><h2>Invitation unavailable</h2><p>This invitation has expired, was already used, or was revoked. Ask your company administrator for a new invitation.</p></>}</div></section></main>;
}
