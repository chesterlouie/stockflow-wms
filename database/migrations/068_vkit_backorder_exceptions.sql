ALTER TABLE sales_orders
  ADD COLUMN original_requested_ship_date date,
  ADD COLUMN backorder_rescheduled_by uuid REFERENCES users(id),
  ADD COLUMN backorder_rescheduled_at timestamptz,
  ADD COLUMN backorder_reschedule_reason text;

UPDATE sales_orders SET original_requested_ship_date=requested_ship_date
WHERE parent_order_id IS NOT NULL AND original_requested_ship_date IS NULL;

CREATE TABLE vkit_backorder_reschedules(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  previous_required_date date,
  revised_required_date date NOT NULL,
  reason text NOT NULL,
  changed_by uuid NOT NULL REFERENCES users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vkit_backorder_reschedules_order_idx ON vkit_backorder_reschedules(company_id,order_id,changed_at DESC);
ALTER TABLE vkit_backorder_reschedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE vkit_backorder_reschedules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_vkit_backorder_reschedules ON vkit_backorder_reschedules USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT ON vkit_backorder_reschedules TO stockflow_app;

CREATE VIEW vkit_backorder_shortages WITH (security_invoker=true) AS
SELECT o.company_id,o.id order_id,o.order_no,o.warehouse_id,o.store_id,o.requested_ship_date,o.backorder_status,
       l.item_id kit_item_id,kit.sku kit_sku,c.component_item_id,component.sku component_sku,
       (l.ordered_quantity*c.quantity)::numeric(18,6) required_quantity,
       coalesce(stock.available,0)::numeric(18,6) available_quantity,
       greatest(l.ordered_quantity*c.quantity-coalesce(stock.available,0),0)::numeric(18,6) shortage_quantity,
       substitute.sku substitute_sku,substitute.available_quantity substitute_available_quantity,
       (o.requested_ship_date<current_date AND o.backorder_status IN('waiting','ready')) overdue
FROM sales_orders o
JOIN sales_order_lines l ON l.company_id=o.company_id AND l.order_id=o.id
JOIN items kit ON kit.company_id=l.company_id AND kit.id=l.item_id AND kit.item_type='virtual_kit'
JOIN item_kit_components c ON c.company_id=l.company_id AND c.kit_item_id=l.item_id AND c.active AND NOT c.optional
JOIN items component ON component.company_id=c.company_id AND component.id=c.component_item_id
LEFT JOIN LATERAL (SELECT sum(a.available_to_promise) available FROM inventory_availability a WHERE a.company_id=o.company_id AND a.warehouse_id=o.warehouse_id AND a.item_id=c.component_item_id AND a.stock_status='available') stock ON true
LEFT JOIN LATERAL (
  SELECT target.sku,sum(a.available_to_promise)::numeric(18,6) available_quantity
  FROM item_relationships r JOIN items target ON target.company_id=r.company_id AND target.id=r.target_item_id AND target.status='active'
  LEFT JOIN inventory_availability a ON a.company_id=r.company_id AND a.warehouse_id=o.warehouse_id AND a.item_id=r.target_item_id AND a.stock_status='available'
  WHERE r.company_id=o.company_id AND r.source_item_id=c.component_item_id AND r.relationship_type IN('substitute','reciprocal_substitute','superseded_by') AND r.active
    AND (r.effective_from IS NULL OR r.effective_from<=current_date) AND (r.effective_to IS NULL OR r.effective_to>=current_date)
  GROUP BY target.sku,r.priority ORDER BY r.priority LIMIT 1
) substitute ON true
WHERE o.parent_order_id IS NOT NULL AND o.status='new' AND o.backorder_status IN('waiting','ready');
GRANT SELECT ON vkit_backorder_shortages TO stockflow_app;
