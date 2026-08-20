CREATE TABLE approval_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,request_id uuid NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,message text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz,UNIQUE(request_id,user_id,message));
CREATE INDEX approval_notifications_user_idx ON approval_notifications(company_id,user_id,read_at,created_at DESC);
ALTER TABLE approval_notifications ENABLE ROW LEVEL SECURITY;ALTER TABLE approval_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_approval_notifications ON approval_notifications USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON approval_notifications TO stockflow_app;
