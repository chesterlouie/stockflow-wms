import {db} from '../../../lib/db';

export const dynamic='force-dynamic';
export const metadata={title:'Platform user access'};
type User={id:string;email:string;display_name:string;company:string;company_id:string;role:string;must_change_password:boolean;active_sessions:string};

export default async function PlatformUsers({searchParams}:{searchParams:Promise<{q?:string;error?:string}>}){
  const params=await searchParams;
  const term=(params.q||'').trim();
  const users=(await db().query<User>(`SELECT u.id,u.email,u.display_name,c.name AS company,c.id AS company_id,m.role,u.must_change_password,count(s.id) FILTER(WHERE s.expires_at>now())::text AS active_sessions FROM users u JOIN company_members m ON m.user_id=u.id JOIN companies c ON c.id=m.company_id LEFT JOIN auth_sessions s ON s.user_id=u.id AND s.company_id=c.id WHERE $1='' OR u.email ILIKE '%'||$1||'%' OR u.display_name ILIKE '%'||$1||'%' OR c.name ILIKE '%'||$1||'%' GROUP BY u.id,c.id,m.role ORDER BY c.name,u.display_name`,[term])).rows;
  return <div className="admin-content"><header className="admin-heading"><div><span className="eyebrow">Warevanta operator console</span><h1>User password recovery</h1><p>Generate a temporary password for any subscriber user during local testing or verified account recovery.</p></div><div className="admin-live"><i/> Restricted control</div></header>
    {params.error&&<div className="form-error">The password reset could not be completed.</div>}
    <section className="panel"><div className="knowledge-note"><strong>Security behavior:</strong> every reset signs the user out everywhere, requires a new password at the next sign-in, and creates a platform audit event. The temporary password is shown only once.</div>
      <form className="list-search" method="get"><input name="q" defaultValue={term} placeholder="Search user, email, or company"/><button className="button button-secondary">Search</button></form>
      <div className="admin-table-wrap"><table className="data-table"><thead><tr><th>User</th><th>Company</th><th>Role</th><th>Sessions</th><th>Password state</th><th>Control</th></tr></thead><tbody>{users.length?users.map(user=><tr key={`${user.company_id}-${user.id}`}><td><strong>{user.display_name}</strong><br/><small>{user.email}</small></td><td>{user.company}</td><td><span className="badge">{user.role}</span></td><td>{user.active_sessions}</td><td>{user.must_change_password?'Change required':'Normal'}</td><td><form method="post" action={`/api/admin/users/${user.id}/reset-password`}><input type="hidden" name="companyId" value={user.company_id}/><button className="signout-button" type="submit">Generate temporary password</button></form></td></tr>):<tr><td colSpan={6} className="empty-cell">No users match this search.</td></tr>}</tbody></table></div>
    </section>
  </div>;
}
