-- Captured verbatim from the live migration ledger (supabase_migrations.schema_migrations, version 20260513191226).
-- Applied via MCP/SQL-editor and never committed as a file; this back-fills the repo so it is complete.
-- SQL is the originally-applied statement, unmodified (not rewritten for idempotency).
-- Capture-only: not re-applied here; canonical migration mechanism still undecided.


-- ============================================================
-- Module Toggle Infrastructure
-- Stores per-tenant module enable/disable preferences.
-- Uses existing sp_settings table with key = 'enabled_modules'.
-- Value is jsonb: { "module_id": true/false, ... }
-- Missing keys = use module's defaultEnabled from code registry.
-- ============================================================

-- RPC 1: Read tenant's module toggle state (returns {} if not set)
CREATE OR REPLACE FUNCTION public.get_tenant_enabled_modules(p_tenant_id UUID)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT value FROM public.sp_settings 
     WHERE tenant_id = p_tenant_id AND key = 'enabled_modules' 
     LIMIT 1),
    '{}'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_enabled_modules(UUID) TO authenticated;


-- RPC 2: Set a single module toggle for a tenant (admin-only).
-- Permission rules:
--   - SuperAdmin can update any tenant
--   - Tenant admin can update their own tenant
CREATE OR REPLACE FUNCTION public.set_tenant_module_enabled(
  p_tenant_id UUID,
  p_module_id TEXT,
  p_enabled BOOLEAN
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_is_tenant_admin BOOLEAN;
  v_current jsonb;
  v_updated jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Permission check: superadmin OR admin of this tenant
  SELECT (role = 'superadmin') INTO v_is_super
  FROM public.user_profiles WHERE id = v_user_id;

  SELECT EXISTS(
    SELECT 1 FROM public.tenant_members
    WHERE user_id = v_user_id AND tenant_id = p_tenant_id AND role IN ('admin', 'superadmin')
  ) INTO v_is_tenant_admin;

  IF NOT (COALESCE(v_is_super, false) OR COALESCE(v_is_tenant_admin, false)) THEN
    RAISE EXCEPTION 'Only tenant admins or superadmins can modify module settings';
  END IF;

  -- Read current state
  SELECT value INTO v_current
  FROM public.sp_settings
  WHERE tenant_id = p_tenant_id AND key = 'enabled_modules' LIMIT 1;

  v_current := COALESCE(v_current, '{}'::jsonb);
  v_updated := v_current || jsonb_build_object(p_module_id, p_enabled);

  -- Upsert
  INSERT INTO public.sp_settings (tenant_id, key, value)
  VALUES (p_tenant_id, 'enabled_modules', v_updated)
  ON CONFLICT (tenant_id, key) 
  DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_module_enabled(UUID, TEXT, BOOLEAN) TO authenticated;


-- RPC 3: Bulk set all modules at once (used by Settings → Modules UI save button)
CREATE OR REPLACE FUNCTION public.set_tenant_modules_bulk(
  p_tenant_id UUID,
  p_modules jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_is_tenant_admin BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT (role = 'superadmin') INTO v_is_super
  FROM public.user_profiles WHERE id = v_user_id;

  SELECT EXISTS(
    SELECT 1 FROM public.tenant_members
    WHERE user_id = v_user_id AND tenant_id = p_tenant_id AND role IN ('admin', 'superadmin')
  ) INTO v_is_tenant_admin;

  IF NOT (COALESCE(v_is_super, false) OR COALESCE(v_is_tenant_admin, false)) THEN
    RAISE EXCEPTION 'Only tenant admins or superadmins can modify module settings';
  END IF;

  INSERT INTO public.sp_settings (tenant_id, key, value)
  VALUES (p_tenant_id, 'enabled_modules', p_modules)
  ON CONFLICT (tenant_id, key)
  DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  RETURN p_modules;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_modules_bulk(UUID, jsonb) TO authenticated;
