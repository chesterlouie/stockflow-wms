import { hash } from "bcryptjs";
import { getSession } from "../../../lib/auth";
import { withTenant } from "../../../lib/db";

function temporaryPassword(){const b=crypto.getRandomValues(new Uint8Array(12));return `Sf!${Array.from(b,x=>x.toString(16).padStart(2,'0')).join('').slice(0,18)}aA1`}
export async function POST(request:Request){
  const s=await getSession();
  if(!s)return Response.redirect(new URL('/signin',request.url),303);
  if(!['owner','admin'].includes(s.role))return new Response('Forbidden',{status:403});
  const f=Object.fromEntries(await request.formData());
  const email=String(f.email||'').trim().toLowerCase(),name=String(f.name||'').trim(),role=['admin','manager','operator','viewer'].includes(String(f.role))?String(f.role):'operator';
  if(!email.includes('@')||name.length<2)return Response.redirect(new URL('/app/users?error=invalid',request.url),303);
  const password=temporaryPassword();
  try{
    await withTenant(s.companyId,async c=>{
      const capacity=(await c.query(`SELECT c.max_users,count(m.user_id)::int AS users FROM companies c LEFT JOIN company_members m ON m.company_id=c.id WHERE c.id=$1 GROUP BY c.id`,[s.companyId])).rows[0];
      if(!capacity||capacity.users>=capacity.max_users)throw new Error('LIMIT');
      const user=(await c.query(`INSERT INTO users(email,password_hash,display_name,must_change_password) VALUES($1,$2,$3,true) RETURNING id`,[email,await hash(password,12),name])).rows[0];
      await c.query(`INSERT INTO company_members(company_id,user_id,role) VALUES($1,$2,$3)`,[s.companyId,user.id,role]);
      await c.query(`INSERT INTO audit_logs(company_id,user_id,action,entity_type,entity_id,details) VALUES($1,$2,'user_invited','user',$3,$4)`,[s.companyId,s.userId,user.id,JSON.stringify({email,role})]);
    });
    return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>User invited</title><style>body{font-family:system-ui;background:#f4f7f5;padding:40px;color:#14231e}.card{max-width:700px;margin:auto;background:#fff;border:1px solid #dbe5e1;border-radius:12px;padding:28px}code{display:block;background:#e9f3ef;padding:16px;margin:16px 0;overflow-wrap:anywhere}a{color:#087f5b;font-weight:700}</style></head><body><main class="card"><h1>User access created</h1><p>Share this temporary password securely with <strong>${email}</strong>. It will not be displayed again.</p><code>${password}</code><p>They must change it at first sign-in.</p><a href="/app/users">Return to users</a></main></body></html>`,{headers:{'content-type':'text/html; charset=utf-8'}});
  }catch(error){
    const code=error instanceof Error&&error.message==='LIMIT'?'limit':'exists';
    return Response.redirect(new URL(`/app/users?error=${code}`,request.url),303);
  }
}
