-- Sequence lifecycle controls
-- Run in Supabase SQL Editor

-- Sequence-level pause + soft delete
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS stop_on_reply TEXT DEFAULT 'this_sequence';

-- Lead-sequence reply tracking
ALTER TABLE lead_sequences ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
ALTER TABLE lead_sequences ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
