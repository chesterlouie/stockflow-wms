ALTER TABLE shipments DROP CONSTRAINT shipments_status_check;
ALTER TABLE shipments ADD CONSTRAINT shipments_status_check CHECK(status IN('dispatched','reversed'));
ALTER TABLE shipments ADD COLUMN reversed_at timestamptz;
ALTER TABLE shipments ADD COLUMN reversed_by uuid REFERENCES users(id);
ALTER TABLE shipments ADD COLUMN reversal_reason text;
