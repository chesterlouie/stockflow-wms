ALTER TABLE store_inventory_transactions
  DROP CONSTRAINT IF EXISTS store_inventory_transactions_warehouse_return_status_check;
ALTER TABLE store_inventory_transactions
  ADD CONSTRAINT store_inventory_transactions_warehouse_return_status_check
  CHECK(warehouse_return_status IN('not_required','awaiting_receipt','received','reversed'));
ALTER TABLE store_inventory_transactions
  ADD COLUMN warehouse_reversed_by uuid REFERENCES users(id),
  ADD COLUMN warehouse_reversed_at timestamptz,
  ADD COLUMN warehouse_reversal_reason text;

ALTER TABLE store_notifications DROP CONSTRAINT IF EXISTS store_notifications_notification_type_check;
ALTER TABLE store_notifications ADD CONSTRAINT store_notifications_notification_type_check
  CHECK(notification_type IN('approval_requested','approved','rejected','reversed'));
