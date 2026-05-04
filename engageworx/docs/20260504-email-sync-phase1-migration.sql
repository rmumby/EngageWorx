-- ═══════════════════════════════════════════════════════════════════
-- Email Sync Phase 1: per-tenant outbound + per-platform sender routing
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Normalize existing email_send_method values
UPDATE tenants SET email_send_method = 'resend' WHERE email_send_method = 'sendgrid';

DO $$
BEGIN
  ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_email_send_method_check;
  ALTER TABLE tenants ADD CONSTRAINT tenants_email_send_method_check
    CHECK (email_send_method IS NULL OR email_send_method IN ('gmail', 'resend', 'smtp'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- Tenant-to-customer email config
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS smtp_config_encrypted JSONB;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS resend_domain_verified BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS resend_domain TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_sync_status TEXT DEFAULT 'not_configured';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_sync_last_verified_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_tracking_domain TEXT;

DO $$
BEGIN
  ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_email_sync_status_check;
  ALTER TABLE tenants ADD CONSTRAINT tenants_email_sync_status_check
    CHECK (email_sync_status IS NULL OR email_sync_status IN
      ('not_configured', 'setup_in_progress', 'verified', 'broken'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- Platform-to-tenant email config (CSP white-label)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS platform_email_send_method TEXT DEFAULT 'resend';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS platform_email_from_address TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS platform_email_domain TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS platform_email_domain_verified BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS platform_smtp_config_encrypted JSONB;

DO $$
BEGIN
  ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_platform_email_send_method_check;
  ALTER TABLE tenants ADD CONSTRAINT tenants_platform_email_send_method_check
    CHECK (platform_email_send_method IS NULL OR platform_email_send_method IN ('resend', 'smtp'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- Inbound emails table (Phase 2 populates)
CREATE TABLE IF NOT EXISTS inbound_emails (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID,
  contact_id      UUID,
  from_address    TEXT NOT NULL,
  to_address      TEXT NOT NULL,
  subject         TEXT,
  body_text       TEXT,
  body_html       TEXT,
  headers         JSONB,
  raw_payload     JSONB,
  thread_id       TEXT,
  processed       BOOLEAN DEFAULT false,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbound_emails_tenant
  ON inbound_emails(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_thread
  ON inbound_emails(thread_id) WHERE thread_id IS NOT NULL;

ALTER TABLE inbound_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read own inbound emails" ON inbound_emails
  FOR SELECT USING (
    tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  );

-- Violation tracking
CREATE TABLE IF NOT EXISTS email_routing_violations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  violation_type  TEXT NOT NULL,
  to_address      TEXT,
  used_fallback   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_routing_violations_tenant
  ON email_routing_violations(tenant_id, created_at DESC);

-- Backfill email_send_method
UPDATE tenants SET email_send_method = 'gmail'
WHERE email_send_method IS NULL
  AND digest_email IS NOT NULL
  AND (digest_email ILIKE '%@gmail.com' OR digest_email ILIKE '%@googlemail.com');

UPDATE tenants SET email_send_method = 'resend'
WHERE email_send_method IS NULL;

-- Backfill EngageWorx platform email config
UPDATE tenants
SET platform_email_from_address = 'hello@engwx.com',
    platform_email_domain = 'engwx.com',
    platform_email_domain_verified = true,
    platform_email_send_method = 'resend',
    email_tracking_domain = 'engwx.com'
WHERE id = 'c1bc59a8-5235-4921-9755-02514b574387';
