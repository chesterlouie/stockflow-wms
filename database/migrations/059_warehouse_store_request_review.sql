ALTER TABLE sales_orders
  ADD COLUMN warehouse_review_status text NOT NULL DEFAULT 'not_required'
    CHECK(warehouse_review_status IN('not_required','pending','accepted','rejected')),
  ADD COLUMN warehouse_reviewed_by uuid REFERENCES users(id),
  ADD COLUMN warehouse_reviewed_at timestamptz,
  ADD COLUMN warehouse_review_note text;

UPDATE sales_orders
SET warehouse_review_status='pending'
WHERE store_id IS NOT NULL AND store_approval_status='approved' AND status='new';

CREATE INDEX sales_orders_warehouse_review_idx
  ON sales_orders(company_id,warehouse_id,warehouse_review_status,created_at DESC)
  WHERE store_id IS NOT NULL;

CREATE TABLE warehouse_notifications(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,user_id,event_key),
  FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id)
);

CREATE INDEX warehouse_notifications_inbox_idx
  ON warehouse_notifications(company_id,user_id,read_at,created_at DESC);
ALTER TABLE warehouse_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_warehouse_notifications ON warehouse_notifications
  USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid)
  WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON warehouse_notifications TO stockflow_app;

INSERT INTO warehouse_notifications(company_id,warehouse_id,user_id,event_key,title,message,order_id)
SELECT o.company_id,o.warehouse_id,m.user_id,'store-request:'||o.id||':warehouse-pending',
       'Store request needs warehouse review',o.order_no||' is ready for warehouse review.',o.id
FROM sales_orders o
JOIN company_members m ON m.company_id=o.company_id AND m.role IN('owner','admin','manager')
WHERE o.store_id IS NOT NULL AND o.warehouse_review_status='pending'
  AND (m.role='owner' OR EXISTS(
    SELECT 1 FROM user_warehouse_assignments a
    WHERE a.company_id=o.company_id AND a.user_id=m.user_id AND a.warehouse_id=o.warehouse_id
  ))
ON CONFLICT DO NOTHING;
