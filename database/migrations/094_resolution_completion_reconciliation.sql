ALTER TABLE delivery_discrepancy_resolution_lines DROP CONSTRAINT delivery_discrepancy_resolution_lines_status_check;
ALTER TABLE delivery_discrepancy_resolution_lines ADD CONSTRAINT delivery_discrepancy_resolution_lines_status_check CHECK(status IN('planned','authorized','dispatched','received','awaiting_fulfillment','awaiting_credit','awaiting_disposal','awaiting_disposition','completed','cancelled'));
ALTER TABLE delivery_discrepancy_resolutions DROP CONSTRAINT delivery_discrepancy_resolutions_status_check;
ALTER TABLE delivery_discrepancy_resolutions ADD CONSTRAINT delivery_discrepancy_resolutions_status_check CHECK(status IN('planned','in_progress','awaiting_store_return','return_in_transit','awaiting_warehouse_receipt','awaiting_disposition','overdue','resolved','cancelled'));
ALTER TABLE delivery_discrepancy_resolutions ADD COLUMN due_at timestamptz NOT NULL DEFAULT(now()+interval '7 days');

CREATE TABLE delivery_resolution_credits(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,resolution_id uuid NOT NULL,line_id uuid NOT NULL,
 amount numeric(18,2) NOT NULL CHECK(amount>=0),currency text NOT NULL DEFAULT 'PHP',credit_reference text NOT NULL,note text NOT NULL,
 approved_by uuid NOT NULL REFERENCES users(id),approved_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,line_id),
 FOREIGN KEY(company_id,resolution_id) REFERENCES delivery_discrepancy_resolutions(company_id,id),FOREIGN KEY(line_id) REFERENCES delivery_discrepancy_resolution_lines(id)
);
CREATE TABLE delivery_resolution_store_disposals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,resolution_id uuid NOT NULL,line_id uuid NOT NULL,
 store_location_id uuid NOT NULL,barcode_value text NOT NULL,evidence_reference text NOT NULL,note text NOT NULL,
 disposed_by uuid NOT NULL REFERENCES users(id),disposed_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,line_id),
 FOREIGN KEY(company_id,resolution_id) REFERENCES delivery_discrepancy_resolutions(company_id,id),FOREIGN KEY(line_id) REFERENCES delivery_discrepancy_resolution_lines(id),FOREIGN KEY(company_id,store_location_id) REFERENCES store_locations(company_id,id)
);
ALTER TABLE delivery_resolution_credits ENABLE ROW LEVEL SECURITY;ALTER TABLE delivery_resolution_credits FORCE ROW LEVEL SECURITY;
ALTER TABLE delivery_resolution_store_disposals ENABLE ROW LEVEL SECURITY;ALTER TABLE delivery_resolution_store_disposals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_delivery_resolution_credits ON delivery_resolution_credits USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_delivery_resolution_store_disposals ON delivery_resolution_store_disposals USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON delivery_resolution_credits,delivery_resolution_store_disposals TO stockflow_app;

UPDATE delivery_discrepancy_resolution_lines SET status=CASE action WHEN 'replacement' THEN 'awaiting_fulfillment' WHEN 'backorder' THEN 'awaiting_fulfillment' WHEN 'credit' THEN 'awaiting_credit' WHEN 'dispose_at_store' THEN 'awaiting_disposal' WHEN 'return_to_warehouse' THEN CASE WHEN status='received' THEN 'awaiting_disposition' ELSE status END ELSE status END WHERE status<>'cancelled';
UPDATE delivery_discrepancy_resolutions r SET status=CASE WHEN EXISTS(SELECT 1 FROM delivery_discrepancy_resolution_lines l WHERE l.resolution_id=r.id AND l.status='authorized') THEN 'awaiting_store_return' WHEN EXISTS(SELECT 1 FROM delivery_discrepancy_resolution_lines l WHERE l.resolution_id=r.id AND l.status='awaiting_disposition') THEN 'awaiting_disposition' ELSE 'in_progress' END,resolved_by=NULL,resolved_at=NULL WHERE status='resolved' AND EXISTS(SELECT 1 FROM delivery_discrepancy_resolution_lines l WHERE l.resolution_id=r.id AND l.status NOT IN('completed','cancelled'));

CREATE FUNCTION complete_delivery_resolution_if_ready(p_company uuid,p_resolution uuid,p_user uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_claim uuid;v_shipment uuid;v_no text;
BEGIN
 IF EXISTS(SELECT 1 FROM delivery_discrepancy_resolution_lines WHERE company_id=p_company AND resolution_id=p_resolution AND status NOT IN('completed','cancelled')) THEN RETURN;END IF;
 SELECT r.claim_id,dc.shipment_id,r.resolution_no INTO v_claim,v_shipment,v_no FROM delivery_discrepancy_resolutions r JOIN shipment_delivery_confirmations dc ON dc.id=r.confirmation_id WHERE r.company_id=p_company AND r.id=p_resolution FOR UPDATE OF r;
 UPDATE delivery_discrepancy_resolutions SET status='resolved',resolved_by=p_user,resolved_at=now() WHERE company_id=p_company AND id=p_resolution AND status<>'resolved';
 UPDATE operational_exceptions SET status='resolved',resolution_note='All service-recovery actions completed for '||v_no,resolved_at=now(),resolved_by=p_user,updated_at=now() WHERE company_id=p_company AND entity_type='shipment' AND entity_id=v_shipment AND category='delivery_discrepancy' AND status<>'resolved';
 IF v_claim IS NOT NULL THEN
  UPDATE delivery_claims SET status='closed',resolved_at=now() WHERE company_id=p_company AND id=v_claim AND status NOT IN('closed','settled','rejected_internal','rejected_by_carrier','withdrawn');
  INSERT INTO delivery_claim_events(company_id,claim_id,event_type,to_status,note,created_by) VALUES(p_company,v_claim,'service_recovery_completed','closed','All Store recovery obligations completed for '||v_no,p_user);
 END IF;
 INSERT INTO delivery_discrepancy_resolution_events(company_id,resolution_id,event_type,note,created_by) VALUES(p_company,p_resolution,'resolved','All required replacement, credit, disposal, and return-disposition actions reconciled.',p_user);
END$$;
GRANT EXECUTE ON FUNCTION complete_delivery_resolution_if_ready(uuid,uuid,uuid) TO stockflow_app;

CREATE FUNCTION reconcile_delivery_return_disposition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_resolution uuid;v_line uuid;v_actor uuid;
BEGIN
 IF NEW.disposition IN('restock','scrap','return_supplier') AND OLD.disposition='pending' THEN
  SELECT e.resolution_id,e.line_id INTO v_resolution,v_line FROM delivery_discrepancy_resolution_events e WHERE e.company_id=NEW.company_id AND e.inventory_return_id=NEW.return_id AND e.event_type='warehouse_return_received' LIMIT 1;
  IF v_resolution IS NOT NULL THEN
   SELECT coalesce(r.dispositioned_by,r.created_by) INTO v_actor FROM inventory_returns r WHERE r.id=NEW.return_id;
   UPDATE delivery_discrepancy_resolution_lines SET status='completed' WHERE company_id=NEW.company_id AND id=v_line AND status='awaiting_disposition';
   INSERT INTO delivery_discrepancy_resolution_events(company_id,resolution_id,event_type,line_id,quantity,inventory_return_id,note,created_by) VALUES(NEW.company_id,v_resolution,'return_disposition_completed',v_line,NEW.quantity,NEW.return_id,'Final disposition: '||NEW.disposition,v_actor);
   PERFORM complete_delivery_resolution_if_ready(NEW.company_id,v_resolution,v_actor);
  END IF;
 END IF;RETURN NEW;
END$$;
CREATE TRIGGER reconcile_delivery_return_disposition_trigger AFTER UPDATE OF disposition ON inventory_return_lines FOR EACH ROW EXECUTE FUNCTION reconcile_delivery_return_disposition();

CREATE FUNCTION reconcile_replacement_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_resolution uuid;v_user uuid;
BEGIN
 IF NEW.status='closed' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
  SELECT r.id INTO v_resolution FROM delivery_discrepancy_resolutions r JOIN shipments sh ON sh.order_id=r.replacement_order_id WHERE r.company_id=NEW.company_id AND sh.id=NEW.shipment_id FOR UPDATE OF r;
  IF v_resolution IS NOT NULL THEN
   v_user=coalesce(NEW.reviewed_by,NEW.submitted_by);
   UPDATE delivery_discrepancy_resolution_lines SET status='completed' WHERE company_id=NEW.company_id AND resolution_id=v_resolution AND action IN('replacement','backorder') AND status='awaiting_fulfillment';
   INSERT INTO delivery_discrepancy_resolution_events(company_id,resolution_id,event_type,note,created_by) VALUES(NEW.company_id,v_resolution,'replacement_delivered','Replacement or backorder delivery was confirmed closed.',v_user);
   PERFORM complete_delivery_resolution_if_ready(NEW.company_id,v_resolution,v_user);
  END IF;
 END IF;RETURN NEW;
END$$;
CREATE TRIGGER reconcile_replacement_delivery_trigger AFTER INSERT OR UPDATE OF status ON shipment_delivery_confirmations FOR EACH ROW EXECUTE FUNCTION reconcile_replacement_delivery();

CREATE VIEW delivery_resolution_reconciliation WITH(security_invoker=true) AS SELECT r.company_id,r.id,r.resolution_no,r.status,r.due_at,(r.due_at<now() AND r.status NOT IN('resolved','cancelled')) overdue,count(l.id) required_actions,count(l.id)FILTER(WHERE l.status IN('completed','cancelled')) completed_actions,sum(l.quantity) affected_quantity,sum(l.quantity)FILTER(WHERE l.status IN('completed','cancelled')) reconciled_quantity,r.replacement_order_id,r.claim_id FROM delivery_discrepancy_resolutions r JOIN delivery_discrepancy_resolution_lines l ON l.resolution_id=r.id GROUP BY r.id;
GRANT SELECT ON delivery_resolution_reconciliation TO stockflow_app;
