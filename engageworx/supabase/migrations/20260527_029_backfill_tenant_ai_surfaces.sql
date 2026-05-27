-- Migration: Backfill tenant_ai_surfaces from existing chatbot_configs.surface values
-- Idempotent: uses ON CONFLICT DO NOTHING for surface inserts,
-- and only updates surface_id where it's currently NULL.
--
-- Known surface values (from codebase):
--   wedding_concierge → key: concierge, label: Wedding Concierge
--   wedding_enquiry   → key: enquiry,   label: Wedding Enquiry
--   wedding_supplier  → key: supplier,  label: Wedding Supplier
--
-- Any other surface values found will be mapped generically:
--   key: the surface value as-is (lowercased, underscores kept)
--   label: title-cased with underscores replaced by spaces

-- Step 1: Insert known wedding surfaces with friendly labels
INSERT INTO tenant_ai_surfaces (tenant_id, key, label, display_order)
SELECT DISTINCT
  cc.tenant_id,
  CASE cc.surface
    WHEN 'wedding_concierge' THEN 'concierge'
    WHEN 'wedding_enquiry'   THEN 'enquiry'
    WHEN 'wedding_supplier'  THEN 'supplier'
    ELSE lower(cc.surface)
  END,
  CASE cc.surface
    WHEN 'wedding_concierge' THEN 'Wedding Concierge'
    WHEN 'wedding_enquiry'   THEN 'Wedding Enquiry'
    WHEN 'wedding_supplier'  THEN 'Wedding Supplier'
    ELSE initcap(replace(cc.surface, '_', ' '))
  END,
  CASE cc.surface
    WHEN 'wedding_concierge' THEN 1
    WHEN 'wedding_enquiry'   THEN 2
    WHEN 'wedding_supplier'  THEN 3
    ELSE 10
  END
FROM chatbot_configs cc
WHERE cc.surface IS NOT NULL
  AND cc.surface != ''
ON CONFLICT (tenant_id, key) DO NOTHING;

-- Step 2: Populate chatbot_configs.surface_id from the newly created surfaces
UPDATE chatbot_configs cc
SET surface_id = s.id
FROM tenant_ai_surfaces s
WHERE cc.tenant_id = s.tenant_id
  AND cc.surface_id IS NULL
  AND (
    (cc.surface = 'wedding_concierge' AND s.key = 'concierge')
    OR (cc.surface = 'wedding_enquiry' AND s.key = 'enquiry')
    OR (cc.surface = 'wedding_supplier' AND s.key = 'supplier')
    OR (cc.surface = lower(s.key))
  );
