ALTER TABLE putaway_tasks DROP CONSTRAINT putaway_tasks_status_check;
ALTER TABLE putaway_tasks ADD CONSTRAINT putaway_tasks_status_check CHECK(status IN('pending','completed','cancelled'));
ALTER TABLE putaway_tasks DROP CONSTRAINT putaway_tasks_quantity_check;
ALTER TABLE putaway_tasks ADD CONSTRAINT putaway_tasks_quantity_check CHECK(quantity>=0);
ALTER TABLE putaway_tasks ADD COLUMN note text;
CREATE TABLE cross_dock_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 receipt_line_id uuid NOT NULL REFERENCES inbound_receipt_lines(id) ON DELETE RESTRICT,order_line_id uuid NOT NULL REFERENCES sales_order_lines(id) ON DELETE RESTRICT,
 item_id uuid NOT NULL,from_location_id uuid NOT NULL,to_location_id uuid NOT NULL,quantity numeric(18,6) NOT NULL CHECK(quantity>0),uom text NOT NULL,
 lot_number text,expiry_date date,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','completed','cancelled','exception')),
 created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),completed_at timestamptz,completed_by uuid REFERENCES users(id),note text,
 FOREIGN KEY(company_id,item_id) REFERENCES items(company_id,id),FOREIGN KEY(company_id,from_location_id) REFERENCES locations(company_id,id),FOREIGN KEY(company_id,to_location_id) REFERENCES locations(company_id,id)
);
CREATE INDEX cross_dock_tasks_status_idx ON cross_dock_tasks(company_id,status,created_at);
ALTER TABLE cross_dock_tasks ENABLE ROW LEVEL SECURITY;ALTER TABLE cross_dock_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_cross_dock_tasks ON cross_dock_tasks USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON cross_dock_tasks TO stockflow_app;
