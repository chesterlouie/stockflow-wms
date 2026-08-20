CREATE FUNCTION normalize_item_uom() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE base text; factor numeric;
BEGIN
 SELECT base_uom INTO base FROM items WHERE company_id=NEW.company_id AND id=NEW.item_id;
 IF base IS NULL THEN RAISE EXCEPTION 'item_not_found'; END IF;
 IF upper(NEW.uom)=upper(base) THEN factor:=1; ELSE SELECT units_per_base INTO factor FROM item_uom_conversions WHERE company_id=NEW.company_id AND item_id=NEW.item_id AND upper(uom)=upper(NEW.uom) AND active; END IF;
 IF factor IS NULL THEN RAISE EXCEPTION 'uom_conversion_not_configured:%',NEW.uom; END IF;
 IF TG_TABLE_NAME='inventory_ledger' THEN NEW.quantity:=NEW.quantity*factor;
 ELSIF TG_TABLE_NAME='sales_order_lines' THEN NEW.ordered_quantity:=NEW.ordered_quantity*factor;
 ELSIF TG_TABLE_NAME='purchase_order_lines' THEN NEW.ordered_quantity:=NEW.ordered_quantity*factor;
 ELSIF TG_TABLE_NAME='inbound_receipt_lines' THEN NEW.expected_quantity:=NEW.expected_quantity*factor;
 ELSIF TG_TABLE_NAME='inventory_return_lines' THEN NEW.quantity:=NEW.quantity*factor; END IF;
 NEW.uom:=base; RETURN NEW;
END $$;
CREATE TRIGGER a_normalize_inventory_ledger_uom BEFORE INSERT ON inventory_ledger FOR EACH ROW EXECUTE FUNCTION normalize_item_uom();
CREATE TRIGGER normalize_sales_order_uom BEFORE INSERT ON sales_order_lines FOR EACH ROW EXECUTE FUNCTION normalize_item_uom();
CREATE TRIGGER normalize_purchase_order_uom BEFORE INSERT ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION normalize_item_uom();
CREATE TRIGGER normalize_inbound_receipt_uom BEFORE INSERT ON inbound_receipt_lines FOR EACH ROW EXECUTE FUNCTION normalize_item_uom();
CREATE TRIGGER normalize_inventory_return_uom BEFORE INSERT ON inventory_return_lines FOR EACH ROW EXECUTE FUNCTION normalize_item_uom();
