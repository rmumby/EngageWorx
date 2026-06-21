-- 082: protect sensitive tenants columns from direct client (non-SP) writes.
-- Closes the hole where any tenant member could `supabase.from('tenants').update({sms_enabled:true})`
-- (or plan / customer_type / letter_of_agency / parent_entity_id / channels_enabled / usage counters ...)
-- directly client-side, defeating activate_channel's cost+TCR gate, the entitlement model, and the
-- parent_entity_id/entity_tier hierarchy spine. Root cause: tenants has a table-level UPDATE grant to
-- authenticated + anon, and the "Tenant members can update own tenant" policy (UPDATE, with_check NULL,
-- keyed on user_profiles.tenant_id) lets ANY member write ANY column of their own tenant row.
--
-- ALLOW-LIST model (fail-closed): a non-SP authenticated caller may only change the vetted self-editable
-- columns below; ANY other column differing OLD->NEW raises 42501. Bypasses are EXECUTION-ROLE based:
--   * service-role + every SECURITY DEFINER RPC (activate_channel, recompute_sms_enabled,
--     update_tenant_branding, provision_*, ...) run with a SWITCHED execution role (the function owner
--     / service_role), so current_user is NOT 'authenticated'/'anon' -> bypass.
--   * SP admins (is_sp_admin) doing DIRECT client writes (current_user='authenticated') -> bypass.
-- CRITICAL: do NOT gate on auth.uid() IS NULL. SECURITY DEFINER does NOT null auth.uid() (it reads
-- request.jwt.claims), so a uid-null bypass would RAISE inside activate_channel when a non-SP tenant admin
-- self-activates (it writes provisioning_incomplete + cascades sms_enabled, both BLOCKED) — breaking
-- self-service. The execution-role check is what distinguishes a definer RPC from a raw client write.
-- (Because definer RPCs bypass wholesale, update_tenant_branding can still set powered_by_visible /
-- custom_domain for resellers; the allow-list only governs DIRECT client UPDATEs.)
--
-- Fires BEFORE trg_tenant_hierarchy_invariants (082's trigger name sorts before "trg_tenant_h..."), so it
-- validates the caller's RAW submission and is never tripped by 072's derived parent-mirror / entity_tier
-- writes. Enforcement is per-row in the trigger (not via column GRANT) so SP keeps its table-level UPDATE;
-- a later optional hardening pass may migrate SP sensitive writes to an admin RPC + switch to a GRANT
-- whitelist. anon's UPDATE grant is revoked here (defense in depth; RLS already blocks anon).

CREATE OR REPLACE FUNCTION public.protect_tenant_columns()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (default) is REQUIRED: the current_user gate below must see the triggering
-- statement's execution role. SECURITY DEFINER would make current_user the function owner (postgres)
-- on every call -> the gate would always bypass and the guard would never fire. This function needs no
-- elevation (it only calls is_sp_admin, itself DEFINER, and auth.uid()).
SET search_path TO 'public'
AS $function$
DECLARE
  v_old     jsonb;
  v_new     jsonb;
  v_key     text;
  v_blocked text[] := '{}';
  -- Vetted self-editable columns. Everything NOT here is protected (entitlement, identity, hierarchy,
  -- provisioning, usage/billing counters, deliverability infra, KYC, security). Keep in sync with the
  -- legit non-SP write surfaces (branding RPC, OnboardingWizard, Settings, WelcomeEmailSettings, AUPModal,
  -- SetupChecklist, EmailTrackingInstructions, AutoDetectBrandBar, AgentPortal self-brand).
  v_allowed text[] := ARRAY[
    'brand_name','brand_primary','brand_secondary','brand_logo_url','brand_logo_url_dark',
    'brand_favicon_url','custom_css','portal_name',
    'website_url','calendly_url','primary_contact_email',
    'welcome_email_enabled','welcome_email_from','welcome_email_from_name','welcome_email_subject',
    'welcome_email_ai_prompt','welcome_email_onboarding_link','welcome_email_steps','welcome_email_calendly',
    'digest_email','digest_send_time','digest_timezone',
    'language','vip_followup_days','email_tracking_slug','email_tracking_remind','setup_checklist_dismissed',
    'onboarding_step','onboarding_completed',
    'aup_accepted','aup_accepted_at',
    'updated_at'
  ];
BEGIN
  -- System / definer paths: service-role and every SECURITY DEFINER RPC run with a switched execution
  -- role (function owner or service_role), never authenticated/anon. Only direct client writes do.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  -- SP admins manage the full tenant record from the platform console (direct client writes).
  IF public.is_sp_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  -- Non-SP authenticated caller: only allow-listed columns may change.
  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);
  FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
    IF NOT (v_key = ANY(v_allowed)) AND (v_new -> v_key) IS DISTINCT FROM (v_old -> v_key) THEN
      v_blocked := array_append(v_blocked, v_key);
    END IF;
  END LOOP;
  IF array_length(v_blocked, 1) > 0 THEN
    RAISE EXCEPTION 'Not permitted to modify protected tenant column(s): %', array_to_string(v_blocked, ', ')
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_tenant_columns ON public.tenants;
CREATE TRIGGER trg_protect_tenant_columns
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.protect_tenant_columns();

-- anon never legitimately updates a tenant row.
REVOKE UPDATE ON public.tenants FROM anon;
