CREATE TABLE inbound_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL, receipt_no text NOT NULL, supplier text NOT NULL, external_reference text,
  expected_date date, status text NOT NULL DEFAULT 'expected' CHECK(status IN('expected','inspected','putaway','completed')),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id), UNIQUE(company_id,receipt_no),
  FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id)
);
CREATE TABLE inbound_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  receipt_id uuid NOT NULL REFERENCES inbound_receipts(id) ON DELETE CASCADE, item_id uuid NOT NULL,
  expected_quantity numeric(18,6) NOT NULL CHECK(expected_quantity>0), accepted_quantity numeric(18,6) NOT NULL DEFAULT 0,
  held_quantity numeric(18,6) NOT NULL DEFAULT 0, damaged_quantity numeric(18,6) NOT NULL DEFAULT 0,
  uom text NOT NULL, lot_number text, expiry_date date, status text NOT NULL DEFAULT 'expected' CHECK(status IN('expected','inspected','putaway','completed')),
  FOREIGN KEY(company_id,item_id) REFERENCES items(company_id,id)
);
CREATE TABLE putaway_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  receipt_line_id uuid NOT NULL REFERENCES inbound_receipt_lines(id) ON DELETE CASCADE, item_id uuid NOT NULL,
  from_location_id uuid NOT NULL, to_location_id uuid NOT NULL, quantity numeric(18,6) NOT NULL CHECK(quantity>0),
  uom text NOT NULL, lot_number text, expiry_date date, status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','completed')),
  completed_at timestamptz, completed_by uuid REFERENCES users(id),
  FOREIGN KEY(company_id,item_id) REFERENCES items(company_id,id),
  FOREIGN KEY(company_id,from_location_id) REFERENCES locations(company_id,id),
  FOREIGN KEY(company_id,to_location_id) REFERENCES locations(company_id,id)
);
ALTER TABLE inbound_receipts ENABLE ROW LEVEL SECURITY;ALTER TABLE inbound_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE inbound_receipt_lines ENABLE ROW LEVEL SECURITY;ALTER TABLE inbound_receipt_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE putaway_tasks ENABLE ROW LEVEL SECURITY;ALTER TABLE putaway_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_receipts ON inbound_receipts USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_receipt_lines ON inbound_receipt_lines USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_putaway ON putaway_tasks USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON inbound_receipts,inbound_receipt_lines,putaway_tasks TO stockflow_app;
