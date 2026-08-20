ALTER TABLE sales_orders DROP CONSTRAINT sales_orders_status_check;
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_status_check CHECK(status IN('new','allocated','picking','picked','packing','packed','held','cancelled','dispatched'));
ALTER TABLE sales_orders ADD COLUMN status_before_hold text;

ALTER TABLE pick_tasks DROP CONSTRAINT pick_tasks_status_check;
ALTER TABLE pick_tasks ADD CONSTRAINT pick_tasks_status_check CHECK(status IN('pending','completed','packed','exception','released','cancelled'));

CREATE TABLE fulfillment_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  pick_task_id uuid REFERENCES pick_tasks(id) ON DELETE SET NULL,
  exception_type text NOT NULL CHECK(exception_type IN('short_pick','order_hold','order_cancelled')),
  reason_code text NOT NULL,
  note text,
  quantity numeric(18,6),
  status text NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved','cancelled')),
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX fulfillment_exceptions_company_status_idx ON fulfillment_exceptions(company_id,status,created_at DESC);
ALTER TABLE fulfillment_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfillment_exceptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_fulfillment_exceptions ON fulfillment_exceptions USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON fulfillment_exceptions TO stockflow_app;
