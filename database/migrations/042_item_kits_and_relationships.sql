ALTER TABLE items
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'standard';

ALTER TABLE items DROP CONSTRAINT IF EXISTS items_item_type_check;
ALTER TABLE items ADD CONSTRAINT items_item_type_check
  CHECK (item_type IN ('standard','spare_part','virtual_kit','stocked_kit'));

CREATE TABLE item_kit_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kit_item_id uuid NOT NULL,
  component_item_id uuid NOT NULL,
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  uom text NOT NULL,
  optional boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, kit_item_id, component_item_id),
  CHECK (kit_item_id <> component_item_id),
  FOREIGN KEY (company_id, kit_item_id) REFERENCES items(company_id,id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, component_item_id) REFERENCES items(company_id,id) ON DELETE RESTRICT
);

CREATE TABLE item_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_item_id uuid NOT NULL,
  target_item_id uuid NOT NULL,
  relationship_type text NOT NULL CHECK (relationship_type IN ('substitute','reciprocal_substitute','superseded_by','compatible_with')),
  conversion_ratio numeric(18,6) NOT NULL DEFAULT 1 CHECK (conversion_ratio > 0),
  priority integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 1 AND 9999),
  effective_from date,
  effective_to date,
  approval_required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_item_id <> target_item_id),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  UNIQUE (company_id, source_item_id, target_item_id, relationship_type),
  FOREIGN KEY (company_id, source_item_id) REFERENCES items(company_id,id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, target_item_id) REFERENCES items(company_id,id) ON DELETE RESTRICT
);

CREATE INDEX item_kit_components_kit_idx ON item_kit_components(company_id,kit_item_id) WHERE active;
CREATE INDEX item_relationships_source_idx ON item_relationships(company_id,source_item_id,priority) WHERE active;

ALTER TABLE item_kit_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_kit_components FORCE ROW LEVEL SECURITY;
CREATE POLICY company_isolation_item_kit_components ON item_kit_components
  USING (company_id = nullif(current_setting('app.company_id',true),'')::uuid)
  WITH CHECK (company_id = nullif(current_setting('app.company_id',true),'')::uuid);

ALTER TABLE item_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_relationships FORCE ROW LEVEL SECURITY;
CREATE POLICY company_isolation_item_relationships ON item_relationships
  USING (company_id = nullif(current_setting('app.company_id',true),'')::uuid)
  WITH CHECK (company_id = nullif(current_setting('app.company_id',true),'')::uuid);

GRANT SELECT,INSERT,UPDATE,DELETE ON item_kit_components,item_relationships TO stockflow_app;
