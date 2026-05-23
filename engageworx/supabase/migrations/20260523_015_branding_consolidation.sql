-- Migration: Branding consolidation
-- Adds powered_by_visible and custom_css to tenants table.
-- Replaces update_tenant_branding RPC with an extended version that covers
-- all branding fields and enforces cascade permission rules server-side.

-- Step 1: Add new columns to tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS powered_by_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS custom_css text;

-- Step 2: Backfill from tenant_branding if any rows exist there
UPDATE tenants t
SET
  powered_by_visible = COALESCE((tb.branding->>'poweredByVisible')::boolean, true),
  custom_css         = NULLIF(tb.branding->>'customCss', '')
FROM tenant_branding tb
WHERE tb.tenant_id = t.id
  AND tb.branding IS NOT NULL;

-- Step 3: Drop old RPC and create extended version with cascade permission checks
DROP FUNCTION IF EXISTS public.update_tenant_branding(uuid, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.update_tenant_branding(
  p_tenant_id         uuid,
  p_brand_name        text     DEFAULT NULL,
  p_brand_primary     text     DEFAULT NULL,
  p_brand_secondary   text     DEFAULT NULL,
  p_brand_logo_url    text     DEFAULT NULL,
  p_brand_favicon_url text     DEFAULT NULL,
  p_portal_name       text     DEFAULT NULL,
  p_website_url       text     DEFAULT NULL,
  p_custom_domain     text     DEFAULT NULL,
  p_powered_by_visible boolean DEFAULT NULL,
  p_custom_css        text     DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id       uuid;
  v_caller_role     text;
  v_caller_tenants  uuid[];
  v_target          record;
  v_is_sp_admin     boolean := false;
  v_caller_tenant   record;
  v_allowed         boolean := false;
BEGIN
  -- Identify caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if caller is platform superadmin
  SELECT role INTO v_caller_role
    FROM user_profiles
   WHERE id = v_caller_id;

  IF v_caller_role IN ('superadmin', 'super_admin', 'sp_admin') THEN
    v_is_sp_admin := true;
    v_allowed := true;
  END IF;

  -- Load target tenant
  SELECT id, parent_tenant_id, parent_entity_id, entity_tier
    INTO v_target
    FROM tenants
   WHERE id = p_tenant_id;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  -- If not SP admin, check cascade permissions
  IF NOT v_allowed THEN
    -- Get caller's tenant memberships
    SELECT array_agg(tenant_id) INTO v_caller_tenants
      FROM tenant_members
     WHERE user_id = v_caller_id
       AND status = 'active'
       AND role IN ('admin', 'superadmin');

    IF v_caller_tenants IS NULL THEN
      RAISE EXCEPTION 'No admin membership found';
    END IF;

    -- Own entity: caller is admin on the target tenant
    IF p_tenant_id = ANY(v_caller_tenants) THEN
      v_allowed := true;
    END IF;

    -- CSP/Agent/MasterAgent editing a direct child
    IF NOT v_allowed THEN
      -- Check if target's parent is one of caller's tenants
      IF v_target.parent_tenant_id = ANY(v_caller_tenants)
         OR v_target.parent_entity_id = ANY(v_caller_tenants) THEN

        -- For agents/master_agents, also require MSP + LOA
        SELECT entity_tier, msp_enabled, letter_of_agency
          INTO v_caller_tenant
          FROM tenants
         WHERE id = ANY(v_caller_tenants)
           AND (id = v_target.parent_tenant_id OR id = v_target.parent_entity_id)
         LIMIT 1;

        IF v_caller_tenant.entity_tier = 'csp' THEN
          v_allowed := true;
        ELSIF v_caller_tenant.entity_tier IN ('agent', 'master_agent') THEN
          IF v_caller_tenant.msp_enabled AND v_caller_tenant.letter_of_agency THEN
            v_allowed := true;
          ELSE
            RAISE EXCEPTION 'Letter of Agency required for branding edits';
          END IF;
        END IF;
      END IF;
    END IF;

    IF NOT v_allowed THEN
      RAISE EXCEPTION 'Insufficient permissions to edit branding for this tenant';
    END IF;
  END IF;

  -- custom_domain is SP-admin only
  IF p_custom_domain IS NOT NULL AND NOT v_is_sp_admin THEN
    p_custom_domain := NULL; -- silently ignore for non-SP
  END IF;

  -- Perform the update
  UPDATE tenants SET
    brand_name        = COALESCE(p_brand_name,        brand_name),
    brand_primary     = COALESCE(p_brand_primary,      brand_primary),
    brand_secondary   = COALESCE(p_brand_secondary,    brand_secondary),
    brand_logo_url    = COALESCE(p_brand_logo_url,     brand_logo_url),
    brand_favicon_url = COALESCE(p_brand_favicon_url,  brand_favicon_url),
    portal_name       = COALESCE(p_portal_name,        portal_name),
    website_url       = COALESCE(p_website_url,        website_url),
    custom_domain     = CASE WHEN v_is_sp_admin THEN COALESCE(p_custom_domain, custom_domain) ELSE custom_domain END,
    powered_by_visible = COALESCE(p_powered_by_visible, powered_by_visible),
    custom_css        = COALESCE(p_custom_css,         custom_css),
    updated_at        = now()
  WHERE id = p_tenant_id;
END;
$$;

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION public.update_tenant_branding(uuid, text, text, text, text, text, text, text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tenant_branding(uuid, text, text, text, text, text, text, text, text, boolean, text) TO authenticated;

-- Also provide a clear-branding function for the "Clear & Inherit" feature
CREATE OR REPLACE FUNCTION public.clear_tenant_branding(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id   uuid;
  v_caller_role text;
  v_allowed     boolean := false;
  v_caller_tenants uuid[];
  v_target      record;
  v_caller_tenant record;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_caller_role FROM user_profiles WHERE id = v_caller_id;
  IF v_caller_role IN ('superadmin', 'super_admin', 'sp_admin') THEN
    v_allowed := true;
  END IF;

  SELECT id, parent_tenant_id, parent_entity_id, entity_tier
    INTO v_target FROM tenants WHERE id = p_tenant_id;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF NOT v_allowed THEN
    SELECT array_agg(tenant_id) INTO v_caller_tenants
      FROM tenant_members WHERE user_id = v_caller_id AND status = 'active' AND role IN ('admin', 'superadmin');
    IF v_caller_tenants IS NULL THEN RAISE EXCEPTION 'No admin membership found'; END IF;

    IF p_tenant_id = ANY(v_caller_tenants) THEN v_allowed := true; END IF;

    IF NOT v_allowed THEN
      IF v_target.parent_tenant_id = ANY(v_caller_tenants) OR v_target.parent_entity_id = ANY(v_caller_tenants) THEN
        SELECT entity_tier, msp_enabled, letter_of_agency INTO v_caller_tenant
          FROM tenants WHERE id = ANY(v_caller_tenants)
            AND (id = v_target.parent_tenant_id OR id = v_target.parent_entity_id) LIMIT 1;
        IF v_caller_tenant.entity_tier = 'csp' THEN v_allowed := true;
        ELSIF v_caller_tenant.entity_tier IN ('agent', 'master_agent') THEN
          IF v_caller_tenant.msp_enabled AND v_caller_tenant.letter_of_agency THEN v_allowed := true;
          ELSE RAISE EXCEPTION 'Letter of Agency required'; END IF;
        END IF;
      END IF;
    END IF;

    IF NOT v_allowed THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  END IF;

  UPDATE tenants SET
    brand_name = NULL, brand_primary = NULL, brand_secondary = NULL,
    brand_logo_url = NULL, brand_favicon_url = NULL, portal_name = NULL,
    updated_at = now()
  WHERE id = p_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_tenant_branding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_tenant_branding(uuid) TO authenticated;
