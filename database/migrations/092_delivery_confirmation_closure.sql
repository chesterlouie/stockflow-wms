CREATE TABLE shipment_delivery_confirmations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  status text NOT NULL CHECK(status IN('pending_review','closed','rejected')),
  outcome text NOT NULL CHECK(outcome IN('complete','short','damaged','short_and_damaged')),
  delivered_at timestamptz NOT NULL,
  recipient_name text NOT NULL,
  proof_type text NOT NULL CHECK(proof_type IN('photo','signature','document','carrier_pod')),
  proof_reference text NOT NULL,
  signature_name text,
  notes text,
  submitted_by uuid NOT NULL REFERENCES users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_note text,
  UNIQUE(company_id,shipment_id),
  UNIQUE(company_id,id),
  FOREIGN KEY(company_id,store_id) REFERENCES requesting_stores(company_id,id),
  FOREIGN KEY(company_id,receipt_id) REFERENCES store_delivery_receipts(company_id,id)
);

CREATE TABLE shipment_delivery_confirmation_lines(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  confirmation_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES items(id),
  source_receipt_line_id uuid NOT NULL REFERENCES store_delivery_receipt_lines(id),
  expected_quantity numeric(18,6) NOT NULL CHECK(expected_quantity>=0),
  accepted_quantity numeric(18,6) NOT NULL CHECK(accepted_quantity>=0),
  short_quantity numeric(18,6) NOT NULL CHECK(short_quantity>=0),
  damaged_quantity numeric(18,6) NOT NULL CHECK(damaged_quantity>=0),
  uom text NOT NULL,
  UNIQUE(confirmation_id,source_receipt_line_id),
  FOREIGN KEY(company_id,confirmation_id) REFERENCES shipment_delivery_confirmations(company_id,id)
);

CREATE TABLE shipment_delivery_confirmation_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  confirmation_id uuid NOT NULL,
  event_type text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  note text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(company_id,confirmation_id) REFERENCES shipment_delivery_confirmations(company_id,id)
);

CREATE INDEX shipment_delivery_confirmations_queue_idx ON shipment_delivery_confirmations(company_id,store_id,status,submitted_at DESC);
CREATE INDEX shipment_delivery_confirmation_events_idx ON shipment_delivery_confirmation_events(company_id,confirmation_id,created_at);

ALTER TABLE shipment_delivery_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_delivery_confirmations FORCE ROW LEVEL SECURITY;
ALTER TABLE shipment_delivery_confirmation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_delivery_confirmation_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE shipment_delivery_confirmation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_delivery_confirmation_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_shipment_delivery_confirmations ON shipment_delivery_confirmations USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_shipment_delivery_confirmation_lines ON shipment_delivery_confirmation_lines USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_shipment_delivery_confirmation_events ON shipment_delivery_confirmation_events USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON shipment_delivery_confirmations,shipment_delivery_confirmation_lines,shipment_delivery_confirmation_events TO stockflow_app;

CREATE VIEW store_request_lifecycle WITH(security_invoker=true) AS
SELECT o.company_id,o.id order_id,o.order_no,o.store_id,o.warehouse_id,
  CASE
    WHEN dc.status='closed' THEN 'closed'
    WHEN dc.status='pending_review' THEN 'delivery_discrepancy_review'
    WHEN dc.status='rejected' THEN 'delivery_confirmation_rejected'
    WHEN r.id IS NOT NULL THEN 'proof_pending'
    WHEN sh.delivery_status='delivered' THEN 'delivery_confirmation_pending'
    WHEN sh.id IS NOT NULL THEN sh.delivery_status
    WHEN o.status='dispatched' THEN 'dispatched'
    WHEN o.warehouse_review_status='rejected' THEN 'warehouse_rejected'
    WHEN o.warehouse_review_status='pending' THEN 'warehouse_review'
    WHEN o.store_approval_status='rejected' THEN 'store_rejected'
    WHEN o.store_approval_status='pending' THEN 'store_approval'
    ELSE o.status
  END lifecycle_status,
  sh.id shipment_id,r.id receipt_id,dc.id confirmation_id,dc.outcome,dc.delivered_at,dc.proof_reference
FROM sales_orders o
LEFT JOIN LATERAL(SELECT s.* FROM shipments s WHERE s.company_id=o.company_id AND s.order_id=o.id AND s.status='dispatched' ORDER BY s.dispatched_at DESC LIMIT 1)sh ON true
LEFT JOIN store_delivery_receipts r ON r.company_id=o.company_id AND r.shipment_id=sh.id
LEFT JOIN shipment_delivery_confirmations dc ON dc.company_id=o.company_id AND dc.shipment_id=sh.id;
GRANT SELECT ON store_request_lifecycle TO stockflow_app;
