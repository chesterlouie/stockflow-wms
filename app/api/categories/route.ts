import { z } from "zod";
import { getSession } from "../../../lib/auth";
import { withTenant } from "../../../lib/db";

const schema = z.object({
  code: z.string().trim().min(1).max(30).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.redirect(new URL("/signin", request.url), 303);
  if (!["owner", "admin", "manager"].includes(session.role)) return new Response("Forbidden", { status: 403 });
  const parsed = schema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return Response.redirect(new URL("/app/categories?error=invalid", request.url), 303);
  try {
    await withTenant(session.companyId, async (client) => {
      const category = (await client.query<{ id: string }>(
        `INSERT INTO item_categories(company_id,code,name,description) VALUES($1,$2,$3,$4) RETURNING id`,
        [session.companyId, parsed.data.code, parsed.data.name, parsed.data.description || null],
      )).rows[0];
      await client.query(
        `INSERT INTO audit_logs(company_id,user_id,action,entity_type,entity_id,details) VALUES($1,$2,'category_created','item_category',$3,$4::jsonb)`,
        [session.companyId, session.userId, category.id, JSON.stringify({ code: parsed.data.code, name: parsed.data.name })],
      );
    });
    return Response.redirect(new URL("/app/categories?created=1", request.url), 303);
  } catch {
    return Response.redirect(new URL("/app/categories?error=duplicate", request.url), 303);
  }
}
