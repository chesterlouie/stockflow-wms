import {hash} from 'bcryptjs';
import {getPlatformAdmin} from '../../../../../../lib/platform-admin';
import {withTransaction} from '../../../../../../lib/db';

function temporaryPassword(){const bytes=crypto.getRandomValues(new Uint8Array(12));return `Wv!${Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('').slice(0,18)}aA1`}
function escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const admin=await getPlatformAdmin();
  if(!admin)return new Response('Forbidden',{status:403});
  const {id}=await params;
  const form=await request.formData();
  const companyId=String(form.get('companyId')||'');
  const password=temporaryPassword();
  try{
    const target=await withTransaction(async client=>{
      const user=(await client.query<{email:string;company:string}>(`SELECT u.email,c.name AS company FROM users u JOIN company_members m ON m.user_id=u.id JOIN companies c ON c.id=m.company_id WHERE u.id=$1 AND c.id=$2 FOR UPDATE OF u`,[id,companyId])).rows[0];
      if(!user)throw new Error('NOT_FOUND');
      await client.query(`UPDATE users SET password_hash=$1,must_change_password=true WHERE id=$2`,[await hash(password,12),id]);
      await client.query(`DELETE FROM auth_sessions WHERE user_id=$1`,[id]);
      await client.query(`INSERT INTO platform_audit_logs(admin_user_id,company_id,action,details) VALUES($1,$2,'platform_user_password_reset',$3::jsonb)`,[admin.userId,companyId,JSON.stringify({targetUserId:id,targetEmail:user.email,sessionsRevoked:true,mustChangePassword:true})]);
      return user;
    });
    return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Temporary password</title><style>body{font-family:system-ui;background:#f4f7f5;padding:24px;color:#14231e}.card{max-width:700px;margin:auto;background:#fff;border:1px solid #dbe5e1;border-radius:12px;padding:28px}code{display:block;background:#e9f3ef;padding:16px;margin:16px 0;font-size:18px;overflow-wrap:anywhere}a{color:#087f5b;font-weight:700}</style></head><body><main class="card"><h1>Temporary password created</h1><p><strong>${escapeHtml(target.email)}</strong> · ${escapeHtml(target.company)}</p><code>${password}</code><p>Copy it now and share it securely. Existing sessions were revoked, and the user must choose a new password after signing in.</p><a href="/admin/users">Return to user recovery</a></main></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
  }catch{return Response.redirect(new URL('/admin/users?error=reset',request.url),303)}
}
