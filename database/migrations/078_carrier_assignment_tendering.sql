CREATE TABLE order_carrier_assignments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,carrier_service_id uuid NOT NULL,
 source text NOT NULL DEFAULT 'preferred_route' CHECK(source IN('preferred_route','manual_override')),status text NOT NULL DEFAULT 'planned' CHECK(status IN('planned','tendered','accepted','rejected','cancelled','dispatched')),
 promised_dispatch_at timestamptz NOT NULL,expected_delivery_at timestamptz NOT NULL,override_reason text,tendered_at timestamptz,accepted_at timestamptz,rejected_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,order_id),FOREIGN KEY(company_id,carrier_service_id) REFERENCES carrier_services(company_id,id)
);
CREATE TABLE carrier_assignment_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,assignment_id uuid NOT NULL REFERENCES order_carrier_assignments(id) ON DELETE CASCADE,event_type text NOT NULL CHECK(event_type IN('planned','tendered','accepted','rejected','cancelled','dispatched')),note text,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id));
ALTER TABLE shipping_manifests ADD COLUMN carrier_service_id uuid,ADD COLUMN pickup_date date,ADD COLUMN handover_scan text,ADD COLUMN handover_at timestamptz,ADD CONSTRAINT shipping_manifests_carrier_service_fk FOREIGN KEY(company_id,carrier_service_id) REFERENCES carrier_services(company_id,id);
ALTER TABLE shipments ADD COLUMN carrier_handover_at timestamptz,ADD COLUMN carrier_handover_scan text;
CREATE VIEW dispatch_service_recommendations WITH(security_invoker=true) AS
SELECT o.company_id,o.id order_id,o.warehouse_id,o.store_id,r.carrier_service_id,c.name carrier_name,c.service_level,c.transit_days,c.cutoff_time,
 CASE WHEN localtime<c.cutoff_time THEN current_date+c.cutoff_time ELSE current_date+1+c.cutoff_time END promised_dispatch_at,
 (CASE WHEN localtime<c.cutoff_time THEN current_date+c.cutoff_time ELSE current_date+1+c.cutoff_time END)+make_interval(days=>c.transit_days) expected_delivery_at
FROM sales_orders o JOIN store_delivery_routes r ON r.company_id=o.company_id AND r.store_id=o.store_id AND r.warehouse_id=o.warehouse_id AND r.active JOIN carrier_services c ON c.company_id=r.company_id AND c.id=r.carrier_service_id AND c.active WHERE o.status='packed';
ALTER TABLE order_carrier_assignments ENABLE ROW LEVEL SECURITY;ALTER TABLE order_carrier_assignments FORCE ROW LEVEL SECURITY;ALTER TABLE carrier_assignment_events ENABLE ROW LEVEL SECURITY;ALTER TABLE carrier_assignment_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_order_carrier_assignments ON order_carrier_assignments USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_carrier_assignment_events ON carrier_assignment_events USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON order_carrier_assignments,carrier_assignment_events TO stockflow_app;GRANT SELECT ON dispatch_service_recommendations TO stockflow_app;
CREATE INDEX order_carrier_assignments_queue_idx ON order_carrier_assignments(company_id,status,promised_dispatch_at);CREATE INDEX carrier_assignment_events_timeline_idx ON carrier_assignment_events(company_id,assignment_id,created_at DESC);
