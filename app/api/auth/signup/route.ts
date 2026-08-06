import { hash } from "bcryptjs";
import { createSession, sessionCookie } from "../../../../lib/auth";
import { withTransaction } from "../../../../lib/db";
import { signupSchema } from "../../../../lib/validation";

function redirect(request: Request, path: string) { return Response.redirect(new URL(path, request.url), 303); }
function slugify(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70); }

export async function POST(request: Request) {
  const form = await request.formData();
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return redirect(request, "/signup?error=invalid");
  try {
    const passwordHash = await hash(parsed.data.password, 12);
    const account = await withTransaction(async (client) => {
      const existing = await client.query("SELECT 1 FROM users WHERE email = $1", [parsed.data.email]);
      if (existing.rowCount) throw new Error("EMAIL_EXISTS");
      const company = (await client.query<{id:string}>("INSERT INTO companies(name, slug) VALUES($1, $2 || '-' || substr(gen_random_uuid()::text, 1, 8)) RETURNING id", [parsed.data.company, slugify(parsed.data.company)])).rows[0];
      const user = (await client.query<{id:string}>("INSERT INTO users(email, password_hash, display_name) VALUES($1,$2,$3) RETURNING id", [parsed.data.email, passwordHash, parsed.data.email.split("@")[0]])).rows[0];
      await client.query("INSERT INTO company_members(company_id,user_id,role) VALUES($1,$2,'owner')", [company.id, user.id]);
      await client.query("INSERT INTO platform_admins(user_id) SELECT $1 WHERE NOT EXISTS(SELECT 1 FROM platform_admins)", [user.id]);
      await client.query("SELECT set_config('app.company_id', $1, true)", [company.id]);
      await client.query("INSERT INTO warehouses(company_id,code,name) VALUES($1,'MAIN','Main Warehouse')", [company.id]);
      await client.query("INSERT INTO barcode_sequences(company_id,prefix,next_value,pad_length) VALUES($1,'',1,8)", [company.id]);
      await client.query(`INSERT INTO adjustment_reasons(company_id,code,description) VALUES($1,'DAMAGE','Damaged stock'),($1,'FOUND','Stock found during verification'),($1,'LOSS','Lost or missing stock'),($1,'CORRECTION','Inventory correction')`,[company.id]);
      return { userId:user.id, companyId:company.id };
    });
    const token = await createSession({ ...account, email:parsed.data.email, role:"owner" });
    return new Response(null,{status:303,headers:{Location:new URL('/app/dashboard',request.url).toString(),'Set-Cookie':sessionCookie(token)}});
  } catch (error) {
    console.error("Workspace registration failed", error);
    const reason = error instanceof Error && error.message === "EMAIL_EXISTS" ? "exists" : "database";
    return redirect(request, `/signup?error=${reason}`);
  }
}
