-- 056: blocklist RPCs + per-contact block flag.
--
-- PARITY ONLY. Already applied to the live DB (via MCP, tested); this file is repo/DB parity
-- and re-applies as a no-op (ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE / idempotent GRANTs).
--
-- IMPORTANT: tenants.blocked_domains and tenants.blocked_keywords are JSONB arrays (NOT text[]).
-- All RPCs treat them as jsonb. add_blocked_domain refuses bare freemail domains (safety rail);
-- the Inbox "Block Sender" UI passes the exact address for freemail senders, the domain otherwise.

-- Per-contact outbound suppression (Inbox "Block" → contacts.is_blocked).
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz;

-- ── INBOUND blocklist RPCs (jsonb), all SECURITY DEFINER, tenant-scoped ──

CREATE OR REPLACE FUNCTION public.add_blocked_domain(p_tenant_id uuid, p_entry text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$;

CREATE OR REPLACE FUNCTION public.remove_blocked_domain(p_tenant_id uuid, p_entry text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$;

CREATE OR REPLACE FUNCTION public.add_blocked_keyword(p_tenant_id uuid, p_entry text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$;

CREATE OR REPLACE FUNCTION public.remove_blocked_keyword(p_tenant_id uuid, p_entry text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$;

-- ── OUTBOUND per-contact block RPC ──

CREATE OR REPLACE FUNCTION public.set_contact_blocked(p_tenant_id uuid, p_contact_id uuid, p_blocked boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.contacts
     SET is_blocked = p_blocked,
         blocked_at = CASE WHEN p_blocked THEN now() ELSE NULL END
   WHERE id = p_contact_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contact % not found for tenant %', p_contact_id, p_tenant_id; END IF;
  RETURN p_blocked;
END; $function$;

GRANT EXECUTE ON FUNCTION public.add_blocked_domain(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_blocked_domain(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_blocked_keyword(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_blocked_keyword(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_contact_blocked(uuid, uuid, boolean) TO authenticated, service_role;
