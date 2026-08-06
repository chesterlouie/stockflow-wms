ALTER TABLE inventory_ledger ADD COLUMN transaction_group_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE inventory_ledger ADD COLUMN reversal_of uuid REFERENCES inventory_ledger(id);
ALTER TABLE inventory_ledger ADD COLUMN reason_code text;
ALTER TABLE inventory_ledger ADD COLUMN note text;

CREATE INDEX inventory_ledger_group_idx ON inventory_ledger(company_id, transaction_group_id);

CREATE TABLE adjustment_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  description text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE(company_id, code)
);

INSERT INTO adjustment_reasons(company_id,code,description)
SELECT id,'DAMAGE','Damaged stock' FROM companies
UNION ALL SELECT id,'FOUND','Stock found during verification' FROM companies
UNION ALL SELECT id,'LOSS','Lost or missing stock' FROM companies
UNION ALL SELECT id,'CORRECTION','Inventory correction' FROM companies;

ALTER TABLE adjustment_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE adjustment_reasons FORCE ROW LEVEL SECURITY;
CREATE POLICY company_isolation_adjustment_reasons ON adjustment_reasons
  USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON adjustment_reasons TO stockflow_app;
