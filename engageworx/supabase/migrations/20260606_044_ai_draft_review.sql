-- 044: AI draft-review mode — config flag + conversation draft columns + RPC
-- Enables per-surface draft_review mode: AI generates reply → held as draft → human reviews → send

-- 1. ai_reply_mode on chatbot_configs (per-surface)
ALTER TABLE chatbot_configs ADD COLUMN IF NOT EXISTS ai_reply_mode TEXT NOT NULL DEFAULT 'auto_send'
  CHECK (ai_reply_mode IN ('auto_send', 'draft_review', 'off'));

-- 2. Draft columns on conversations (one pending draft per conversation, Phase 1)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_draft_body TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_draft_html TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_draft_status TEXT NOT NULL DEFAULT 'none'
  CHECK (ai_draft_status IN ('none', 'pending'));
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_draft_channel TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_draft_generated_at TIMESTAMPTZ;

-- 3. Seed: set all Delamere surfaces to draft_review (concierge + enquiry + supplier)
UPDATE chatbot_configs SET ai_reply_mode = 'draft_review'
WHERE tenant_id = '2e057a7a-69d8-4e17-9e3b-6000a8cf6ebf';

-- 4. RPC: save_ai_draft — writes draft to conversation, service-role only
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
    updated_at = NOW()
  WHERE id = p_conversation_id AND tenant_id = p_tenant_id;
END;
$$;

-- Lock down execute scope: service_role only (handler is the sole caller in Phase 1)
REVOKE EXECUTE ON FUNCTION public.save_ai_draft FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_ai_draft FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_ai_draft FROM authenticated;
GRANT EXECUTE ON FUNCTION public.save_ai_draft TO service_role;
