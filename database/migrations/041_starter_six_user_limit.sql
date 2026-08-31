ALTER TABLE companies ALTER COLUMN max_users SET DEFAULT 6;

UPDATE companies
SET max_users = 6,
    updated_at = now()
WHERE subscription_plan = 'starter'
  AND max_users = 3;
