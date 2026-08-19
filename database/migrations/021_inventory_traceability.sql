CREATE TABLE inventory_serials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 item_id uuid NOT NULL, serial_number text NOT NULL, location_id uuid, status text NOT NULL DEFAULT 'available'
 CHECK(status IN('available','held','damaged','packed','issued','scrapped','returned_supplier')),
 source_receipt_inspection_id uuid REFERENCES receipt_inspections(id), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,serial_number), FOREIGN KEY(company_id,item_id) REFERENCES items(company_id,id),
 FOREIGN KEY(company_id,location_id) REFERENCES locations(company_id,id)
);
CREATE TABLE putaway_task_serials (company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,putaway_task_id uuid NOT NULL REFERENCES putaway_tasks(id) ON DELETE CASCADE,serial_id uuid NOT NULL REFERENCES inventory_serials(id) ON DELETE CASCADE,PRIMARY KEY(putaway_task_id,serial_id));
CREATE TABLE pick_task_serials (company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,pick_task_id uuid NOT NULL REFERENCES pick_tasks(id) ON DELETE CASCADE,serial_id uuid NOT NULL REFERENCES inventory_serials(id) ON DELETE CASCADE,PRIMARY KEY(pick_task_id,serial_id));
ALTER TABLE inventory_return_lines ADD COLUMN serial_number text;
INSERT INTO inventory_serials(company_id,item_id,serial_number,location_id,status,source_receipt_inspection_id)
SELECT s.company_id,s.item_id,s.serial_number,x.location_id,s.status,s.receipt_inspection_id FROM received_serials s
JOIN receipt_inspections ri ON ri.id=s.receipt_inspection_id JOIN inbound_receipt_lines rl ON rl.id=ri.receipt_line_id
LEFT JOIN LATERAL (SELECT il.location_id FROM inventory_ledger il WHERE il.company_id=s.company_id AND il.item_id=s.item_id AND il.reference_id=rl.receipt_id::text ORDER BY il.occurred_at DESC LIMIT 1) x ON true
ON CONFLICT(company_id,serial_number) DO NOTHING;
ALTER TABLE inventory_serials ENABLE ROW LEVEL SECURITY;ALTER TABLE inventory_serials FORCE ROW LEVEL SECURITY;
ALTER TABLE putaway_task_serials ENABLE ROW LEVEL SECURITY;ALTER TABLE putaway_task_serials FORCE ROW LEVEL SECURITY;
ALTER TABLE pick_task_serials ENABLE ROW LEVEL SECURITY;ALTER TABLE pick_task_serials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_inventory_serials ON inventory_serials USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_putaway_task_serials ON putaway_task_serials USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_pick_task_serials ON pick_task_serials USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON inventory_serials,putaway_task_serials,pick_task_serials TO stockflow_app;
CREATE INDEX inventory_serials_lookup_idx ON inventory_serials(company_id,item_id,status,location_id);
