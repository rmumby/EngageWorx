-- 2026-04-30: pipeline_stages table + RLS + default seeds
-- Phase 1 of AI Action Board — authoritative pipeline definition per tenant

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stage_key       TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  stage_type      TEXT NOT NULL CHECK (stage_type IN ('lead', 'active', 'closed_won', 'closed_lost')),
  sub_stage       TEXT,
  display_order   INT NOT NULL,
  auto_advance    BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, stage_key)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_tenant
  ON pipeline_stages(tenant_id, display_order);

ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read own pipeline stages" ON pipeline_stages
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Tenant admins modify own pipeline stages" ON pipeline_stages
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
      AND role IN ('admin', 'owner', 'manager')
    )
  );

-- Seed: Non-SP tenants get 7 standard stages
INSERT INTO pipeline_stages (tenant_id, stage_key, display_name, stage_type, sub_stage, display_order, auto_advance)
SELECT t.id, v.stage_key, v.display_name, v.stage_type, v.sub_stage, v.display_order, v.auto_advance
FROM tenants t
CROSS JOIN (VALUES
  ('lead',                   'Lead',            'lead',        NULL,              1, false),
  ('active_qualified',       'Qualified',       'active',      'qualified',       2, false),
  ('active_demo_scheduled',  'Demo Scheduled',  'active',      'demo_scheduled',  3, true),
  ('active_pricing_sent',    'Pricing Sent',    'active',      'pricing_sent',    4, true),
  ('active_negotiating',     'Negotiating',     'active',      'negotiating',     5, false),
  ('closed_won',             'Customer',        'closed_won',  NULL,              6, false),
  ('closed_lost',            'Closed Lost',     'closed_lost', NULL,              7, false)
) AS v(stage_key, display_name, stage_type, sub_stage, display_order, auto_advance)
WHERE t.id != 'c1bc59a8-5235-4921-9755-02514b574387'
ON CONFLICT (tenant_id, stage_key) DO NOTHING;

-- Seed: SP tenant (EngageWorx) gets 8 stages with sandbox_shared + demo_shared
INSERT INTO pipeline_stages (tenant_id, stage_key, display_name, stage_type, sub_stage, display_order, auto_advance)
VALUES
  ('c1bc59a8-5235-4921-9755-02514b574387', 'lead',                   'Lead',            'lead',        NULL,              1, false),
  ('c1bc59a8-5235-4921-9755-02514b574387', 'active_qualified',       'Qualified',       'active',      'qualified',       2, false),
  ('c1bc59a8-5235-4921-9755-02514b574387', 'active_sandbox_shared',  'Sandbox Shared',  'active',      'sandbox_shared',  3, true),
  ('c1bc59a8-5235-4921-9755-02514b574387', 'active_demo_shared',     'Demo Shared',     'active',      'demo_shared',     4, true),
  ('c1bc59a8-5235-4921-9755-02514b574387', 'active_pricing_sent',    'Pricing Sent',    'active',      'pricing_sent',    5, true),
  ('c1bc59a8-5235-4921-9755-02514b574387', 'active_negotiating',     'Negotiating',     'active',      'negotiating',     6, false),
  ('c1bc59a8-5235-4921-9755-02514b574387', 'closed_won',             'Customer',        'closed_won',  NULL,              7, false),
  ('c1bc59a8-5235-4921-9755-02514b574387', 'closed_lost',            'Closed Lost',     'closed_lost', NULL,              8, false)
ON CONFLICT (tenant_id, stage_key) DO NOTHING;

-- Nullable pipeline_stage_id on leads (no FK yet — backfill deferred to Phase 2)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_stage_id UUID;
