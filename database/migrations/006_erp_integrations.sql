CREATE TABLE api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL, key_prefix text NOT NULL UNIQUE, secret_hash text NOT NULL,
  access_level text NOT NULL DEFAULT 'read' CHECK(access_level IN('read','write')), active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id), last_used_at timestamptz,
  UNIQUE(company_id,name)
);
CREATE TABLE integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  api_client_id uuid REFERENCES api_clients(id) ON DELETE SET NULL, method text NOT NULL, path text NOT NULL,
  status_code integer NOT NULL, idempotency_key text, response_body jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,api_client_id,idempotency_key)
);
ALTER TABLE api_clients ENABLE ROW LEVEL SECURITY; ALTER TABLE api_clients FORCE ROW LEVEL SECURITY;
ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY; ALTER TABLE integration_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_api_clients ON api_clients USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
CREATE POLICY tenant_integration_logs ON integration_logs USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON api_clients,integration_logs TO stockflow_app;
CREATE OR REPLACE FUNCTION authenticate_api_client(p_prefix text,p_hash text)
RETURNS TABLE(client_id uuid,company_id uuid,access_level text) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  UPDATE api_clients SET last_used_at=now() WHERE key_prefix=p_prefix AND secret_hash=p_hash AND active=true
  RETURNING id,api_clients.company_id,api_clients.access_level;
$$;
REVOKE ALL ON FUNCTION authenticate_api_client(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION authenticate_api_client(text,text) TO stockflow_app;
