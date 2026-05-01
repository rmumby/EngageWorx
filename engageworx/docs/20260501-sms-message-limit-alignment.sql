-- 2026-05-01: Align SMS message_limit with enforced values
-- cron-usage-alerts.js enforces: starter=1000, growth=5000, pro=20000
-- platform_config and tenants previously stored: 5000, 25000, 50000
-- contact_limit intentionally NOT changed (display/alert only, not enforced)
--
-- Affected tenants (4 total, all trial or low-usage):
--   Delamere Manor (starter 5000→1000)
--   Dylan J Aebi Consulting (starter 5000→1000)
--   P2P Labs (growth 25000→5000)
--   Telennovatiq (growth 25000→5000)
--
-- 15 tenants with custom message_limit=10000 are NOT touched.

-- Part A: Fix platform_config.plans message_limit
UPDATE platform_config
SET plans = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'slug' = 'starter' THEN jsonb_set(elem, '{message_limit}', '1000')
      WHEN elem->>'slug' = 'growth'  THEN jsonb_set(elem, '{message_limit}', '5000')
      WHEN elem->>'slug' = 'pro'     THEN jsonb_set(elem, '{message_limit}', '20000')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(plans) AS elem
),
updated_at = now()
WHERE (scope = 'platform' OR tenant_id IS NULL)
  AND plans IS NOT NULL
  AND plans != '[]'::jsonb;

-- Part B: Backfill tenants.message_limit ONLY where old high values exist
UPDATE tenants SET message_limit = 1000
WHERE plan = 'starter' AND message_limit = 5000;

UPDATE tenants SET message_limit = 5000
WHERE plan = 'growth' AND message_limit = 25000;

UPDATE tenants SET message_limit = 20000
WHERE plan = 'pro' AND message_limit = 50000;
