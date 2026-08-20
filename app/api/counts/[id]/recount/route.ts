import { getSession } from "../../../../../lib/auth";
import { withTenant } from "../../../../../lib/db";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const s = await getSession();
  if (!s) return Response.redirect(new URL("/signin", r.url), 303);
  if (!["owner", "admin", "manager"].includes(s.role))
    return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  try {
    const next = await withTenant(s.companyId, async (c) => {
      const old = (
        await c.query(
          `SELECT c.*,coalesce(s.variance_threshold,0) threshold FROM inventory_counts c LEFT JOIN cycle_count_schedules s ON s.id=c.schedule_id WHERE c.company_id=$1 AND c.id=$2 AND c.status='counted' FOR UPDATE OF c`,
          [s.companyId, id],
        )
      ).rows[0];
      if (!old) throw new Error();
      const count = (
        await c.query(
          `INSERT INTO inventory_counts(company_id,warehouse_id,count_no,count_type,location_id,blind_count,created_by,schedule_id,parent_count_id,recount_number) VALUES($1,$2,$3,'cycle',$4,true,$5,$6,$7,$8) RETURNING id`,
          [
            s.companyId,
            old.warehouse_id,
            `${old.count_no}-R${Number(old.recount_number) + 1}`.slice(0, 50),
            old.location_id,
            s.userId,
            old.schedule_id,
            id,
            Number(old.recount_number) + 1,
          ],
        )
      ).rows[0];
      const lines = await c.query(
        `INSERT INTO inventory_count_lines(company_id,count_id,item_id,location_id,lot_number,expiry_date,system_quantity,uom) SELECT company_id,$2,item_id,location_id,lot_number,expiry_date,system_quantity,uom FROM inventory_count_lines WHERE company_id=$1 AND count_id=$3 AND abs(counted_quantity-system_quantity)>greatest($4,0) RETURNING id`,
        [s.companyId, count.id, id, old.threshold],
      );
      if (!lines.rowCount) {
        await c.query(`DELETE FROM inventory_counts WHERE id=$1`, [count.id]);
        throw new Error();
      }
      await c.query(`UPDATE inventory_counts SET status='cancelled' WHERE id=$1`,[id]);
      return count.id;
    });
    return Response.redirect(
      new URL(`/app/counts/${next}?recount=1`, r.url),
      303,
    );
  } catch {
    return Response.redirect(
      new URL(`/app/counts/${id}?error=recount`, r.url),
      303,
    );
  }
}
