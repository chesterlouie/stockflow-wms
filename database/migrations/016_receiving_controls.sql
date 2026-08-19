ALTER TABLE items ADD COLUMN over_receipt_tolerance_percent numeric(6,3) NOT NULL DEFAULT 0 CHECK(over_receipt_tolerance_percent BETWEEN 0 AND 100), ADD COLUMN minimum_shelf_life_days integer NOT NULL DEFAULT 0 CHECK(minimum_shelf_life_days BETWEEN 0 AND 3650);
ALTER TABLE putaway_tasks ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE inbound_receipts DROP CONSTRAINT inbound_receipts_status_check;
ALTER TABLE inbound_receipts ADD CONSTRAINT inbound_receipts_status_check CHECK(status IN('expected','partial','inspected','putaway','completed'));
ALTER TABLE inbound_receipt_lines DROP CONSTRAINT inbound_receipt_lines_status_check;
ALTER TABLE inbound_receipt_lines ADD CONSTRAINT inbound_receipt_lines_status_check CHECK(status IN('expected','partial','inspected','putaway','completed'));
CREATE TABLE receipt_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  receipt_line_id uuid NOT NULL REFERENCES inbound_receipt_lines(id) ON DELETE CASCADE,
  accepted_quantity numeric(18,6) NOT NULL DEFAULT 0,held_quantity numeric(18,6) NOT NULL DEFAULT 0,damaged_quantity numeric(18,6) NOT NULL DEFAULT 0,
  lot_number text,expiry_date date,created_by uuid REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE received_serials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  receipt_inspection_id uuid NOT NULL REFERENCES receipt_inspections(id) ON DELETE CASCADE,item_id uuid NOT NULL,
  serial_number text NOT NULL,status text NOT NULL DEFAULT 'available' CHECK(status IN('available','held','damaged','issued')),
  created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,serial_number),FOREIGN KEY(company_id,item_id) REFERENCES items(company_id,id)
);
ALTER TABLE receipt_inspections ENABLE ROW LEVEL SECURITY;ALTER TABLE receipt_inspections FORCE ROW LEVEL SECURITY;
ALTER TABLE received_serials ENABLE ROW LEVEL SECURITY;ALTER TABLE received_serials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_receipt_inspections ON receipt_inspections USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_received_serials ON received_serials USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON receipt_inspections,received_serials TO stockflow_app;
