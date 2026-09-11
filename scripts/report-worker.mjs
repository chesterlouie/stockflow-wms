import pg from "pg";
import { writeFile, unlink } from "node:fs/promises";
import { sendEmail, emailConfigured, escapeHtml } from "../lib/email.ts";
import { generateScheduledCount } from "../lib/cycle-counts.ts";
import { decryptCarrierSecret } from "../lib/carrier-secrets.ts";
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
  await processCarrierTenderExceptions();
  await processCarrierTenderCapacity();
  await processCarrierIntegrationJobs();
  await processCarrierSlaGovernance();
  const safeTimer = setInterval(
    () =>
      Promise.all([createAlerts(), processApprovals(),processCountSchedules(),processVkitBackorders(),processOperationalExceptions(),processDeliveryExceptions(),processCarrierTenderExceptions(),processCarrierTenderCapacity(),processCarrierIntegrationJobs(),processCarrierSlaGovernance()]).catch(console.error),
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
    await processCarrierTenderExceptions();
    await processCarrierTenderCapacity();
    await processCarrierIntegrationJobs();
    await processCarrierSlaGovernance();
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
async function processCarrierIntegrationJobs(){if(!(await client.query(`SELECT pg_try_advisory_lock(9042079) ok`)).rows[0].ok)return;try{const jobs=(await client.query(`SELECT j.*,i.api_base_url,i.api_key_encrypted,i.booking_path,i.tracking_path_template,sh.shipment_no,sh.tracking_number,sh.external_shipment_id FROM carrier_integration_jobs j JOIN carrier_integrations i ON i.id=j.carrier_integration_id JOIN shipments sh ON sh.id=j.shipment_id WHERE j.status IN('pending','retry') AND j.next_attempt_at<=now() AND i.active ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 20`)).rows;for(const j of jobs){try{await client.query(`UPDATE carrier_integration_jobs SET status='processing',attempts=attempts+1,updated_at=now() WHERE id=$1`,[j.id]);const path=j.job_type==='book'?j.booking_path:j.tracking_path_template.replace('{external_id}',encodeURIComponent(j.external_shipment_id||j.tracking_number)),response=await fetch(new URL(path,j.api_base_url),{method:j.job_type==='book'?'POST':'GET',headers:{authorization:`Bearer ${await decryptCarrierSecret(j.api_key_encrypted)}`,'content-type':'application/json','idempotency-key':j.id},body:j.job_type==='book'?JSON.stringify(j.request_payload):undefined,signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`HTTP_${response.status}`);const data=await response.json();await client.query(`UPDATE carrier_integration_jobs SET status='completed',response_payload=$2,completed_at=now(),updated_at=now() WHERE id=$1`,[j.id,data]);await client.query(`UPDATE shipments SET external_shipment_id=coalesce($2,external_shipment_id),tracking_number=coalesce($3,tracking_number),external_label_url=coalesce($4,external_label_url),carrier_last_sync_at=now(),carrier_sync_status='synced' WHERE id=$1`,[j.shipment_id,data.id||null,data.trackingNumber||null,data.labelUrl||null]);await client.query(`UPDATE carrier_integrations SET last_success_at=now(),last_error=NULL WHERE id=$1`,[j.carrier_integration_id])}catch(e){const message=e instanceof Error?e.message:'carrier_job_failed',attempts=j.attempts+1,dead=attempts>=5;await client.query(`UPDATE carrier_integration_jobs SET status=$2,last_error=$3,next_attempt_at=now()+make_interval(mins=>least(60,power(2,$4)::int)),updated_at=now() WHERE id=$1`,[j.id,dead?'dead_letter':'retry',message,attempts]);await client.query(`UPDATE shipments SET carrier_sync_status='failed' WHERE id=$1`,[j.shipment_id]);await client.query(`UPDATE carrier_integrations SET last_failure_at=now(),last_error=$2 WHERE id=$1`,[j.carrier_integration_id,message]);if(dead)await client.query(`INSERT INTO operational_exceptions(company_id,domain,entity_type,entity_id,order_id,warehouse_id,store_id,category,severity,summary,recommended_action,sla_due_at) SELECT sh.company_id,'dispatch','carrier_job',j.id,sh.order_id,o.warehouse_id,o.store_id,'carrier_integration_dead_letter','high',sh.shipment_no||' carrier integration failed after five attempts.','Review credentials and endpoint, then retry the carrier job.',now()+interval '4 hours' FROM carrier_integration_jobs j JOIN shipments sh ON sh.id=j.shipment_id JOIN sales_orders o ON o.id=sh.order_id WHERE j.id=$1 ON CONFLICT(company_id,domain,entity_type,entity_id,category) WHERE status<>'resolved' DO UPDATE SET summary=excluded.summary,updated_at=now()`,[j.id])}}}finally{await client.query(`SELECT pg_advisory_unlock(9042079)`)}}
async function processCarrierTenderExceptions(){if(!(await client.query(`SELECT pg_try_advisory_lock(9042078) ok`)).rows[0].ok)return;try{await client.query(`INSERT INTO operational_exceptions(company_id,domain,entity_type,entity_id,order_id,warehouse_id,store_id,category,severity,summary,recommended_action,sla_due_at) SELECT a.company_id,'dispatch','carrier_assignment',a.id,o.id,o.warehouse_id,o.store_id,'late_carrier_pickup',CASE WHEN a.promised_dispatch_at<now()-interval '4 hours' THEN 'critical' ELSE 'high' END,o.order_no||' missed its planned carrier handover.','Confirm carrier capacity, retender the order, or record the actual handover.',now()+interval '2 hours' FROM order_carrier_assignments a JOIN sales_orders o ON o.id=a.order_id WHERE a.status IN('planned','tendered','accepted') AND a.promised_dispatch_at<now() ON CONFLICT(company_id,domain,entity_type,entity_id,category) WHERE status<>'resolved' DO UPDATE SET severity=excluded.severity,summary=excluded.summary,updated_at=now()`)}finally{await client.query(`SELECT pg_advisory_unlock(9042078)`)}}
async function processCarrierTenderCapacity(){if(!(await client.query(`SELECT pg_try_advisory_lock(9042088) ok`)).rows[0].ok)return;try{await client.query('BEGIN');const expired=(await client.query(`SELECT t.id,t.company_id,t.assignment_id,o.id order_id,o.warehouse_id,o.store_id,o.order_no FROM carrier_tender_attempts t JOIN order_carrier_assignments a ON a.id=t.assignment_id JOIN sales_orders o ON o.id=a.order_id WHERE t.status='submitted' AND t.response_due_at<now() FOR UPDATE OF t SKIP LOCKED`)).rows;for(const x of expired){await client.query(`UPDATE carrier_tender_attempts SET status='expired',responded_at=now(),response_note='Response SLA expired automatically.' WHERE id=$1`,[x.id]);await client.query(`UPDATE carrier_capacity_reservations SET status='released',released_at=now() WHERE assignment_id=$1 AND status='reserved'`,[x.assignment_id]);await client.query(`UPDATE order_carrier_assignments SET status='rejected',updated_at=now() WHERE id=$1`,[x.assignment_id]);await client.query(`INSERT INTO carrier_assignment_events(company_id,assignment_id,event_type,note) VALUES($1,$2,'rejected','Carrier response SLA expired; capacity released for fallback.')`,[x.company_id,x.assignment_id]);await client.query(`INSERT INTO operational_exceptions(company_id,domain,entity_type,entity_id,order_id,warehouse_id,store_id,category,severity,summary,recommended_action,sla_due_at) VALUES($1,'dispatch','carrier_assignment',$2,$3,$4,$5,'carrier_tender_no_response','high',$6,'Open Carrier tenders and select Use next ranked carrier.',now()+interval '30 minutes') ON CONFLICT(company_id,domain,entity_type,entity_id,category) WHERE status<>'resolved' DO UPDATE SET severity='high',summary=excluded.summary,updated_at=now()`,[x.company_id,x.assignment_id,x.order_id,x.warehouse_id,x.store_id,`${x.order_no} carrier tender expired without a response.`])}await client.query('COMMIT')}catch(e){await client.query('ROLLBACK');throw e}finally{await client.query(`SELECT pg_advisory_unlock(9042088)`)}}
async function processDeliveryExceptions(){if(!(await client.query(`SELECT pg_try_advisory_lock(9042077) ok`)).rows[0].ok)return;try{await client.query(`INSERT INTO operational_exceptions(company_id,domain,entity_type,entity_id,order_id,warehouse_id,store_id,category,severity,summary,recommended_action,sla_due_at) SELECT sh.company_id,'dispatch','shipment',sh.id,o.id,o.warehouse_id,o.store_id,'late_delivery',CASE WHEN sh.expected_delivery_at<now()-interval '24 hours' THEN 'critical' ELSE 'high' END,sh.shipment_no||' missed its expected delivery time.','Contact the carrier, update the milestone, and notify the destination Store.',now()+interval '4 hours' FROM shipments sh JOIN sales_orders o ON o.id=sh.order_id WHERE sh.status='dispatched' AND sh.delivery_status NOT IN('delivered','returned') AND sh.expected_delivery_at<now() ON CONFLICT(company_id,domain,entity_type,entity_id,category) WHERE status<>'resolved' DO UPDATE SET severity=excluded.severity,summary=excluded.summary,updated_at=now()`)}finally{await client.query(`SELECT pg_advisory_unlock(9042077)`)}}
async function processCarrierSlaGovernance(){if(!(await client.query(`SELECT pg_try_advisory_lock(9042084) ok`)).rows[0].ok)return;try{const reviews=(await client.query(`WITH due AS(SELECT s.*,m.user_id actor FROM carrier_performance_scorecards s JOIN carrier_sla_automation_configs a ON a.company_id=s.company_id AND a.enabled JOIN LATERAL(SELECT user_id FROM company_members WHERE company_id=s.company_id AND role='owner' ORDER BY user_id LIMIT 1)m ON true WHERE extract(day FROM current_date)>=a.review_day AND s.period=date_trunc('month',current_date-interval '1 month')::date) INSERT INTO carrier_performance_reviews(company_id,carrier_service_id,warehouse_id,period_start,period_end,status,score,review_note,created_by,generation_source,breach_count) SELECT company_id,carrier_service_id,warehouse_id,period,(period+interval '1 month'-interval '1 day')::date,'in_review',score,'Automatically generated monthly carrier SLA review.',actor,'scheduled',breach_count FROM due ON CONFLICT(company_id,carrier_service_id,warehouse_id,period_start,period_end) DO NOTHING RETURNING *`)).rows;for(const x of reviews)await client.query(`INSERT INTO carrier_sla_notifications(company_id,user_id,carrier_service_id,warehouse_id,event_key,title,message,link_path,entity_type,entity_id,priority) SELECT $1,m.user_id,$2,$3,$4,$5,$6,'/app/carrier-scorecards','carrier_performance_review',$7,CASE WHEN $8>0 THEN 'high' ELSE 'normal' END FROM company_members m WHERE m.company_id=$1 AND m.role IN('owner','admin','manager') AND(m.role='owner' OR EXISTS(SELECT 1 FROM user_warehouse_assignments a WHERE a.company_id=$1 AND a.user_id=m.user_id AND a.warehouse_id=$3)) ON CONFLICT DO NOTHING`,[x.company_id,x.carrier_service_id,x.warehouse_id,`carrier-review:${x.id}:scheduled`,x.breach_count>0?'Carrier SLA breach needs review':'Monthly carrier review ready',`${x.breach_count} target breach(es); score ${x.score}.`,x.id,x.breach_count]);await client.query(`INSERT INTO carrier_sla_notifications(company_id,user_id,carrier_service_id,event_key,title,message,link_path,entity_type,entity_id,priority) SELECT c.company_id,m.user_id,c.carrier_service_id,'carrier-contract:'||c.id||':renewal:'||c.effective_to,'Carrier contract renewal due',c.contract_number||' expires on '||c.effective_to,'/app/carrier-scorecards/contracts/'||c.id,'carrier_contract',c.id,'high' FROM carrier_contracts c JOIN carrier_sla_automation_configs a ON a.company_id=c.company_id AND a.enabled JOIN company_members m ON m.company_id=c.company_id AND m.role IN('owner','admin') WHERE c.status='active' AND c.effective_to BETWEEN current_date AND current_date+a.contract_warning_days ON CONFLICT DO NOTHING`);await client.query(`INSERT INTO carrier_sla_notifications(company_id,user_id,carrier_service_id,warehouse_id,event_key,title,message,link_path,entity_type,entity_id,priority) SELECT a.company_id,coalesce(a.owner_id,m.user_id),r.carrier_service_id,r.warehouse_id,'carrier-action:'||a.id||':overdue','Carrier corrective action overdue',a.title||' was due '||a.due_at,'/app/carrier-scorecards','carrier_corrective_action',a.id,'critical' FROM carrier_corrective_actions a JOIN carrier_performance_reviews r ON r.id=a.review_id JOIN carrier_sla_automation_configs cfg ON cfg.company_id=a.company_id AND cfg.enabled JOIN LATERAL(SELECT user_id FROM company_members WHERE company_id=a.company_id AND role='owner' ORDER BY user_id LIMIT 1)m ON true WHERE a.status IN('open','in_progress') AND a.due_at+make_interval(hours=>cfg.corrective_action_grace_hours)<now() ON CONFLICT DO NOTHING`)}finally{await client.query(`SELECT pg_advisory_unlock(9042084)`)}}
