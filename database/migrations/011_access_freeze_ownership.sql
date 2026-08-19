ALTER TABLE companies ADD COLUMN admin_access_frozen boolean NOT NULL DEFAULT false;
UPDATE companies SET admin_access_frozen=true WHERE access_status='frozen' AND billing_access_suspended=false;
