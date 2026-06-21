-- 079: sms_enabled bidirectional guard, hooked on the REAL registration-outcome axis
-- (tcr_wizard_sessions.status — tenants.tcr_status only ever holds 'unregistered'/'active', so the
-- originally-specced trigger on it would never fire).
--
-- DISABLE (data-layer trigger): when a wizard session's status transitions to 'rejected'/'suspended',
--   force tenants.sms_enabled = false — "a killed campaign can't keep sending," catches every write path.
-- ENABLE (scoped helper, called from the runner code on BOTH events — TCR-approved and number-ready,
--   either order): sms_enabled = (an approved wizard session exists) AND (channel_configs sms 'connected').
--   SCOPED to tenants that HAVE a wizard session — so SP (approved via tcr_campaigns) and Delamere
--   (UK-exempt), which have no wizard session, are NEVER touched. NOT a global derivation.
--
-- ⚠️ This closes the INITIAL-outcome case only. The post-approval kill of an already-ACTIVE campaign is
--    NOT yet caught — nothing re-polls/receives webhooks for approved wizard sessions. The real
--    exposure-closer (Telnyx campaign-status webhook or active-session re-poll writing status=
--    'rejected'/'suspended') is TRACKED separately; this trigger is the catch once such a write lands.

-- 'suspended' is a kill status the disable guard (and the tracked post-approval monitor) must be able
-- to write, but the status CHECK didn't permit it. Widen it (additive — adds 'suspended' only).
-- NOTE (separate, not fixed here): tcr-wizard.js also writes 'brand_failed'/'campaign_failed'/
-- 'submit_failed_post_payment', none of which this CHECK permits — pre-existing code↔CHECK drift; tracked.
ALTER TABLE public.tcr_wizard_sessions DROP CONSTRAINT IF EXISTS tcr_wizard_sessions_status_check;
ALTER TABLE public.tcr_wizard_sessions ADD CONSTRAINT tcr_wizard_sessions_status_check
  CHECK (status = ANY (ARRAY['in_progress','submitted','approved','rejected','abandoned','suspended']));

-- ── ENABLE helper (shared; invoked by the runner on both events) ──
CREATE OR REPLACE FUNCTION public.recompute_sms_enabled(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_session boolean;
  v_approved    boolean;
  v_connected   boolean;
BEGIN
  -- Carve-out: only act for tenants that went through the wizard. No session => leave sms_enabled
  -- untouched (SP / Delamere / any non-wizard tenant).
  SELECT EXISTS (SELECT 1 FROM tcr_wizard_sessions WHERE tenant_id = p_tenant_id) INTO v_has_session;
  IF NOT v_has_session THEN RETURN; END IF;

  v_approved  := EXISTS (SELECT 1 FROM tcr_wizard_sessions WHERE tenant_id = p_tenant_id AND status = 'approved');
  v_connected := EXISTS (SELECT 1 FROM channel_configs    WHERE tenant_id = p_tenant_id AND channel = 'sms' AND status = 'connected');

  UPDATE public.tenants SET sms_enabled = (v_approved AND v_connected) WHERE id = p_tenant_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.recompute_sms_enabled(uuid) TO authenticated, service_role;

-- ── DISABLE trigger ──
CREATE OR REPLACE FUNCTION public.tcr_wizard_sms_disable_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('rejected','suspended') AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.tenants SET sms_enabled = false WHERE id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_tcr_wizard_sms_disable ON public.tcr_wizard_sessions;
CREATE TRIGGER trg_tcr_wizard_sms_disable
  AFTER UPDATE OF status ON public.tcr_wizard_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tcr_wizard_sms_disable_guard();
