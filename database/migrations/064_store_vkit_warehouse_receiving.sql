ALTER TABLE store_inventory_transactions
  ADD COLUMN return_warehouse_id uuid,
  ADD COLUMN warehouse_return_status text NOT NULL DEFAULT 'not_required'
    CHECK(warehouse_return_status IN('not_required','awaiting_receipt','received')),
  ADD COLUMN warehouse_received_by uuid REFERENCES users(id),
  ADD COLUMN warehouse_received_at timestamptz,
  ADD CONSTRAINT store_inventory_transactions_return_warehouse_fk
    FOREIGN KEY(company_id,return_warehouse_id) REFERENCES warehouses(company_id,id);

ALTER TABLE inventory_returns
  ADD COLUMN source_store_transaction_id uuid,
  ADD COLUMN parent_kit_item_id uuid,
  ADD CONSTRAINT inventory_returns_source_store_transaction_fk
    FOREIGN KEY(company_id,source_store_transaction_id) REFERENCES store_inventory_transactions(company_id,id),
  ADD CONSTRAINT inventory_returns_parent_kit_fk
    FOREIGN KEY(company_id,parent_kit_item_id) REFERENCES items(company_id,id);

ALTER TABLE inventory_return_lines
  ADD COLUMN source_store_transaction_line_id uuid REFERENCES store_inventory_transaction_lines(id);

CREATE UNIQUE INDEX inventory_return_store_line_idx
  ON inventory_return_lines(company_id,source_store_transaction_line_id)
  WHERE source_store_transaction_line_id IS NOT NULL;

CREATE OR REPLACE FUNCTION route_approved_store_vkit_return() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status='approved' AND OLD.status='pending' AND NEW.transaction_type='return' AND NEW.parent_kit_item_id IS NOT NULL THEN
    SELECT default_warehouse_id INTO NEW.return_warehouse_id
    FROM requesting_stores WHERE company_id=NEW.company_id AND id=NEW.from_store_id AND status='active';
    IF NEW.return_warehouse_id IS NULL THEN RAISE EXCEPTION 'store_return_warehouse_required'; END IF;
    NEW.warehouse_return_status='awaiting_receipt';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER route_approved_store_vkit_return_trigger
BEFORE UPDATE OF status ON store_inventory_transactions
FOR EACH ROW EXECUTE FUNCTION route_approved_store_vkit_return();
