-- 086_campaign_status_monitor_writepath.sql
-- Prereq + shared write-path for the post-approval campaign-status monitor.
-- Disable chain verified live: AFTER UPDATE OF status on tcr_wizard_sessions
--   -> recompute_sms_enabled -> sms_enabled = (approved_session AND connected_sms).
-- Missing piece added here: a service-role write-path that flips a session to
-- rejected/suspended when the provider kills a campaign post-approval.

-- 1) Correlation key: unique partial index. Lookup for poll/webhook + 1 campaign<->1 session.
CREATE UNIQUE INDEX IF NOT EXISTS tcr_wizard_sessions_supplier_campaign_id_key
  ON public.tcr_wizard_sessions (supplier_campaign_id)
  WHERE supplier_campaign_id IS NOT NULL;

-- 2) Shared write-path RPC. Poll (now) and webhook (later) both call this.
--    v1 scope: KILLS ONLY. Maps provider status -> {rejected,suspended}; never enables SMS.
--    Approval reconciliation stays owned by the wizard flow (deferred).
CREATE OR REPLACE FUNCTION public.record_campaign_status(
  p_supplier_campaign_id text,
  p_provider_status      text,
  p_raw                  jsonb DEFAULT '{}'::jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session   tcr_wizard_sessions%ROWTYPE;
  v_canonical text;
BEGIN
  IF p_supplier_campaign_id IS NULL THEN
    RETURN 'noop:null_campaign_id';
  END IF;

  SELECT * INTO v_session
  FROM tcr_wizard_sessions
  WHERE supplier_campaign_id = p_supplier_campaign_id;

  IF NOT FOUND THEN
    RETURN 'noop:no_session';
  END IF;

  -- ===== TODO: PIN TO TELNYX 10DLC CAMPAIGN-STATUS VOCABULARY =====
  -- Confirm exact provider strings from Telnyx docs / a live payload before prod.
  -- Strings below are PLACEHOLDERS, unverified.
  v_canonical := CASE lower(coalesce(p_provider_status,''))
    WHEN 'suspended'    THEN 'suspended'
    WHEN 'rejected'     THEN 'rejected'
    WHEN 'expired'      THEN 'suspended'   -- confirm Telnyx semantics
    WHEN 'deactivated'  THEN 'suspended'   -- confirm
    ELSE NULL
  END;
  -- ================================================================

  -- v1: kills only. The monitor must never enable SMS.
  IF v_canonical IS NULL OR v_canonical NOT IN ('rejected','suspended') THEN
    RETURN 'noop:non_kill_status';
  END IF;

  -- Idempotent: only write (and fire the disable trigger) on a real transition.
  IF v_session.status IS NOT DISTINCT FROM v_canonical THEN
    RETURN 'noop:unchanged';
  END IF;

  UPDATE tcr_wizard_sessions
  SET status            = v_canonical,          -- fires AFTER UPDATE OF status -> recompute
      campaign_status   = p_provider_status,     -- raw provider mirror
      rejected_at       = now(),
      rejection_history = coalesce(rejection_history, '[]'::jsonb)
                          || jsonb_build_object(
                               'at', now(),
                               'provider_status', p_provider_status,
                               'canonical', v_canonical,
                               'raw', p_raw
                             )
  WHERE id = v_session.id;

  RETURN 'updated:' || v_canonical;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_campaign_status(text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.record_campaign_status(text,text,jsonb) TO service_role;
