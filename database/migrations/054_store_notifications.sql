CREATE TABLE store_notifications(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  event_key text NOT NULL,
  notification_type text NOT NULL CHECK(notification_type IN('approval_requested','approved','rejected')),
  title text NOT NULL,
  message text NOT NULL,
  link_path text NOT NULL DEFAULT '/store-portal',
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,user_id,event_key),
  FOREIGN KEY(company_id,store_id) REFERENCES requesting_stores(company_id,id)
);

CREATE INDEX store_notifications_inbox_idx ON store_notifications(company_id,user_id,read_at,created_at DESC);
ALTER TABLE store_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_store_notifications ON store_notifications USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON store_notifications TO stockflow_app;

INSERT INTO store_notifications(company_id,user_id,store_id,event_key,notification_type,title,message,entity_type,entity_id)
SELECT o.company_id,a.user_id,o.store_id,'request:'||o.id||':pending','approval_requested','Stock request needs approval',o.order_no||' is waiting for your decision.','sales_order',o.id
FROM sales_orders o JOIN store_user_assignments a ON a.company_id=o.company_id AND a.store_id=o.store_id AND a.store_role='store_manager'
WHERE o.store_id IS NOT NULL AND o.store_approval_status='pending' ON CONFLICT DO NOTHING;

INSERT INTO store_notifications(company_id,user_id,store_id,event_key,notification_type,title,message,entity_type,entity_id)
SELECT r.company_id,a.user_id,r.store_id,'receipt:'||r.id||':pending','approval_requested','Store receipt needs approval','Receipt for '||sh.shipment_no||' is waiting for your decision.','store_delivery_receipt',r.id
FROM store_delivery_receipts r JOIN shipments sh ON sh.id=r.shipment_id JOIN store_user_assignments a ON a.company_id=r.company_id AND a.store_id=r.store_id AND a.store_role='store_manager'
WHERE r.approval_status='pending' ON CONFLICT DO NOTHING;

INSERT INTO store_notifications(company_id,user_id,store_id,event_key,notification_type,title,message,entity_type,entity_id)
SELECT t.company_id,a.user_id,t.from_store_id,'transaction:'||t.id||':pending','approval_requested','Store transaction needs approval',t.transaction_no||' ('||replace(t.transaction_type,'_',' ')||') is waiting for your decision.','store_inventory_transaction',t.id
FROM store_inventory_transactions t JOIN store_user_assignments a ON a.company_id=t.company_id AND a.store_id=t.from_store_id AND a.store_role='store_manager'
WHERE t.status='pending' ON CONFLICT DO NOTHING;
