-- Captured verbatim from the live migration ledger (supabase_migrations.schema_migrations, version 20260511194225).
-- Applied via MCP/SQL-editor and never committed as a file; this back-fills the repo so it is complete.
-- SQL is the originally-applied statement, unmodified (not rewritten for idempotency).
-- Capture-only: not re-applied here; canonical migration mechanism still undecided.


-- Public function for hostname-based branding lookup.
-- Exposes ONLY the branding fields, never other tenant data.
-- SECURITY DEFINER bypasses RLS so the React app can resolve branding
-- before the user authenticates.

CREATE OR REPLACE FUNCTION public.get_tenant_branding_by_domain(p_hostname TEXT)
RETURNS TABLE (
  id UUID,
  brand_name TEXT,
  brand_primary TEXT,
  brand_secondary TEXT,
  brand_logo_url TEXT,
  brand_favicon_url TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    id,
    brand_name,
    brand_primary,
    brand_secondary,
    brand_logo_url,
    brand_favicon_url
  FROM public.tenants
  WHERE custom_domain = p_hostname
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_branding_by_domain(TEXT) TO anon, authenticated;
