ALTER TABLE companies
  ADD COLUMN billing_email text,
  ADD COLUMN billing_currency text NOT NULL DEFAULT 'PHP',
  ADD COLUMN billing_cycle text NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','annual')),
  ADD COLUMN payment_provider text,
  ADD COLUMN external_customer_id text;

CREATE TABLE subscription_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_plan text NOT NULL CHECK (requested_plan IN ('starter','growth','business','enterprise')),
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly','annual')),
  status text NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment','completed','cancelled','failed')),
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL, provider_checkout_id text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscription_change_requests_company_time_idx ON subscription_change_requests(company_id,created_at DESC);
CREATE TABLE billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number text NOT NULL, amount numeric(14,2) NOT NULL CHECK (amount>=0), currency text NOT NULL DEFAULT 'PHP',
  status text NOT NULL CHECK (status IN ('draft','open','paid','void','uncollectible')), invoice_url text,
  period_start date, period_end date, paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,invoice_number)
);
CREATE INDEX billing_invoices_company_time_idx ON billing_invoices(company_id,created_at DESC);
ALTER TABLE subscription_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_change_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_subscription_changes ON subscription_change_requests USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_billing_invoices ON billing_invoices USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON subscription_change_requests,billing_invoices TO stockflow_app;
