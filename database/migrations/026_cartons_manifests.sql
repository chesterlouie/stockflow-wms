CREATE TABLE packing_cartons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE, carton_no text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN('open','sealed','dispatched')),
  weight_kg numeric(12,3), length_cm numeric(12,2), width_cm numeric(12,2), height_cm numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id), sealed_at timestamptz, sealed_by uuid REFERENCES users(id),
  UNIQUE(company_id,carton_no)
);
CREATE TABLE carton_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  carton_id uuid NOT NULL REFERENCES packing_cartons(id) ON DELETE CASCADE, pick_task_id uuid NOT NULL REFERENCES pick_tasks(id) ON DELETE RESTRICT,
  quantity numeric(18,6) NOT NULL CHECK(quantity>0), packed_at timestamptz NOT NULL DEFAULT now(), packed_by uuid REFERENCES users(id),
  UNIQUE(company_id,pick_task_id)
);
CREATE TABLE shipping_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  manifest_no text NOT NULL, carrier text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id), closed_at timestamptz, closed_by uuid REFERENCES users(id),
  UNIQUE(company_id,manifest_no)
);
CREATE TABLE manifest_shipments (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE, manifest_id uuid NOT NULL REFERENCES shipping_manifests(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT, PRIMARY KEY(company_id,shipment_id)
);
ALTER TABLE packing_cartons ENABLE ROW LEVEL SECURITY; ALTER TABLE packing_cartons FORCE ROW LEVEL SECURITY;
ALTER TABLE carton_items ENABLE ROW LEVEL SECURITY; ALTER TABLE carton_items FORCE ROW LEVEL SECURITY;
ALTER TABLE shipping_manifests ENABLE ROW LEVEL SECURITY; ALTER TABLE shipping_manifests FORCE ROW LEVEL SECURITY;
ALTER TABLE manifest_shipments ENABLE ROW LEVEL SECURITY; ALTER TABLE manifest_shipments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_packing_cartons ON packing_cartons USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_carton_items ON carton_items USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_shipping_manifests ON shipping_manifests USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_manifest_shipments ON manifest_shipments USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON packing_cartons,carton_items,shipping_manifests,manifest_shipments TO stockflow_app;
CREATE INDEX packing_cartons_order_idx ON packing_cartons(company_id,order_id,status);
CREATE INDEX shipping_manifests_status_idx ON shipping_manifests(company_id,status,created_at DESC);
