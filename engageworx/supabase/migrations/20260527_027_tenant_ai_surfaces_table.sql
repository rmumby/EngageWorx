-- Migration: Create tenant_ai_surfaces table
-- Foundation for tenant-defined AI agent surfaces. Replaces the
-- hardcoded chatbot_configs.surface text column with a proper
-- normalized table that tenants can customize.
--
-- Existing code continues to read chatbot_configs.surface as-is.
-- This migration is purely additive — no behavior change.

CREATE TABLE IF NOT EXISTS tenant_ai_surfaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE INDEX IF NOT EXISTS tenant_ai_surfaces_tenant_id_idx
  ON tenant_ai_surfaces(tenant_id);

CREATE INDEX IF NOT EXISTS tenant_ai_surfaces_active_idx
  ON tenant_ai_surfaces(tenant_id, is_active, display_order)
  WHERE is_active = true;

-- RLS: tenant members can read their own tenant's surfaces; SP admin can read all
ALTER TABLE tenant_ai_surfaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_ai_surfaces_read ON tenant_ai_surfaces
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM tenant_members tm
      WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('superadmin', 'super_admin', 'sp_admin')
    )
  );

-- Write: service-role only (writes happen via RPC, matching the
-- save_channel_config / assign_conversation pattern)
