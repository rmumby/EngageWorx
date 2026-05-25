-- 20260525_029: Clean up vendor-branded welcome email defaults across all non-SP tenants
-- These leaked from historical signup flow before PR #29 fixed the code defaults.
-- Post-PR-29, new tenants get NULL for these fields (correct behavior).

-- Clean channel_configs.config_encrypted where welcome fields contain vendor branding
-- NOTE: This uses jsonb operators — config_encrypted is JSONB.

-- Remove welcome_email_from_name where it's "EngageWorx" or "Rob at EngageWorx"
UPDATE channel_configs
SET config_encrypted = config_encrypted - 'welcome_email_from_name'
WHERE tenant_id != 'c1bc59a8-5235-4921-9755-02514b574387'
  AND channel = 'email'
  AND (config_encrypted->>'welcome_email_from_name' ILIKE '%engageworx%'
       OR config_encrypted->>'welcome_email_from_name' ILIKE '%rob%');

-- Remove welcome_email_from where it's hello@engwx.com
UPDATE channel_configs
SET config_encrypted = config_encrypted - 'welcome_email_from'
WHERE tenant_id != 'c1bc59a8-5235-4921-9755-02514b574387'
  AND channel = 'email'
  AND config_encrypted->>'welcome_email_from' = 'hello@engwx.com';

-- Remove welcome_email_onboarding_link where it points to Rob's Calendly
UPDATE channel_configs
SET config_encrypted = config_encrypted - 'welcome_email_onboarding_link'
WHERE tenant_id != 'c1bc59a8-5235-4921-9755-02514b574387'
  AND channel = 'email'
  AND config_encrypted->>'welcome_email_onboarding_link' ILIKE '%calendly.com/rob%';

-- Remove welcome_email_ai_prompt where it mentions Rob Mumby or EngageWorx
UPDATE channel_configs
SET config_encrypted = config_encrypted - 'welcome_email_ai_prompt'
WHERE tenant_id != 'c1bc59a8-5235-4921-9755-02514b574387'
  AND channel = 'email'
  AND (config_encrypted->>'welcome_email_ai_prompt' ILIKE '%rob mumby%'
       OR config_encrypted->>'welcome_email_ai_prompt' ILIKE '%engageworx%');
