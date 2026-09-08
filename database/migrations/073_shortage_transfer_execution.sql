ALTER TABLE shortage_supply_transfers DROP CONSTRAINT shortage_supply_transfers_status_check;
ALTER TABLE shortage_supply_transfers
  ADD COLUMN approved_quantity numeric(18,6) NOT NULL DEFAULT 0 CHECK(approved_quantity>=0),
  ADD COLUMN dispatched_quantity numeric(18,6) NOT NULL DEFAULT 0 CHECK(dispatched_quantity>=0),
  ADD COLUMN received_quantity numeric(18,6) NOT NULL DEFAULT 0 CHECK(received_quantity>=0),
  ADD COLUMN approved_by uuid REFERENCES users(id), ADD COLUMN approved_at timestamptz,
  ADD COLUMN dispatched_by uuid REFERENCES users(id), ADD COLUMN dispatched_at timestamptz,
  ADD COLUMN received_by uuid REFERENCES users(id), ADD COLUMN received_at timestamptz,
  ADD COLUMN closed_by uuid REFERENCES users(id), ADD COLUMN closed_at timestamptz, ADD COLUMN close_reason text,
  ADD CONSTRAINT shortage_supply_transfers_status_check CHECK(status IN('draft','approved','partially_dispatched','dispatched','partially_received','received','cancelled','reversed')),
  ADD CONSTRAINT shortage_supply_transfer_totals_check CHECK(received_quantity<=dispatched_quantity AND dispatched_quantity<=quantity AND approved_quantity<=quantity);

CREATE TABLE shortage_supply_transfer_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 transfer_id uuid NOT NULL REFERENCES shortage_supply_transfers(id) ON DELETE CASCADE,
 event_type text NOT NULL CHECK(event_type IN('approved','dispatch','receipt','cancelled','reversed')),
 quantity numeric(18,6) CHECK(quantity IS NULL OR quantity>0),uom text,
 warehouse_location_id uuid,store_location_id uuid,scanned_location text,scanned_item text,
 lot_number text,expiry_date date,warehouse_ledger_id uuid REFERENCES inventory_ledger(id),store_ledger_id uuid REFERENCES store_inventory_ledger(id),
 reversal_of uuid REFERENCES shortage_supply_transfer_events(id),reason text,performed_by uuid NOT NULL REFERENCES users(id),occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,warehouse_location_id) REFERENCES locations(company_id,id),FOREIGN KEY(company_id,store_location_id) REFERENCES store_locations(company_id,id)
);
CREATE INDEX shortage_transfer_queue_idx ON shortage_supply_transfers(company_id,status,created_at DESC);
CREATE INDEX shortage_transfer_events_idx ON shortage_supply_transfer_events(company_id,transfer_id,occurred_at);
ALTER TABLE shortage_supply_transfer_events ENABLE ROW LEVEL SECURITY;ALTER TABLE shortage_supply_transfer_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_shortage_supply_transfer_events ON shortage_supply_transfer_events USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON shortage_supply_transfer_events TO stockflow_app;
