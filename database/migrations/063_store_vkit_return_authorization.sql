ALTER TABLE store_inventory_transactions
  ADD COLUMN parent_kit_item_id uuid,
  ADD COLUMN parent_kit_quantity numeric(18,6),
  ADD CONSTRAINT store_inventory_transactions_parent_kit_fk
    FOREIGN KEY(company_id,parent_kit_item_id) REFERENCES items(company_id,id),
  ADD CONSTRAINT store_inventory_transactions_parent_kit_check
    CHECK ((parent_kit_item_id IS NULL AND parent_kit_quantity IS NULL) OR
           (transaction_type='return' AND parent_kit_item_id IS NOT NULL AND parent_kit_quantity>0));

CREATE INDEX store_inventory_transactions_parent_kit_idx
  ON store_inventory_transactions(company_id,parent_kit_item_id)
  WHERE parent_kit_item_id IS NOT NULL;
