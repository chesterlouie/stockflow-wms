import { getSession } from "../../../lib/auth";
import { withTenant } from "../../../lib/db";
import { hashToken, randomToken } from "../../../lib/tokens";
import { z } from "zod";

const schema=z.object({email:z.string().trim().toLowerCase().email().max(254),name:z.string().trim().min(2).max(120),role:z.enum(["admin","manager","operator","viewer"])});
export async function POST(request:Request){
  const s=await getSession();if(!s)return Response.redirect(new URL('/signin',request.url),303);if(!['owner','admin'].includes(s.role))return new Response('Forbidden',{status:403});
  const parsed=schema.safeParse(Object.fromEntries(await request.formData()));if(!parsed.success)return Response.redirect(new URL('/app/users?error=invalid',request.url),303);
  const token=randomToken();
  try{await withTenant(s.companyId,async c=>{
    await c.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[s.companyId]);
    const capacity=(await c.query(`SELECT c.max_users,(SELECT count(*)::int FROM company_members m WHERE m.company_id=c.id)+(SELECT count(*)::int FROM user_invitations i WHERE i.company_id=c.id AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()) AS reserved FROM companies c WHERE c.id=$1`,[s.companyId])).rows[0];
    if(!capacity||capacity.reserved>=capacity.max_users)throw new Error('LIMIT');
    if((await c.query('SELECT 1 FROM users WHERE email=$1',[parsed.data.email])).rowCount)throw new Error('EXISTS');
    const invite=(await c.query(`INSERT INTO user_invitations(company_id,email,display_name,role,token_hash,invited_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '72 hours') RETURNING id`,[s.companyId,parsed.data.email,parsed.data.name,parsed.data.role,await hashToken(token),s.userId])).rows[0];
    await c.query(`INSERT INTO audit_logs(company_id,user_id,action,entity_type,entity_id,details) VALUES($1,$2,'user_invitation_created','user_invitation',$3,$4::jsonb)`,[s.companyId,s.userId,invite.id,JSON.stringify({email:parsed.data.email,role:parsed.data.role,expiresInHours:72})]);
  });return Response.redirect(new URL(`/invite/${token}?created=1`,request.url),303)}catch(error){const code=error instanceof Error&&error.message==='LIMIT'?'limit':'exists';return Response.redirect(new URL(`/app/users?error=${code}`,request.url),303)}
}
