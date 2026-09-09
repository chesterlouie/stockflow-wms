import pg from "pg";
import { writeFile, unlink } from "node:fs/promises";
import { sendEmail, emailConfigured, escapeHtml } from "../lib/email.ts";
import { generateScheduledCount } from "../lib/cycle-counts.ts";
const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error("DATABASE_ADMIN_URL is required");
const deliveryEnabled = process.env.REPORT_DELIVERY_ENABLED === "true";
const client = new pg.Client({ connectionString: url });
await client.connect();
await writeFile(
  new URL("../.runtime/report-worker.pid", import.meta.url),
  String(process.pid),
);
const next = (frequency) =>
  frequency === "daily"
    ? `interval '1 day'`
    : frequency === "weekly"
      ? `interval '7 days'`
      : `interval '1 month'`;
if (!deliveryEnabled) {
  await createAlerts();
  await processApprovals();
  await processCountSchedules();
  await processVkitBackorders();
  await processOperationalExceptions();
  await processDeliveryExceptions();
  const safeTimer = setInterval(
    () =>
      Promise.all([createAlerts(), processApprovals(),processCountSchedules(),processVkitBackorders(),processOperationalExceptions(),processDeliveryExceptions()]).catch(console.error),
    60000,
  );
  const safeStop = async () => {
    clearInterval(safeTimer);
    await client.end();
    await unlink(
      new URL("../.runtime/report-worker.pid", import.meta.url),
    ).catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", safeStop);
  process.on("SIGINT", safeStop);
  await new Promise(() => {});
}
async function cycle() {
  if (
    !(await client.query(`SELECT pg_try_advisory_lock(9042026) AS ok`)).rows[0]
      .ok
  )
    return;
  try {
    const due = (
      await client.query(
        `SELECT s.*,c.name FROM report_schedules s JOIN companies c ON c.id=s.company_id WHERE s.active=true AND s.next_run_at<=now() ORDER BY s.next_run_at LIMIT 25`,
      )
    ).rows;
    for (const s of due) {
      const run = (
        await client.query(
          `INSERT INTO report_runs(company_id,schedule_id,scheduled_for,started_at,status,attempt) VALUES($1,$2,$3,now(),'sending',1) RETURNING id`,
          [s.company_id, s.id, s.next_run_at],
        )
      ).rows[0];
      try {
        if (!emailConfigured())
          throw new Error("Email delivery is not configured");
        const recipients = s.recipients.split(/[,;\s]+/).filter(Boolean),
          ids = [];
        for (const to of recipients) {
          const download = `${process.env.APP_URL}/api/reports/export?type=${s.report_type}&format=${s.format}`;
          const result = await sendEmail({
            to,
            subject: `Warevanta ${s.report_type} report - ${s.name}`,
            idempotencyKey: `report-${run.id}-${to}`,
            html: `<p>Your scheduled <strong>${escapeHtml(s.report_type)}</strong> report for ${escapeHtml(s.name)} is ready.</p><p><a href="${escapeHtml(download)}">Open Warevanta to download the ${s.format.toUpperCase()} report</a>.</p>`,
            text: `Your ${s.report_type} report is ready: ${download}`,
          });
          if (result.id) ids.push(result.id);
        }
        await client.query(
          `UPDATE report_runs SET status='sent',finished_at=now(),provider_ids=$2 WHERE id=$1`,
          [run.id, JSON.stringify(ids)],
        );
        await client.query(
          `UPDATE report_schedules SET next_run_at=next_run_at+${next(s.frequency)} WHERE id=$1`,
          [s.id],
        );
      } catch (e) {
        await client.query(
          `UPDATE report_runs SET status='failed',finished_at=now(),error_message=$2 WHERE id=$1`,
          [run.id, String(e?.message || e).slice(0, 1000)],
        );
        await client.query(
          `UPDATE report_schedules SET next_run_at=now()+interval '15 minutes' WHERE id=$1`,
          [s.id],
        );
      }
    }
    await createAlerts();
    await notifyAlerts();
    await processApprovals();
    await processCountSchedules();
    await processVkitBackorders();
    await processOperationalExceptions();
    await processDeliveryExceptions();
  } finally {
    await client.query(`SELECT pg_advisory_unlock(9042026)`);
  }
}
async function createAlerts() {
  const companies = (
    await client.query(
      `SELECT c.id,coalesce(a.expiry_warning_days,30) expiry,coalesce(a.low_stock_quantity,5) low,coalesce(a.overdue_order_hours,24) overdue,coalesce(a.accuracy_target,98) accuracy FROM companies c LEFT JOIN warehouse_alert_settings a ON a.company_id=c.id WHERE c.access_status='active'`,
    )
  ).rows;
  for (const x of companies) {
    const alerts = (
      await client.query(
        `SELECT 'expiry' type,'warning' severity,count(*)::text||' expiring stock balances require review' message FROM inventory_balances WHERE company_id=$1 AND quantity>0 AND expiry_date<=current_date+$2::int AND expiry_date IS NOT NULL HAVING count(*)>0 UNION ALL SELECT 'low_stock','warning',count(*)::text||' stocked items are below the configured quantity' FROM inventory_balances WHERE company_id=$1 AND quantity>0 AND quantity<=$3 GROUP BY company_id HAVING count(*)>0 UNION ALL SELECT 'overdue_order','critical',count(*)::text||' orders have exceeded the fulfillment threshold' FROM sales_orders WHERE company_id=$1 AND status<>'dispatched' AND created_at<now()-($4||' hours')::interval HAVING count(*)>0`,
        [x.id, x.expiry, x.low, x.overdue],
      )
    ).rows;
    const accuracy = (
      await client.query(
        `SELECT coalesce(round(100-100*sum(abs(counted_quantity-system_quantity))/nullif(sum(abs(system_quantity)),0),1),100) value FROM inventory_count_lines WHERE company_id=$1 AND status='approved'`,
        [x.id],
      )
    ).rows[0].value;
    if (Number(accuracy) < Number(x.accuracy))
      alerts.push({
        type: "accuracy",
        severity: "warning",
        message: `Stock accuracy ${accuracy}% is below the ${x.accuracy}% target`,
      });
    for (const a of alerts)
      await client.query(
        `INSERT INTO warehouse_alert_events(company_id,alert_type,severity,message) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [x.id, a.type, a.severity, a.message],
      );
  }
}
async function notifyAlerts() {
  if (!emailConfigured()) return;
  const alerts = (
    await client.query(
      `SELECT a.*,c.name,array_agg(DISTINCT s.recipients) recipients FROM warehouse_alert_events a JOIN companies c ON c.id=a.company_id LEFT JOIN report_schedules s ON s.company_id=a.company_id AND s.active=true WHERE a.notified_at IS NULL GROUP BY a.id,c.name ORDER BY a.event_date LIMIT 50`,
    )
  ).rows;
  for (const a of alerts) {
    const recipients = (a.recipients || [])
      .flatMap((x) => String(x || "").split(/[,;\s]+/))
      .filter(Boolean);
    if (!recipients.length) continue;
    try {
      for (const to of [...new Set(recipients)])
        await sendEmail({
          to,
          subject: `Warevanta ${a.severity} alert - ${a.name}`,
          idempotencyKey: `alert-${a.id}-${to}`,
          html: `<p><strong>${escapeHtml(a.message)}</strong></p><p><a href="${process.env.APP_URL}/app/delivery-history">Review the alert in Warevanta</a>.</p>`,
          text: `Warevanta alert: ${a.message}`,
        });
      await client.query(
        `UPDATE warehouse_alert_events SET notified_at=now() WHERE id=$1`,
        [a.id],
      );
    } catch (e) {
      console.error("Alert delivery failed", e);
    }
  }
}
async function processApprovals() {
  const overdue = (
    await client.query(
      `SELECT q.id,q.company_id,q.operation_type,q.entity_id FROM approval_requests q JOIN approval_rules r ON r.id=q.rule_id WHERE q.status='pending' AND q.escalation_notified_at IS NULL AND q.requested_at+(r.escalation_hours||' hours')::interval<now() LIMIT 50`,
    )
  ).rows;
  for (const q of overdue) {
    await client.query(
      `INSERT INTO approval_notifications(company_id,request_id,user_id,message) SELECT $1,$2,m.user_id,$3 FROM company_members m WHERE m.company_id=$1 AND m.role IN('owner','admin') ON CONFLICT DO NOTHING`,
      [
        q.company_id,
        q.id,
        `OVERDUE: ${q.operation_type.replaceAll("_", " ")} · ${q.entity_id}`,
      ],
    );
    await client.query(
      `UPDATE approval_requests SET escalation_notified_at=now() WHERE id=$1`,
      [q.id],
    );
  }
  if (!emailConfigured()) return;
  const messages = (
    await client.query(
      `SELECT n.id,n.message,n.created_at,u.email,u.display_name,c.name company FROM approval_notifications n JOIN users u ON u.id=n.user_id JOIN companies c ON c.id=n.company_id WHERE n.email_sent_at IS NULL ORDER BY n.created_at LIMIT 50`,
    )
  ).rows;
  for (const n of messages) {
    try {
      await sendEmail({
        to: n.email,
        subject: `Warevanta approval notification - ${n.company}`,
        idempotencyKey: `approval-notification-${n.id}`,
        html: `<p>Hello ${escapeHtml(n.display_name)},</p><p><strong>${escapeHtml(n.message)}</strong></p><p><a href="${process.env.APP_URL}/app/approvals">Open the approval inbox</a>.</p>`,
        text: `${n.message}\n${process.env.APP_URL}/app/approvals`,
      });
      await client.query(
        `UPDATE approval_notifications SET email_sent_at=now(),email_error=NULL WHERE id=$1`,
        [n.id],
      );
    } catch (e) {
      await client.query(
        `UPDATE approval_notifications SET email_error=$2 WHERE id=$1`,
        [n.id, String(e?.message || e).slice(0, 500)],
      );
    }
  }
}
async function processCountSchedules(){if(!(await client.query(`SELECT pg_try_advisory_lock(9042035) ok`)).rows[0].ok)return;try{const due=(await client.query(`SELECT * FROM cycle_count_schedules WHERE active=true AND next_run_at<=now() ORDER BY next_run_at LIMIT 25 FOR UPDATE SKIP LOCKED`)).rows;for(const schedule of due){try{const id=await generateScheduledCount(client,schedule,null);if(id)await client.query(`INSERT INTO audit_logs(company_id,action,entity_type,entity_id,details) VALUES($1,'scheduled_count_generated','inventory_count',$2,$3::jsonb)`,[schedule.company_id,id,JSON.stringify({scheduleId:schedule.id})]);else await client.query(`UPDATE cycle_count_schedules SET last_run_at=now(),next_run_at=next_run_at+(frequency_days||' days')::interval WHERE id=$1`,[schedule.id])}catch(e){console.error('Scheduled count generation failed',e)}}}finally{await client.query(`SELECT pg_advisory_unlock(9042035)`)}}
async function processVkitBackorders(){if(!(await client.query(`SELECT pg_try_advisory_lock(9042069) ok`)).rows[0].ok)return;try{const rows=(await client.query(`SELECT s.*,o.created_by FROM vkit_backorder_summary s JOIN sales_orders o ON o.company_id=s.company_id AND o.id=s.id WHERE o.status='new' AND o.backorder_status IN('waiting','ready') AND s.attention_status IN('due_soon','overdue','critical')`)).rows;for(const x of rows){const message=`${x.order_no} is ${x.attention_status.replaceAll('_',' ')} (required ${x.requested_ship_date||'date not set'}).`;const event=(await client.query(`INSERT INTO vkit_backorder_escalations(company_id,order_id,severity,event_key,message) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id`,[x.company_id,x.id,x.attention_status,`backorder:${x.id}:${x.attention_status}`,message])).rows[0];if(!event)continue;await client.query(`INSERT INTO warehouse_notifications(company_id,warehouse_id,user_id,event_key,title,message,order_id) SELECT $1,$2,m.user_id,$3,'VKIT backorder attention required',$4,$5 FROM company_members m WHERE m.company_id=$1 AND m.role IN('owner','admin','manager') AND (m.role='owner' OR EXISTS(SELECT 1 FROM user_warehouse_assignments a WHERE a.company_id=$1 AND a.user_id=m.user_id AND a.warehouse_id=$2)) ON CONFLICT DO NOTHING`,[x.company_id,x.warehouse_id,`backorder:${x.id}:${x.attention_status}`,message,x.id]);if(x.store_id)await client.query(`INSERT INTO store_notifications(company_id,user_id,store_id,event_key,notification_type,title,message,entity_type,entity_id) SELECT $1,u.user_id,$2,$3,'approval_requested','VKIT backorder attention required',$4,'sales_order',$5 FROM (SELECT $6::uuid user_id UNION SELECT a.user_id FROM store_user_assignments a WHERE a.company_id=$1 AND a.store_id=$2 AND a.store_role='store_manager')u ON CONFLICT DO NOTHING`,[x.company_id,x.store_id,`backorder:${x.id}:${x.attention_status}`,message,x.id,x.created_by])}}finally{await client.query(`SELECT pg_advisory_unlock(9042069)`)}}
async function processOperationalExceptions(){if(!(await client.query(`SELECT pg_try_advisory_lock(9042075) ok`)).rows[0].ok)return;try{const rows=(await client.query(`WITH changed AS(UPDATE operational_exceptions SET severity=CASE WHEN sla_due_at<now()-interval '24 hours' THEN 'critical' ELSE 'high' END,updated_at=now() WHERE status<>'resolved' AND sla_due_at<now() AND severity IS DISTINCT FROM CASE WHEN sla_due_at<now()-interval '24 hours' THEN 'critical' ELSE 'high' END RETURNING *) INSERT INTO operational_exception_events(company_id,exception_id,event_type,note) SELECT company_id,id,'escalated','SLA overdue; escalated to '||severity FROM changed RETURNING exception_id`)).rows;for(const row of rows){const x=(await client.query(`SELECT e.*,o.created_by FROM operational_exceptions e LEFT JOIN sales_orders o ON o.id=e.order_id WHERE e.id=$1`,[row.exception_id])).rows[0];if(!x?.order_id)continue;const message=`${x.summary} SLA was due ${new Date(x.sla_due_at).toISOString()}.`;await client.query(`INSERT INTO warehouse_notifications(company_id,warehouse_id,user_id,event_key,title,message,order_id) SELECT $1,$2,m.user_id,$3,'Operational exception overdue',$4,$5 FROM company_members m WHERE m.company_id=$1 AND m.role IN('owner','admin','manager') AND (m.role='owner' OR EXISTS(SELECT 1 FROM user_warehouse_assignments a WHERE a.company_id=$1 AND a.user_id=m.user_id AND a.warehouse_id=$2)) ON CONFLICT DO NOTHING`,[x.company_id,x.warehouse_id,`operational-exception:${x.id}:${x.severity}`,message,x.order_id]);if(x.store_id)await client.query(`INSERT INTO store_notifications(company_id,user_id,store_id,event_key,notification_type,title,message,entity_type,entity_id) SELECT $1,u.user_id,$2,$3,'approval_requested','Fulfillment exception overdue',$4,'sales_order',$5 FROM (SELECT $6::uuid user_id UNION SELECT a.user_id FROM store_user_assignments a WHERE a.company_id=$1 AND a.store_id=$2 AND a.store_role='store_manager')u ON CONFLICT DO NOTHING`,[x.company_id,x.store_id,`operational-exception:${x.id}:${x.severity}`,message,x.order_id,x.created_by])}}finally{await client.query(`SELECT pg_advisory_unlock(9042075)`)}}
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  await client.end();
  await unlink(new URL("../.runtime/report-worker.pid", import.meta.url)).catch(
    () => {},
  );
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
await cycle();
const timer = setInterval(() => cycle().catch(console.error), 60000);
async function processDeliveryExceptions(){if(!(await client.query(`SELECT pg_try_advisory_lock(9042077) ok`)).rows[0].ok)return;try{await client.query(`INSERT INTO operational_exceptions(company_id,domain,entity_type,entity_id,order_id,warehouse_id,store_id,category,severity,summary,recommended_action,sla_due_at) SELECT sh.company_id,'dispatch','shipment',sh.id,o.id,o.warehouse_id,o.store_id,'late_delivery',CASE WHEN sh.expected_delivery_at<now()-interval '24 hours' THEN 'critical' ELSE 'high' END,sh.shipment_no||' missed its expected delivery time.','Contact the carrier, update the milestone, and notify the destination Store.',now()+interval '4 hours' FROM shipments sh JOIN sales_orders o ON o.id=sh.order_id WHERE sh.status='dispatched' AND sh.delivery_status NOT IN('delivered','returned') AND sh.expected_delivery_at<now() ON CONFLICT(company_id,domain,entity_type,entity_id,category) WHERE status<>'resolved' DO UPDATE SET severity=excluded.severity,summary=excluded.summary,updated_at=now()`)}finally{await client.query(`SELECT pg_advisory_unlock(9042077)`)}}
