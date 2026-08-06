ALTER TABLE users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
CREATE TABLE login_throttles (email text PRIMARY KEY,failed_attempts integer NOT NULL DEFAULT 0,first_failed_at timestamptz NOT NULL DEFAULT now(),blocked_until timestamptz);
CREATE TABLE audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,user_id uuid REFERENCES users(id) ON DELETE SET NULL,action text NOT NULL,entity_type text NOT NULL,entity_id text,details jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX audit_logs_company_time_idx ON audit_logs(company_id,created_at DESC);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY; ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_audit_logs ON audit_logs USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON audit_logs,login_throttles TO stockflow_app;
