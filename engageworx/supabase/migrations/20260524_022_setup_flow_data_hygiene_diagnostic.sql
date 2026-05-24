-- Migration: Setup flow data hygiene diagnostic
-- Reports data quality issues for manual review. Does NOT auto-fix.
-- Run this and inspect the results before deciding on cleanup actions.
--
-- Three diagnostic queries:
-- 1. Enabled channel_configs with no corresponding phone_numbers row
-- 2. phone_numbers rows with no enabled channel_configs (orphaned numbers)
-- 3. phone_numbers rows not in E.164 format

-- Diagnostic 1: Enabled channel_configs (sms/voice) with no phone_numbers row
-- These tenants cannot receive inbound messages even though their channel is "enabled"
DO $$
DECLARE
  r record;
  count_found int := 0;
BEGIN
  RAISE NOTICE '=== DIAGNOSTIC 1: Enabled channel_configs without phone_numbers row ===';
  FOR r IN
    SELECT cc.tenant_id, t.name AS tenant_name, cc.channel, cc.enabled
    FROM channel_configs cc
    LEFT JOIN tenants t ON t.id = cc.tenant_id
    WHERE cc.channel IN ('sms', 'voice')
      AND cc.enabled = true
      AND NOT EXISTS (
        SELECT 1 FROM phone_numbers pn
        WHERE pn.tenant_id = cc.tenant_id
          AND pn.status = 'active'
      )
    ORDER BY t.name
  LOOP
    RAISE NOTICE 'tenant=% (%) channel=% enabled=%',
      r.tenant_id, r.tenant_name, r.channel, r.enabled;
    count_found := count_found + 1;
  END LOOP;
  RAISE NOTICE 'Total: % enabled channel_configs without phone_numbers', count_found;
END $$;

-- Diagnostic 2: Active phone_numbers with no enabled channel_configs
-- These numbers are registered but have no channel config to drive them
DO $$
DECLARE
  r record;
  count_found int := 0;
BEGIN
  RAISE NOTICE '=== DIAGNOSTIC 2: Active phone_numbers without enabled channel_configs ===';
  FOR r IN
    SELECT pn.id, pn.tenant_id, t.name AS tenant_name, pn.number, pn.status
    FROM phone_numbers pn
    LEFT JOIN tenants t ON t.id = pn.tenant_id
    WHERE pn.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM channel_configs cc
        WHERE cc.tenant_id = pn.tenant_id
          AND cc.channel IN ('sms', 'voice')
          AND cc.enabled = true
      )
    ORDER BY t.name
  LOOP
    RAISE NOTICE 'phone_number_id=% tenant=% (%) number=% status=%',
      r.id, r.tenant_id, r.tenant_name, r.number, r.status;
    count_found := count_found + 1;
  END LOOP;
  RAISE NOTICE 'Total: % active phone_numbers without channel_configs', count_found;
END $$;

-- Diagnostic 3: phone_numbers not in E.164 format
DO $$
DECLARE
  r record;
  count_found int := 0;
BEGIN
  RAISE NOTICE '=== DIAGNOSTIC 3: phone_numbers not in E.164 format ===';
  FOR r IN
    SELECT pn.id, pn.tenant_id, t.name AS tenant_name, pn.number, pn.status
    FROM phone_numbers pn
    LEFT JOIN tenants t ON t.id = pn.tenant_id
    WHERE pn.number IS NOT NULL
      AND pn.number !~ '^\+\d{8,15}$'
    ORDER BY t.name
  LOOP
    RAISE NOTICE 'phone_number_id=% tenant=% (%) number=% status=%',
      r.id, r.tenant_id, r.tenant_name, r.number, r.status;
    count_found := count_found + 1;
  END LOOP;
  RAISE NOTICE 'Total: % phone_numbers not in E.164 format', count_found;
END $$;
