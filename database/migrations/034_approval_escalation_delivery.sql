ALTER TABLE approval_requests ADD COLUMN escalation_notified_at timestamptz;
ALTER TABLE approval_notifications ADD COLUMN email_sent_at timestamptz;
ALTER TABLE approval_notifications ADD COLUMN email_error text;
