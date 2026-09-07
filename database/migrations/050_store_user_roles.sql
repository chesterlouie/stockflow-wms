ALTER TABLE store_user_assignments
  ADD COLUMN store_role text NOT NULL DEFAULT 'store_viewer'
  CHECK(store_role IN('store_viewer','store_operator','store_manager'));

