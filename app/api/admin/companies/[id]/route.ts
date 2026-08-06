import { getPlatformAdmin } from "../../../../../lib/platform-admin";
import { withTransaction } from "../../../../../lib/db";

const statuses=new Set(['trial','active','past_due','cancelled']);
const plans=new Set(['starter','growth','business','enterprise']);
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const admin=await getPlatformAdmin();
  if(!admin)return new Response('Forbidden',{status:403});
  const {id}=await params,f=Object.fromEntries(await request.formData());
  const accessStatus=f.accessStatus==='frozen'?'frozen':'active',subscriptionStatus=String(f.subscriptionStatus),subscriptionPlan=String(f.subscriptionPlan),maxUsers=Number(f.maxUsers),subscriptionEndsAt=String(f.subscriptionEndsAt||''),adminNotes=String(f.adminNotes||'').trim().slice(0,500);
  if(!statuses.has(subscriptionStatus)||!plans.has(subscriptionPlan)||!Number.isInteger(maxUsers)||maxUsers<1||maxUsers>10000)return Response.redirect(new URL('/admin?error=invalid',request.url),303);
  try{await withTransaction(async client=>{const before=(await client.query(`SELECT access_status,subscription_status,subscription_plan,max_users,subscription_ends_at,admin_notes FROM companies WHERE id=$1 FOR UPDATE`,[id])).rows[0];if(!before)throw new Error('NOT_FOUND');await client.query(`UPDATE companies SET access_status=$1,subscription_status=$2,subscription_plan=$3,max_users=$4,subscription_ends_at=$5::date,admin_notes=$6,updated_at=now() WHERE id=$7`,[accessStatus,subscriptionStatus,subscriptionPlan,maxUsers,subscriptionEndsAt||null,adminNotes||null,id]);if(accessStatus==='frozen')await client.query(`DELETE FROM auth_sessions WHERE company_id=$1 AND user_id NOT IN(SELECT user_id FROM platform_admins)`,[id]);await client.query(`INSERT INTO platform_audit_logs(admin_user_id,company_id,action,details) VALUES($1,$2,'company_controls_updated',$3::jsonb)`,[admin.userId,id,JSON.stringify({before,after:{accessStatus,subscriptionStatus,subscriptionPlan,maxUsers,subscriptionEndsAt:subscriptionEndsAt||null,adminNotes:adminNotes||null}})])});return Response.redirect(new URL('/admin?saved=1',request.url),303)}catch{return Response.redirect(new URL('/admin?error=save',request.url),303)}
}
