CREATE TABLE vkit_backorder_escalations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,severity text NOT NULL CHECK(severity IN('due_soon','overdue','critical')),
  event_key text NOT NULL,message text NOT NULL,acknowledged_by uuid REFERENCES users(id),acknowledged_at timestamptz,resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,order_id,severity)
);
CREATE INDEX vkit_backorder_escalations_open_idx ON vkit_backorder_escalations(company_id,acknowledged_at,created_at DESC);
ALTER TABLE vkit_backorder_escalations ENABLE ROW LEVEL SECURITY;ALTER TABLE vkit_backorder_escalations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_vkit_backorder_escalations ON vkit_backorder_escalations USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON vkit_backorder_escalations TO stockflow_app;

CREATE OR REPLACE VIEW vkit_backorder_summary WITH (security_invoker=true) AS
SELECT o.company_id,o.id,o.order_no,o.parent_order_id,o.warehouse_id,o.store_id,o.backorder_status,o.requested_ship_date,
       (current_date-o.created_at::date) age_days,CASE WHEN o.requested_ship_date IS NULL THEN 'waiting' WHEN o.requested_ship_date<current_date-7 THEN 'critical' WHEN o.requested_ship_date<current_date THEN 'overdue' WHEN o.requested_ship_date<=current_date+2 THEN 'due_soon' ELSE o.backorder_status END attention_status
FROM sales_orders o WHERE o.parent_order_id IS NOT NULL;
GRANT SELECT ON vkit_backorder_summary TO stockflow_app;
