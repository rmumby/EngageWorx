-- 2026-04-30: VIP and Priority flags on contacts + leads
-- Phase 1 of AI Action Board — tier assignment inputs

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS vip_marked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS priority_until TIMESTAMPTZ;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS is_priority BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contacts_vip
  ON contacts(tenant_id)
  WHERE is_vip = true;

CREATE INDEX IF NOT EXISTS idx_leads_priority
  ON leads(tenant_id)
  WHERE is_priority = true;
