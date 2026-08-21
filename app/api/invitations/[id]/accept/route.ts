import { hash } from "bcryptjs";
import { withTransaction } from "../../../../../lib/db";
import { hashToken } from "../../../../../lib/tokens";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: token } = await params;
  const form = Object.fromEntries(await request.formData());
  const password = String(form.password || "");
  if (password.length < 10 || password !== String(form.confirmPassword || "")) return Response.redirect(new URL(`/invite/${token}?error=password`, request.url), 303);
  try {
    await withTransaction(async (client) => {
      const invitation = (await client.query(`SELECT id,company_id,email,display_name,role FROM resolve_user_invitation($1)`, [await hashToken(token)])).rows[0];
      if (!invitation) throw new Error("INVALID");
      await client.query("SELECT set_config('app.company_id',$1,true)", [invitation.company_id]);
      const locked = (await client.query(`SELECT id FROM user_invitations WHERE id=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE`, [invitation.id])).rows[0];
      if (!locked) throw new Error("INVALID");
      await client.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE", [invitation.company_id]);
      const capacity = (await client.query(`SELECT c.max_users,count(m.user_id)::int AS users FROM companies c LEFT JOIN company_members m ON m.company_id=c.id WHERE c.id=$1 GROUP BY c.id`, [invitation.company_id])).rows[0];
      if (!capacity || capacity.users >= capacity.max_users) throw new Error("LIMIT");
      const user = (await client.query(`INSERT INTO users(email,password_hash,display_name,must_change_password,email_verified_at) VALUES($1,$2,$3,false,now()) RETURNING id`, [invitation.email, await hash(password, 12), invitation.display_name])).rows[0];
      await client.query("INSERT INTO company_members(company_id,user_id,role) VALUES($1,$2,$3)", [invitation.company_id, user.id, invitation.role]);
      await client.query("UPDATE user_invitations SET accepted_at=now() WHERE id=$1", [invitation.id]);
      await client.query(`INSERT INTO audit_logs(company_id,user_id,action,entity_type,entity_id,details) VALUES($1,$2,'user_invitation_accepted','user',$3,$4::jsonb)`, [invitation.company_id, user.id, String(user.id), JSON.stringify({ email: invitation.email, role: invitation.role })]);
    });
    return Response.redirect(new URL("/signin?invited=1", request.url), 303);
  } catch (error) {
    const code=error instanceof Error&&error.message==='LIMIT'?'limit':error instanceof Error&&error.message==='INVALID'?'unavailable':'system';
    return Response.redirect(new URL(`/invite/${token}?error=${code}`, request.url), 303);
  }
}
