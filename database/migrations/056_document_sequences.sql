CREATE TABLE document_sequences(
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  scope_id uuid NOT NULL,
  document_type text NOT NULL,
  period text NOT NULL CHECK(period ~ '^[0-9]{6}$'),
  next_value bigint NOT NULL DEFAULT 1 CHECK(next_value>0),
  PRIMARY KEY(company_id,scope_id,document_type,period)
);
ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_sequences FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_document_sequences ON document_sequences USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid) WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON document_sequences TO stockflow_app;
