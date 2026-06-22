-- 088_brand_status_writepath.sql
-- Brand-side status-sync write-path (forward-sync twin of campaign monitor 086/087).
-- Advances tcr_brands.status pending -> verified on authoritative TCR vetting result.
-- No downstream trigger: brand status is read by future self-serve gating, not by
-- recompute_sms_enabled. Inert until a consumer (poll/webhook) exists + TCR API access.
-- Correlation index tcr_brands_tcr_brand_id_key already present (unique partial).
-- The two statements below are idempotent (IF NOT EXISTS) — already live, included for
-- replay-completeness so a fresh apply reaches the same end state. Not re-applied as a new
-- migration version (live already has both objects + the function).

ALTER TABLE public.tcr_brands
  ADD COLUMN IF NOT EXISTS status_history jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS tcr_brands_tcr_brand_id_key
  ON public.tcr_brands (tcr_brand_id) WHERE (tcr_brand_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.record_brand_status(
  p_tcr_brand_id    text,
  p_provider_status text,
  p_trust_score     int   DEFAULT NULL,
  p_raw             jsonb DEFAULT '{}'::jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand     tcr_brands%ROWTYPE;
  v_canonical text;
BEGIN
  IF p_tcr_brand_id IS NULL THEN
    RETURN 'noop:null_brand_id';
  END IF;

  SELECT * INTO v_brand FROM tcr_brands WHERE tcr_brand_id = p_tcr_brand_id;
  IF NOT FOUND THEN
    RETURN 'noop:no_brand';
  END IF;

  -- ===== TODO: PIN TO TCR BRAND identityStatus VOCABULARY (needs CSP API access) =====
  -- status CHECK = {pending,verified,rejected,suspended}. There is NO 'failed'.
  -- Terminal-fail must map to 'rejected'; suspension to 'suspended' -- both DEFERRED until
  -- the TCR vocab is confirmed (UNVERIFIED is ambiguous: pre-vet vs terminal-fail).
  -- v1 maps only the unambiguous verify transition; everything else -> no-op (stays pending,
  -- never falsely verifies or rejects).
  v_canonical := CASE upper(coalesce(p_provider_status,''))
    WHEN 'VERIFIED'        THEN 'verified'
    WHEN 'VETTED_VERIFIED' THEN 'verified'
    ELSE NULL
  END;
  -- ====================================================================================

  IF v_canonical IS NULL THEN
    RETURN 'noop:non_terminal_status';
  END IF;

  IF v_brand.status IS NOT DISTINCT FROM v_canonical
     AND (p_trust_score IS NULL OR v_brand.trust_score IS NOT DISTINCT FROM p_trust_score) THEN
    RETURN 'noop:unchanged';
  END IF;

  UPDATE tcr_brands
  SET status        = v_canonical,
      trust_score   = COALESCE(p_trust_score, trust_score),
      vetting_date  = CASE WHEN v_canonical='verified' THEN now() ELSE vetting_date END,
      updated_at    = now(),
      status_history = coalesce(status_history,'[]'::jsonb)
                       || jsonb_build_object(
                            'at', now(),
                            'provider_status', p_provider_status,
                            'canonical', v_canonical,
                            'trust_score', p_trust_score,
                            'raw', p_raw
                          )
  WHERE id = v_brand.id;

  RETURN 'updated:' || v_canonical;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_brand_status(text,text,integer,jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.record_brand_status(text,text,integer,jsonb) TO service_role;
