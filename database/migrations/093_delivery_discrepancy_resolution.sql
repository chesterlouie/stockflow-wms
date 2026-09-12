CREATE TABLE delivery_discrepancy_resolutions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  confirmation_id uuid NOT NULL, claim_id uuid REFERENCES delivery_claims(id), resolution_no text NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK(status IN('planned','awaiting_store_return','return_in_transit','awaiting_warehouse_receipt','resolved','cancelled')),
  shortage_action text NOT NULL CHECK(shortage_action IN('none','replacement','backorder','credit')),
  damage_action text NOT NULL CHECK(damage_action IN('none','return_to_warehouse','dispose_at_store','credit')),
  replacement_order_id uuid REFERENCES sales_orders(id), return_warehouse_id uuid, reason text NOT NULL,
  planned_by uuid NOT NULL REFERENCES users(id), planned_at timestamptz NOT NULL DEFAULT now(), resolved_by uuid REFERENCES users(id), resolved_at timestamptz,
  UNIQUE(company_id,confirmation_id), UNIQUE(company_id,resolution_no), UNIQUE(company_id,id),
  FOREIGN KEY(company_id,confirmation_id) REFERENCES shipment_delivery_confirmations(company_id,id),
  FOREIGN KEY(company_id,return_warehouse_id) REFERENCES warehouses(company_id,id)
);
CREATE TABLE delivery_discrepancy_resolution_lines(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  resolution_id uuid NOT NULL, confirmation_line_id uuid NOT NULL REFERENCES shipment_delivery_confirmation_lines(id), item_id uuid NOT NULL REFERENCES items(id),
  action text NOT NULL CHECK(action IN('replacement','backorder','credit','return_to_warehouse','dispose_at_store')),
  quantity numeric(18,6) NOT NULL CHECK(quantity>0), uom text NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK(status IN('planned','authorized','dispatched','received','completed','cancelled')),
  dispatched_quantity numeric(18,6) NOT NULL DEFAULT 0 CHECK(dispatched_quantity>=0 AND dispatched_quantity<=quantity),
  received_quantity numeric(18,6) NOT NULL DEFAULT 0 CHECK(received_quantity>=0 AND received_quantity<=dispatched_quantity),
  UNIQUE(resolution_id,confirmation_line_id,action), FOREIGN KEY(company_id,resolution_id) REFERENCES delivery_discrepancy_resolutions(company_id,id)
);
CREATE TABLE delivery_return_authorizations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  resolution_id uuid NOT NULL, authorization_no text NOT NULL, store_id uuid NOT NULL, warehouse_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'authorized' CHECK(status IN('authorized','partially_dispatched','dispatched','partially_received','received','cancelled')),
  authorized_at timestamptz NOT NULL DEFAULT now(), authorized_by uuid NOT NULL REFERENCES users(id),
  UNIQUE(company_id,resolution_id), UNIQUE(company_id,authorization_no), UNIQUE(company_id,id),
  FOREIGN KEY(company_id,resolution_id) REFERENCES delivery_discrepancy_resolutions(company_id,id),
  FOREIGN KEY(company_id,store_id) REFERENCES requesting_stores(company_id,id), FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id)
);
CREATE TABLE delivery_discrepancy_resolution_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  resolution_id uuid NOT NULL, event_type text NOT NULL, line_id uuid REFERENCES delivery_discrepancy_resolution_lines(id),
  quantity numeric(18,6), location_id uuid, store_location_id uuid, barcode_value text, lot_number text, expiry_date date,
  inventory_return_id uuid REFERENCES inventory_returns(id), inventory_ledger_id uuid REFERENCES inventory_ledger(id), note text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(company_id,resolution_id) REFERENCES delivery_discrepancy_resolutions(company_id,id)
);
CREATE INDEX delivery_resolution_queue_idx ON delivery_discrepancy_resolutions(company_id,status,planned_at);
CREATE INDEX delivery_resolution_events_idx ON delivery_discrepancy_resolution_events(company_id,resolution_id,created_at);
ALTER TABLE delivery_discrepancy_resolutions ENABLE ROW LEVEL SECURITY; ALTER TABLE delivery_discrepancy_resolutions FORCE ROW LEVEL SECURITY;
ALTER TABLE delivery_discrepancy_resolution_lines ENABLE ROW LEVEL SECURITY; ALTER TABLE delivery_discrepancy_resolution_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE delivery_return_authorizations ENABLE ROW LEVEL SECURITY; ALTER TABLE delivery_return_authorizations FORCE ROW LEVEL SECURITY;
ALTER TABLE delivery_discrepancy_resolution_events ENABLE ROW LEVEL SECURITY; ALTER TABLE delivery_discrepancy_resolution_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_delivery_discrepancy_resolutions ON delivery_discrepancy_resolutions USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_delivery_discrepancy_resolution_lines ON delivery_discrepancy_resolution_lines USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_delivery_return_authorizations ON delivery_return_authorizations USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_delivery_discrepancy_resolution_events ON delivery_discrepancy_resolution_events USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON delivery_discrepancy_resolutions,delivery_discrepancy_resolution_lines,delivery_return_authorizations,delivery_discrepancy_resolution_events TO stockflow_app;

CREATE VIEW delivery_discrepancy_resolution_queue WITH(security_invoker=true) AS
SELECT r.company_id,r.id,r.resolution_no,r.status,r.shortage_action,r.damage_action,r.reason,r.confirmation_id,r.claim_id,r.replacement_order_id,r.return_warehouse_id,
 dc.shipment_id,dc.store_id,sh.shipment_no,o.order_no,o.warehouse_id,ra.id return_authorization_id,ra.authorization_no,ra.status return_status,
 coalesce(sum(l.quantity) FILTER(WHERE l.action IN('replacement','backorder')),0) replacement_quantity,
 coalesce(sum(l.quantity) FILTER(WHERE l.action='return_to_warehouse'),0) return_quantity
FROM delivery_discrepancy_resolutions r JOIN shipment_delivery_confirmations dc ON dc.id=r.confirmation_id
JOIN shipments sh ON sh.id=dc.shipment_id JOIN sales_orders o ON o.id=sh.order_id
LEFT JOIN delivery_discrepancy_resolution_lines l ON l.resolution_id=r.id LEFT JOIN delivery_return_authorizations ra ON ra.resolution_id=r.id
GROUP BY r.id,dc.shipment_id,dc.store_id,sh.shipment_no,o.order_no,o.warehouse_id,ra.id;
GRANT SELECT ON delivery_discrepancy_resolution_queue TO stockflow_app;
