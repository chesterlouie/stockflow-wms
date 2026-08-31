import { getSession } from "../../../lib/auth";
import { withTenant } from "../../../lib/db";
import { itemSchema } from "../../../lib/validation";
import { generateCompanyBarcode } from "../../../lib/barcodes";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.redirect(new URL("/signin",request.url),303);
  if (!["owner", "admin", "manager"].includes(session.role)) return new Response("Forbidden", { status: 403 });
  const parsed = itemSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return Response.redirect(new URL("/app/items/new?error=invalid",request.url),303);
  try {
    await withTenant(session.companyId, async (client) => {
      if (parsed.data.category && !(await client.query("SELECT 1 FROM item_categories WHERE company_id=$1 AND name=$2 AND active=true", [session.companyId, parsed.data.category])).rowCount) throw new Error("INVALID_CATEGORY");
      const item = (await client.query<{id:string}>(`INSERT INTO items(company_id,sku,description,category,base_uom,tracking_method,allocation_method,status,over_receipt_tolerance_percent,minimum_shelf_life_days) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [session.companyId,parsed.data.sku,parsed.data.name,parsed.data.category||null,parsed.data.uom,parsed.data.tracking,parsed.data.allocation,parsed.data.status,parsed.data.overReceiptTolerance,parsed.data.minimumShelfLifeDays])).rows[0];
      let barcode = parsed.data.barcode;
      if (parsed.data.barcodeMode === "auto") {
        barcode = await generateCompanyBarcode(client, session.companyId, parsed.data.format);
      }
      await client.query(`INSERT INTO item_barcodes(company_id,item_id,barcode_value,barcode_format,generation_mode,uom,is_primary) VALUES($1,$2,$3,$4,$5,$6,true)`,[session.companyId,item.id,barcode,parsed.data.format,parsed.data.barcodeMode,parsed.data.uom]);
    });
    return Response.redirect(new URL("/app/items?created=1",request.url),303);
  } catch { return Response.redirect(new URL("/app/items/new?error=duplicate",request.url),303); }
}
