CREATE OR REPLACE FUNCTION create_store_approval_notifications()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_store_id uuid;
  event_prefix text;
  notice_title text;
  notice_message text;
  notice_entity_type text;
BEGIN
  IF TG_TABLE_NAME='sales_orders' THEN
    IF NEW.store_id IS NULL OR NEW.store_approval_status<>'pending' THEN RETURN NEW; END IF;
    target_store_id:=NEW.store_id;
    event_prefix:='request:'||NEW.id||':pending';
    notice_title:='Stock request needs approval';
    notice_message:=NEW.order_no||' is waiting for your decision.';
    notice_entity_type:='sales_order';
  ELSIF TG_TABLE_NAME='store_delivery_receipts' THEN
    IF NEW.approval_status<>'pending' THEN RETURN NEW; END IF;
    target_store_id:=NEW.store_id;
    event_prefix:='receipt:'||NEW.id||':pending';
    notice_title:='Store receipt needs approval';
    SELECT 'Receipt for '||shipment_no||' is waiting for your decision.' INTO notice_message FROM shipments WHERE id=NEW.shipment_id;
    notice_entity_type:='store_delivery_receipt';
  ELSE
    IF NEW.status<>'pending' THEN RETURN NEW; END IF;
    target_store_id:=NEW.from_store_id;
    event_prefix:='transaction:'||NEW.id||':pending';
    notice_title:='Store transaction needs approval';
    notice_message:=NEW.transaction_no||' ('||replace(NEW.transaction_type,'_',' ')||') is waiting for your decision.';
    notice_entity_type:='store_inventory_transaction';
  END IF;
  INSERT INTO store_notifications(company_id,user_id,store_id,event_key,notification_type,title,message,entity_type,entity_id)
  SELECT NEW.company_id,a.user_id,target_store_id,event_prefix,'approval_requested',notice_title,notice_message,notice_entity_type,NEW.id
  FROM store_user_assignments a WHERE a.company_id=NEW.company_id AND a.store_id=target_store_id AND a.store_role='store_manager'
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER sales_order_store_notification AFTER INSERT ON sales_orders FOR EACH ROW EXECUTE FUNCTION create_store_approval_notifications();
CREATE TRIGGER store_receipt_notification AFTER INSERT ON store_delivery_receipts FOR EACH ROW EXECUTE FUNCTION create_store_approval_notifications();
CREATE TRIGGER store_transaction_notification AFTER INSERT ON store_inventory_transactions FOR EACH ROW EXECUTE FUNCTION create_store_approval_notifications();

CREATE OR REPLACE FUNCTION backfill_store_manager_notifications()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.store_role<>'store_manager' THEN RETURN NEW; END IF;
  INSERT INTO store_notifications(company_id,user_id,store_id,event_key,notification_type,title,message,entity_type,entity_id)
  SELECT o.company_id,NEW.user_id,o.store_id,'request:'||o.id||':pending','approval_requested','Stock request needs approval',o.order_no||' is waiting for your decision.','sales_order',o.id
  FROM sales_orders o WHERE o.company_id=NEW.company_id AND o.store_id=NEW.store_id AND o.store_approval_status='pending'
  ON CONFLICT DO NOTHING;
  INSERT INTO store_notifications(company_id,user_id,store_id,event_key,notification_type,title,message,entity_type,entity_id)
  SELECT r.company_id,NEW.user_id,r.store_id,'receipt:'||r.id||':pending','approval_requested','Store receipt needs approval','Receipt for '||sh.shipment_no||' is waiting for your decision.','store_delivery_receipt',r.id
  FROM store_delivery_receipts r JOIN shipments sh ON sh.id=r.shipment_id WHERE r.company_id=NEW.company_id AND r.store_id=NEW.store_id AND r.approval_status='pending'
  ON CONFLICT DO NOTHING;
  INSERT INTO store_notifications(company_id,user_id,store_id,event_key,notification_type,title,message,entity_type,entity_id)
  SELECT t.company_id,NEW.user_id,t.from_store_id,'transaction:'||t.id||':pending','approval_requested','Store transaction needs approval',t.transaction_no||' ('||replace(t.transaction_type,'_',' ')||') is waiting for your decision.','store_inventory_transaction',t.id
  FROM store_inventory_transactions t WHERE t.company_id=NEW.company_id AND t.from_store_id=NEW.store_id AND t.status='pending'
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER store_manager_assignment_notifications AFTER INSERT OR UPDATE OF store_id,store_role ON store_user_assignments FOR EACH ROW EXECUTE FUNCTION backfill_store_manager_notifications();

INSERT INTO store_notifications(company_id,user_id,store_id,event_key,notification_type,title,message,entity_type,entity_id)
SELECT o.company_id,a.user_id,o.store_id,'request:'||o.id||':pending','approval_requested','Stock request needs approval',o.order_no||' is waiting for your decision.','sales_order',o.id
FROM sales_orders o JOIN store_user_assignments a ON a.company_id=o.company_id AND a.store_id=o.store_id AND a.store_role='store_manager'
WHERE o.store_id IS NOT NULL AND o.store_approval_status='pending' ON CONFLICT DO NOTHING;
