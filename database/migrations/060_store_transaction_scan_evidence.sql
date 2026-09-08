ALTER TABLE store_delivery_receipts
  ADD COLUMN receiving_location_id uuid,
  ADD COLUMN scanned_shipment_identifier text,
  ADD CONSTRAINT store_delivery_receipts_location_fk
    FOREIGN KEY(company_id,receiving_location_id) REFERENCES store_locations(company_id,id);

ALTER TABLE store_delivery_receipt_lines
  ADD COLUMN scanned_item_identifier text;

ALTER TABLE store_inventory_transaction_lines
  ADD COLUMN source_location_id uuid,
  ADD COLUMN scanned_item_identifier text,
  ADD CONSTRAINT store_inventory_transaction_lines_location_fk
    FOREIGN KEY(company_id,source_location_id) REFERENCES store_locations(company_id,id);
