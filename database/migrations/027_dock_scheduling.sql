CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE dock_doors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL, code text NOT NULL, name text NOT NULL, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,warehouse_id,code),
  FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id)
);
CREATE TABLE receiving_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  appointment_no text NOT NULL, warehouse_id uuid NOT NULL, dock_door_id uuid NOT NULL REFERENCES dock_doors(id),
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL, supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  scheduled_start timestamptz NOT NULL, scheduled_end timestamptz NOT NULL,
  vehicle_plate text, driver_name text, driver_phone text, reference text, notes text,
  status text NOT NULL DEFAULT 'scheduled' CHECK(status IN('scheduled','arrived','checked_in','unloading','completed','cancelled','no_show')),
  arrived_at timestamptz, checked_in_at timestamptz, unloading_started_at timestamptz, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,appointment_no), CHECK(scheduled_end>scheduled_start),
  FOREIGN KEY(company_id,warehouse_id) REFERENCES warehouses(company_id,id)
);
ALTER TABLE receiving_appointments ADD CONSTRAINT receiving_appointments_no_overlap EXCLUDE USING gist (dock_door_id WITH =,tstzrange(scheduled_start,scheduled_end,'[)') WITH &&) WHERE (status IN('scheduled','arrived','checked_in','unloading'));
CREATE INDEX receiving_appointments_schedule_idx ON receiving_appointments(company_id,scheduled_start,status);
ALTER TABLE dock_doors ENABLE ROW LEVEL SECURITY; ALTER TABLE dock_doors FORCE ROW LEVEL SECURITY;
ALTER TABLE receiving_appointments ENABLE ROW LEVEL SECURITY; ALTER TABLE receiving_appointments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_dock_doors ON dock_doors USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_receiving_appointments ON receiving_appointments USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON dock_doors,receiving_appointments TO stockflow_app;
