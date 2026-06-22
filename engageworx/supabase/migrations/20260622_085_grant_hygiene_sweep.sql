-- 085_grant_hygiene_sweep.sql
-- Least-privilege sweep on SECDEF RPC EXECUTE + tenants table grants.
-- Verified pre-apply against live: trigger-binding (pg_trigger) and RLS-predicate
-- usage (pg_policies) before stripping any EXECUTE.
--   * GROUP A funcs each have exactly 1 trigger binding and are never RPC-called -> all EXECUTE revoked.
--   * GROUP B funcs are not referenced in any RLS policy (is_tenant_admin/is_csp_admin/get_csp_tenants/
--     get_user_tenant_ids = 0 policy refs) and are not anon-context -> strip PUBLIC+anon.
--   * GROUP C funcs ARE RLS predicates ({public} policies) or the pre-auth branding path -> keep anon.
--   * is_sp_admin (64 {public} policies) is intentionally NOT in the sweep.
-- tenants: anon SELECT unused (pre-auth branding goes through get_tenant_branding_by_domain SECDEF RPC),
-- anon INSERT already RLS-blocked (with_check auth.uid() IS NOT NULL). authenticated DELETE is RETAINED:
-- it is RLS-gated to superadmin only and load-bearing for SP delete-tenant (App.jsx:1100).

DO $$
DECLARE r record;
BEGIN
  -- GROUP A: trigger functions -> postgres only (triggers fire as definer regardless)
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname = ANY (ARRAY[
             'channel_sms_recompute_trigger','coalesce_auth_token_columns','handle_new_user',
             'tcr_wizard_sms_disable_guard','unbind_profiles_on_tenant_delete'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', r.sig);
  END LOOP;

  -- GROUP B: authenticated/service-role RPCs -> strip PUBLIC + anon
  -- (includes the 3 confirmed forks: provision_tenant_and_bind, find_or_create_contact, upsert_sms_conversation)
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname = ANY (ARRAY[
             'activate_channel','add_blocked_domain','add_blocked_keyword','remove_blocked_domain',
             'remove_blocked_keyword','assign_conversation','assign_phone_number','clear_tenant_branding',
             'delete_pipeline_stage_if_empty','set_contact_blocked','set_tenant_module_enabled',
             'set_tenant_modules_bulk','update_tenant_branding','check_usage_status','increment_usage',
             'get_or_create_usage_period','recompute_sms_enabled','log_audit_event','log_debug',
             'save_user_theme_preference','get_csp_tenants','is_csp_admin','is_tenant_admin',
             'get_user_tenant_ids',
             'provision_tenant_and_bind','find_or_create_contact','upsert_sms_conversation'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;

  -- GROUP C+D: keep anon (RLS predicate / pre-auth branding), strip redundant PUBLIC only
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname = ANY (ARRAY[
             'is_tenant_member','is_wedding_user',
             'get_tenant_branding_by_domain','get_tenant_branding_by_id','get_tenant_enabled_modules'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
  END LOOP;
END $$;

-- tenants table: revoke latent/ungated grants. Keep authenticated SELECT/INSERT/UPDATE/DELETE
-- (authenticated DELETE stays granted -- RLS-gated to superadmin only, load-bearing for SP
-- delete-tenant at App.jsx:1100. Do NOT revoke it.)
REVOKE SELECT, INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.tenants FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.tenants FROM authenticated;
