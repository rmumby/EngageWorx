-- Capture of the live provisioning layer into version control.
--
-- Context: the atomic-provisioning work (live ledger versions 20260614182142,
-- 20260614190206, 20260614191051, 20260615090721) was applied directly to the
-- database via MCP and was never committed as migration files. The DDL existed
-- nowhere in the repo, so a fresh replay of the migrations would NOT recreate it,
-- even though the app and the provisioning guards test depend on it entirely.
--
-- This migration reconstructs those objects from the live catalog (final state,
-- captured 2026-06-15) so the repo can reproduce the running schema. Every
-- statement is idempotent: against the existing production DB it is a no-op;
-- against a fresh DB it builds the full layer.
--
-- It captures FINAL object state, not the per-step historical DDL — the
-- intermediate RPC bodies (pre-idempotency, pre-self-heal) were not recoverable
-- from the catalog. The original ledger rows are left untouched; full
-- ledger-scheme reconciliation (58 repo files vs the live ledger) is a separate pass.

-- ---------------------------------------------------------------------------
-- Idempotency ledger for webhook-driven provisioning (event de-duplication).
-- A duplicate event_id raises unique_violation (23505) inside the RPC and aborts
-- the whole transaction, preventing a second tenant from being created.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stripe_events (
  event_id   text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stripe_events_pkey PRIMARY KEY (event_id)
);

-- ---------------------------------------------------------------------------
-- tenants.provisioning_incomplete — set true when a post-RPC follow-up UPDATE
-- (plan, limits, branding, etc.) fails, so a half-configured tenant is queryable
-- via v_incomplete_provisioning instead of failing silently.
-- Must exist before v_incomplete_provisioning is created (the view references it).
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS provisioning_incomplete boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Atomic provision-and-bind RPC.
-- Tenant insert + user_profiles.tenant_id bind + tenant_members admin row in one
-- transaction; any failure rolls back all three (no orphan possible). Includes the
-- idempotency gate and slug self-heal. SECURITY DEFINER; execute is restricted to
-- service_role (revoked from PUBLIC) — the GRANT and definer flag are exactly the
-- attributes a migra-generated diff would have dropped.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_tenant_and_bind(
  p_user_id          uuid,
  p_name             text,
  p_slug             text,
  p_customer_type    text    DEFAULT 'direct'::text,
  p_entity_tier      text    DEFAULT 'tenant'::text,
  p_status           text    DEFAULT 'trial'::text,
  p_parent_tenant_id uuid    DEFAULT NULL::uuid,
  p_referred_by      uuid    DEFAULT NULL::uuid,
  p_is_sandbox       boolean DEFAULT false,
  p_event_id         text    DEFAULT NULL::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id  uuid;
  v_slug       text := p_slug;
  v_attempt    int  := 0;
  v_constraint text;
BEGIN
  -- Idempotency gate: duplicate event_id raises unique_violation (23505) and aborts the
  -- whole transaction. Propagates out (handled by caller). Inactive when p_event_id is null.
  IF p_event_id IS NOT NULL THEN
    INSERT INTO public.stripe_events (event_id) VALUES (p_event_id);
  END IF;

  -- Tenant insert with slug self-heal.
  LOOP
    BEGIN
      INSERT INTO public.tenants
        (name, slug, customer_type, entity_tier, status,
         parent_tenant_id, referred_by, is_sandbox)
      VALUES
        (p_name, v_slug, p_customer_type, p_entity_tier, p_status,
         p_parent_tenant_id, p_referred_by, p_is_sandbox)
      RETURNING id INTO v_tenant_id;
      EXIT;  -- success
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint <> 'tenants_slug_key' THEN
        RAISE;  -- not a slug clash — surface it untouched
      END IF;
      v_attempt := v_attempt + 1;
      IF v_attempt > 5 THEN
        RAISE EXCEPTION 'provision_tenant_and_bind: slug "%" unresolved after % retries', p_slug, v_attempt;
      END IF;
      v_slug := p_slug || '-' || substr(md5(random()::text), 1, 6);
    END;
  END LOOP;

  UPDATE public.user_profiles
     SET tenant_id   = v_tenant_id::text,
         tenant_type = p_customer_type
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'provision_tenant_and_bind: user_profile % not found', p_user_id;
  END IF;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
  VALUES (v_tenant_id, p_user_id, 'admin', 'active');

  RETURN v_tenant_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.provision_tenant_and_bind(
  uuid, text, text, text, text, text, uuid, uuid, boolean, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.provision_tenant_and_bind(
  uuid, text, text, text, text, text, uuid, uuid, boolean, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- Deletion-phantom guard: when a tenant is deleted, null out any user_profiles
-- still pointing at it (tenant_id is text; cast OLD.id to match).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unbind_profiles_on_tenant_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.user_profiles
     SET tenant_id = NULL
   WHERE tenant_id = OLD.id::text;
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE TRIGGER trg_unbind_profiles_on_tenant_delete
  AFTER DELETE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.unbind_profiles_on_tenant_delete();

-- ---------------------------------------------------------------------------
-- Monitoring views. Both should always read 0 rows in a healthy system.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_orphan_user_profiles AS
 SELECT up.id,
    up.email,
    up.tenant_id,
    up.created_at,
    round(EXTRACT(epoch FROM now() - up.created_at) / 60::numeric)::integer AS minutes_old,
        CASE
            WHEN up.tenant_id IS NULL THEN 'never_bound'::text
            ELSE 'phantom_tenant'::text
        END AS orphan_type
   FROM user_profiles up
     LEFT JOIN tenants t ON t.id::text = up.tenant_id
  WHERE up.tenant_id IS NULL OR t.id IS NULL;

CREATE OR REPLACE VIEW public.v_incomplete_provisioning AS
 SELECT id,
    name,
    slug,
    customer_type,
    status,
    is_sandbox,
    created_at
   FROM tenants
  WHERE provisioning_incomplete = true;
