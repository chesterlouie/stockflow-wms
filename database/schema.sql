CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  subscription_plan text NOT NULL DEFAULT 'starter',
  subscription_status text NOT NULL DEFAULT 'trial',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE company_members (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','manager','operator','viewer')),
  PRIMARY KEY (company_id, user_id)
);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at);
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id, company_id);

CREATE TABLE warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Manila',
  active boolean NOT NULL DEFAULT true,
  UNIQUE (company_id, code),
  UNIQUE (company_id, id)
);

CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL,
  code text NOT NULL,
  type text NOT NULL CHECK (type IN ('receiving','storage','picking','packing','shipping','hold','damaged')),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (company_id, warehouse_id, code),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, warehouse_id) REFERENCES warehouses(company_id, id) ON DELETE CASCADE
);

CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku text NOT NULL,
  description text NOT NULL,
  category text,
  base_uom text NOT NULL,
  tracking_method text NOT NULL DEFAULT 'none' CHECK (tracking_method IN ('none','lot','lot_expiry','serial')),
  allocation_method text NOT NULL DEFAULT 'fifo' CHECK (allocation_method IN ('fifo','fefo','lifo')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','discontinued')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, sku),
  UNIQUE (company_id, id)
);

CREATE TABLE item_barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id uuid NOT NULL,
  barcode_value text NOT NULL,
  barcode_format text NOT NULL CHECK (barcode_format IN ('code128','ean13','upca','qr','gs1')),
  generation_mode text NOT NULL CHECK (generation_mode IN ('auto','manual')),
  uom text NOT NULL,
  quantity_in_base numeric(18,6) NOT NULL DEFAULT 1,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, barcode_value),
  FOREIGN KEY (company_id, item_id) REFERENCES items(company_id, id) ON DELETE CASCADE
);

CREATE TABLE barcode_sequences (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  prefix text NOT NULL DEFAULT '',
  next_value bigint NOT NULL DEFAULT 1 CHECK (next_value > 0),
  pad_length integer NOT NULL DEFAULT 8 CHECK (pad_length BETWEEN 4 AND 18)
);

CREATE TABLE inventory_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL,
  location_id uuid NOT NULL,
  item_id uuid NOT NULL,
  movement_type text NOT NULL,
  quantity numeric(18,6) NOT NULL,
  uom text NOT NULL,
  lot_number text,
  serial_number text,
  expiry_date date,
  reference_type text NOT NULL,
  reference_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),
  FOREIGN KEY (company_id, warehouse_id) REFERENCES warehouses(company_id, id),
  FOREIGN KEY (company_id, location_id) REFERENCES locations(company_id, id),
  FOREIGN KEY (company_id, item_id) REFERENCES items(company_id, id)
);

CREATE INDEX inventory_ledger_tenant_item_idx ON inventory_ledger(company_id, item_id, occurred_at DESC);
CREATE INDEX inventory_ledger_tenant_location_idx ON inventory_ledger(company_id, location_id, occurred_at DESC);
CREATE INDEX item_barcodes_lookup_idx ON item_barcodes(company_id, barcode_value);

CREATE VIEW inventory_balances WITH (security_invoker = true) AS
SELECT company_id, warehouse_id, location_id, item_id, lot_number, expiry_date, sum(quantity) AS quantity
FROM inventory_ledger
GROUP BY company_id, warehouse_id, location_id, item_id, lot_number, expiry_date
HAVING sum(quantity) <> 0;

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_barcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE barcode_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses FORCE ROW LEVEL SECURITY;
ALTER TABLE locations FORCE ROW LEVEL SECURITY;
ALTER TABLE items FORCE ROW LEVEL SECURITY;
ALTER TABLE item_barcodes FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE barcode_sequences FORCE ROW LEVEL SECURITY;

CREATE POLICY company_isolation_items ON items
  USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY company_isolation_barcodes ON item_barcodes
  USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY company_isolation_warehouses ON warehouses
  USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY company_isolation_locations ON locations
  USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY company_isolation_ledger ON inventory_ledger
  USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY company_isolation_barcode_sequences ON barcode_sequences
  USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);

GRANT CONNECT ON DATABASE stockflow TO stockflow_app;
GRANT USAGE ON SCHEMA public TO stockflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO stockflow_app;
GRANT SELECT ON inventory_balances TO stockflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO stockflow_app;
