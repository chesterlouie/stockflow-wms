import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "../../../../lib/auth";
import { tenantRows } from "../../../../lib/db";
export const dynamic = "force-dynamic";
type Count = {
  id: string;
  count_no: string;
  count_type: string;
  status: string;
  blind_count: boolean;
  warehouse: string;
  location: string | null;
};
type Line = {
  id: string;
  sku: string;
  description: string;
  location: string;
  lot_number: string | null;
  expiry_date: string | null;
  system_quantity: string;
  counted_quantity: string | null;
  uom: string;
  status: string;
};
export default async function CountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; approved?: string; recount?:string; error?: string }>;
}) {
  const s = await getSession();
  const { id } = await params;
  const q = await searchParams;
  const counts = s
    ? await tenantRows<Count>(
        s.companyId,
        `SELECT c.id,c.count_no,c.count_type,c.status,c.blind_count,w.name AS warehouse,l.code AS location FROM inventory_counts c JOIN warehouses w ON w.id=c.warehouse_id LEFT JOIN locations l ON l.id=c.location_id WHERE c.company_id=$1 AND c.id=$2`,
        [s.companyId, id],
      )
    : [];
  const c = counts[0];
  if (!c) notFound();
  const lines = await tenantRows<Line>(
    s!.companyId,
    `SELECT cl.id,i.sku,i.description,l.code AS location,cl.lot_number,cl.expiry_date::text,cl.system_quantity::text,cl.counted_quantity::text,cl.uom,cl.status FROM inventory_count_lines cl JOIN items i ON i.id=cl.item_id JOIN locations l ON l.id=cl.location_id WHERE cl.company_id=$1 AND cl.count_id=$2 ORDER BY l.code,i.sku,cl.expiry_date NULLS LAST`,
    [s!.companyId, id],
  );
  const canApprove = ["owner", "admin", "manager"].includes(s!.role);
  return (
    <div className="app-content">
      <div className="page-heading">
        <div>
          <h1>{c.count_no}</h1>
          <p>
            {c.count_type.replaceAll("_", " ")} · {c.location || c.warehouse} ·{" "}
            {c.blind_count ? "Blind count" : "Visible count"}
          </p>
        </div>
        <Link href="/app/counts" className="button button-secondary">
          Back
        </Link>
      </div>
      {(q.saved || q.approved || q.recount) && (
        <div className="success-banner">
          {q.recount?'Recount created for material variance lines.':q.approved
            ? "Count approved and variances posted."
            : "Count entry saved."}
        </div>
      )}
      {q.error && (
        <div className="form-error">
          {q.error === "stale"
            ? "Stock changed after this count started. Start a fresh count before approval."
            : "The operation could not be completed. Verify the location and barcode scans."}
        </div>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Count lines</h2>
            <p>Scan the location and item, then enter the physical quantity.</p>
          </div>
          <span className="badge">{c.status}</span>
        </div>
        {lines.map((line) => {
          const variance =
            line.counted_quantity === null
              ? null
              : Number(line.counted_quantity) - Number(line.system_quantity);
          return (
            <article className="pick-card" key={line.id}>
              <div>
                <strong>
                  {line.location} · {line.sku} — {line.description}
                </strong>
                <small>
                  {line.lot_number || "No lot"}
                  {line.expiry_date ? ` · expires ${line.expiry_date}` : ""}
                </small>
                {(!c.blind_count || line.status !== "pending") && (
                  <small>
                    Expected: {line.system_quantity} {line.uom}
                    {variance !== null ? ` · Variance: ${variance}` : ""}
                  </small>
                )}
              </div>
              {line.status === "pending" && c.status === "open" ? (
                <form
                  className="form-row"
                  method="post"
                  action={`/api/counts/lines/${line.id}/submit`}
                >
                  <div className="field">
                    <label>Location scan</label>
                    <input
                      name="locationCode"
                      placeholder={line.location}
                      required
                    />
                  </div>
                  <div className="field">
                    <label>Item barcode</label>
                    <input name="barcode" placeholder="Scan barcode" required />
                  </div>
                  <div className="field">
                    <label>Counted quantity</label>
                    <input
                      name="countedQuantity"
                      type="number"
                      min="0"
                      step="any"
                      required
                    />
                  </div>
                  <button className="button button-primary">Save count</button>
                </form>
              ) : (
                <span className="badge">{line.status}</span>
              )}
            </article>
          );
        })}
        {c.status === "counted" && canApprove && (
          <div className="form-row order-action"><form method="post" action={`/api/counts/${id}/approve`}><button className="button button-primary">Approve and post variances</button></form><form method="post" action={`/api/counts/${id}/recount`}><button className="button button-secondary">Create variance recount</button></form></div>
        )}
      </section>
    </div>
  );
}
