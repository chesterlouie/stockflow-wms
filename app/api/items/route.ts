import { getSession } from "../../../lib/auth";
import { withTenant } from "../../../lib/db";
import { itemSchema } from "../../../lib/validation";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.redirect(new URL("/signin",request.url),303);
  const parsed = itemSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return Response.redirect(new URL("/app/items/new?error=invalid",request.url),303);
  try {
    await withTenant(session.companyId, async (client) => {
      const item = (await client.query<{id:string}>(`INSERT INTO items(company_id,sku,description,category,base_uom,tracking_method,allocation_method,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [session.companyId,parsed.data.sku,parsed.data.name,parsed.data.category||null,parsed.data.uom,parsed.data.tracking,parsed.data.allocation,parsed.data.status])).rows[0];
      let barcode = parsed.data.barcode;
      if (parsed.data.barcodeMode === "auto") {
        const sequence = (await client.query<{prefix:string;issued:number;pad_length:number}>(`UPDATE barcode_sequences SET next_value=next_value+1 WHERE company_id=$1 RETURNING prefix,next_value-1 AS issued,pad_length`,[session.companyId])).rows[0];
        barcode = `${sequence.prefix}${String(sequence.issued).padStart(sequence.pad_length,"0")}`;
      }
      await client.query(`INSERT INTO item_barcodes(company_id,item_id,barcode_value,barcode_format,generation_mode,uom,is_primary) VALUES($1,$2,$3,$4,$5,$6,true)`,[session.companyId,item.id,barcode,parsed.data.format,parsed.data.barcodeMode,parsed.data.uom]);
    });
    return Response.redirect(new URL("/app/items?created=1",request.url),303);
  } catch { return Response.redirect(new URL("/app/items/new?error=duplicate",request.url),303); }
}
