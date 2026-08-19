CREATE FUNCTION register_received_serial() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE loc uuid;receipt uuid;movement text;
BEGIN
 SELECT rl.receipt_id INTO receipt FROM receipt_inspections ri JOIN inbound_receipt_lines rl ON rl.id=ri.receipt_line_id WHERE ri.id=NEW.receipt_inspection_id;
 movement:=CASE NEW.status WHEN 'available' THEN 'receipt_accepted' WHEN 'held' THEN 'receipt_hold' ELSE 'receipt_damaged' END;
 SELECT location_id INTO loc FROM inventory_ledger WHERE company_id=NEW.company_id AND item_id=NEW.item_id AND reference_id=receipt::text AND movement_type=movement ORDER BY occurred_at DESC LIMIT 1;
 INSERT INTO inventory_serials(company_id,item_id,serial_number,location_id,status,source_receipt_inspection_id) VALUES(NEW.company_id,NEW.item_id,NEW.serial_number,loc,NEW.status,NEW.receipt_inspection_id) ON CONFLICT(company_id,serial_number) DO UPDATE SET location_id=excluded.location_id,status=excluded.status,updated_at=now();
 RETURN NEW;
END $$;
CREATE TRIGGER received_serial_registry AFTER INSERT ON received_serials FOR EACH ROW EXECUTE FUNCTION register_received_serial();

CREATE FUNCTION assign_pick_serials() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tracked text;
BEGIN
 SELECT tracking_method INTO tracked FROM items WHERE id=NEW.item_id;
 IF tracked='serial' THEN
  IF NEW.quantity<>trunc(NEW.quantity) THEN RAISE EXCEPTION 'serial_quantity_must_be_whole';END IF;
  INSERT INTO pick_task_serials(company_id,pick_task_id,serial_id)
  SELECT NEW.company_id,NEW.id,s.id FROM inventory_serials s WHERE s.company_id=NEW.company_id AND s.item_id=NEW.item_id AND s.location_id=NEW.from_location_id AND s.status='available'
  AND NOT EXISTS(SELECT 1 FROM pick_task_serials ps JOIN pick_tasks p ON p.id=ps.pick_task_id WHERE ps.serial_id=s.id AND p.status='pending') ORDER BY s.updated_at LIMIT NEW.quantity::integer;
  IF (SELECT count(*) FROM pick_task_serials WHERE pick_task_id=NEW.id)<>NEW.quantity THEN RAISE EXCEPTION 'insufficient_serial_stock';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER pick_task_assign_serials AFTER INSERT ON pick_tasks FOR EACH ROW EXECUTE FUNCTION assign_pick_serials();

CREATE FUNCTION advance_task_serials() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='putaway_tasks' AND OLD.status='pending' AND NEW.status='completed' THEN
  WITH chosen AS (SELECT s.id FROM inventory_serials s JOIN receipt_inspections ri ON ri.id=s.source_receipt_inspection_id JOIN inbound_receipt_lines rl ON rl.id=ri.receipt_line_id WHERE s.company_id=NEW.company_id AND rl.id=NEW.receipt_line_id AND s.location_id=NEW.from_location_id AND s.status='available' ORDER BY s.updated_at LIMIT NEW.quantity::integer)
  UPDATE inventory_serials s SET location_id=NEW.to_location_id,updated_at=now() FROM chosen WHERE s.id=chosen.id;
 ELSIF TG_TABLE_NAME='pick_tasks' AND OLD.status<>NEW.status THEN
  UPDATE inventory_serials s SET location_id=CASE WHEN NEW.status='packed' THEN NEW.to_location_id ELSE s.location_id END,status=CASE WHEN NEW.status='packed' THEN 'packed' ELSE s.status END,updated_at=now() FROM pick_task_serials ps WHERE ps.pick_task_id=NEW.id AND ps.serial_id=s.id;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER putaway_serial_progress AFTER UPDATE OF status ON putaway_tasks FOR EACH ROW EXECUTE FUNCTION advance_task_serials();
CREATE TRIGGER pick_serial_progress AFTER UPDATE OF status ON pick_tasks FOR EACH ROW EXECUTE FUNCTION advance_task_serials();

CREATE FUNCTION issue_dispatched_serials() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF OLD.status<>'dispatched' AND NEW.status='dispatched' THEN
 UPDATE inventory_serials s SET location_id=NULL,status='issued',updated_at=now() FROM pick_task_serials ps JOIN pick_tasks p ON p.id=ps.pick_task_id JOIN stock_allocations a ON a.id=p.allocation_id JOIN sales_order_lines ol ON ol.id=a.order_line_id WHERE ol.order_id=NEW.id AND ps.serial_id=s.id;
 END IF;RETURN NEW;END $$;
CREATE TRIGGER sales_order_serial_dispatch AFTER UPDATE OF status ON sales_orders FOR EACH ROW EXECUTE FUNCTION issue_dispatched_serials();
