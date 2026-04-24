-- Channel field alignment migration
-- Run in Supabase SQL Editor

-- 1. SMS: Fix phone_country label-as-value (emoji strings → country codes)
UPDATE public.channel_configs
SET config_encrypted = jsonb_set(
  config_encrypted::jsonb,
  '{phone_country}',
  CASE
    WHEN config_encrypted->>'phone_country' LIKE '%+1)%' AND config_encrypted->>'phone_country' NOT LIKE '%Canada%' THEN '"+1"'::jsonb
    WHEN config_encrypted->>'phone_country' LIKE '%Canada%' THEN '"+1-CA"'::jsonb
    WHEN config_encrypted->>'phone_country' LIKE '%+44%' THEN '"+44"'::jsonb
    WHEN config_encrypted->>'phone_country' LIKE '%+61%' THEN '"+61"'::jsonb
    WHEN config_encrypted->>'phone_country' LIKE '%+49%' THEN '"+49"'::jsonb
    WHEN config_encrypted->>'phone_country' LIKE '%+33%' THEN '"+33"'::jsonb
    WHEN config_encrypted->>'phone_country' LIKE '%+34%' THEN '"+34"'::jsonb
    WHEN config_encrypted->>'phone_country' LIKE '%+353%' THEN '"+353"'::jsonb
    WHEN config_encrypted->>'phone_country' LIKE '%+48%' THEN '"+48"'::jsonb
    ELSE config_encrypted->'phone_country'
  END
)
WHERE channel = 'sms'
  AND config_encrypted->>'phone_country' LIKE '%(%';

-- 2. WhatsApp: Copy business_account_id → waba_id for existing rows
UPDATE public.channel_configs
SET config_encrypted = config_encrypted::jsonb || jsonb_build_object('waba_id', config_encrypted->>'business_account_id')
WHERE channel = 'whatsapp'
  AND config_encrypted->>'business_account_id' IS NOT NULL
  AND (config_encrypted->>'waba_id' IS NULL OR config_encrypted->>'waba_id' = '');
