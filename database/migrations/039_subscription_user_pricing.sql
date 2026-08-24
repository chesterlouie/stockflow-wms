ALTER TABLE companies ALTER COLUMN max_users SET DEFAULT 3;

UPDATE companies
SET max_users = CASE subscription_plan
  WHEN 'starter' THEN 3
  WHEN 'growth' THEN 10
  WHEN 'business' THEN 20
  ELSE max_users
END,
updated_at = now()
WHERE subscription_plan IN ('starter', 'growth', 'business');
