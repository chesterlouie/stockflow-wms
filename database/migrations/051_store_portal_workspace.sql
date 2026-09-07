CREATE TABLE store_locations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL, code text NOT NULL, name text NOT NULL, location_type text NOT NULL DEFAULT 'sales_floor' CHECK(location_type IN('receiving','backroom','sales_floor','hold','damaged')),
  active boolean NOT NULL DEFAULT true, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,store_id,code), UNIQUE(company_id,id), FOREIGN KEY(company_id,store_id) REFERENCES requesting_stores(company_id,id)
);
CREATE TABLE store_inventory_counts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL, count_no text NOT NULL, status text NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','approved','rejected')),
  notes text, submitted_by uuid NOT NULL REFERENCES users(id), submitted_at timestamptz NOT NULL DEFAULT now(), approved_by uuid REFERENCES users(id), approved_at timestamptz,
  UNIQUE(company_id,count_no), UNIQUE(company_id,id), FOREIGN KEY(company_id,store_id) REFERENCES requesting_stores(company_id,id)
);
CREATE TABLE store_inventory_count_lines(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  count_id uuid NOT NULL, item_id uuid NOT NULL, lot_number text, expiry_date date, system_quantity numeric(18,6) NOT NULL,
  counted_quantity numeric(18,6) NOT NULL CHECK(counted_quantity>=0), uom text NOT NULL,
  FOREIGN KEY(company_id,count_id) REFERENCES store_inventory_counts(company_id,id) ON DELETE CASCADE,
  FOREIGN KEY(company_id,item_id) REFERENCES items(company_id,id)
);
ALTER TABLE store_locations ENABLE ROW LEVEL SECURITY; ALTER TABLE store_locations FORCE ROW LEVEL SECURITY;
ALTER TABLE store_inventory_counts ENABLE ROW LEVEL SECURITY; ALTER TABLE store_inventory_counts FORCE ROW LEVEL SECURITY;
ALTER TABLE store_inventory_count_lines ENABLE ROW LEVEL SECURITY; ALTER TABLE store_inventory_count_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_store_locations ON store_locations USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_store_inventory_counts ON store_inventory_counts USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_store_inventory_count_lines ON store_inventory_count_lines USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON store_locations,store_inventory_counts,store_inventory_count_lines TO stockflow_app;
