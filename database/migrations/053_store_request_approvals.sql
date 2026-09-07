ALTER TABLE sales_orders
  ADD COLUMN store_approval_status text NOT NULL DEFAULT 'not_required'
    CHECK(store_approval_status IN('not_required','pending','approved','rejected')),
  ADD COLUMN store_approved_by uuid REFERENCES users(id),
  ADD COLUMN store_approved_at timestamptz,
  ADD COLUMN store_approval_note text;

CREATE INDEX sales_orders_store_approval_idx
  ON sales_orders(company_id,store_id,store_approval_status,created_at DESC)
  WHERE store_id IS NOT NULL;
