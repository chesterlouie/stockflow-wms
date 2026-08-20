import { z } from "zod";
import type { Client } from "pg";
import { getSession } from "../../../../../lib/auth";
import { withTenant } from "../../../../../lib/db";
import { reverseReturn } from "../../../returns/[id]/reverse/route";
import { reverseShipment } from "../../../shipments/[id]/reverse/route";
const schema = z.object({
  decision: z.enum(["approved", "rejected", "returned"]),
  comment: z.string().trim().max(500).optional(),
});

async function execute(
  c: Client,
  q: any,
  x: any,
  userId: string,
  companyId: string,
) {
  if (q.operation_type === "forecast_replenishment") {
    const f = (
      await c.query(
        `SELECT rr.*,i.base_uom,b.lot_number,b.expiry_date FROM replenishment_recommendations rr JOIN items i ON i.id=rr.item_id LEFT JOIN inventory_balances b ON b.company_id=rr.company_id AND b.item_id=rr.item_id AND b.location_id=rr.from_location_id WHERE rr.company_id=$1 AND rr.id=$2 AND rr.status='pending' FOR UPDATE`,
        [companyId, q.entity_id],
      )
    ).rows[0];
    if (!f) throw new Error("state");
    const task = (
      await c.query(
        `INSERT INTO replenishment_tasks(company_id,item_id,from_location_id,to_location_id,quantity,uom,lot_number,expiry_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          companyId,
          f.item_id,
          f.from_location_id,
          f.to_location_id,
          f.recommended_quantity,
          f.base_uom,
          f.lot_number,
          f.expiry_date,
        ],
      )
    ).rows[0];
    await c.query(
      `UPDATE replenishment_recommendations SET status='converted',reviewed_at=now(),reviewed_by=$1,replenishment_task_id=$2 WHERE id=$3`,
      [userId, task.id, q.entity_id],
    );
    return;
  }
  if (q.operation_type === "inventory_adjustment") {
    const resource = (
      await c.query(
        `SELECT i.base_uom,l.warehouse_id FROM items i CROSS JOIN locations l WHERE i.company_id=$1 AND l.company_id=$1 AND i.id=$2 AND l.id=$3`,
        [companyId, x.itemId, x.locationId],
      )
    ).rows[0];
    if (!resource || resource.base_uom !== x.uom) throw new Error("state");
    const current = Number(
      (
        await c.query(
          `SELECT coalesce(sum(quantity),0) q FROM inventory_ledger WHERE company_id=$1 AND item_id=$2 AND location_id=$3 AND lot_number IS NOT DISTINCT FROM $4 AND expiry_date IS NOT DISTINCT FROM $5::date`,
          [
            companyId,
            x.itemId,
            x.locationId,
            x.lotNumber || null,
            x.expiryDate || null,
          ],
        )
      ).rows[0].q,
    );
    if (Number(x.quantity) < 0 && current < Math.abs(Number(x.quantity)))
      throw new Error("stock");
    await c.query(
      `INSERT INTO inventory_ledger(company_id,warehouse_id,location_id,item_id,movement_type,quantity,uom,lot_number,expiry_date,reference_type,reference_id,created_by,transaction_group_id,reason_code,note) VALUES($1,$2,$3,$4,'adjustment',$5,$6,$7,$8,'adjustment',$9,$10,$11,$12,$13)`,
      [
        companyId,
        resource.warehouse_id,
        x.locationId,
        x.itemId,
        x.quantity,
        x.uom,
        x.lotNumber || null,
        x.expiryDate || null,
        x.referenceId,
        userId,
        crypto.randomUUID(),
        x.reasonCode,
        x.note || null,
      ],
    );
    return;
  }
  if (q.operation_type === "count_variance") {
    const count = (
      await c.query(
        `SELECT * FROM inventory_counts WHERE company_id=$1 AND id=$2 AND status='counted' FOR UPDATE`,
        [companyId, q.entity_id],
      )
    ).rows[0];
    if (!count) throw new Error("state");
    const lines = (
      await c.query(
        `SELECT * FROM inventory_count_lines WHERE company_id=$1 AND count_id=$2 FOR UPDATE`,
        [companyId, q.entity_id],
      )
    ).rows;
    for (const line of lines) {
      const current = Number(
        (
          await c.query(
            `SELECT coalesce(sum(quantity),0) q FROM inventory_ledger WHERE company_id=$1 AND item_id=$2 AND location_id=$3 AND lot_number IS NOT DISTINCT FROM $4 AND expiry_date IS NOT DISTINCT FROM $5::date`,
            [
              companyId,
              line.item_id,
              line.location_id,
              line.lot_number,
              line.expiry_date,
            ],
          )
        ).rows[0].q,
      );
      if (current !== Number(line.system_quantity)) throw new Error("stale");
      const variance = Number(line.counted_quantity) - current;
      if (variance)
        await c.query(
          `INSERT INTO inventory_ledger(company_id,warehouse_id,location_id,item_id,movement_type,quantity,uom,lot_number,expiry_date,reference_type,reference_id,created_by,transaction_group_id,reason_code,note) VALUES($1,$2,$3,$4,'count_adjustment',$5,$6,$7,$8,'inventory_count',$9,$10,$11,'COUNT_VARIANCE','Approved count variance')`,
          [
            companyId,
            count.warehouse_id,
            line.location_id,
            line.item_id,
            variance,
            line.uom,
            line.lot_number,
            line.expiry_date,
            q.entity_id,
            userId,
            crypto.randomUUID(),
          ],
        );
      await c.query(
        `UPDATE inventory_count_lines SET status='approved' WHERE id=$1`,
        [line.id],
      );
    }
    await c.query(
      `UPDATE inventory_counts SET status='approved',approved_at=now(),approved_by=$1 WHERE id=$2`,
      [userId, q.entity_id],
    );
    return;
  }
  if (q.operation_type === "purchase_order_release") {
    const po = (
      await c.query(
        `SELECT p.*,s.name supplier FROM purchase_orders p JOIN suppliers s ON s.id=p.supplier_id AND s.company_id=p.company_id WHERE p.company_id=$1 AND p.id=$2 AND p.status='draft' FOR UPDATE`,
        [companyId, q.entity_id],
      )
    ).rows[0];
    if (!po) throw new Error("state");
    const lines = (
      await c.query(
        `SELECT * FROM purchase_order_lines WHERE company_id=$1 AND purchase_order_id=$2 ORDER BY line_no FOR UPDATE`,
        [companyId, q.entity_id],
      )
    ).rows;
    if (!lines.length) throw new Error("state");
    for (const line of lines) {
      const receipt = (
        await c.query(
          `INSERT INTO inbound_receipts(company_id,warehouse_id,receipt_no,supplier,external_reference,expected_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [
            companyId,
            po.warehouse_id,
            `${po.po_no}-${String(line.line_no).padStart(2, "0")}`.slice(0, 50),
            po.supplier,
            po.po_no,
            po.expected_date,
            userId,
          ],
        )
      ).rows[0];
      await c.query(
        `INSERT INTO inbound_receipt_lines(company_id,receipt_id,item_id,expected_quantity,uom,purchase_order_line_id) VALUES($1,$2,$3,$4,$5,$6)`,
        [
          companyId,
          receipt.id,
          line.item_id,
          line.ordered_quantity,
          line.uom,
          line.id,
        ],
      );
    }
    await c.query(
      `UPDATE purchase_order_lines SET status='open' WHERE purchase_order_id=$1`,
      [q.entity_id],
    );
    await c.query(
      `UPDATE purchase_orders SET status='open',updated_at=now() WHERE id=$1`,
      [q.entity_id],
    );
    return;
  }
  if (
    q.operation_type === "order_cancel" ||
    q.operation_type === "order_reopen"
  ) {
    const o = (
      await c.query(
        `SELECT * FROM sales_orders WHERE company_id=$1 AND id=$2 FOR UPDATE`,
        [companyId, q.entity_id],
      )
    ).rows[0];
    if (!o) throw new Error("state");
    if (q.operation_type === "order_cancel") {
      if (
        ["cancelled", "dispatched", "picked", "packing", "packed"].includes(
          o.status,
        )
      )
        throw new Error("state");
      await c.query(
        `UPDATE stock_allocations SET status='released' WHERE order_line_id IN(SELECT id FROM sales_order_lines WHERE order_id=$1) AND status='allocated'`,
        [q.entity_id],
      );
      await c.query(
        `UPDATE pick_tasks SET status='cancelled' WHERE allocation_id IN(SELECT a.id FROM stock_allocations a JOIN sales_order_lines ol ON ol.id=a.order_line_id WHERE ol.order_id=$1) AND status IN('pending','exception')`,
        [q.entity_id],
      );
      await c.query(
        `UPDATE sales_order_lines SET allocated_quantity=0 WHERE order_id=$1`,
        [q.entity_id],
      );
      await c.query(
        `UPDATE sales_orders SET status='cancelled',status_before_hold=NULL WHERE id=$1`,
        [q.entity_id],
      );
      await c.query(
        `INSERT INTO fulfillment_exceptions(company_id,order_id,exception_type,reason_code,note,status,resolution,created_by,resolved_at,resolved_by) VALUES($1,$2,'order_cancelled',$3,$4,'resolved','cancelled',$5,now(),$5)`,
        [companyId, q.entity_id, x.reasonCode, x.note || null, userId],
      );
    } else {
      if (o.status !== "cancelled") throw new Error("state");
      await c.query(
        `UPDATE sales_orders SET status='new',status_before_hold=NULL WHERE id=$1`,
        [q.entity_id],
      );
    }
    return;
  }
  if (q.operation_type === "return_reversal") {
    await reverseReturn(c, companyId, q.entity_id, userId);
    return;
  }
  if (q.operation_type === "dispatch_reversal") {
    await reverseShipment(c, companyId, q.entity_id, userId, x.reason);
    return;
  }
  throw new Error("unsupported");
}

export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const s = await getSession();
  if (!s) return Response.redirect(new URL("/signin", r.url), 303);
  const { id } = await params,
    p = schema.safeParse(Object.fromEntries(await r.formData()));
  if (!p.success)
    return Response.redirect(
      new URL("/app/approvals?error=decision", r.url),
      303,
    );
  try {
    await withTenant(s.companyId, async (c) => {
      const q = (
        await c.query(
          `SELECT q.*,r.required_steps,rs.approver_role FROM approval_requests q JOIN approval_rules r ON r.id=q.rule_id JOIN approval_rule_steps rs ON rs.rule_id=r.id AND rs.step_no=q.current_step WHERE q.company_id=$1 AND q.id=$2 AND q.status='pending' FOR UPDATE`,
          [s.companyId, id],
        )
      ).rows[0];
      if (!q) throw new Error("role");
      const delegated=q.approver_role!==s.role&&(await c.query(`SELECT 1 FROM approval_delegations d JOIN company_members m ON m.company_id=d.company_id AND m.user_id=d.delegator_id WHERE d.company_id=$1 AND d.delegate_id=$2 AND d.active=true AND now() BETWEEN d.starts_at AND d.ends_at AND m.role=$3 LIMIT 1`,[s.companyId,s.userId,q.approver_role])).rowCount;
      if(q.approver_role!==s.role&&!delegated)throw new Error("role");
      if (p.data.decision !== "approved" && !p.data.comment)
        throw new Error("comment");
      await c.query(
        `INSERT INTO approval_decisions(company_id,request_id,step_no,decision,comment,decided_by) VALUES($1,$2,$3,$4,$5,$6)`,
        [
          s.companyId,
          id,
          q.current_step,
          p.data.decision,
          p.data.comment || null,
          s.userId,
        ],
      );
      if (p.data.decision !== "approved") {
        await c.query(
          `UPDATE approval_requests SET status=$1,completed_at=now() WHERE id=$2`,
          [p.data.decision, id],
        );
        await c.query(`UPDATE approval_notifications SET read_at=now() WHERE request_id=$1 AND read_at IS NULL`,[id]);
        if(q.requested_by)await c.query(`INSERT INTO approval_notifications(company_id,request_id,user_id,message) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[s.companyId,id,q.requested_by,`${q.operation_type.replaceAll('_',' ')} was ${p.data.decision}`]);
        return;
      }
      if (q.current_step < q.required_steps) {
        await c.query(
          `UPDATE approval_requests SET current_step=current_step+1 WHERE id=$1`,
          [id],
        );
        await c.query(`UPDATE approval_notifications SET read_at=now() WHERE request_id=$1 AND read_at IS NULL`,[id]);
        await c.query(`INSERT INTO approval_notifications(company_id,request_id,user_id,message) SELECT $1,$2,m.user_id,$3 FROM company_members m JOIN approval_rule_steps rs ON rs.rule_id=$4 AND rs.step_no=$5 AND rs.approver_role=m.role WHERE m.company_id=$1 ON CONFLICT DO NOTHING`,[s.companyId,id,`${q.operation_type.replaceAll('_',' ')} requires step ${Number(q.current_step)+1} approval`,q.rule_id,Number(q.current_step)+1]);
        return;
      }
      const x =
        typeof q.payload === "string" ? JSON.parse(q.payload) : q.payload;
      await execute(c, q, x, s.userId, s.companyId);
      await c.query(
        `UPDATE approval_requests SET status='executed',completed_at=now() WHERE id=$1`,
        [id],
      );
      await c.query(`UPDATE approval_notifications SET read_at=now() WHERE request_id=$1 AND read_at IS NULL`,[id]);
      if(q.requested_by)await c.query(`INSERT INTO approval_notifications(company_id,request_id,user_id,message) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[s.companyId,id,q.requested_by,`${q.operation_type.replaceAll('_',' ')} was approved and executed`]);
      await c.query(
        `INSERT INTO audit_logs(company_id,user_id,action,entity_type,entity_id,details) VALUES($1,$2,'approval_executed','approval_request',$3,$4::jsonb)`,
        [
          s.companyId,
          s.userId,
          id,
          JSON.stringify({
            operationType: q.operation_type,
            entityId: q.entity_id,
          }),
        ],
      );
    });
    return Response.redirect(new URL("/app/approvals?decided=1", r.url), 303);
  } catch {
    return Response.redirect(
      new URL("/app/approvals?error=decision", r.url),
      303,
    );
  }
}
