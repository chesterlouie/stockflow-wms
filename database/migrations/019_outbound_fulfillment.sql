ALTER TABLE sales_orders DROP CONSTRAINT sales_orders_status_check;
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_status_check CHECK(status IN('new','allocated','picking','picked','packing','packed','dispatched'));
ALTER TABLE sales_order_lines ADD COLUMN line_no integer;
WITH numbered AS (SELECT id,row_number() OVER(PARTITION BY order_id ORDER BY id) AS n FROM sales_order_lines)
UPDATE sales_order_lines l SET line_no=numbered.n FROM numbered WHERE numbered.id=l.id;
ALTER TABLE sales_order_lines ALTER COLUMN line_no SET NOT NULL;
ALTER TABLE sales_order_lines ADD CONSTRAINT sales_order_lines_order_line_unique UNIQUE(order_id,line_no);

ALTER TABLE pick_tasks DROP CONSTRAINT pick_tasks_status_check;
ALTER TABLE pick_tasks ADD CONSTRAINT pick_tasks_status_check CHECK(status IN('pending','completed','packed'));
ALTER TABLE pick_tasks ADD COLUMN packed_at timestamptz;
ALTER TABLE pick_tasks ADD COLUMN packed_by uuid REFERENCES users(id);

CREATE TABLE pick_waves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL, wave_no text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN('open','in_progress','completed')),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id), completed_at timestamptz,
  UNIQUE(company_id,wave_no), FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id)
);
ALTER TABLE pick_tasks ADD COLUMN wave_id uuid REFERENCES pick_waves(id) ON DELETE SET NULL;
ALTER TABLE pick_waves ENABLE ROW LEVEL SECURITY; ALTER TABLE pick_waves FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_pick_waves ON pick_waves USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON pick_waves TO stockflow_app;
CREATE INDEX pick_tasks_wave_status_idx ON pick_tasks(company_id,wave_id,status);

ALTER TABLE shipments ADD COLUMN carrier text;
ALTER TABLE shipments ADD COLUMN tracking_number text;
