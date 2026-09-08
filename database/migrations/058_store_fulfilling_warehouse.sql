ALTER TABLE requesting_stores ADD COLUMN default_warehouse_id uuid;

UPDATE requesting_stores AS store
SET default_warehouse_id=(
  SELECT warehouse.id
  FROM warehouses AS warehouse
  WHERE warehouse.company_id=store.company_id AND warehouse.active
  ORDER BY warehouse.code,warehouse.id
  LIMIT 1
);

ALTER TABLE requesting_stores ALTER COLUMN default_warehouse_id SET NOT NULL;
ALTER TABLE requesting_stores ADD CONSTRAINT requesting_stores_default_warehouse_fk
  FOREIGN KEY(company_id,default_warehouse_id) REFERENCES warehouses(company_id,id);
CREATE INDEX requesting_stores_default_warehouse_idx
  ON requesting_stores(company_id,default_warehouse_id,status);
