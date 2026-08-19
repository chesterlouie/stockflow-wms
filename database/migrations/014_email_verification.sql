ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
UPDATE users SET email_verified_at=created_at;
CREATE TABLE email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_verification_tokens_user_idx ON email_verification_tokens(user_id,created_at DESC);
GRANT SELECT,INSERT,UPDATE,DELETE ON email_verification_tokens TO stockflow_app;
