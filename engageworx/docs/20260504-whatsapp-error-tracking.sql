-- 2026-05-04: Add error tracking columns to messages table
-- Captures Twilio ErrorCode/ErrorMessage from status webhook callbacks
-- Table is 'messages' (not conversation_messages)

ALTER TABLE messages ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS provider_status_updated_at TIMESTAMPTZ;
