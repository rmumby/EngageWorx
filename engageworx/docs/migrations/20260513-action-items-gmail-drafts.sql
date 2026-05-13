-- 2026-05-13: Add Gmail draft columns to action_items + extend status CHECK
-- Part of Gmail Drafts integration (Action Board scope doc)

-- 1. Add gmail_draft columns
ALTER TABLE action_items
  ADD COLUMN IF NOT EXISTS gmail_draft_id    TEXT,
  ADD COLUMN IF NOT EXISTS gmail_thread_id   TEXT,
  ADD COLUMN IF NOT EXISTS gmail_message_id  TEXT,
  ADD COLUMN IF NOT EXISTS gmail_drafted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gmail_user_id     UUID,
  ADD COLUMN IF NOT EXISTS has_new_activity_since_draft BOOLEAN DEFAULT false;

-- 2. Extend status CHECK to include 'drafted_to_gmail' + 'submit_failed_post_payment'
-- Drop existing constraint and recreate with new values
ALTER TABLE action_items DROP CONSTRAINT IF EXISTS action_items_status_check;
ALTER TABLE action_items ADD CONSTRAINT action_items_status_check
  CHECK (status IN ('pending', 'snoozed', 'sent', 'dismissed', 'resolved_auto', 'drafted_to_gmail'));

-- 3. Partial index for reconciler polling efficiency
CREATE INDEX IF NOT EXISTS idx_action_items_drafted_to_gmail
  ON action_items (status, gmail_drafted_at)
  WHERE status = 'drafted_to_gmail';

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'action_items' AND column_name LIKE 'gmail_%'
ORDER BY ordinal_position;
