-- Escalation Log — audit trail for fired escalation notifications
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.escalation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  rule_id UUID REFERENCES escalation_rules(id),
  conversation_id UUID,
  contact_id UUID,
  notified_user_id UUID,
  channels_attempted TEXT[],
  channels_succeeded TEXT[],
  channels_failed JSONB,
  trigger_keyword_matched TEXT,
  trigger_excerpt TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escalation_log_tenant ON escalation_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_escalation_log_conversation ON escalation_log(conversation_id);

ALTER TABLE escalation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON escalation_log
  FOR ALL USING (true) WITH CHECK (true);
