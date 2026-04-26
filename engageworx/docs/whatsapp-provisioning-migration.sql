-- WhatsApp Provisioning status tracking
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.whatsapp_provisioning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  meta_error_code TEXT,
  meta_error_message TEXT,
  details JSONB,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_wa_prov_tenant ON whatsapp_provisioning(tenant_id);

ALTER TABLE whatsapp_provisioning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON whatsapp_provisioning FOR ALL USING (true) WITH CHECK (true);

-- Add provisioning stages config to platform_config
ALTER TABLE platform_config ADD COLUMN IF NOT EXISTS whatsapp_provisioning_stages JSONB;

UPDATE platform_config SET whatsapp_provisioning_stages = '[
  {"key":"meta_business_manager","label":"Meta Business Manager","description":"Create or connect your Meta Business account","help":"Go to business.facebook.com and create a Business Manager account if you don''t have one."},
  {"key":"business_verification","label":"Business Verification","description":"Verify your business identity with Meta","help":"Submit business documents in Meta Business Manager → Settings → Business Verification."},
  {"key":"waba_application","label":"WhatsApp Business Account","description":"Apply for a WhatsApp Business Account","help":"In Meta Business Manager, go to WhatsApp → Getting Started to create your WABA."},
  {"key":"phone_number_registration","label":"Phone Number Registration","description":"Register and verify your business phone number","help":"Add your business phone number in WhatsApp Manager and complete the verification code process."},
  {"key":"webhook_configured","label":"Webhook Connected","description":"Platform webhook connected to receive messages","help":"This step completes automatically when your credentials are verified."}
]'::jsonb
WHERE tenant_id IS NULL AND whatsapp_provisioning_stages IS NULL;
