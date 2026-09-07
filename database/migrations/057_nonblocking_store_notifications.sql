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

  BEGIN
    INSERT INTO store_notifications(company_id,user_id,store_id,event_key,notification_type,title,message,entity_type,entity_id)
    SELECT NEW.company_id,a.user_id,target_store_id,event_prefix,'approval_requested',notice_title,notice_message,notice_entity_type,NEW.id
    FROM store_user_assignments a WHERE a.company_id=NEW.company_id AND a.store_id=target_store_id AND a.store_role='store_manager'
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Store approval notification failed for % %: %',TG_TABLE_NAME,NEW.id,SQLERRM;
  END;
  RETURN NEW;
END $$;
