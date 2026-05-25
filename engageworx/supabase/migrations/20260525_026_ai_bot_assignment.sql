-- Migration: AI Bot assignment support
-- assigned_agent_id FKs to auth.users — cannot store a sentinel UUID.
-- Add ai_assigned boolean flag for AI routing instead.
--
-- Assignment states:
--   Human:     assigned_agent_id = <user_uuid>, ai_assigned = false
--   AI Bot:    assigned_agent_id = NULL, ai_assigned = true
--   Unassigned: assigned_agent_id = NULL, ai_assigned = false

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_assigned boolean NOT NULL DEFAULT false;

-- Recreate assign_conversation RPC to handle AI flag
CREATE OR REPLACE FUNCTION public.assign_conversation(
  p_conversation_id uuid,
  p_assignee_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id      uuid;
  v_caller_role    text;
  v_caller_tenants uuid[];
  v_conv_tenant    uuid;
  v_is_sp_admin    boolean := false;
  v_allowed        boolean := false;
  v_assign_ai      boolean := false;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tenant_id INTO v_conv_tenant
    FROM conversations WHERE id = p_conversation_id;
  IF v_conv_tenant IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  SELECT role INTO v_caller_role
    FROM user_profiles WHERE id = v_caller_id;
  IF v_caller_role IN ('superadmin', 'super_admin', 'sp_admin') THEN
    v_is_sp_admin := true;
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    SELECT array_agg(tenant_id) INTO v_caller_tenants
      FROM tenant_members
     WHERE user_id = v_caller_id AND status = 'active'
       AND role IN ('admin', 'superadmin', 'agent');
    IF v_caller_tenants IS NULL THEN
      RAISE EXCEPTION 'No active membership found';
    END IF;
    IF v_conv_tenant = ANY(v_caller_tenants) THEN
      v_allowed := true;
    END IF;
    IF NOT v_allowed THEN
      RAISE EXCEPTION 'Insufficient permissions to assign this conversation';
    END IF;
  END IF;

  -- Detect AI Bot sentinel
  IF p_assignee_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    v_assign_ai := true;
    p_assignee_id := NULL;
  END IF;

  -- Validate human assignee
  IF p_assignee_id IS NOT NULL AND NOT v_assign_ai THEN
    IF NOT EXISTS (
      SELECT 1 FROM tenant_members
      WHERE user_id = p_assignee_id AND tenant_id = v_conv_tenant AND status = 'active'
    ) AND NOT EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = p_assignee_id AND role IN ('superadmin', 'super_admin', 'sp_admin')
    ) THEN
      RAISE EXCEPTION 'Assignee is not a member of this tenant';
    END IF;
  END IF;

  UPDATE conversations
  SET assigned_agent_id = p_assignee_id,
      ai_assigned = v_assign_ai,
      updated_at = now()
  WHERE id = p_conversation_id;

  RETURN jsonb_build_object(
    'conversation_id', p_conversation_id,
    'assigned_to', p_assignee_id,
    'ai_assigned', v_assign_ai,
    'success', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_conversation(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_conversation(uuid, uuid) TO authenticated;
