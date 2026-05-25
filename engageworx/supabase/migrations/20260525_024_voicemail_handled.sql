-- Migration: Voicemail handled tracking
-- Adds voicemail_handled_at to conversations for "Mark as Handled" action.
-- When set, the conversation drops out of unanswered/active voicemail counts.
-- Auto-set when an outbound call goes to the same contact within 7 days.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS voicemail_handled_at timestamptz;

-- Index for efficiently querying unhandled voicemails
CREATE INDEX IF NOT EXISTS conversations_voicemail_unhandled_idx
  ON conversations(tenant_id, updated_at)
  WHERE voicemail_handled_at IS NULL;
