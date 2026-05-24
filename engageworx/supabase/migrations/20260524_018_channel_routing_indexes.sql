-- Migration: Channel routing indexes + WhatsApp identifier columns
-- Supports the resolver rewrite: phone_numbers becomes the sole
-- routing lookup for voice/SMS, and whatsapp_phone_number_id gets
-- a top-level indexed column for Meta Cloud API webhook resolution.

-- 1. Unique index on active phone numbers for indexed routing lookup.
--    Guarantees one tenant per active number — prevents collision.
CREATE UNIQUE INDEX IF NOT EXISTS phone_numbers_number_active_uniq
  ON phone_numbers(number)
  WHERE status = 'active';

-- 2. Composite index for channel config lookups by tenant + channel.
CREATE INDEX IF NOT EXISTS channel_configs_tenant_channel_idx
  ON channel_configs(tenant_id, channel)
  WHERE enabled = true;

-- 3. Top-level column for WhatsApp phone_number_id (Meta's identifier).
--    Enables indexed lookup instead of full-table-scan + JSONB extraction.
ALTER TABLE channel_configs
  ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id text;

-- 4. Backfill from existing JSONB data where it exists.
UPDATE channel_configs
SET whatsapp_phone_number_id = config_encrypted->>'phone_number_id'
WHERE channel = 'whatsapp'
  AND config_encrypted->>'phone_number_id' IS NOT NULL
  AND config_encrypted->>'phone_number_id' != '';

-- 5. Partial unique index on whatsapp_phone_number_id for routing.
CREATE UNIQUE INDEX IF NOT EXISTS channel_configs_wa_phone_number_id_uniq
  ON channel_configs(whatsapp_phone_number_id)
  WHERE channel = 'whatsapp'
    AND enabled = true
    AND whatsapp_phone_number_id IS NOT NULL;

-- 6. Top-level column for WhatsApp WABA ID (useful for template management).
ALTER TABLE channel_configs
  ADD COLUMN IF NOT EXISTS whatsapp_waba_id text;

UPDATE channel_configs
SET whatsapp_waba_id = config_encrypted->>'waba_id'
WHERE channel = 'whatsapp'
  AND config_encrypted->>'waba_id' IS NOT NULL
  AND config_encrypted->>'waba_id' != '';
