-- 047: Conversation state machine hardening
-- 1. Allow 'sent' as terminal ai_draft_status (audit trail, not recyclable)
-- 2. Add sent_at to messages for dispatch timestamp tracking

-- Widen the CHECK to include 'sent' terminal state
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_ai_draft_status_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_ai_draft_status_check
  CHECK (ai_draft_status IN ('none', 'pending', 'sent'));

-- Add sent_at column to messages (nullable — only set on outbound dispatch)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
