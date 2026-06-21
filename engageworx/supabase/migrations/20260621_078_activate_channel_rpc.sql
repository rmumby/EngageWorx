-- 078: activate_channel RPC — self-service channel activation, state-transition core (§3 v1, slice 1).
-- The user-JWT endpoint (slice 2) calls this with the caller's JWT; the RPC authorizes (F1), cost-gates
-- (F2), is idempotent, transitions the channel shell to 'pending', and recomputes provisioning_incomplete.
-- The external step (number purchase / domain verify / WABA / TCR wizard) runs in the endpoint AFTER this
-- returns ok+pending; a provider webhook later flips status to 'connected'|'error'. Additive — nothing
-- calls it yet. NOTE: the sms_enabled disable guard is intentionally NOT here — keyed on the registration
-- OUTCOME write-point (tcr_wizard_sessions), confirmed + built in slice 2 (the tenants.tcr_status version
-- was a no-op: tcr_status only ever holds 'unregistered'/'active').
--
-- F1 (mapped to live tenant_members roles — the spec's 'owner'/'manager' don't exist in the role CHECK,
--     and is_tenant_admin's owner/manager branches are dead, so it's admin-only today):
--     PAID (sms,mms,voice,whatsapp) -> 'admin' ('owner' kept forward-compat, no-op today). SP bypass.
--     FREE (email) -> 'admin' + 'campaign_manager' (the real "manager who configures, not spends").
-- F2: PAID + direct tenant -> require billing active + card; PAID + reseller (csp/agent/master_agent) ->
--     'managed_setup' (no consumer add-card; self-activation deferred to v2). FREE -> no gate.
-- F4: rcs -> 'coming_soon' stub.

CREATE OR REPLACE FUNCTION public.activate_channel(p_tenant_id uuid, p_channel text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor       uuid := auth.uid();
  v_is_sp       boolean;
  v_role        text;
  v_tier        text;
  v_paid        boolean;
  v_status      text;
  v_bill_status text;
  v_has_card    boolean;
BEGIN
  IF p_channel NOT IN ('sms','email','whatsapp','rcs','mms','voice') THEN
    RAISE EXCEPTION 'activate_channel: unknown channel %', p_channel USING ERRCODE = '22023';
  END IF;

  -- F4: RCS coming-soon stub (shell stays inert; nothing to do yet).
  IF p_channel = 'rcs' THEN
    RETURN jsonb_build_object('ok', false, 'channel', p_channel, 'outcome', 'coming_soon',
      'message', 'RCS activation is not yet available.');
  END IF;

  v_paid := p_channel IN ('sms','mms','voice','whatsapp');

  -- ── Authz (F1) — user-JWT required; SP bypasses; else role-gated by paid/free ──
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'activate_channel: no authenticated caller' USING ERRCODE = '42501';
  END IF;
  v_is_sp := is_sp_admin(v_actor);
  IF NOT v_is_sp THEN
    SELECT role INTO v_role FROM tenant_members
      WHERE user_id = v_actor AND tenant_id = p_tenant_id AND status = 'active';
    IF v_paid THEN
      IF v_role IS NULL OR v_role NOT IN ('admin','owner') THEN
        RAISE EXCEPTION 'activate_channel: caller % must be admin/owner of tenant % to enable a paid channel', v_actor, p_tenant_id
          USING ERRCODE = '42501';
      END IF;
    ELSE
      IF v_role IS NULL OR v_role NOT IN ('admin','owner','campaign_manager') THEN
        RAISE EXCEPTION 'activate_channel: caller % not authorized for tenant %', v_actor, p_tenant_id
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  SELECT entity_tier INTO v_tier FROM tenants WHERE id = p_tenant_id;
  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'activate_channel: tenant % not found', p_tenant_id USING ERRCODE = '23503';
  END IF;

  -- ── Cost gate (F2) — paid channels only ──
  IF v_paid THEN
    IF v_tier IN ('csp','agent','master_agent') THEN
      RETURN jsonb_build_object('ok', false, 'channel', p_channel, 'outcome', 'managed_setup',
        'message', 'Paid channel setup for partner accounts is handled by your account team.');
    ELSE
      SELECT status, (payment_method_last4 IS NOT NULL) INTO v_bill_status, v_has_card
        FROM billing_accounts WHERE tenant_id = p_tenant_id;
      IF COALESCE(v_bill_status,'') <> 'active' OR NOT COALESCE(v_has_card,false) THEN
        RETURN jsonb_build_object('ok', false, 'channel', p_channel, 'outcome', 'payment_required',
          'message', 'An active subscription and a card on file are required to enable this channel.');
      END IF;
    END IF;
  END IF;

  -- ── Idempotency — no-op if already in flight or live ──
  SELECT status INTO v_status FROM channel_configs WHERE tenant_id = p_tenant_id AND channel = p_channel;
  IF v_status IN ('pending','connected') THEN
    RETURN jsonb_build_object('ok', true, 'channel', p_channel, 'status', v_status,
      'outcome', CASE v_status WHEN 'connected' THEN 'already_connected' ELSE 'already_pending' END);
  END IF;

  -- ── Transition to pending (upsert: older tenants may predate the seeded shell) ──
  INSERT INTO channel_configs (tenant_id, channel, enabled, status, config_encrypted)
  VALUES (p_tenant_id, p_channel, false, 'pending', '{}'::jsonb)
  ON CONFLICT (tenant_id, channel) DO UPDATE SET status = 'pending', updated_at = now();

  UPDATE tenants SET provisioning_incomplete =
    EXISTS (SELECT 1 FROM channel_configs WHERE tenant_id = p_tenant_id AND status = 'pending')
  WHERE id = p_tenant_id;

  RETURN jsonb_build_object('ok', true, 'channel', p_channel, 'status', 'pending', 'outcome', 'activating');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.activate_channel(uuid, text) TO authenticated;
