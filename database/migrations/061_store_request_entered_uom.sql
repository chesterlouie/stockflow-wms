ALTER TABLE sales_order_lines
  ADD COLUMN entered_quantity numeric(18,6),
  ADD COLUMN entered_uom text,
  ADD COLUMN entered_conversion_factor numeric(18,6);

UPDATE sales_order_lines
SET entered_quantity=ordered_quantity,
    entered_uom=uom,
    entered_conversion_factor=1
WHERE entered_quantity IS NULL;

CREATE OR REPLACE FUNCTION normalize_item_uom() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE base text; factor numeric;
BEGIN
 SELECT base_uom INTO base FROM items WHERE company_id=NEW.company_id AND id=NEW.item_id;
 IF base IS NULL THEN RAISE EXCEPTION 'item_not_found'; END IF;
 IF upper(NEW.uom)=upper(base) THEN factor:=1; ELSE SELECT units_per_base INTO factor FROM item_uom_conversions WHERE company_id=NEW.company_id AND item_id=NEW.item_id AND upper(uom)=upper(NEW.uom) AND active; END IF;
 IF factor IS NULL THEN RAISE EXCEPTION 'uom_conversion_not_configured:%',NEW.uom; END IF;
 IF TG_TABLE_NAME='inventory_ledger' THEN NEW.quantity:=NEW.quantity*factor;
 ELSIF TG_TABLE_NAME='sales_order_lines' THEN
   NEW.entered_quantity:=coalesce(NEW.entered_quantity,NEW.ordered_quantity);
   NEW.entered_uom:=coalesce(NEW.entered_uom,NEW.uom);
   NEW.entered_conversion_factor:=coalesce(NEW.entered_conversion_factor,factor);
   NEW.ordered_quantity:=NEW.ordered_quantity*factor;
 ELSIF TG_TABLE_NAME='purchase_order_lines' THEN NEW.ordered_quantity:=NEW.ordered_quantity*factor;
 ELSIF TG_TABLE_NAME='inbound_receipt_lines' THEN NEW.expected_quantity:=NEW.expected_quantity*factor;
 ELSIF TG_TABLE_NAME='inventory_return_lines' THEN NEW.quantity:=NEW.quantity*factor; END IF;
 NEW.uom:=base; RETURN NEW;
END $$;

ALTER TABLE sales_order_lines
  ALTER COLUMN entered_quantity SET NOT NULL,
  ALTER COLUMN entered_uom SET NOT NULL,
  ALTER COLUMN entered_conversion_factor SET NOT NULL,
  ADD CONSTRAINT sales_order_lines_entered_quantity_positive CHECK(entered_quantity>0),
  ADD CONSTRAINT sales_order_lines_entered_factor_positive CHECK(entered_conversion_factor>0);
