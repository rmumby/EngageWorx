-- 073: Redesign provision_tenant_and_bind — CONTRACT + AUTH ONLY (no channel/plan/pipeline seeding;
-- that's the next step). Reviewable in isolation.
--
-- ⚠️ NOT YET APPLIED TO PROD — ONE decision still gates apply:
--   (1) AUTH vs CALLER CONTEXT [OPEN]: all current callers (invite-tenant, stripe-webhook,
--       provision-eval, create-tenant) invoke via the SERVICE-ROLE key, so auth.uid() is NULL.
--       As written (strict), the caller-scope check RAISES for them — applying breaks all
--       provisioning until the endpoints invoke with the user's JWT, OR we add a service-role/
--       null-uid bypass (one line, marked below). Pick one before apply.
--   (2) TIER-RANK [RESOLVED]: rank super_admin=0..tenant=4; raise only when child would OUTRANK its
--       parent (child_rank < parent_rank, e.g. CSP under tenant). Equal rank allowed (reseller/agent
--       chains: csp-under-csp, master_agent-under-master_agent). Plus an absolute guard: never
--       provision a super_admin (no second root), regardless of parent.
--
-- Changes: + p_parent_entity_id, + p_idempotency_key; keep p_parent_tenant_id (072 trigger mirrors);
-- ignore p_entity_tier (072 trigger derives entity_tier from customer_type); generalized idempotency
-- table folds in stripe_events; caller-scope auth + tier-rank guard at top; slug self-heal, member
-- bind, RETURNS uuid preserved.

-- ── Generalized idempotency table (folds in stripe_events) ──────────────────
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key        text PRIMARY KEY,
  scope      text NOT NULL DEFAULT 'provision',
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.idempotency_keys (key, scope)
  SELECT event_id, 'stripe_event' FROM public.stripe_events
  ON CONFLICT (key) DO NOTHING;
DROP TABLE IF EXISTS public.stripe_events;

-- Drop the old 10-arg signature so the new 12-arg one doesn't create an ambiguous overload.
DROP FUNCTION IF EXISTS public.provision_tenant_and_bind(uuid, text, text, text, text, text, uuid, uuid, boolean, text);

CREATE OR REPLACE FUNCTION public.provision_tenant_and_bind(
  p_user_id           uuid,
  p_name              text,
  p_slug              text,
  p_customer_type     text    DEFAULT 'direct',
  p_entity_tier       text    DEFAULT 'tenant',   -- accepted for back-compat, IGNORED (072 trigger derives)
  p_status            text    DEFAULT 'trial',
  p_parent_tenant_id  uuid    DEFAULT NULL,        -- accepted; 072 trigger mirrors from parent_entity_id
  p_referred_by       uuid    DEFAULT NULL,
  p_is_sandbox        boolean DEFAULT false,
  p_event_id          text    DEFAULT NULL,        -- legacy idempotency token (folded into idempotency_keys)
  p_parent_entity_id  uuid    DEFAULT NULL,        -- NEW: authoritative parent pointer
  p_idempotency_key   text    DEFAULT NULL         -- NEW: generalized idempotency token
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id   uuid;
  v_slug        text := p_slug;
  v_attempt     int  := 0;
  v_constraint  text;
  v_actor       uuid := auth.uid();
  v_parent      uuid := COALESCE(p_parent_entity_id, p_parent_tenant_id);
  v_idem        text := COALESCE(p_idempotency_key, p_event_id);
  v_child_tier  text;
  v_parent_tier text;
  v_cur         uuid;
  v_authorized  boolean := false;
  v_depth       int := 0;
  v_rank        jsonb := '{"super_admin":0,"master_agent":1,"agent":2,"csp":3,"tenant":4}'::jsonb;
BEGIN
  -- Derived child tier (same map as the 072 invariant trigger). p_entity_tier is ignored.
  v_child_tier := CASE p_customer_type
    WHEN 'internal'     THEN 'super_admin'
    WHEN 'master_agent' THEN 'master_agent'
    WHEN 'agent'        THEN 'agent'
    WHEN 'csp_partner'  THEN 'csp'
    WHEN 'direct'       THEN 'tenant'
    ELSE 'tenant' END;

  -- ── Caller-scope auth ─────────────────────────────────────────────────────
  -- auth.uid() must be an SP member (bypass) OR an admin of the parent / an ancestor
  -- (recursive walk up parent_entity_id). NOTE: service-role callers have auth.uid() = NULL and
  -- will RAISE here. For a service-role/null-uid bypass instead, prepend:  IF v_actor IS NOT NULL THEN
  IF NOT is_sp_admin(v_actor) THEN
    v_cur := v_parent;
    WHILE v_cur IS NOT NULL AND v_depth < 20 LOOP
      IF is_tenant_admin(v_actor, v_cur) THEN v_authorized := true; EXIT; END IF;
      SELECT parent_entity_id INTO v_cur FROM public.tenants WHERE id = v_cur;
      v_depth := v_depth + 1;
    END LOOP;
    IF NOT v_authorized THEN
      RAISE EXCEPTION 'provision_tenant_and_bind: caller % not authorized to provision under parent %', v_actor, v_parent
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Absolute guard: never provision a second root, regardless of parent.
  IF v_child_tier = 'super_admin' THEN
    RAISE EXCEPTION 'provision_tenant_and_bind: cannot provision a super_admin tenant (no second root)'
      USING ERRCODE = '23514';
  END IF;

  -- ── Tier-rank (super_admin=0 .. tenant=4): raise only if the child would OUTRANK its parent ──
  -- (child_rank < parent_rank, e.g. a CSP under a tenant). Equal rank is allowed (reseller/agent chains).
  IF v_parent IS NOT NULL THEN
    SELECT entity_tier INTO v_parent_tier FROM public.tenants WHERE id = v_parent;
    IF v_parent_tier IS NULL THEN
      RAISE EXCEPTION 'provision_tenant_and_bind: parent % not found', v_parent USING ERRCODE = '23503';
    END IF;
    IF COALESCE((v_rank->>v_child_tier)::int, 99) < COALESCE((v_rank->>v_parent_tier)::int, 0) THEN
      RAISE EXCEPTION 'provision_tenant_and_bind: child tier % would outrank parent tier %', v_child_tier, v_parent_tier
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- ── Idempotency (generalized; dup aborts the whole transaction) ────────────
  IF v_idem IS NOT NULL THEN
    INSERT INTO public.idempotency_keys (key, scope) VALUES (v_idem, 'provision');
  END IF;

  -- ── Tenant insert with slug self-heal. entity_tier + parent_tenant_id are set by the 072 trigger ──
  LOOP
    BEGIN
      INSERT INTO public.tenants
        (name, slug, customer_type, status, parent_entity_id, referred_by, is_sandbox)
      VALUES
        (p_name, v_slug, p_customer_type, p_status, v_parent, p_referred_by, p_is_sandbox)
      RETURNING id INTO v_tenant_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint <> 'tenants_slug_key' THEN RAISE; END IF;
      v_attempt := v_attempt + 1;
      IF v_attempt > 5 THEN
        RAISE EXCEPTION 'provision_tenant_and_bind: slug "%" unresolved after % retries', p_slug, v_attempt;
      END IF;
      v_slug := p_slug || '-' || substr(md5(random()::text), 1, 6);
    END;
  END LOOP;

  UPDATE public.user_profiles
     SET tenant_id = v_tenant_id::text, tenant_type = p_customer_type
   WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'provision_tenant_and_bind: user_profile % not found', p_user_id;
  END IF;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
  VALUES (v_tenant_id, p_user_id, 'admin', 'active');

  RETURN v_tenant_id;
END;
$function$;
