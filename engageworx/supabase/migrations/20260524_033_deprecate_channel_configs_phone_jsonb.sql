-- Migration: Deprecate channel_configs phone_number/phone_country JSONB fields
--
-- Context: phone_numbers table is now the authoritative source for
-- tenant→number routing (PR B, migration 018). The phone_number and
-- phone_country keys inside channel_configs.config_encrypted are no
-- longer read by any inbound or outbound routing code.
--
-- Strategy: MOVE (not delete) the deprecated keys to legacy_* keys
-- in the same JSONB blob. This preserves the original values for
-- forensic queries without any production code reading them.
--
-- The legacy_* keys will be dropped in a follow-up migration after
-- 30 days of stability (target: 2026-06-24).
--
-- To inspect preserved values:
--   SELECT tenant_id, config_encrypted->'legacy_phone_number',
--          config_encrypted->'legacy_phone_country'
--   FROM channel_configs
--   WHERE channel IN ('voice', 'sms')
--     AND config_encrypted ? 'legacy_phone_number';

UPDATE channel_configs
SET config_encrypted = (
  config_encrypted
    - 'phone_number'
    - 'phone_country'
  ) || jsonb_build_object(
    'legacy_phone_number', config_encrypted->'phone_number',
    'legacy_phone_country', config_encrypted->'phone_country',
    'legacy_migration_date', to_jsonb(now())
  )
WHERE channel IN ('voice', 'sms')
  AND (
    config_encrypted ? 'phone_number'
    OR config_encrypted ? 'phone_country'
  );
