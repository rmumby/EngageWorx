-- 072: Hierarchy-invariant trigger on tenants — enables the parent_entity_id read-retirement to
-- ship safely. A BEFORE INSERT OR UPDATE trigger enforces two spine invariants at the data layer so
-- NO write path (provision_tenant_and_bind RPC, the dual-writes, the SA direct insert, any future
-- writer) can orphan a tenant or drift its tier:
--   (1) mirror parent_entity_id <-> parent_tenant_id when one is set and the other is NULL;
--   (2) entity_tier := map(customer_type) — makes the RPC's free p_entity_tier param vestigial.
-- The proper RPC contract (explicit params, caller-scope auth) stays owned by the provisioning build.
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS before CREATE TRIGGER (re-runnable).

CREATE OR REPLACE FUNCTION enforce_tenant_hierarchy_invariants()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_entity_id IS NULL AND NEW.parent_tenant_id IS NOT NULL THEN
    NEW.parent_entity_id := NEW.parent_tenant_id;
  ELSIF NEW.parent_tenant_id IS NULL AND NEW.parent_entity_id IS NOT NULL THEN
    NEW.parent_tenant_id := NEW.parent_entity_id;
  END IF;
  NEW.entity_tier := CASE NEW.customer_type
    WHEN 'internal' THEN 'super_admin'
    WHEN 'master_agent' THEN 'master_agent'
    WHEN 'agent' THEN 'agent'
    WHEN 'csp_partner' THEN 'csp'
    WHEN 'direct' THEN 'tenant'
    ELSE NEW.entity_tier
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_hierarchy_invariants ON public.tenants;

CREATE TRIGGER trg_tenant_hierarchy_invariants
BEFORE INSERT OR UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_hierarchy_invariants();
