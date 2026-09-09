CREATE TABLE carrier_services(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 code text NOT NULL,name text NOT NULL,service_level text NOT NULL,transit_days integer NOT NULL CHECK(transit_days BETWEEN 0 AND 90),
 cutoff_time time NOT NULL DEFAULT '17:00',tracking_url_template text,contact_name text,contact_email text,contact_phone text,active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),UNIQUE(company_id,code),UNIQUE(company_id,id)
);
CREATE TABLE store_delivery_routes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,store_id uuid NOT NULL,warehouse_id uuid NOT NULL,carrier_service_id uuid NOT NULL,
 dispatch_weekdays integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),
 UNIQUE(company_id,store_id,warehouse_id),FOREIGN KEY(company_id,store_id) REFERENCES requesting_stores(company_id,id),FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id),FOREIGN KEY(company_id,carrier_service_id) REFERENCES carrier_services(company_id,id)
);
ALTER TABLE shipments ADD COLUMN carrier_service_id uuid,ADD COLUMN promised_dispatch_at timestamptz,ADD COLUMN expected_delivery_at timestamptz,
 ADD COLUMN delivery_status text NOT NULL DEFAULT 'ready_for_pickup' CHECK(delivery_status IN('ready_for_pickup','picked_up','in_transit','out_for_delivery','delivered','failed','returned')),
 ADD COLUMN delivered_at timestamptz,ADD COLUMN recipient_name text,ADD COLUMN proof_reference text,
 ADD CONSTRAINT shipments_carrier_service_fk FOREIGN KEY(company_id,carrier_service_id) REFERENCES carrier_services(company_id,id);
CREATE TABLE shipment_tracking_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN('ready_for_pickup','picked_up','in_transit','out_for_delivery','delivered','failed','returned')),
 event_at timestamptz NOT NULL DEFAULT now(),location text,note text,recipient_name text,proof_reference text,created_by uuid REFERENCES users(id),UNIQUE(company_id,shipment_id,status,event_at)
);
CREATE INDEX shipment_tracking_events_timeline_idx ON shipment_tracking_events(company_id,shipment_id,event_at DESC);
ALTER TABLE carrier_services ENABLE ROW LEVEL SECURITY;ALTER TABLE carrier_services FORCE ROW LEVEL SECURITY;ALTER TABLE store_delivery_routes ENABLE ROW LEVEL SECURITY;ALTER TABLE store_delivery_routes FORCE ROW LEVEL SECURITY;ALTER TABLE shipment_tracking_events ENABLE ROW LEVEL SECURITY;ALTER TABLE shipment_tracking_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_carrier_services ON carrier_services USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_store_delivery_routes ON store_delivery_routes USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_shipment_tracking_events ON shipment_tracking_events USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON carrier_services,store_delivery_routes,shipment_tracking_events TO stockflow_app;
CREATE VIEW delivery_performance_kpis WITH(security_invoker=true) AS SELECT s.company_id,o.warehouse_id,o.store_id,date_trunc('day',s.dispatched_at)::date activity_date,count(*) shipments,
 count(*)FILTER(WHERE s.promised_dispatch_at IS NULL OR s.dispatched_at<=s.promised_dispatch_at) on_time_dispatch,
 count(*)FILTER(WHERE s.delivery_status='delivered' AND (s.expected_delivery_at IS NULL OR s.delivered_at<=s.expected_delivery_at)) on_time_delivery,
 count(*)FILTER(WHERE s.delivery_status='failed') failed_delivery,
 avg(extract(epoch FROM(s.delivered_at-s.dispatched_at))/3600)FILTER(WHERE s.delivered_at IS NOT NULL) avg_transit_hours
 FROM shipments s JOIN sales_orders o ON o.id=s.order_id GROUP BY s.company_id,o.warehouse_id,o.store_id,date_trunc('day',s.dispatched_at)::date;
GRANT SELECT ON delivery_performance_kpis TO stockflow_app;
