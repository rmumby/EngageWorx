-- 087_campaign_status_mapping.sql
-- Replace placeholder status mapping in record_campaign_status with the real
-- Telnyx 10DLC vocabulary. Poll reads campaign.status enum; webhook sends DORMANT.
-- Body identical to 086 except the CASE block. v1 kill-only semantics unchanged.

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

  -- Telnyx 10DLC campaign.status enum (poll path) + DORMANT (suspension webhook path).
  -- Kills only; healthy/in-progress states fall through to NULL -> no-op.
  v_canonical := CASE upper(coalesce(p_provider_status,''))
    WHEN 'TCR_FAILED'              THEN 'rejected'
    WHEN 'TELNYX_FAILED'           THEN 'rejected'
    WHEN 'MNO_REJECTED'            THEN 'rejected'
    WHEN 'MNO_PROVISIONING_FAILED' THEN 'rejected'
    WHEN 'TCR_SUSPENDED'           THEN 'suspended'
    WHEN 'TCR_EXPIRED'             THEN 'suspended'
    WHEN 'DORMANT'                 THEN 'suspended'  -- dormancy webhook payload
    ELSE NULL  -- TCR_PENDING/TCR_ACCEPTED/TELNYX_ACCEPTED/MNO_PENDING/MNO_ACCEPTED/MNO_PROVISIONED
  END;

  IF v_canonical IS NULL OR v_canonical NOT IN ('rejected','suspended') THEN
    RETURN 'noop:non_kill_status';
  END IF;

  IF v_session.status IS NOT DISTINCT FROM v_canonical THEN
    RETURN 'noop:unchanged';
  END IF;

  UPDATE tcr_wizard_sessions
  SET status            = v_canonical,
      campaign_status   = p_provider_status,
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
