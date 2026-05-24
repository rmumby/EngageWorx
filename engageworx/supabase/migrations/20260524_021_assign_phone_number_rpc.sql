-- Migration: RPC for assigning phone numbers to tenants
-- Creates phone_numbers rows (previously manual-only SQL).
-- Only SP admins can assign numbers. Validates E.164 format and
-- prevents duplicate active assignments.

CREATE OR REPLACE FUNCTION public.assign_phone_number(
  p_tenant_id  uuid,
  p_number     text,
  p_type       text DEFAULT '10dlc'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id   uuid;
  v_caller_role text;
  v_existing    record;
  v_result_id   uuid;
BEGIN
  -- Only SP admins can assign phone numbers
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_caller_role FROM user_profiles WHERE id = v_caller_id;
  IF v_caller_role NOT IN ('superadmin', 'super_admin', 'sp_admin') THEN
    RAISE EXCEPTION 'Only platform admins can assign phone numbers';
  END IF;

  -- Validate tenant exists
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  -- Validate E.164 format
  IF p_number !~ '^\+\d{8,15}$' THEN
    RAISE EXCEPTION 'Phone number must be in E.164 format (e.g. +14155551234)';
  END IF;

  -- Check for existing active assignment of this number
  SELECT id, tenant_id, status INTO v_existing
    FROM phone_numbers
   WHERE number = p_number
     AND status = 'active';

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.tenant_id = p_tenant_id THEN
      -- Already assigned to this tenant — idempotent success
      RETURN jsonb_build_object('id', v_existing.id, 'status', 'already_assigned');
    ELSE
      RAISE EXCEPTION 'This number is already assigned to another tenant';
    END IF;
  END IF;

  -- Create the phone_numbers row
  INSERT INTO phone_numbers (tenant_id, number, status, type)
  VALUES (p_tenant_id, p_number, 'active', p_type)
  RETURNING id INTO v_result_id;

  RETURN jsonb_build_object('id', v_result_id, 'status', 'assigned');
END;
$$;

REVOKE ALL ON FUNCTION public.assign_phone_number(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_phone_number(uuid, text, text) TO authenticated;
