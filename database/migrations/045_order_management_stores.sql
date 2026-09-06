CREATE TABLE requesting_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'retail' CHECK(channel IN('retail','wholesale','ecommerce','internal','other')),
  contact_name text,
  email text,
  phone text,
  delivery_address text,
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,code),
  UNIQUE(company_id,id)
);
ALTER TABLE sales_orders ADD COLUMN store_id uuid;
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_company_store_fk FOREIGN KEY(company_id,store_id) REFERENCES requesting_stores(company_id,id);
CREATE INDEX requesting_stores_company_status_idx ON requesting_stores(company_id,status,name);
CREATE INDEX sales_orders_store_idx ON sales_orders(company_id,store_id,created_at DESC);
ALTER TABLE requesting_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE requesting_stores FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_requesting_stores ON requesting_stores USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON requesting_stores TO stockflow_app;
