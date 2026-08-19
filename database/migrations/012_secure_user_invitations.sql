CREATE TABLE user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email text NOT NULL, display_name text NOT NULL, role text NOT NULL CHECK (role IN ('admin','manager','operator','viewer')),
  token_hash text NOT NULL UNIQUE, invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL, accepted_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_invitations_active_email_idx ON user_invitations(company_id,email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX user_invitations_company_time_idx ON user_invitations(company_id,created_at DESC);
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_user_invitations ON user_invitations USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON user_invitations TO stockflow_app;
CREATE FUNCTION resolve_user_invitation(p_token_hash text)
RETURNS TABLE(id uuid,company_id uuid,email text,display_name text,role text,company text)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT i.id,i.company_id,i.email,i.display_name,i.role,c.name FROM user_invitations i JOIN companies c ON c.id=i.company_id
  WHERE i.token_hash=p_token_hash AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()
$$;
REVOKE ALL ON FUNCTION resolve_user_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_user_invitation(text) TO stockflow_app;
