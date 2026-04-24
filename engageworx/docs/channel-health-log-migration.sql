-- Channel Health Log — stores daily health check results
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.channel_health_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ DEFAULT now(),
  tenant_id UUID,
  channel TEXT,
  severity TEXT,
  issue TEXT,
  config_snapshot JSONB
);

CREATE INDEX IF NOT EXISTS idx_channel_health_log_run ON channel_health_log(run_at);
CREATE INDEX IF NOT EXISTS idx_channel_health_log_tenant ON channel_health_log(tenant_id);

ALTER TABLE channel_health_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON channel_health_log
  FOR ALL USING (true) WITH CHECK (true);
