CREATE TABLE operational_exceptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 domain text NOT NULL CHECK(domain IN('sourcing','transfer','receipt','allocation','picking','dispatch')),
 entity_type text NOT NULL,entity_id uuid NOT NULL,order_id uuid REFERENCES sales_orders(id) ON DELETE CASCADE,warehouse_id uuid NOT NULL,store_id uuid,item_id uuid,
 category text NOT NULL,severity text NOT NULL DEFAULT 'medium' CHECK(severity IN('low','medium','high','critical')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','acknowledged','resolved')),
 summary text NOT NULL,recommended_action text,sla_due_at timestamptz NOT NULL DEFAULT(now()+interval '4 hours'),
 assigned_to uuid REFERENCES users(id),acknowledged_by uuid REFERENCES users(id),acknowledged_at timestamptz,
 resolved_by uuid REFERENCES users(id),resolved_at timestamptz,resolution_note text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id),FOREIGN KEY(company_id,store_id) REFERENCES requesting_stores(company_id,id),FOREIGN KEY(company_id,item_id) REFERENCES items(company_id,id)
);
CREATE UNIQUE INDEX operational_exception_open_unique ON operational_exceptions(company_id,domain,entity_type,entity_id,category) WHERE status<>'resolved';
CREATE INDEX operational_exception_queue_idx ON operational_exceptions(company_id,warehouse_id,status,severity,sla_due_at);
CREATE TABLE operational_exception_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,exception_id uuid NOT NULL REFERENCES operational_exceptions(id) ON DELETE CASCADE,
 event_type text NOT NULL CHECK(event_type IN('created','assigned','acknowledged','resolved','reopened','escalated')),note text,actor_id uuid REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION sync_allocation_operational_exception() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE r record;e uuid;BEGIN
 IF NEW.status='exception' AND OLD.status IS DISTINCT FROM NEW.status THEN
  SELECT s.order_id,s.warehouse_id,s.item_id,o.store_id INTO r FROM shortage_sourcing_recommendations s JOIN sales_orders o ON o.id=s.order_id WHERE s.id=NEW.sourcing_recommendation_id;
  INSERT INTO operational_exceptions(company_id,domain,entity_type,entity_id,order_id,warehouse_id,store_id,item_id,category,severity,summary,recommended_action,sla_due_at)
  VALUES(NEW.company_id,'allocation','replenishment_allocation_job',NEW.id,r.order_id,r.warehouse_id,r.store_id,r.item_id,coalesce(NEW.last_error,'ALLOCATION_FAILED'),CASE WHEN NEW.attempts>=5 THEN 'critical' ELSE 'high' END,'Automatic replenishment allocation failed: '||coalesce(NEW.last_error,'unknown error'),'Correct stock, Packing location, or order state, then retry allocation.',now()+CASE WHEN NEW.attempts>=5 THEN interval '1 hour' ELSE interval '4 hours' END)
  ON CONFLICT(company_id,domain,entity_type,entity_id,category) WHERE status<>'resolved' DO UPDATE SET severity=excluded.severity,summary=excluded.summary,recommended_action=excluded.recommended_action,sla_due_at=least(operational_exceptions.sla_due_at,excluded.sla_due_at),updated_at=now() RETURNING id INTO e;
  INSERT INTO operational_exception_events(company_id,exception_id,event_type,note) VALUES(NEW.company_id,e,'created',NEW.last_error);
 ELSIF NEW.status='completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
  UPDATE operational_exceptions SET status='resolved',resolved_at=now(),resolution_note='Resolved automatically when replenishment allocation completed.',updated_at=now() WHERE company_id=NEW.company_id AND entity_type='replenishment_allocation_job' AND entity_id=NEW.id AND status<>'resolved';
 END IF;RETURN NEW;END $$;
CREATE TRIGGER allocation_job_operational_exception AFTER UPDATE OF status ON replenishment_allocation_jobs FOR EACH ROW EXECUTE FUNCTION sync_allocation_operational_exception();

CREATE VIEW operational_order_timeline WITH(security_invoker=true) AS
 SELECT r.company_id,r.order_id,r.created_at event_at,'sourcing_recommendation' event_type,r.id entity_id,r.recommended_action||' · '||r.status detail FROM shortage_sourcing_recommendations r
 UNION ALL SELECT t.company_id,r.order_id,t.created_at,'supply_transfer',t.id,t.transfer_no||' · '||t.status FROM shortage_supply_transfers t JOIN shortage_sourcing_recommendations r ON r.id=t.sourcing_recommendation_id
 UNION ALL SELECT e.company_id,r.order_id,e.occurred_at,'transfer_'||e.event_type,e.id,coalesce(e.quantity::text||' '||e.uom,e.reason,e.event_type) FROM shortage_supply_transfer_events e JOIN shortage_supply_transfers t ON t.id=e.transfer_id JOIN shortage_sourcing_recommendations r ON r.id=t.sourcing_recommendation_id
 UNION ALL SELECT j.company_id,j.order_id,j.updated_at,'replenishment_allocation',j.id,j.status||coalesce(' · '||j.last_error,'') FROM replenishment_allocation_jobs j
 UNION ALL SELECT a.company_id,l.order_id,o.created_at,'stock_allocation',a.id,a.quantity::text||' allocated' FROM stock_allocations a JOIN sales_order_lines l ON l.id=a.order_line_id JOIN sales_orders o ON o.id=l.order_id
 UNION ALL SELECT p.company_id,l.order_id,coalesce(p.completed_at,o.created_at),'pick_'||p.status,p.id,p.quantity::text||' '||p.uom FROM pick_tasks p JOIN stock_allocations a ON a.id=p.allocation_id JOIN sales_order_lines l ON l.id=a.order_line_id JOIN sales_orders o ON o.id=l.order_id
 UNION ALL SELECT s.company_id,s.order_id,s.dispatched_at,'shipment_dispatched',s.id,s.shipment_no FROM shipments s;

CREATE VIEW sourcing_performance_kpis WITH(security_invoker=true) AS SELECT r.company_id,r.warehouse_id,date_trunc('day',r.created_at)::date activity_date,r.recommended_action,
 count(*) recommendations,count(*)FILTER(WHERE r.status='converted') converted,count(*)FILTER(WHERE r.status='rejected') rejected,
 avg(extract(epoch FROM(r.reviewed_at-r.created_at))/3600)FILTER(WHERE r.reviewed_at IS NOT NULL) avg_review_hours,
 avg(extract(epoch FROM(t.received_at-t.approved_at))/3600)FILTER(WHERE t.received_at IS NOT NULL) avg_transfer_lead_hours,
 count(j.id) allocation_jobs,count(j.id)FILTER(WHERE j.status='completed') allocation_completed,count(j.id)FILTER(WHERE j.status='exception') allocation_failed
 FROM shortage_sourcing_recommendations r LEFT JOIN shortage_supply_transfers t ON t.sourcing_recommendation_id=r.id LEFT JOIN replenishment_allocation_jobs j ON j.sourcing_recommendation_id=r.id GROUP BY r.company_id,r.warehouse_id,date_trunc('day',r.created_at)::date,r.recommended_action;

ALTER TABLE operational_exceptions ENABLE ROW LEVEL SECURITY;ALTER TABLE operational_exceptions FORCE ROW LEVEL SECURITY;ALTER TABLE operational_exception_events ENABLE ROW LEVEL SECURITY;ALTER TABLE operational_exception_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_operational_exceptions ON operational_exceptions USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_operational_exception_events ON operational_exception_events USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON operational_exceptions,operational_exception_events TO stockflow_app;GRANT SELECT ON operational_order_timeline,sourcing_performance_kpis TO stockflow_app;
