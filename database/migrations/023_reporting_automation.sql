CREATE TABLE warehouse_alert_settings (
 company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
 expiry_warning_days integer NOT NULL DEFAULT 30 CHECK(expiry_warning_days BETWEEN 1 AND 365),
 low_stock_quantity numeric(18,6) NOT NULL DEFAULT 5 CHECK(low_stock_quantity>=0),
 overdue_order_hours integer NOT NULL DEFAULT 24 CHECK(overdue_order_hours BETWEEN 1 AND 720),
 accuracy_target numeric(5,2) NOT NULL DEFAULT 98 CHECK(accuracy_target BETWEEN 0 AND 100),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE report_schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 report_type text NOT NULL CHECK(report_type IN('stock','movements','receiving','fulfillment','expiry','variances')),
 frequency text NOT NULL CHECK(frequency IN('daily','weekly','monthly')),format text NOT NULL DEFAULT 'csv' CHECK(format IN('csv','pdf')),
 recipients text NOT NULL,active boolean NOT NULL DEFAULT true,next_run_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id)
);
ALTER TABLE warehouse_alert_settings ENABLE ROW LEVEL SECURITY;ALTER TABLE warehouse_alert_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;ALTER TABLE report_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_warehouse_alert_settings ON warehouse_alert_settings USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_report_schedules ON report_schedules USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON warehouse_alert_settings,report_schedules TO stockflow_app;
