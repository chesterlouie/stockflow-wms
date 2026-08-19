ALTER TABLE companies
  ADD COLUMN external_subscription_id text,
  ADD COLUMN billing_access_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN payment_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN payment_grace_ends_at date;
CREATE UNIQUE INDEX companies_external_subscription_idx ON companies(external_subscription_id) WHERE external_subscription_id IS NOT NULL;

ALTER TABLE subscription_change_requests
  ADD COLUMN checkout_url text,
  ADD COLUMN provider_status text,
  ADD COLUMN failure_reason text;

ALTER TABLE billing_invoices
  ADD COLUMN provider_invoice_id text,
  ADD COLUMN due_date date;
CREATE UNIQUE INDEX billing_invoices_provider_idx ON billing_invoices(provider_invoice_id) WHERE provider_invoice_id IS NOT NULL;

CREATE TABLE payment_webhook_events (
  provider_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','processed','ignored','failed')),
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

GRANT SELECT,INSERT,UPDATE,DELETE ON payment_webhook_events TO stockflow_app;
