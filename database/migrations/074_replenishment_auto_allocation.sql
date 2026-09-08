ALTER TABLE shortage_sourcing_recommendations ADD COLUMN auto_allocate boolean NOT NULL DEFAULT true;
CREATE TABLE replenishment_allocation_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 sourcing_recommendation_id uuid NOT NULL UNIQUE REFERENCES shortage_sourcing_recommendations(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,warehouse_id uuid NOT NULL,source_document_type text NOT NULL,source_document_id uuid,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','completed','exception','cancelled')),
 attempts integer NOT NULL DEFAULT 0,last_error text,next_attempt_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id)
);
CREATE TABLE replenishment_allocation_links(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 job_id uuid NOT NULL REFERENCES replenishment_allocation_jobs(id) ON DELETE CASCADE,allocation_id uuid NOT NULL UNIQUE REFERENCES stock_allocations(id) ON DELETE CASCADE,
 source_document_type text NOT NULL,source_document_id uuid,receipt_inventory_ledger_id uuid REFERENCES inventory_ledger(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX replenishment_jobs_queue_idx ON replenishment_allocation_jobs(company_id,warehouse_id,status,next_attempt_at);
CREATE INDEX replenishment_links_job_idx ON replenishment_allocation_links(company_id,job_id);

CREATE FUNCTION enqueue_shortage_transfer_allocation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status='received' AND OLD.status IS DISTINCT FROM NEW.status THEN
  INSERT INTO replenishment_allocation_jobs(company_id,sourcing_recommendation_id,order_id,warehouse_id,source_document_type,source_document_id)
  SELECT r.company_id,r.id,r.order_id,r.warehouse_id,'shortage_supply_transfer',NEW.id FROM shortage_sourcing_recommendations r
  WHERE r.id=NEW.sourcing_recommendation_id AND r.auto_allocate ON CONFLICT(sourcing_recommendation_id) DO UPDATE SET status=CASE WHEN replenishment_allocation_jobs.status='completed' THEN 'completed' ELSE 'pending' END,next_attempt_at=now(),updated_at=now();
 END IF;RETURN NEW;END $$;
CREATE TRIGGER shortage_transfer_enqueue_allocation AFTER UPDATE OF status ON shortage_supply_transfers FOR EACH ROW EXECUTE FUNCTION enqueue_shortage_transfer_allocation();

CREATE FUNCTION enqueue_shortage_po_allocation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.purchase_order_line_id IS NOT NULL AND NEW.accepted_quantity>OLD.accepted_quantity THEN
  INSERT INTO replenishment_allocation_jobs(company_id,sourcing_recommendation_id,order_id,warehouse_id,source_document_type,source_document_id)
  SELECT r.company_id,r.id,r.order_id,r.warehouse_id,'purchase_order',pl.purchase_order_id FROM purchase_order_lines pl JOIN shortage_sourcing_recommendations r ON r.company_id=pl.company_id AND (r.source_purchase_order_id=pl.purchase_order_id OR (r.document_type='purchase_order' AND r.document_id=pl.purchase_order_id))
  WHERE pl.company_id=NEW.company_id AND pl.id=NEW.purchase_order_line_id AND r.auto_allocate ON CONFLICT(sourcing_recommendation_id) DO UPDATE SET status=CASE WHEN replenishment_allocation_jobs.status='completed' THEN 'completed' ELSE 'pending' END,next_attempt_at=now(),updated_at=now();
 END IF;RETURN NEW;END $$;
CREATE TRIGGER shortage_po_enqueue_allocation AFTER UPDATE OF accepted_quantity ON inbound_receipt_lines FOR EACH ROW EXECUTE FUNCTION enqueue_shortage_po_allocation();

ALTER TABLE replenishment_allocation_jobs ENABLE ROW LEVEL SECURITY;ALTER TABLE replenishment_allocation_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE replenishment_allocation_links ENABLE ROW LEVEL SECURITY;ALTER TABLE replenishment_allocation_links FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_replenishment_allocation_jobs ON replenishment_allocation_jobs USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_replenishment_allocation_links ON replenishment_allocation_links USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON replenishment_allocation_jobs,replenishment_allocation_links TO stockflow_app;
