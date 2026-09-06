ALTER TABLE stock_allocations
  ADD COLUMN allocated_item_id uuid,
  ADD COLUMN demand_item_id uuid,
  ADD COLUMN demand_quantity numeric(18,6),
  ADD COLUMN allocation_type text NOT NULL DEFAULT 'exact';

UPDATE stock_allocations a SET allocated_item_id=ol.item_id,demand_item_id=ol.item_id,demand_quantity=a.quantity
FROM sales_order_lines ol WHERE ol.id=a.order_line_id;

ALTER TABLE stock_allocations
  ALTER COLUMN allocated_item_id SET NOT NULL,
  ALTER COLUMN demand_item_id SET NOT NULL,
  ALTER COLUMN demand_quantity SET NOT NULL,
  ADD CONSTRAINT stock_allocations_allocated_item_fk FOREIGN KEY(company_id,allocated_item_id) REFERENCES items(company_id,id),
  ADD CONSTRAINT stock_allocations_demand_item_fk FOREIGN KEY(company_id,demand_item_id) REFERENCES items(company_id,id),
  ADD CONSTRAINT stock_allocations_demand_quantity_check CHECK(demand_quantity>0),
  ADD CONSTRAINT stock_allocations_type_check CHECK(allocation_type IN('exact','kit_component','substitute','kit_component_substitute'));

CREATE INDEX stock_allocations_actual_item_idx ON stock_allocations(company_id,allocated_item_id,status);

DROP VIEW inventory_availability;
CREATE VIEW inventory_availability WITH (security_invoker=true) AS
SELECT b.company_id,b.warehouse_id,b.location_id,b.item_id,b.lot_number,b.expiry_date,b.quantity,b.quantity AS on_hand,
CASE WHEN coalesce(o.status,CASE WHEN b.expiry_date<current_date THEN 'expired' WHEN l.type='hold' THEN 'hold' WHEN l.type='damaged' THEN 'damaged' ELSE 'available' END)='available' THEN coalesce((SELECT sum(a.quantity) FROM stock_allocations a WHERE a.company_id=b.company_id AND a.allocated_item_id=b.item_id AND a.location_id=b.location_id AND a.lot_number IS NOT DISTINCT FROM b.lot_number AND a.expiry_date IS NOT DISTINCT FROM b.expiry_date AND a.status='allocated'),0) ELSE 0 END AS reserved,
CASE WHEN coalesce(o.status,CASE WHEN b.expiry_date<current_date THEN 'expired' WHEN l.type='hold' THEN 'hold' WHEN l.type='damaged' THEN 'damaged' ELSE 'available' END)='available' THEN greatest(b.quantity-coalesce((SELECT sum(a.quantity) FROM stock_allocations a WHERE a.company_id=b.company_id AND a.allocated_item_id=b.item_id AND a.location_id=b.location_id AND a.lot_number IS NOT DISTINCT FROM b.lot_number AND a.expiry_date IS NOT DISTINCT FROM b.expiry_date AND a.status='allocated'),0),0) ELSE 0 END AS available_to_promise,
coalesce(o.status,CASE WHEN b.expiry_date<current_date THEN 'expired' WHEN l.type='hold' THEN 'hold' WHEN l.type='damaged' THEN 'damaged' ELSE 'available' END) AS stock_status,o.reason AS status_reason
FROM inventory_balances b JOIN locations l ON l.company_id=b.company_id AND l.id=b.location_id LEFT JOIN LATERAL (SELECT x.status,x.reason FROM inventory_status_overrides x WHERE x.company_id=b.company_id AND x.warehouse_id=b.warehouse_id AND x.location_id=b.location_id AND x.item_id=b.item_id AND x.lot_number IS NOT DISTINCT FROM b.lot_number AND x.expiry_date IS NOT DISTINCT FROM b.expiry_date AND x.active ORDER BY x.created_at DESC LIMIT 1) o ON true;
GRANT SELECT ON inventory_availability TO stockflow_app;

CREATE OR REPLACE FUNCTION enforce_allocatable_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT EXISTS(SELECT 1 FROM inventory_availability a WHERE a.company_id=NEW.company_id AND a.item_id=NEW.allocated_item_id AND a.location_id=NEW.location_id AND a.lot_number IS NOT DISTINCT FROM NEW.lot_number AND a.expiry_date IS NOT DISTINCT FROM NEW.expiry_date AND a.stock_status='available' AND a.available_to_promise>=NEW.quantity) THEN RAISE EXCEPTION 'stock_not_available'; END IF; RETURN NEW; END $$;

CREATE VIEW kit_availability WITH (security_invoker=true) AS
SELECT k.company_id,k.kit_item_id,w.id AS warehouse_id,floor(min(coalesce(s.available,0)/k.quantity))::numeric(18,6) AS available_kits
FROM item_kit_components k JOIN warehouses w ON w.company_id=k.company_id AND w.active
LEFT JOIN LATERAL (SELECT sum(a.available_to_promise) AS available FROM inventory_availability a WHERE a.company_id=k.company_id AND a.warehouse_id=w.id AND a.item_id=k.component_item_id AND a.stock_status='available') s ON true
WHERE k.active AND NOT k.optional GROUP BY k.company_id,k.kit_item_id,w.id;
GRANT SELECT ON kit_availability TO stockflow_app;
