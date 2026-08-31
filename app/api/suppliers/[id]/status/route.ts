import { getSession } from "../../../../../lib/auth";
import { withTenant } from "../../../../../lib/db";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.redirect(new URL("/signin", request.url), 303);
  if (!["owner", "admin", "manager"].includes(session.role)) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  try {
    await withTenant(session.companyId, async (client) => {
      const supplier = (await client.query<{ status: string }>(
        `UPDATE suppliers SET status=CASE WHEN status='active' THEN 'blocked' ELSE 'active' END WHERE company_id=$1 AND id=$2 RETURNING status`,
        [session.companyId, id],
      )).rows[0];
      if (!supplier) throw new Error("NOT_FOUND");
      await client.query(
        `INSERT INTO audit_logs(company_id,user_id,action,entity_type,entity_id,details) VALUES($1,$2,'supplier_status_changed','supplier',$3,$4::jsonb)`,
        [session.companyId, session.userId, id, JSON.stringify({ status: supplier.status })],
      );
    });
    return Response.redirect(new URL("/app/suppliers?updated=1", request.url), 303);
  } catch {
    return Response.redirect(new URL("/app/suppliers?error=status", request.url), 303);
  }
}
