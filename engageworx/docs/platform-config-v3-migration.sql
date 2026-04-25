-- Platform Config v3 — multi-row support for CSP-scoped overrides
-- Run in Supabase SQL Editor

-- Add scope and tenant_id columns
ALTER TABLE platform_config
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'platform',
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Make all existing columns nullable (CSP rows only override what they need)
-- platform_name and portal_url are already NOT NULL — allow null for tenant-scoped rows
ALTER TABLE platform_config ALTER COLUMN platform_name DROP NOT NULL;
ALTER TABLE platform_config ALTER COLUMN support_email DROP NOT NULL;
ALTER TABLE platform_config ALTER COLUMN portal_url DROP NOT NULL;
ALTER TABLE platform_config ALTER COLUMN welcome_email_subject_template DROP NOT NULL;
ALTER TABLE platform_config ALTER COLUMN welcome_email_html_template DROP NOT NULL;
ALTER TABLE platform_config ALTER COLUMN default_escalation_rules DROP NOT NULL;
ALTER TABLE platform_config ALTER COLUMN plans DROP NOT NULL;

-- Index for tenant-scoped lookups
CREATE INDEX IF NOT EXISTS idx_platform_config_tenant ON platform_config(tenant_id) WHERE tenant_id IS NOT NULL;

-- Update existing row to scope='platform'
UPDATE platform_config SET scope = 'platform' WHERE tenant_id IS NULL;
