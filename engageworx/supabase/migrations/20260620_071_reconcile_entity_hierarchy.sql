-- 071: Reconcile entity hierarchy (already applied to prod via MCP — committed file backfills the repo).
--
-- Makes parent_entity_id + entity_tier the authoritative hierarchy representation:
--   1. entity_tier ← derived from customer_type (guarded: only drifted rows).
--   2/3. backfill parent_entity_id for tenants that had it NULL (→ SP, → Petar).
-- All three are idempotent: re-running matches 0 rows once reconciled. Safe to re-run.
-- After this, parent_entity_id is a superset of the legacy parent_tenant_id (0 ptid-without-peid,
-- 0 mismatches) — code reads should key off parent_entity_id, not parent_tenant_id.

-- 1. entity_tier ← derived from customer_type (guarded: only touches drifted rows)
UPDATE tenants
SET entity_tier = CASE customer_type
  WHEN 'internal' THEN 'super_admin'
  WHEN 'master_agent' THEN 'master_agent'
  WHEN 'agent' THEN 'agent'
  WHEN 'csp_partner' THEN 'csp'
  WHEN 'direct' THEN 'tenant'
END
WHERE entity_tier IS DISTINCT FROM (CASE customer_type
  WHEN 'internal' THEN 'super_admin'
  WHEN 'master_agent' THEN 'master_agent'
  WHEN 'agent' THEN 'agent'
  WHEN 'csp_partner' THEN 'csp'
  WHEN 'direct' THEN 'tenant'
END);

-- 2. parent_entity_id → SP (Petar, ChannelPro, FD, MMD, Range, Niko, Dylan)
UPDATE tenants SET parent_entity_id = 'c1bc59a8-5235-4921-9755-02514b574387'
WHERE parent_entity_id IS NULL
  AND id IN (
    '20f31d13-19b7-400b-8b45-961c7f47341b',
    'abd51258-b71b-4286-9168-66b556b6ea54',
    '250fd9e2-093e-455c-b42f-62e108fa44f3',
    '885bf2a9-7724-4eeb-bd83-1fa3bae79004',
    'b7db58fa-7ab0-41c7-95ab-f3c675b3394f',
    '467a8861-c457-486e-a14c-ce73a6203385',
    'fa9700a1-e0be-444d-811c-8657f32e9881'
  );

-- 3. parent_entity_id → Petar (One Smile, Campus Dentist)
UPDATE tenants SET parent_entity_id = '20f31d13-19b7-400b-8b45-961c7f47341b'
WHERE parent_entity_id IS NULL
  AND id IN (
    '7cf7e945-4e79-4c2d-9b29-8f9e4fabe8f4',
    'af6515a7-c521-4092-9d57-a8d33ce9b1cb'
  );
