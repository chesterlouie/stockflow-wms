CREATE TABLE sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL, order_no text NOT NULL, customer text NOT NULL, requested_ship_date date,
  priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'new' CHECK(status IN('new','allocated','picking','picked','dispatched')),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id), UNIQUE(company_id,order_no),
  FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id)
);
CREATE TABLE sales_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE, item_id uuid NOT NULL,
  ordered_quantity numeric(18,6) NOT NULL CHECK(ordered_quantity>0), allocated_quantity numeric(18,6) NOT NULL DEFAULT 0,
  picked_quantity numeric(18,6) NOT NULL DEFAULT 0, shipped_quantity numeric(18,6) NOT NULL DEFAULT 0, uom text NOT NULL,
  FOREIGN KEY(company_id,item_id) REFERENCES items(company_id,id)
);
CREATE TABLE stock_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_line_id uuid NOT NULL REFERENCES sales_order_lines(id) ON DELETE CASCADE, location_id uuid NOT NULL,
  lot_number text, expiry_date date, quantity numeric(18,6) NOT NULL CHECK(quantity>0),
  status text NOT NULL DEFAULT 'allocated' CHECK(status IN('allocated','picked','released')),
  FOREIGN KEY(company_id,location_id) REFERENCES locations(company_id,id)
);
CREATE TABLE pick_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  allocation_id uuid NOT NULL REFERENCES stock_allocations(id) ON DELETE CASCADE, item_id uuid NOT NULL,
  from_location_id uuid NOT NULL, to_location_id uuid NOT NULL, quantity numeric(18,6) NOT NULL CHECK(quantity>0),
  uom text NOT NULL, lot_number text, expiry_date date,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','completed')), completed_at timestamptz, completed_by uuid REFERENCES users(id),
  FOREIGN KEY(company_id,item_id) REFERENCES items(company_id,id),
  FOREIGN KEY(company_id,from_location_id) REFERENCES locations(company_id,id),
  FOREIGN KEY(company_id,to_location_id) REFERENCES locations(company_id,id)
);
CREATE TABLE shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE, shipment_no text NOT NULL,
  status text NOT NULL DEFAULT 'dispatched' CHECK(status IN('dispatched')), dispatched_at timestamptz NOT NULL DEFAULT now(),
  dispatched_by uuid REFERENCES users(id), UNIQUE(company_id,shipment_no)
);
CREATE INDEX sales_orders_company_status_idx ON sales_orders(company_id,status,created_at DESC);
CREATE INDEX pick_tasks_company_status_idx ON pick_tasks(company_id,status);
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY; ALTER TABLE sales_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_order_lines ENABLE ROW LEVEL SECURITY; ALTER TABLE sales_order_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE stock_allocations ENABLE ROW LEVEL SECURITY; ALTER TABLE stock_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE pick_tasks ENABLE ROW LEVEL SECURITY; ALTER TABLE pick_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY; ALTER TABLE shipments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_sales_orders ON sales_orders USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_sales_order_lines ON sales_order_lines USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_stock_allocations ON stock_allocations USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_pick_tasks ON pick_tasks USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_shipments ON shipments USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON sales_orders,sales_order_lines,stock_allocations,pick_tasks,shipments TO stockflow_app;
