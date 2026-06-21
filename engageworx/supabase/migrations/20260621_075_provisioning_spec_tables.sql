-- 075: declarative provisioning config surfaces.
--   tenant_provisioning_specs       — per-tier recipe (channels/plan/pipeline/incomplete-map/branding)
--   provisioning_pipeline_templates — named pipeline-stage templates (e.g. standard_sales)
-- Config, not code: provision_tenant_and_bind (076) reads these. Spec-row-missing => seeding skipped.
-- Idempotent: CREATE TABLE IF NOT EXISTS + upsert seeds.

CREATE TABLE IF NOT EXISTS public.tenant_provisioning_specs (
  entity_tier        text PRIMARY KEY,           -- master_agent|agent|csp|tenant (super_admin excluded; RPC blocks it)
  channels           text[] NOT NULL DEFAULT '{}',
  default_plan       text,                        -- plan_limits.plan_name, or NULL (resellers)
  pipeline_template  text,                        -- provisioning_pipeline_templates.template_name, or NULL
  set_incomplete_when jsonb NOT NULL DEFAULT '{}',-- per-channel -> external-step token (used at activation, not seed)
  branding_defaults  jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.provisioning_pipeline_templates (
  template_name text   NOT NULL,
  stage_key     text   NOT NULL,
  display_name  text   NOT NULL,
  stage_type    text   NOT NULL,
  display_order int    NOT NULL,
  auto_advance  boolean NOT NULL DEFAULT false,
  CONSTRAINT provisioning_pipeline_templates_uq UNIQUE (template_name, stage_key)
);

-- standard_sales template (verbatim from the canonical default shared by prod tenants)
INSERT INTO public.provisioning_pipeline_templates (template_name, stage_key, display_name, stage_type, display_order, auto_advance) VALUES
  ('standard_sales', 'lead',                  'New Inquiry',    'lead',        1, false),
  ('standard_sales', 'active_qualified',      'Qualified',      'active',      2, false),
  ('standard_sales', 'active_demo_scheduled', 'Demo Scheduled', 'active',      3, false),
  ('standard_sales', 'active_pricing_sent',   'Pricing Sent',   'active',      4, false),
  ('standard_sales', 'active_negotiating',    'Negotiating',    'active',      5, false),
  ('standard_sales', 'closed_won',            'Won',            'closed_won',  6, false),
  ('standard_sales', 'closed_lost',           'Lost',           'closed_lost', 7, false)
ON CONFLICT (template_name, stage_key) DO UPDATE
  SET display_name = EXCLUDED.display_name, stage_type = EXCLUDED.stage_type,
      display_order = EXCLUDED.display_order, auto_advance = EXCLUDED.auto_advance;

-- Per-tier spec rows (D1/D2/D3 locked). set_incomplete_when uniform across tiers.
INSERT INTO public.tenant_provisioning_specs (entity_tier, channels, default_plan, pipeline_template, set_incomplete_when) VALUES
  ('tenant',       '{sms,email,whatsapp,rcs,mms,voice}', 'trial', 'standard_sales',
     '{"sms":"telnyx_number","mms":"telnyx_number","voice":"telnyx_number","whatsapp":"whatsapp","email":"email_domain","rcs":"rcs_agent"}'),
  ('csp',          '{sms,email,whatsapp,rcs,mms,voice}', NULL,    'standard_sales',
     '{"sms":"telnyx_number","mms":"telnyx_number","voice":"telnyx_number","whatsapp":"whatsapp","email":"email_domain","rcs":"rcs_agent"}'),
  ('agent',        '{sms,email,whatsapp,rcs,mms,voice}', NULL,    'standard_sales',
     '{"sms":"telnyx_number","mms":"telnyx_number","voice":"telnyx_number","whatsapp":"whatsapp","email":"email_domain","rcs":"rcs_agent"}'),
  ('master_agent', '{sms,email,whatsapp,rcs,mms,voice}', NULL,    NULL,
     '{"sms":"telnyx_number","mms":"telnyx_number","voice":"telnyx_number","whatsapp":"whatsapp","email":"email_domain","rcs":"rcs_agent"}')
ON CONFLICT (entity_tier) DO UPDATE
  SET channels = EXCLUDED.channels, default_plan = EXCLUDED.default_plan,
      pipeline_template = EXCLUDED.pipeline_template, set_incomplete_when = EXCLUDED.set_incomplete_when;
