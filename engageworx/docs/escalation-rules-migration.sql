-- Escalation Rules schema + seed data
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}',
  action_type TEXT NOT NULL,
  action_config JSONB DEFAULT '{}',
  priority INT DEFAULT 10,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escalation_rules_tenant ON escalation_rules(tenant_id);

ALTER TABLE escalation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON escalation_rules
  FOR ALL USING (true) WITH CHECK (true);

-- Seed default rules for all existing tenants
INSERT INTO escalation_rules (tenant_id, rule_name, description, trigger_type, trigger_config, action_type, action_config, priority, active)
SELECT t.id, r.rule_name, r.description, r.trigger_type, r.trigger_config::jsonb, r.action_type, r.action_config::jsonb, r.priority, true
FROM tenants t
CROSS JOIN (VALUES
  ('Human request', 'Customer asks to speak with a real person', 'keyword', '{"keywords":["speak to human","real person","manager","agent","representative"]}', 'escalate_human', '{}', 5),
  ('Legal threat', 'Customer mentions legal action', 'keyword', '{"keywords":["lawyer","lawsuit","legal action","sue","attorney"]}', 'notify_admin', '{}', 1),
  ('Safety concern', 'Urgent safety or emergency language detected', 'keyword', '{"keywords":["emergency","urgent","harm","threat","danger"]}', 'escalate_human', '{}', 1),
  ('VIP customer', 'Contact is flagged as VIP', 'vip_match', '{"vip_only":true}', 'notify_admin', '{}', 3)
) AS r(rule_name, description, trigger_type, trigger_config, action_type, action_config, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM escalation_rules er WHERE er.tenant_id = t.id
);
