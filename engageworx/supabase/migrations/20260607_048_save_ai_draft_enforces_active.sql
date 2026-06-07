-- 048: save_ai_draft must enforce status='active'
-- A conversation with a pending AI draft is by definition active.
-- This prevents any race or prior state from leaving a draft-bearing
-- conversation stuck in 'resolved' or 'waiting'.

CREATE OR REPLACE FUNCTION public.save_ai_draft(
  p_tenant_id UUID,
  p_conversation_id UUID,
  p_body TEXT,
  p_html TEXT,
  p_channel TEXT DEFAULT 'email'
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE conversations SET
    ai_draft_body = p_body,
    ai_draft_html = p_html,
    ai_draft_status = 'pending',
    ai_draft_channel = p_channel,
    ai_draft_generated_at = NOW(),
    status = 'active',
    updated_at = NOW()
  WHERE id = p_conversation_id AND tenant_id = p_tenant_id;
END;
$$;

-- Permissions unchanged from 044
REVOKE EXECUTE ON FUNCTION public.save_ai_draft FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_ai_draft FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_ai_draft FROM authenticated;
GRANT EXECUTE ON FUNCTION public.save_ai_draft TO service_role;
