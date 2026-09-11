ALTER TABLE shipments
  ADD COLUMN carrier_assignment_id uuid REFERENCES order_carrier_assignments(id) ON DELETE SET NULL,
  ADD COLUMN carrier_tender_attempt_id uuid REFERENCES carrier_tender_attempts(id) ON DELETE SET NULL,
  ADD COLUMN carrier_capacity_reservation_id uuid REFERENCES carrier_capacity_reservations(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX shipments_carrier_assignment_once_idx ON shipments(company_id,carrier_assignment_id) WHERE carrier_assignment_id IS NOT NULL;

CREATE VIEW carrier_dispatch_readiness WITH(security_invoker=true) AS
SELECT o.company_id,o.id order_id,o.warehouse_id,o.order_no,a.id assignment_id,a.carrier_service_id,a.status assignment_status,
       t.id tender_attempt_id,t.attempt_number,t.status tender_status,t.response_due_at,
       r.id capacity_reservation_id,r.status capacity_status,r.shipment_units,
       coalesce(i.mode,'manual') integration_mode,
       (a.status='accepted' AND t.status='accepted' AND r.status='reserved' AND t.carrier_service_id=a.carrier_service_id) ready_to_dispatch,
       CASE
         WHEN a.id IS NULL THEN 'carrier_plan_required'
         WHEN a.status<>'accepted' THEN 'accepted_tender_required'
         WHEN t.id IS NULL OR t.status<>'accepted' THEN 'accepted_tender_required'
         WHEN t.carrier_service_id<>a.carrier_service_id THEN 'carrier_mismatch'
         WHEN r.id IS NULL OR r.status<>'reserved' THEN 'capacity_reservation_required'
         ELSE 'ready'
       END readiness_code
FROM sales_orders o
LEFT JOIN order_carrier_assignments a ON a.company_id=o.company_id AND a.order_id=o.id
LEFT JOIN LATERAL(
  SELECT x.* FROM carrier_tender_attempts x
  WHERE x.company_id=o.company_id AND x.assignment_id=a.id
  ORDER BY x.attempt_number DESC LIMIT 1
) t ON true
LEFT JOIN carrier_capacity_reservations r ON r.company_id=o.company_id AND r.assignment_id=a.id
LEFT JOIN carrier_integrations i ON i.company_id=o.company_id AND i.carrier_service_id=a.carrier_service_id AND i.active
WHERE o.status='packed';

GRANT SELECT ON carrier_dispatch_readiness TO stockflow_app;
CREATE INDEX shipments_tender_attempt_idx ON shipments(company_id,carrier_tender_attempt_id);
CREATE INDEX shipments_capacity_reservation_idx ON shipments(company_id,carrier_capacity_reservation_id);
