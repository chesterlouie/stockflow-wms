ALTER TABLE sales_orders
  ADD COLUMN parent_order_id uuid REFERENCES sales_orders(id),
  ADD COLUMN backorder_sequence integer,
  ADD CONSTRAINT sales_orders_backorder_check
    CHECK((parent_order_id IS NULL AND backorder_sequence IS NULL) OR
          (parent_order_id IS NOT NULL AND backorder_sequence>0));

CREATE INDEX sales_orders_backorder_idx ON sales_orders(company_id,parent_order_id,backorder_sequence)
  WHERE parent_order_id IS NOT NULL;
