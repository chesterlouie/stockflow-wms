CREATE TABLE inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL, count_no text NOT NULL, count_type text NOT NULL CHECK(count_type IN('cycle','physical','wall_to_wall')),
  location_id uuid, blind_count boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'open' CHECK(status IN('open','counted','approved','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  submitted_at timestamptz, submitted_by uuid REFERENCES users(id), approved_at timestamptz, approved_by uuid REFERENCES users(id),
  UNIQUE(company_id,count_no), FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id),
  FOREIGN KEY(company_id,location_id) REFERENCES locations(company_id,id)
);
CREATE TABLE inventory_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  count_id uuid NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE, item_id uuid NOT NULL, location_id uuid NOT NULL,
  lot_number text, expiry_date date, system_quantity numeric(18,6) NOT NULL, counted_quantity numeric(18,6), uom text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','counted','approved')),
  counted_at timestamptz, counted_by uuid REFERENCES users(id),
  FOREIGN KEY(company_id,item_id) REFERENCES items(company_id,id), FOREIGN KEY(company_id,location_id) REFERENCES locations(company_id,id)
);
CREATE INDEX inventory_counts_company_status_idx ON inventory_counts(company_id,status,created_at DESC);
CREATE INDEX inventory_count_lines_count_idx ON inventory_count_lines(company_id,count_id,status);
ALTER TABLE inventory_counts ENABLE ROW LEVEL SECURITY; ALTER TABLE inventory_counts FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_count_lines ENABLE ROW LEVEL SECURITY; ALTER TABLE inventory_count_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_inventory_counts ON inventory_counts USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_inventory_count_lines ON inventory_count_lines USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON inventory_counts,inventory_count_lines TO stockflow_app;
