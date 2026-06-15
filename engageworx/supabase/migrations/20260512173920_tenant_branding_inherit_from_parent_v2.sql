-- Captured verbatim from the live migration ledger (supabase_migrations.schema_migrations, version 20260512173920).
-- Applied via MCP/SQL-editor and never committed as a file; this back-fills the repo so it is complete.
-- SQL is the originally-applied statement, unmodified (not rewritten for idempotency).
-- Capture-only: not re-applied here; canonical migration mechanism still undecided.


DROP FUNCTION IF EXISTS public.get_tenant_branding_by_domain(TEXT);

CREATE OR REPLACE FUNCTION public.get_tenant_branding_by_domain(p_hostname TEXT)
RETURNS TABLE (
  id UUID,
  brand_name TEXT,
  brand_primary TEXT,
  brand_secondary TEXT,
  brand_logo_url TEXT,
  brand_favicon_url TEXT,
  chatbot_name TEXT,
  parent_tenant_id UUID
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH tenant_self AS (
    SELECT t.id, t.parent_tenant_id, t.brand_name, t.brand_primary,
           t.brand_secondary, t.brand_logo_url, t.brand_favicon_url,
           cc.bot_name AS chatbot_name
    FROM public.tenants t
    LEFT JOIN public.chatbot_configs cc ON cc.tenant_id = t.id
    WHERE t.custom_domain = p_hostname
    LIMIT 1
  ),
  tenant_parent AS (
    SELECT t.id, t.brand_name, t.brand_primary, t.brand_secondary,
           t.brand_logo_url, t.brand_favicon_url,
           cc.bot_name AS chatbot_name
    FROM public.tenants t
    LEFT JOIN public.chatbot_configs cc ON cc.tenant_id = t.id
    WHERE t.id = (SELECT parent_tenant_id FROM tenant_self)
    LIMIT 1
  )
  SELECT
    s.id,
    NULLIF(COALESCE(NULLIF(s.brand_name,''), NULLIF(p.brand_name,'')), '') AS brand_name,
    NULLIF(COALESCE(NULLIF(s.brand_primary,''), NULLIF(p.brand_primary,'')), '') AS brand_primary,
    NULLIF(COALESCE(NULLIF(s.brand_secondary,''), NULLIF(p.brand_secondary,'')), '') AS brand_secondary,
    NULLIF(COALESCE(NULLIF(s.brand_logo_url,''), NULLIF(p.brand_logo_url,'')), '') AS brand_logo_url,
    NULLIF(COALESCE(NULLIF(s.brand_favicon_url,''), NULLIF(p.brand_favicon_url,'')), '') AS brand_favicon_url,
    NULLIF(COALESCE(NULLIF(s.chatbot_name,''), NULLIF(p.chatbot_name,'')), '') AS chatbot_name,
    s.parent_tenant_id
  FROM tenant_self s
  LEFT JOIN tenant_parent p ON true;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_branding_by_domain(TEXT) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.get_tenant_branding_by_id(p_tenant_id UUID)
RETURNS TABLE (
  id UUID,
  brand_name TEXT,
  brand_primary TEXT,
  brand_secondary TEXT,
  brand_logo_url TEXT,
  brand_favicon_url TEXT,
  chatbot_name TEXT,
  parent_tenant_id UUID
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH tenant_self AS (
    SELECT t.id, t.parent_tenant_id, t.brand_name, t.brand_primary,
           t.brand_secondary, t.brand_logo_url, t.brand_favicon_url,
           cc.bot_name AS chatbot_name
    FROM public.tenants t
    LEFT JOIN public.chatbot_configs cc ON cc.tenant_id = t.id
    WHERE t.id = p_tenant_id
    LIMIT 1
  ),
  tenant_parent AS (
    SELECT t.id, t.brand_name, t.brand_primary, t.brand_secondary,
           t.brand_logo_url, t.brand_favicon_url,
           cc.bot_name AS chatbot_name
    FROM public.tenants t
    LEFT JOIN public.chatbot_configs cc ON cc.tenant_id = t.id
    WHERE t.id = (SELECT parent_tenant_id FROM tenant_self)
    LIMIT 1
  )
  SELECT
    s.id,
    NULLIF(COALESCE(NULLIF(s.brand_name,''), NULLIF(p.brand_name,'')), '') AS brand_name,
    NULLIF(COALESCE(NULLIF(s.brand_primary,''), NULLIF(p.brand_primary,'')), '') AS brand_primary,
    NULLIF(COALESCE(NULLIF(s.brand_secondary,''), NULLIF(p.brand_secondary,'')), '') AS brand_secondary,
    NULLIF(COALESCE(NULLIF(s.brand_logo_url,''), NULLIF(p.brand_logo_url,'')), '') AS brand_logo_url,
    NULLIF(COALESCE(NULLIF(s.brand_favicon_url,''), NULLIF(p.brand_favicon_url,'')), '') AS brand_favicon_url,
    NULLIF(COALESCE(NULLIF(s.chatbot_name,''), NULLIF(p.chatbot_name,'')), '') AS chatbot_name,
    s.parent_tenant_id
  FROM tenant_self s
  LEFT JOIN tenant_parent p ON true;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_branding_by_id(UUID) TO authenticated;
