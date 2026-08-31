CREATE TABLE item_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, code),
  UNIQUE(company_id, name),
  UNIQUE(company_id, id)
);

INSERT INTO item_categories(company_id,code,name)
SELECT company_id,upper(regexp_replace(trim(category),'[^A-Za-z0-9]+','-','g')),trim(category)
FROM items
WHERE nullif(trim(category),'') IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_item_categories ON item_categories
  USING(company_id=nullif(current_setting('app.company_id',true),'')::uuid)
  WITH CHECK(company_id=nullif(current_setting('app.company_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON item_categories TO stockflow_app;
