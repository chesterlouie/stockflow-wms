import { getSession } from "../../../../../lib/auth";
import { generateCompanyBarcode } from "../../../../../lib/barcodes";
import { withTenant } from "../../../../../lib/db";
import { barcodeSchema } from "../../../../../lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.redirect(new URL("/signin", request.url), 303);
  if (!["owner", "admin", "manager"].includes(session.role)) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const parsed = barcodeSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return Response.redirect(new URL(`/app/items/${id}?error=invalid`, request.url), 303);
  try {
    await withTenant(session.companyId, async (client) => {
      const item = await client.query("SELECT 1 FROM items WHERE company_id=$1 AND id=$2", [session.companyId, id]);
      if (!item.rowCount) throw new Error("NOT_FOUND");
      const barcode = parsed.data.barcodeMode === "auto"
        ? await generateCompanyBarcode(client, session.companyId, parsed.data.barcodeFormat)
        : parsed.data.barcodeValue;
      await client.query(
        `INSERT INTO item_barcodes(company_id,item_id,barcode_value,barcode_format,generation_mode,uom,quantity_in_base,is_primary) VALUES($1,$2,$3,$4,$5,$6,$7,false)`,
        [session.companyId, id, barcode, parsed.data.barcodeFormat, parsed.data.barcodeMode, parsed.data.uom, parsed.data.quantityInBase],
      );
    });
    return Response.redirect(new URL(`/app/items/${id}?created=1`, request.url), 303);
  } catch {
    return Response.redirect(new URL(`/app/items/${id}?error=duplicate`, request.url), 303);
  }
}
