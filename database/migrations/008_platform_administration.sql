ALTER TABLE companies
  ADD COLUMN max_users integer NOT NULL DEFAULT 10 CHECK (max_users BETWEEN 1 AND 10000),
  ADD COLUMN access_status text NOT NULL DEFAULT 'active' CHECK (access_status IN ('active','frozen')),
  ADD COLUMN subscription_ends_at date,
  ADD COLUMN admin_notes text;

CREATE TABLE platform_admins (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_audit_logs_time_idx ON platform_audit_logs(created_at DESC);
CREATE INDEX platform_audit_logs_company_time_idx ON platform_audit_logs(company_id,created_at DESC);

INSERT INTO platform_admins(user_id)
SELECT m.user_id FROM company_members m JOIN users u ON u.id=m.user_id
WHERE m.role='owner' ORDER BY u.created_at LIMIT 1 ON CONFLICT DO NOTHING;

GRANT SELECT,INSERT,UPDATE,DELETE ON platform_admins,platform_audit_logs TO stockflow_app;
