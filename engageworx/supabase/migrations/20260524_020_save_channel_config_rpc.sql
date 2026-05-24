-- Migration: Server-side channel config save with validation
-- Matches the update_tenant_branding RPC pattern: cascade permission
-- check + field validation at the database layer.
--
-- Validates:
--   1. Caller has permission to edit the target tenant (same cascade
--      logic as update_tenant_branding)
--   2. If config_encrypted contains phone_number, it must be E.164
--      AND exist in phone_numbers for the target tenant
--   3. Channel must be a known value

CREATE OR REPLACE FUNCTION public.save_channel_config(
  p_tenant_id        uuid,
  p_channel          text,
  p_enabled          boolean  DEFAULT NULL,
  p_config_encrypted jsonb    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id       uuid;
  v_caller_role     text;
  v_caller_tenants  uuid[];
  v_target          record;
  v_is_sp_admin     boolean := false;
  v_caller_tenant   record;
  v_allowed         boolean := false;
  v_phone_number    text;
  v_existing_id     uuid;
  v_result_id       uuid;
BEGIN
  -- Identify caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate channel
  IF p_channel NOT IN ('sms', 'voice', 'email', 'whatsapp', 'rcs', 'mms') THEN
    RAISE EXCEPTION 'Invalid channel: %', p_channel;
  END IF;

  -- Check if caller is platform superadmin
  SELECT role INTO v_caller_role
    FROM user_profiles
   WHERE id = v_caller_id;

  IF v_caller_role IN ('superadmin', 'super_admin', 'sp_admin') THEN
    v_is_sp_admin := true;
    v_allowed := true;
  END IF;

  -- Load target tenant
  SELECT id, parent_tenant_id, parent_entity_id, entity_tier
    INTO v_target
    FROM tenants
   WHERE id = p_tenant_id;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  -- Cascade permission check (same as update_tenant_branding)
  IF NOT v_allowed THEN
    SELECT array_agg(tenant_id) INTO v_caller_tenants
      FROM tenant_members
     WHERE user_id = v_caller_id
       AND status = 'active'
       AND role IN ('admin', 'superadmin');

    IF v_caller_tenants IS NULL THEN
      RAISE EXCEPTION 'No admin membership found';
    END IF;

    IF p_tenant_id = ANY(v_caller_tenants) THEN
      v_allowed := true;
    END IF;

    IF NOT v_allowed THEN
      IF v_target.parent_tenant_id = ANY(v_caller_tenants)
         OR v_target.parent_entity_id = ANY(v_caller_tenants) THEN

        SELECT entity_tier, msp_enabled, letter_of_agency
          INTO v_caller_tenant
          FROM tenants
         WHERE id = ANY(v_caller_tenants)
           AND (id = v_target.parent_tenant_id OR id = v_target.parent_entity_id)
         LIMIT 1;

        IF v_caller_tenant.entity_tier = 'csp' THEN
          v_allowed := true;
        ELSIF v_caller_tenant.entity_tier IN ('agent', 'master_agent') THEN
          IF v_caller_tenant.msp_enabled AND v_caller_tenant.letter_of_agency THEN
            v_allowed := true;
          ELSE
            RAISE EXCEPTION 'Letter of Agency required for channel config edits';
          END IF;
        END IF;
      END IF;
    END IF;

    IF NOT v_allowed THEN
      RAISE EXCEPTION 'Insufficient permissions to edit channel config for this tenant';
    END IF;
  END IF;

  -- Validate phone_number if present in config (voice/sms channels)
  IF p_config_encrypted IS NOT NULL AND p_channel IN ('sms', 'voice') THEN
    v_phone_number := p_config_encrypted->>'phone_number';
    IF v_phone_number IS NOT NULL AND v_phone_number != '' THEN
      -- Must be E.164 format
      IF v_phone_number !~ '^\+\d{8,15}$' THEN
        RAISE EXCEPTION 'Phone number must be in E.164 format (e.g. +14155551234)';
      END IF;
      -- Must be owned by the target tenant
      IF NOT EXISTS (
        SELECT 1 FROM phone_numbers
        WHERE tenant_id = p_tenant_id
          AND number = v_phone_number
          AND status = 'active'
      ) THEN
        RAISE EXCEPTION 'This number is not assigned to this tenant';
      END IF;
    END IF;
  END IF;

  -- Upsert: find existing row by (tenant_id, channel)
  SELECT id INTO v_existing_id
    FROM channel_configs
   WHERE tenant_id = p_tenant_id
     AND channel = p_channel
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Update existing row: merge config_encrypted, update enabled
    UPDATE channel_configs SET
      config_encrypted = CASE
        WHEN p_config_encrypted IS NOT NULL
        THEN COALESCE(config_encrypted, '{}'::jsonb) || p_config_encrypted
        ELSE config_encrypted
      END,
      enabled = COALESCE(p_enabled, enabled),
      updated_at = now()
    WHERE id = v_existing_id;
    v_result_id := v_existing_id;
  ELSE
    -- Insert new row
    INSERT INTO channel_configs (tenant_id, channel, enabled, config_encrypted, updated_at)
    VALUES (
      p_tenant_id,
      p_channel,
      COALESCE(p_enabled, false),
      COALESCE(p_config_encrypted, '{}'::jsonb),
      now()
    )
    RETURNING id INTO v_result_id;
  END IF;

  RETURN jsonb_build_object('id', v_result_id, 'success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.save_channel_config(uuid, text, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_channel_config(uuid, text, boolean, jsonb) TO authenticated;
