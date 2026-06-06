-- 045: clear_ai_draft RPC — clears a pending draft, service-role only

CREATE OR REPLACE FUNCTION public.clear_ai_draft(
  p_tenant_id UUID,
  p_conversation_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE conversations SET
    ai_draft_body = NULL,
    ai_draft_html = NULL,
    ai_draft_status = 'none',
    ai_draft_channel = NULL,
    ai_draft_generated_at = NULL,
    updated_at = NOW()
  WHERE id = p_conversation_id AND tenant_id = p_tenant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_ai_draft(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clear_ai_draft(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.clear_ai_draft(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.clear_ai_draft(uuid, uuid) TO service_role;
