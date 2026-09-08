ALTER TABLE sales_orders
  ADD COLUMN backorder_status text CHECK(backorder_status IN('waiting','ready','released','fulfilled','cancelled')),
  ADD COLUMN backorder_cancelled_by uuid REFERENCES users(id),
  ADD COLUMN backorder_cancelled_at timestamptz,
  ADD COLUMN backorder_cancel_reason text;

UPDATE sales_orders SET backorder_status='waiting' WHERE parent_order_id IS NOT NULL;
CREATE UNIQUE INDEX sales_orders_backorder_sequence_unique ON sales_orders(company_id,parent_order_id,backorder_sequence) WHERE parent_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION initialize_vkit_backorder() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_order_id IS NOT NULL AND NEW.backorder_status IS NULL THEN NEW.backorder_status='waiting'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sales_order_initialize_vkit_backorder BEFORE INSERT ON sales_orders FOR EACH ROW EXECUTE FUNCTION initialize_vkit_backorder();

CREATE OR REPLACE FUNCTION refresh_vkit_backorder_readiness() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  WITH became_ready AS (
    UPDATE sales_orders o SET backorder_status='ready'
    WHERE o.company_id=NEW.company_id AND o.warehouse_id=NEW.warehouse_id AND o.parent_order_id IS NOT NULL
      AND o.status='new' AND o.backorder_status='waiting'
      AND NOT EXISTS (SELECT 1 FROM sales_order_lines l JOIN items i ON i.company_id=l.company_id AND i.id=l.item_id LEFT JOIN kit_availability k ON k.company_id=l.company_id AND k.warehouse_id=o.warehouse_id AND k.kit_item_id=l.item_id WHERE l.company_id=o.company_id AND l.order_id=o.id AND i.item_type='virtual_kit' AND coalesce(k.available_kits,0)<l.ordered_quantity)
    RETURNING o.id,o.company_id,o.warehouse_id,o.order_no
  )
  INSERT INTO warehouse_notifications(company_id,warehouse_id,user_id,event_key,title,message,order_id)
  SELECT r.company_id,r.warehouse_id,m.user_id,'backorder:'||r.id||':ready','VKIT backorder ready to allocate',r.order_no||' can now be released and allocated.',r.id
  FROM became_ready r JOIN company_members m ON m.company_id=r.company_id AND m.role IN('owner','admin','manager')
  WHERE m.role='owner' OR EXISTS(SELECT 1 FROM user_warehouse_assignments a WHERE a.company_id=r.company_id AND a.user_id=m.user_id AND a.warehouse_id=r.warehouse_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_refresh_vkit_backorders AFTER INSERT ON inventory_ledger FOR EACH ROW EXECUTE FUNCTION refresh_vkit_backorder_readiness();

WITH became_ready AS (
  UPDATE sales_orders o SET backorder_status='ready'
  WHERE o.parent_order_id IS NOT NULL AND o.status='new' AND o.backorder_status='waiting'
    AND NOT EXISTS (SELECT 1 FROM sales_order_lines l JOIN items i ON i.company_id=l.company_id AND i.id=l.item_id LEFT JOIN kit_availability k ON k.company_id=l.company_id AND k.warehouse_id=o.warehouse_id AND k.kit_item_id=l.item_id WHERE l.company_id=o.company_id AND l.order_id=o.id AND i.item_type='virtual_kit' AND coalesce(k.available_kits,0)<l.ordered_quantity)
  RETURNING o.id,o.company_id,o.warehouse_id,o.order_no
)
INSERT INTO warehouse_notifications(company_id,warehouse_id,user_id,event_key,title,message,order_id)
SELECT r.company_id,r.warehouse_id,m.user_id,'backorder:'||r.id||':ready','VKIT backorder ready to allocate',r.order_no||' can now be released and allocated.',r.id
FROM became_ready r JOIN company_members m ON m.company_id=r.company_id AND m.role IN('owner','admin','manager')
WHERE m.role='owner' OR EXISTS(SELECT 1 FROM user_warehouse_assignments a WHERE a.company_id=r.company_id AND a.user_id=m.user_id AND a.warehouse_id=r.warehouse_id)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION close_vkit_backorder() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_order_id IS NOT NULL AND NEW.status='dispatched' AND OLD.status IS DISTINCT FROM NEW.status THEN NEW.backorder_status='fulfilled'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sales_order_close_vkit_backorder BEFORE UPDATE OF status ON sales_orders FOR EACH ROW EXECUTE FUNCTION close_vkit_backorder();
