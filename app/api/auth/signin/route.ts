import { compare } from "bcryptjs";
import { createSession,sessionCookie } from "../../../../lib/auth";
import { db,withTenant } from "../../../../lib/db";
import { signinSchema } from "../../../../lib/validation";
import { hashToken, randomToken } from "../../../../lib/tokens";

export async function POST(request:Request){
  const parsed=signinSchema.safeParse(Object.fromEntries(await request.formData()));
  if(!parsed.success)return Response.redirect(new URL('/signin?error=invalid',request.url),303);
  const throttle=(await db().query<{blocked:boolean}>(`SELECT blocked_until>now() AS blocked FROM login_throttles WHERE email=$1`,[parsed.data.email])).rows[0];
  if(throttle?.blocked)return Response.redirect(new URL('/signin?error=locked',request.url),303);
  const user=(await db().query<{id:string;password_hash:string;company_id:string;role:string;must_change_password:boolean;email_verified_at:string|null;access_status:string;subscription_ends_at:string|null;is_platform_admin:boolean}>(`SELECT u.id,u.password_hash,u.must_change_password,u.email_verified_at::text,m.company_id,m.role,c.access_status,c.subscription_ends_at::text,EXISTS(SELECT 1 FROM platform_admins p WHERE p.user_id=u.id) AS is_platform_admin FROM users u JOIN company_members m ON m.user_id=u.id JOIN companies c ON c.id=m.company_id WHERE u.email=$1 ORDER BY m.role='owner' DESC LIMIT 1`,[parsed.data.email])).rows[0];
  if(!user||!(await compare(parsed.data.password,user.password_hash))){await db().query(`INSERT INTO login_throttles(email,failed_attempts) VALUES($1,1) ON CONFLICT(email) DO UPDATE SET failed_attempts=CASE WHEN login_throttles.first_failed_at<now()-interval '15 minutes' THEN 1 ELSE login_throttles.failed_attempts+1 END,first_failed_at=CASE WHEN login_throttles.first_failed_at<now()-interval '15 minutes' THEN now() ELSE login_throttles.first_failed_at END,blocked_until=CASE WHEN (CASE WHEN login_throttles.first_failed_at<now()-interval '15 minutes' THEN 1 ELSE login_throttles.failed_attempts+1 END)>=5 THEN now()+interval '15 minutes' ELSE NULL END`,[parsed.data.email]);return Response.redirect(new URL('/signin?error=credentials',request.url),303)}
  if(!user.email_verified_at)return Response.redirect(new URL('/verify-email-required',request.url),303);
  const accessEnded=user.subscription_ends_at&&Date.parse(user.subscription_ends_at)<Date.now();
  if((user.access_status==='frozen'||accessEnded)&&!user.is_platform_admin)return Response.redirect(new URL('/signin?error=company',request.url),303);
  await db().query(`DELETE FROM login_throttles WHERE email=$1`,[parsed.data.email]);
  const mfa=(await db().query<{enabled:boolean}>('SELECT enabled FROM user_mfa WHERE user_id=$1',[user.id])).rows[0];
  if(mfa?.enabled){const challenge=randomToken();await db().query(`INSERT INTO mfa_login_challenges(token_hash,user_id,company_id,expires_at) VALUES($1,$2,$3,now()+interval '5 minutes')`,[await hashToken(challenge),user.id,user.company_id]);return new Response(null,{status:303,headers:{Location:new URL('/two-factor',request.url).toString(),'Set-Cookie':`warevanta_mfa=${challenge}; Path=/; HttpOnly; SameSite=Strict; Max-Age=300${process.env.NODE_ENV==='production'?'; Secure':''}`}})}
  const token=await createSession({userId:user.id,companyId:user.company_id,email:parsed.data.email,role:user.role});
  await withTenant(user.company_id,c=>c.query(`INSERT INTO audit_logs(company_id,user_id,action,entity_type,entity_id) VALUES($1,$2,'signin','session',$3)`,[user.company_id,user.id,user.id]));
  const target=user.must_change_password?'/account/password':user.is_platform_admin?'/admin':'/app/dashboard';
  return new Response(null,{status:303,headers:{Location:new URL(target,request.url).toString(),'Set-Cookie':sessionCookie(token)}});
}
