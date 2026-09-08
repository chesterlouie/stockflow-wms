CREATE TABLE order_release_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE, warehouse_id uuid NOT NULL,
  event_type text NOT NULL CHECK(event_type IN('reviewed','wave_created','deferred','escalated')),
  planning_status text NOT NULL, recommendation text NOT NULL, score integer NOT NULL,
  wave_id uuid REFERENCES pick_waves(id) ON DELETE SET NULL, note text, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id)
);
CREATE INDEX order_release_events_order_time_idx ON order_release_events(company_id,order_id,created_at DESC);
ALTER TABLE order_release_events ENABLE ROW LEVEL SECURITY; ALTER TABLE order_release_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_order_release_events ON order_release_events USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT ON order_release_events TO stockflow_app;

CREATE VIEW order_release_plan WITH (security_invoker=true) AS
WITH facts AS (
 SELECT o.company_id,o.id order_id,o.order_no,o.warehouse_id,o.store_id,o.customer,o.priority,o.status,o.requested_ship_date,o.created_at,o.backorder_status,
   count(DISTINCT l.id) line_count,
   count(DISTINCT p.id) FILTER(WHERE p.status='pending') pending_picks,
   count(DISTINCT p.id) FILTER(WHERE p.status='pending' AND p.wave_id IS NULL) unassigned_picks,
   count(DISTINCT e.id) FILTER(WHERE e.status<>'resolved') open_exceptions,
   count(DISTINCT j.id) FILTER(WHERE j.status='pending') pending_supply,
   count(DISTINCT j.id) FILTER(WHERE j.status='exception') allocation_failures
 FROM sales_orders o JOIN sales_order_lines l ON l.company_id=o.company_id AND l.order_id=o.id
 LEFT JOIN stock_allocations a ON a.company_id=l.company_id AND a.order_line_id=l.id
 LEFT JOIN pick_tasks p ON p.company_id=a.company_id AND p.allocation_id=a.id
 LEFT JOIN operational_exceptions e ON e.company_id=o.company_id AND e.order_id=o.id
 LEFT JOIN replenishment_allocation_jobs j ON j.company_id=o.company_id AND j.order_id=o.id
 WHERE o.status<>'dispatched'
 GROUP BY o.id
), classified AS (
 SELECT f.*,
   CASE WHEN open_exceptions>0 OR allocation_failures>0 THEN 'blocked'
        WHEN requested_ship_date IS NOT NULL AND requested_ship_date<=current_date+2 AND status NOT IN('packed','dispatched') THEN 'at_risk'
        WHEN status='packed' THEN 'ready_to_dispatch'
        WHEN status IN('allocated','picking') AND unassigned_picks>0 THEN 'ready_to_wave'
        WHEN status='new' AND coalesce(backorder_status,'ready')='ready' THEN 'ready_to_release'
        WHEN pending_supply>0 OR backorder_status='waiting' THEN 'waiting_for_stock'
        ELSE 'in_progress' END planning_status
 FROM facts f
)
SELECT c.*,
 CASE planning_status WHEN 'blocked' THEN 'Resolve exception' WHEN 'at_risk' THEN 'Expedite and review' WHEN 'ready_to_dispatch' THEN 'Dispatch order' WHEN 'ready_to_wave' THEN 'Add to pick wave' WHEN 'ready_to_release' THEN 'Validate and allocate' WHEN 'waiting_for_stock' THEN 'Track inbound supply' ELSE 'Continue fulfillment' END recommended_action,
 (CASE priority WHEN 'urgent' THEN 400 WHEN 'high' THEN 300 WHEN 'normal' THEN 200 ELSE 100 END
  + CASE planning_status WHEN 'blocked' THEN 90 WHEN 'at_risk' THEN 80 WHEN 'ready_to_dispatch' THEN 70 WHEN 'ready_to_wave' THEN 60 WHEN 'ready_to_release' THEN 50 ELSE 10 END
  + greatest(0,least(60,current_date-coalesce(requested_ship_date,current_date))))::integer) priority_score
FROM classified c;
GRANT SELECT ON order_release_plan TO stockflow_app;
