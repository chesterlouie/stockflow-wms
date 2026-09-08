CREATE TABLE shortage_sourcing_recommendations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,warehouse_id uuid NOT NULL,item_id uuid NOT NULL,
 shortage_quantity numeric(18,6) NOT NULL CHECK(shortage_quantity>0),recommended_quantity numeric(18,6) NOT NULL CHECK(recommended_quantity>0),uom text NOT NULL,
 recommended_action text NOT NULL CHECK(recommended_action IN('interwarehouse_transfer','store_transfer','await_purchase_order','purchase_order')),
 source_warehouse_id uuid,source_store_id uuid,source_purchase_order_id uuid REFERENCES purchase_orders(id),expected_available_date date,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','converted','rejected','cancelled')),
 reviewed_by uuid REFERENCES users(id),reviewed_at timestamptz,review_note text,document_type text,document_id uuid,document_reference text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id),FOREIGN KEY(company_id,item_id) REFERENCES items(company_id,id),
 FOREIGN KEY(company_id,source_warehouse_id) REFERENCES warehouses(company_id,id),FOREIGN KEY(company_id,source_store_id) REFERENCES requesting_stores(company_id,id)
);
CREATE UNIQUE INDEX shortage_sourcing_one_pending_idx ON shortage_sourcing_recommendations(company_id,order_id,item_id) WHERE status='pending';
CREATE INDEX shortage_sourcing_queue_idx ON shortage_sourcing_recommendations(company_id,warehouse_id,status,created_at DESC);

CREATE TABLE shortage_supply_transfers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 transfer_no text NOT NULL,destination_warehouse_id uuid NOT NULL,item_id uuid NOT NULL,quantity numeric(18,6) NOT NULL CHECK(quantity>0),uom text NOT NULL,
 source_type text NOT NULL CHECK(source_type IN('warehouse','store')),source_warehouse_id uuid,source_store_id uuid,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','dispatched','received','cancelled')),
 sourcing_recommendation_id uuid NOT NULL UNIQUE REFERENCES shortage_sourcing_recommendations(id),created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,transfer_no),FOREIGN KEY(company_id,destination_warehouse_id) REFERENCES warehouses(company_id,id),FOREIGN KEY(company_id,item_id) REFERENCES items(company_id,id),
 FOREIGN KEY(company_id,source_warehouse_id) REFERENCES warehouses(company_id,id),FOREIGN KEY(company_id,source_store_id) REFERENCES requesting_stores(company_id,id),
 CHECK((source_type='warehouse' AND source_warehouse_id IS NOT NULL AND source_store_id IS NULL) OR (source_type='store' AND source_store_id IS NOT NULL AND source_warehouse_id IS NULL))
);

ALTER TABLE shortage_sourcing_recommendations ENABLE ROW LEVEL SECURITY;ALTER TABLE shortage_sourcing_recommendations FORCE ROW LEVEL SECURITY;
ALTER TABLE shortage_supply_transfers ENABLE ROW LEVEL SECURITY;ALTER TABLE shortage_supply_transfers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_shortage_sourcing_recommendations ON shortage_sourcing_recommendations USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_shortage_supply_transfers ON shortage_supply_transfers USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON shortage_sourcing_recommendations,shortage_supply_transfers TO stockflow_app;
