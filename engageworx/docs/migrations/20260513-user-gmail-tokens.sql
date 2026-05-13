-- 2026-05-13: Per-user Gmail OAuth tokens for Gmail Drafts integration

CREATE TABLE IF NOT EXISTS user_gmail_tokens (
  user_id          UUID PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  refresh_token    TEXT NOT NULL,
  access_token     TEXT,
  token_expires_at TIMESTAMPTZ,
  email_address    TEXT NOT NULL,
  scopes           TEXT[],
  connected_at     TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_gmail_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read/write own gmail tokens"
  ON user_gmail_tokens
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'user_gmail_tokens'
ORDER BY ordinal_position;
