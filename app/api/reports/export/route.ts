import { getSession } from "../../../../lib/auth";
import { tenantRows } from "../../../../lib/db";
const reports = {
  stock: `SELECT i.sku,i.description,w.name AS warehouse,l.code AS location,b.lot_number,b.expiry_date::text,b.quantity::text AS on_hand,i.base_uom AS uom FROM inventory_balances b JOIN items i ON i.id=b.item_id JOIN warehouses w ON w.id=b.warehouse_id JOIN locations l ON l.id=b.location_id WHERE b.company_id=$1 ORDER BY i.sku,l.code`,
  valuation:`SELECT i.sku,i.description,i.abc_class,sum(b.quantity)::text on_hand,i.base_uom uom,i.standard_cost::text unit_cost,c.valuation_currency currency,round(sum(b.quantity)*i.standard_cost,2)::text inventory_value FROM inventory_balances b JOIN items i ON i.id=b.item_id JOIN companies c ON c.id=b.company_id WHERE b.company_id=$1 GROUP BY i.id,c.valuation_currency ORDER BY sum(b.quantity)*i.standard_cost DESC`,
  aging:`SELECT i.sku,i.description,l.code location,b.lot_number,b.quantity::text,first_stock.first_date::text first_stocked,coalesce((current_date-first_stock.first_date)::text,'0') age_days FROM inventory_balances b JOIN items i ON i.id=b.item_id JOIN locations l ON l.id=b.location_id LEFT JOIN LATERAL(SELECT min(m.occurred_at::date) first_date FROM inventory_ledger m WHERE m.company_id=b.company_id AND m.item_id=b.item_id AND m.location_id=b.location_id AND m.lot_number IS NOT DISTINCT FROM b.lot_number AND m.quantity>0)first_stock ON true WHERE b.company_id=$1 AND b.quantity>0 ORDER BY first_stock.first_date NULLS LAST`,
  supplier:`SELECT s.name supplier,count(DISTINCT p.id)::text purchase_orders,coalesce(sum(rl.expected_quantity),0)::text expected_units,coalesce(sum(rl.accepted_quantity),0)::text accepted_units,coalesce(sum(rl.held_quantity),0)::text held_units,coalesce(sum(rl.damaged_quantity),0)::text damaged_units,coalesce(round(100*sum(rl.accepted_quantity)/nullif(sum(rl.expected_quantity),0),1),0)::text acceptance_percent FROM suppliers s LEFT JOIN purchase_orders p ON p.company_id=s.company_id AND p.supplier_id=s.id LEFT JOIN inbound_receipt_lines rl ON rl.purchase_order_line_id IN(SELECT id FROM purchase_order_lines WHERE purchase_order_id=p.id) WHERE s.company_id=$1 GROUP BY s.id ORDER BY s.name`,
  movements: `SELECT m.occurred_at::text,i.sku,l.code AS location,m.movement_type,m.quantity::text,m.uom,m.reference_type,m.reference_id FROM inventory_ledger m JOIN items i ON i.id=m.item_id JOIN locations l ON l.id=m.location_id WHERE m.company_id=$1 ORDER BY m.occurred_at DESC LIMIT 1000`,
  receiving: `SELECT r.receipt_no,r.supplier,i.sku,rl.expected_quantity::text,rl.accepted_quantity::text,rl.held_quantity::text,rl.damaged_quantity::text,r.status FROM inbound_receipts r JOIN inbound_receipt_lines rl ON rl.receipt_id=r.id JOIN items i ON i.id=rl.item_id WHERE r.company_id=$1 ORDER BY r.created_at DESC`,
  fulfillment: `SELECT o.order_no,o.customer,i.sku,ol.ordered_quantity::text,ol.allocated_quantity::text,ol.picked_quantity::text,ol.shipped_quantity::text,o.status FROM sales_orders o JOIN sales_order_lines ol ON ol.order_id=o.id JOIN items i ON i.id=ol.item_id WHERE o.company_id=$1 ORDER BY o.created_at DESC`,
  expiry: `SELECT i.sku,l.code AS location,b.lot_number,b.expiry_date::text,b.quantity::text FROM inventory_balances b JOIN items i ON i.id=b.item_id JOIN locations l ON l.id=b.location_id WHERE b.company_id=$1 AND b.expiry_date IS NOT NULL ORDER BY b.expiry_date`,
  variances: `SELECT c.count_no,c.count_type,l.code AS location,i.sku,cl.system_quantity::text,cl.counted_quantity::text,(cl.counted_quantity-cl.system_quantity)::text AS variance,c.status FROM inventory_count_lines cl JOIN inventory_counts c ON c.id=cl.count_id JOIN items i ON i.id=cl.item_id JOIN locations l ON l.id=cl.location_id WHERE cl.company_id=$1 AND cl.counted_quantity IS NOT NULL ORDER BY c.created_at DESC`,
} as const;
const csv = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
const clean = (v: unknown) =>
  String(v ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[\\()]/g, (m) => `\\${m}`);
function pdf(title: string, rows: Record<string, unknown>[]) {
  const headers = rows[0] ? Object.keys(rows[0]) : ["No records"];
  const lines = [
    headers.join(" | "),
    ...rows.map((r) => headers.map((h) => String(r[h] ?? "")).join(" | ")),
  ];
  const chunks = [] as string[][];
  for (let i = 0; i < lines.length; i += 44)
    chunks.push(lines.slice(i, i + 44));
  if (!chunks.length) chunks.push(["No records"]);
  const fontId = 3 + chunks.length * 2;
  const objects: string[] = [];
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  const kids = chunks.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  objects[1] = `<< /Type /Pages /Kids [${kids}] /Count ${chunks.length} >>`;
  chunks.forEach((page, index) => {
    const pageId = 3 + index * 2,
      contentId = pageId + 1;
    let content = `BT /F1 16 Tf 40 755 Td (${clean(`Warevanta - ${title}`)}) Tj /F1 8 Tf 0 -24 Td`;
    for (const line of page) {
      const clipped = clean(line).slice(0, 135);
      content += ` (${clipped}) Tj 0 -15 Td`;
    }
    content += ` /F1 8 Tf 0 -12 Td (Page ${index + 1} of ${chunks.length}) Tj ET`;
    objects[pageId - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId - 1] =
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });
  objects[fontId - 1] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets[i + 1] = new TextEncoder().encode(output).length;
    output += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = new TextEncoder().encode(output).length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++)
    output += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(output);
}
export async function GET(request: Request) {
  const s = await getSession();
  if (!s) return new Response("Unauthorized", { status: 401 });
  const url = new URL(request.url),
    type = url.searchParams.get("type") as keyof typeof reports,
    format = url.searchParams.get("format");
  if (!type || !(type in reports))
    return new Response("Invalid report", { status: 400 });
  const rows = await tenantRows<Record<string, unknown>>(
    s.companyId,
    reports[type],
    [s.companyId],
  );
  if (format === "pdf")
    return new Response(pdf(type, rows), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="warevanta-${type}.pdf"`,
      },
    });
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const body = [
    headers.map(csv).join(","),
    ...rows.map((r) => headers.map((h) => csv(r[h])).join(",")),
  ].join("\r\n");
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="warevanta-${type}.csv"`,
    },
  });
}
