-- Captured verbatim from the live migration ledger (supabase_migrations.schema_migrations, version 20260511205107).
-- Applied via MCP/SQL-editor and never committed as a file; this back-fills the repo so it is complete.
-- SQL is the originally-applied statement, unmodified (not rewritten for idempotency).
-- Capture-only: not re-applied here; canonical migration mechanism still undecided.


-- Self-serve tenant branding updates.
-- Caller must be a tenant admin (via tenant_members.role) OR a platform superadmin.
-- SECURITY DEFINER so it works regardless of underlying RLS policies.

CREATE OR REPLACE FUNCTION public.update_tenant_branding(
  p_tenant_id UUID,
  p_brand_name TEXT DEFAULT NULL,
  p_brand_primary TEXT DEFAULT NULL,
  p_brand_secondary TEXT DEFAULT NULL,
  p_brand_logo_url TEXT DEFAULT NULL,
  p_brand_favicon_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  brand_name TEXT,
  brand_primary TEXT,
  brand_secondary TEXT,
  brand_logo_url TEXT,
  brand_favicon_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_authorized BOOLEAN := FALSE;
BEGIN
  -- Check 1: is caller a tenant admin via tenant_members?
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE user_id = auth.uid()
      AND tenant_id = p_tenant_id
      AND role IN ('admin', 'superadmin')
  ) INTO v_is_authorized;

  -- Check 2: is caller a platform superadmin via user_profiles?
  IF NOT v_is_authorized THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND role = 'superadmin'
    ) INTO v_is_authorized;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Not authorized to update branding for this tenant';
  END IF;

  -- Update only brand fields, leaving everything else untouched.
  -- NULL parameter means "keep existing value".
  UPDATE public.tenants
  SET
    brand_name       = COALESCE(p_brand_name, brand_name),
    brand_primary    = COALESCE(p_brand_primary, brand_primary),
    brand_secondary  = COALESCE(p_brand_secondary, brand_secondary),
    brand_logo_url   = COALESCE(p_brand_logo_url, brand_logo_url),
    brand_favicon_url= COALESCE(p_brand_favicon_url, brand_favicon_url)
  WHERE tenants.id = p_tenant_id;

  RETURN QUERY
  SELECT t.id, t.brand_name, t.brand_primary, t.brand_secondary, t.brand_logo_url, t.brand_favicon_url
  FROM public.tenants t
  WHERE t.id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_tenant_branding(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
