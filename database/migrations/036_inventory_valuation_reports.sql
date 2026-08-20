ALTER TABLE companies ADD COLUMN valuation_currency text NOT NULL DEFAULT 'PHP';
ALTER TABLE items ADD COLUMN standard_cost numeric(18,6) NOT NULL DEFAULT 0 CHECK(standard_cost>=0);
