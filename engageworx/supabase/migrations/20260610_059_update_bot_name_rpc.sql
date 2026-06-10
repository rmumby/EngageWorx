-- 059: update_bot_name — tenant self-service rename of the AI assistant.
--
-- Lets a tenant set chatbot_configs.bot_name from portal Settings without a raw client-side
-- UPDATE on tenant data. SECURITY DEFINER; the caller must be a platform superadmin OR an
-- active member of the target tenant (mirrors update_tenant_branding's auth shape). Touches
-- nothing but bot_name. Additive — safe to (re)apply.
--
-- NOTE: the Settings "AI assistant name" field calls this RPC, so it must be applied
-- (supabase db push) before/with the frontend deploy, or the save will fail.

CREATE OR REPLACE FUNCTION public.update_bot_name(
  p_tenant_id uuid,
  p_bot_name  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   uuid;
  v_caller_role text;
  v_allowed     boolean := false;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_caller_role FROM public.user_profiles WHERE id = v_caller_id;
  IF v_caller_role IN ('superadmin', 'super_admin', 'sp_admin') THEN
    v_allowed := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.tenant_members
     WHERE tenant_id = p_tenant_id
       AND user_id = v_caller_id
       AND status = 'active'
  ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;

  -- Tenant-wide assistant name. NULLIF keeps "blank" as NULL (neutral default at runtime)
  -- rather than an empty string.
  UPDATE public.chatbot_configs
     SET bot_name = NULLIF(btrim(p_bot_name), '')
   WHERE tenant_id = p_tenant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_bot_name(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_bot_name(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.update_bot_name(uuid, text) TO authenticated;
