import { getSession } from "../../../../../lib/auth";
import { withTenant } from "../../../../../lib/db";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.redirect(new URL("/signin", request.url), 303);
  if (!["owner", "admin", "manager"].includes(session.role)) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  try {
    await withTenant(session.companyId, async (client) => {
      const category = (await client.query<{ active: boolean }>(
        `UPDATE item_categories SET active=NOT active,updated_at=now() WHERE company_id=$1 AND id=$2 RETURNING active`,
        [session.companyId, id],
      )).rows[0];
      if (!category) throw new Error("NOT_FOUND");
      await client.query(
        `INSERT INTO audit_logs(company_id,user_id,action,entity_type,entity_id,details) VALUES($1,$2,'category_status_changed','item_category',$3,$4::jsonb)`,
        [session.companyId, session.userId, id, JSON.stringify({ active: category.active })],
      );
    });
    return Response.redirect(new URL("/app/categories?updated=1", request.url), 303);
  } catch {
    return Response.redirect(new URL("/app/categories?error=status", request.url), 303);
  }
}
