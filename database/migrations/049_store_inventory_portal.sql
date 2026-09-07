ALTER TABLE store_delivery_receipts
  ADD COLUMN approval_status text NOT NULL DEFAULT 'pending' CHECK(approval_status IN('pending','approved','rejected')),
  ADD COLUMN approved_by uuid REFERENCES users(id),
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN approval_note text;

ALTER TABLE store_delivery_receipt_lines
  ADD COLUMN lot_number text,
  ADD COLUMN expiry_date date,
  ADD COLUMN source_ledger_id uuid REFERENCES inventory_ledger(id),
  ADD COLUMN item_id uuid,
  ADD COLUMN uom text;
ALTER TABLE store_delivery_receipt_lines ALTER COLUMN order_line_id DROP NOT NULL;
ALTER TABLE store_delivery_receipt_lines ADD CONSTRAINT store_delivery_receipt_lines_company_item_fk FOREIGN KEY(company_id,item_id) REFERENCES items(company_id,id);
ALTER TABLE store_delivery_receipt_lines DROP CONSTRAINT store_delivery_receipt_lines_receipt_id_order_line_id_key;
ALTER TABLE store_delivery_receipt_lines ADD CONSTRAINT store_delivery_receipt_lines_receipt_ledger_key UNIQUE(receipt_id,source_ledger_id);

CREATE TABLE store_inventory_transactions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transaction_no text NOT NULL,
  transaction_type text NOT NULL CHECK(transaction_type IN('return','transfer','misc_issue')),
  from_store_id uuid NOT NULL,
  to_store_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
  reason_code text NOT NULL,
  notes text,
  requested_by uuid NOT NULL REFERENCES users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  approval_note text,
  UNIQUE(company_id,transaction_no),
  UNIQUE(company_id,id),
  FOREIGN KEY(company_id,from_store_id) REFERENCES requesting_stores(company_id,id),
  FOREIGN KEY(company_id,to_store_id) REFERENCES requesting_stores(company_id,id),
  CHECK(transaction_type='transfer' AND to_store_id IS NOT NULL AND to_store_id<>from_store_id OR transaction_type<>'transfer' AND to_store_id IS NULL)
);

CREATE TABLE store_inventory_transaction_lines(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL,
  item_id uuid NOT NULL,
  quantity numeric(18,6) NOT NULL CHECK(quantity>0),
  uom text NOT NULL,
  lot_number text,
  expiry_date date,
  FOREIGN KEY(company_id,transaction_id) REFERENCES store_inventory_transactions(company_id,id) ON DELETE CASCADE,
  FOREIGN KEY(company_id,item_id) REFERENCES items(company_id,id)
);

CREATE TABLE store_inventory_ledger(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  item_id uuid NOT NULL,
  movement_type text NOT NULL CHECK(movement_type IN('receipt','return','transfer_out','transfer_in','misc_issue','reversal')),
  quantity numeric(18,6) NOT NULL CHECK(quantity<>0),
  uom text NOT NULL,
  lot_number text,
  expiry_date date,
  reference_type text NOT NULL,
  reference_id text NOT NULL,
  transaction_group_id uuid NOT NULL DEFAULT gen_random_uuid(),
  reason_code text,
  note text,
  created_by uuid REFERENCES users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(company_id,store_id) REFERENCES requesting_stores(company_id,id),
  FOREIGN KEY(company_id,item_id) REFERENCES items(company_id,id)
);

CREATE INDEX store_inventory_ledger_balance_idx ON store_inventory_ledger(company_id,store_id,item_id,lot_number,expiry_date);
CREATE INDEX store_inventory_transactions_queue_idx ON store_inventory_transactions(company_id,status,requested_at);

ALTER TABLE store_inventory_transactions ENABLE ROW LEVEL SECURITY;ALTER TABLE store_inventory_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE store_inventory_transaction_lines ENABLE ROW LEVEL SECURITY;ALTER TABLE store_inventory_transaction_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE store_inventory_ledger ENABLE ROW LEVEL SECURITY;ALTER TABLE store_inventory_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_store_inventory_transactions ON store_inventory_transactions USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_store_inventory_transaction_lines ON store_inventory_transaction_lines USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_store_inventory_ledger ON store_inventory_ledger USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON store_inventory_transactions,store_inventory_transaction_lines,store_inventory_ledger TO stockflow_app;
