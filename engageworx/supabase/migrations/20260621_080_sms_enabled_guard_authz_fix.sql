-- 080: corrective to 079 — fix the sms_enabled authorization model against live data.
-- 079 treated the wizard as the SOLE SMS authority. But (verified live) SP and Conecta have wizard
-- sessions yet are authorized by OTHER paths, so 079 would wrongly govern them:
--   SP (EngageWorx): tcr_status='unregistered', 2 wizard sessions, authority = an APPROVED tcr_campaigns
--                    row. A blind disable on one session rejected would kill platform SMS.
--   Conecta:         tcr_status='active' (CSP/BYOC), in_progress session, 0 approved → 079 recompute
--                    would derive false and disable it.
--   Delamere:        no session (exempt) — already safe via the no-session early-return.
--
-- Fixes:
--  1. Disable trigger no longer blind-sets false — it routes through recompute_sms_enabled (which has
--     the alt-auth guards), keeping the rejected/suspended + IS DISTINCT condition.
--  2. recompute_sms_enabled early-RETURNs (does NOT touch sms_enabled) for non-wizard-authorized tenants:
--       - tcr_status='active' (CSP/BYOC), OR
--       - an approved tcr_campaigns row (SP/legacy; tcr_campaigns.status ∈ {approved,pending}).
--     Only genuinely wizard-sourced tenants get the (approved session AND sms connected) derivation.
-- Net: recompute/trigger never disable SP / Conecta / Delamere; a US wizard tenant losing approval still
--      goes false.
-- (SP's 2 approved wizard sessions are MOCK/stale test data — flagged for separate cleanup; the alt-auth
--  guard is required regardless, for the Conecta/CSP class.)

CREATE OR REPLACE FUNCTION public.recompute_sms_enabled(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tcr_status  text;
  v_alt_campaign boolean;
  v_has_session boolean;
  v_approved    boolean;
  v_connected   boolean;
BEGIN
  -- Alternate SMS authorization (governed by a NON-wizard path) — never touch sms_enabled here.
  SELECT tcr_status INTO v_tcr_status FROM tenants WHERE id = p_tenant_id;
  IF v_tcr_status = 'active' THEN RETURN; END IF;                  -- CSP/BYOC self-authorized (e.g. Conecta)
  SELECT EXISTS (SELECT 1 FROM tcr_campaigns WHERE tenant_id = p_tenant_id AND status = 'approved')
    INTO v_alt_campaign;
  IF v_alt_campaign THEN RETURN; END IF;                          -- approved via tcr_campaigns (e.g. SP / legacy)

  -- Wizard-sourced only: no session => not wizard-authorized, leave untouched (e.g. Delamere, exempt).
  SELECT EXISTS (SELECT 1 FROM tcr_wizard_sessions WHERE tenant_id = p_tenant_id) INTO v_has_session;
  IF NOT v_has_session THEN RETURN; END IF;

  v_approved  := EXISTS (SELECT 1 FROM tcr_wizard_sessions WHERE tenant_id = p_tenant_id AND status = 'approved');
  v_connected := EXISTS (SELECT 1 FROM channel_configs    WHERE tenant_id = p_tenant_id AND channel = 'sms' AND status = 'connected');
  UPDATE public.tenants SET sms_enabled = (v_approved AND v_connected) WHERE id = p_tenant_id;
END;
$function$;

-- Disable trigger: route through recompute (alt-auth aware) instead of a blind UPDATE false.
CREATE OR REPLACE FUNCTION public.tcr_wizard_sms_disable_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('rejected','suspended') AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.recompute_sms_enabled(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$function$;
