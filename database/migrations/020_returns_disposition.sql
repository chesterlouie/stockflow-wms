CREATE TABLE inventory_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL, return_no text NOT NULL, return_type text NOT NULL CHECK(return_type IN('customer','supplier')),
  party_name text NOT NULL, source_order_id uuid REFERENCES sales_orders(id), supplier_id uuid REFERENCES suppliers(id),
  reason text NOT NULL, status text NOT NULL DEFAULT 'received' CHECK(status IN('received','restocked','scrapped','supplier_shipped','reversed')),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id), dispositioned_at timestamptz, dispositioned_by uuid REFERENCES users(id),
  UNIQUE(company_id,return_no), UNIQUE(company_id,id), FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id)
);
CREATE TABLE inventory_return_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  return_id uuid NOT NULL REFERENCES inventory_returns(id) ON DELETE CASCADE, item_id uuid NOT NULL,
  quantity numeric(18,6) NOT NULL CHECK(quantity>0), uom text NOT NULL, lot_number text, expiry_date date,
  source_location_id uuid, quarantine_location_id uuid NOT NULL, disposition_location_id uuid,
  disposition text NOT NULL DEFAULT 'pending' CHECK(disposition IN('pending','restock','scrap','return_supplier','reversed')),
  FOREIGN KEY(company_id,item_id) REFERENCES items(company_id,id),
  FOREIGN KEY(company_id,source_location_id) REFERENCES locations(company_id,id),
  FOREIGN KEY(company_id,quarantine_location_id) REFERENCES locations(company_id,id),
  FOREIGN KEY(company_id,disposition_location_id) REFERENCES locations(company_id,id)
);
CREATE INDEX inventory_returns_company_status_idx ON inventory_returns(company_id,status,created_at DESC);
ALTER TABLE inventory_returns ENABLE ROW LEVEL SECURITY; ALTER TABLE inventory_returns FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_return_lines ENABLE ROW LEVEL SECURITY; ALTER TABLE inventory_return_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_inventory_returns ON inventory_returns USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_inventory_return_lines ON inventory_return_lines USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON inventory_returns,inventory_return_lines TO stockflow_app;
