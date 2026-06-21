-- 076: extend provision_tenant_and_bind with declarative seeding (D1–D5).
--   + idempotency_keys.tenant_id (RPC backfills; orchestrator catches 23505 -> returns prior tenant).
--   Seeding block runs AFTER member-bind, BEFORE RETURN — same transaction, so any seed failure rolls
--   back the whole tenant (and the idempotency row -> clean retry). Spec-row-missing => seeding skipped
--   (additive; the 4 existing callers + current behavior unaffected).
-- Preserves the 073 contract verbatim (auth bypass / tier-rank / super_admin guard / slug self-heal /
-- member bind / RETURNS uuid); only the seeding block + idempotency tenant_id link are added.

ALTER TABLE public.idempotency_keys ADD COLUMN IF NOT EXISTS tenant_id uuid;

CREATE OR REPLACE FUNCTION public.provision_tenant_and_bind(
  p_user_id           uuid,
  p_name              text,
  p_slug              text,
  p_customer_type     text    DEFAULT 'direct',
  p_entity_tier       text    DEFAULT 'tenant',
  p_status            text    DEFAULT 'trial',
  p_parent_tenant_id  uuid    DEFAULT NULL,
  p_referred_by       uuid    DEFAULT NULL,
  p_is_sandbox        boolean DEFAULT false,
  p_event_id          text    DEFAULT NULL,
  p_parent_entity_id  uuid    DEFAULT NULL,
  p_idempotency_key   text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id     uuid;
  v_slug          text := p_slug;
  v_attempt       int  := 0;
  v_constraint    text;
  v_actor         uuid := auth.uid();
  v_parent        uuid := COALESCE(p_parent_entity_id, p_parent_tenant_id);
  v_idem          text := COALESCE(p_idempotency_key, p_event_id);
  v_child_tier    text;
  v_parent_tier   text;
  v_cur           uuid;
  v_authorized    boolean := false;
  v_depth         int := 0;
  v_rank          jsonb := '{"super_admin":0,"master_agent":1,"agent":2,"csp":3,"tenant":4}'::jsonb;
  v_spec          public.tenant_provisioning_specs%ROWTYPE;
  v_slugbase      text;
  v_eslug_attempt int := 0;
BEGIN
  v_child_tier := CASE p_customer_type
    WHEN 'internal'     THEN 'super_admin'
    WHEN 'master_agent' THEN 'master_agent'
    WHEN 'agent'        THEN 'agent'
    WHEN 'csp_partner'  THEN 'csp'
    WHEN 'direct'       THEN 'tenant'
    ELSE 'tenant' END;

  -- Caller-scope auth: service-role/null-uid bypasses; authenticated users scoped.
  IF v_actor IS NOT NULL AND NOT is_sp_admin(v_actor) THEN
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

  IF v_child_tier = 'super_admin' THEN
    RAISE EXCEPTION 'provision_tenant_and_bind: cannot provision a super_admin tenant (no second root)'
      USING ERRCODE = '23514';
  END IF;

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

  -- Idempotency early guard (fail-fast on replay; aborts the whole transaction).
  IF v_idem IS NOT NULL THEN
    INSERT INTO public.idempotency_keys (key, scope) VALUES (v_idem, 'provision');
  END IF;

  -- Tenant insert with slug self-heal. entity_tier + parent_tenant_id set by the 072 trigger.
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

  -- ── Declarative seeding (spec-driven; additive — missing spec row = skip) ──────────────────
  SELECT * INTO v_spec FROM public.tenant_provisioning_specs WHERE entity_tier = v_child_tier;
  IF FOUND THEN
    -- D1 plan (NULL for resellers — leave whatever the column default was, only set when spec'd)
    IF v_spec.default_plan IS NOT NULL THEN
      UPDATE public.tenants SET plan = v_spec.default_plan WHERE id = v_tenant_id;
    ELSE
      UPDATE public.tenants SET plan = NULL WHERE id = v_tenant_id;
    END IF;

    -- D3 channels: clear channels_enabled + create inert shells for every spec channel
    UPDATE public.tenants SET channels_enabled = '{}'::text[] WHERE id = v_tenant_id;
    INSERT INTO public.channel_configs (tenant_id, channel, enabled, status, config_encrypted)
      SELECT v_tenant_id, ch, false, 'disconnected', '{}'::jsonb FROM unnest(v_spec.channels) AS ch
      ON CONFLICT (tenant_id, channel) DO NOTHING;

    -- D2 pipeline (NULL template for master_agent — no sales funnel)
    IF v_spec.pipeline_template IS NOT NULL THEN
      INSERT INTO public.pipeline_stages (tenant_id, stage_key, display_name, stage_type, display_order, auto_advance)
        SELECT v_tenant_id, t.stage_key, t.display_name, t.stage_type, t.display_order, t.auto_advance
        FROM public.provisioning_pipeline_templates t
        WHERE t.template_name = v_spec.pipeline_template
        ON CONFLICT (tenant_id, stage_key) DO NOTHING;
    END IF;

    -- Identity/ingest (set only when NULL → idempotent). inbound_email_slug has a UNIQUE partial
    -- index → collision-loop like the slug self-heal above.
    IF (SELECT inbound_email_slug IS NULL FROM public.tenants WHERE id = v_tenant_id) THEN
      v_slugbase := trim(both '-' from lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g')));
      IF v_slugbase = '' THEN v_slugbase := 'tenant'; END IF;
      LOOP
        BEGIN
          UPDATE public.tenants
             SET inbound_email_slug = v_slugbase || '-' || substr(md5(random()::text), 1, 6)
           WHERE id = v_tenant_id;
          EXIT;
        EXCEPTION WHEN unique_violation THEN
          v_eslug_attempt := v_eslug_attempt + 1;
          IF v_eslug_attempt > 5 THEN
            RAISE EXCEPTION 'provision_tenant_and_bind: inbound_email_slug for "%" unresolved after % retries', p_name, v_eslug_attempt;
          END IF;
        END;
      END LOOP;
    END IF;

    UPDATE public.tenants
       SET ingest_token = COALESCE(ingest_token, encode(extensions.gen_random_bytes(24), 'hex')),  -- pgcrypto lives in the extensions schema (search_path is public)
           allowed_origins = COALESCE(allowed_origins, '{}'::text[]),
           provisioning_incomplete = false   -- D3/consequence: nothing pre-enabled => nothing pending at seed
     WHERE id = v_tenant_id;
  END IF;

  -- Link the idempotency key to the created tenant (orchestrator returns it on 23505 replay).
  IF v_idem IS NOT NULL THEN
    UPDATE public.idempotency_keys SET tenant_id = v_tenant_id WHERE key = v_idem;
  END IF;

  RETURN v_tenant_id;
END;
$function$;
