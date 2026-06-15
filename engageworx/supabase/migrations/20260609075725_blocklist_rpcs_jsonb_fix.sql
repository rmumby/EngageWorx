-- Captured verbatim from the live migration ledger (supabase_migrations.schema_migrations, version 20260609075725).
-- Applied via MCP/SQL-editor and never committed as a file; this back-fills the repo so it is complete.
-- SQL is the originally-applied statement, unmodified (not rewritten for idempotency).
-- Capture-only: not re-applied here; canonical migration mechanism still undecided.

-- tenants.blocked_domains / blocked_keywords are JSONB arrays, not text[]. Rebuild RPCs for jsonb.
DROP FUNCTION IF EXISTS public.add_blocked_domain(uuid, text);
DROP FUNCTION IF EXISTS public.remove_blocked_domain(uuid, text);
DROP FUNCTION IF EXISTS public.add_blocked_keyword(uuid, text);
DROP FUNCTION IF EXISTS public.remove_blocked_keyword(uuid, text);

CREATE FUNCTION public.add_blocked_domain(p_tenant_id uuid, p_entry text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry text := lower(trim(p_entry));
  v_freemail text[] := ARRAY['gmail.com','googlemail.com','outlook.com','hotmail.com','live.com',
                             'msn.com','yahoo.com','ymail.com','icloud.com','me.com','mac.com',
                             'aol.com','proton.me','protonmail.com','gmx.com','zoho.com'];
  v_result jsonb;
BEGIN
  IF v_entry IS NULL OR v_entry = '' THEN RAISE EXCEPTION 'Blocked entry cannot be empty'; END IF;
  IF position('@' in v_entry) = 0 AND v_entry = ANY(v_freemail) THEN
    RAISE EXCEPTION 'Refusing to block entire freemail domain "%" — block the specific address instead', v_entry;
  END IF;
  UPDATE public.tenants
     SET blocked_domains = CASE
       WHEN coalesce(blocked_domains, '[]'::jsonb) @> to_jsonb(v_entry) THEN blocked_domains
       ELSE coalesce(blocked_domains, '[]'::jsonb) || to_jsonb(v_entry)
     END
   WHERE id = p_tenant_id
   RETURNING blocked_domains INTO v_result;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant % not found', p_tenant_id; END IF;
  RETURN v_result;
END; $$;

CREATE FUNCTION public.remove_blocked_domain(p_tenant_id uuid, p_entry text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry text := lower(trim(p_entry)); v_result jsonb;
BEGIN
  UPDATE public.tenants
     SET blocked_domains = (
       SELECT coalesce(jsonb_agg(e), '[]'::jsonb)
       FROM jsonb_array_elements_text(coalesce(blocked_domains, '[]'::jsonb)) e
       WHERE e <> v_entry
     )
   WHERE id = p_tenant_id
   RETURNING blocked_domains INTO v_result;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant % not found', p_tenant_id; END IF;
  RETURN v_result;
END; $$;

CREATE FUNCTION public.add_blocked_keyword(p_tenant_id uuid, p_entry text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry text := lower(trim(p_entry)); v_result jsonb;
BEGIN
  IF v_entry IS NULL OR v_entry = '' THEN RAISE EXCEPTION 'Blocked keyword cannot be empty'; END IF;
  UPDATE public.tenants
     SET blocked_keywords = CASE
       WHEN coalesce(blocked_keywords, '[]'::jsonb) @> to_jsonb(v_entry) THEN blocked_keywords
       ELSE coalesce(blocked_keywords, '[]'::jsonb) || to_jsonb(v_entry)
     END
   WHERE id = p_tenant_id
   RETURNING blocked_keywords INTO v_result;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant % not found', p_tenant_id; END IF;
  RETURN v_result;
END; $$;

CREATE FUNCTION public.remove_blocked_keyword(p_tenant_id uuid, p_entry text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry text := lower(trim(p_entry)); v_result jsonb;
BEGIN
  UPDATE public.tenants
     SET blocked_keywords = (
       SELECT coalesce(jsonb_agg(e), '[]'::jsonb)
       FROM jsonb_array_elements_text(coalesce(blocked_keywords, '[]'::jsonb)) e
       WHERE e <> v_entry
     )
   WHERE id = p_tenant_id
   RETURNING blocked_keywords INTO v_result;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant % not found', p_tenant_id; END IF;
  RETURN v_result;
END; $$;

GRANT EXECUTE ON FUNCTION public.add_blocked_domain(uuid, text)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_blocked_domain(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_blocked_keyword(uuid, text)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_blocked_keyword(uuid, text) TO authenticated, service_role;