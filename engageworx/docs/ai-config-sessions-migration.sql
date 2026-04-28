-- ai_config_sessions — logs AI config builder conversations
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS ai_config_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  config_type   TEXT NOT NULL,          -- e.g. 'escalation_rules', 'digest_config', 'welcome_email'
  status        TEXT NOT NULL DEFAULT 'in_progress',  -- 'in_progress', 'completed', 'abandoned'
  turn_count    INT NOT NULL DEFAULT 0,
  final_config  JSONB,                  -- the final structured config (null until completed)
  nl_summary    TEXT,                   -- plain-English summary (null until completed)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_ai_config_sessions_tenant
  ON ai_config_sessions(tenant_id, config_type, created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_ai_config_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_config_sessions_updated ON ai_config_sessions;
CREATE TRIGGER trg_ai_config_sessions_updated
  BEFORE UPDATE ON ai_config_sessions
  FOR EACH ROW EXECUTE FUNCTION update_ai_config_sessions_updated_at();

-- RLS: tenant-scoped reads
ALTER TABLE ai_config_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can read own sessions"
  ON ai_config_sessions FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Service role full access"
  ON ai_config_sessions FOR ALL
  USING (true)
  WITH CHECK (true);
