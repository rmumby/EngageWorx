-- 2026-05-07: Add error tracking columns to lead_sequences
-- Captures send failures so errored enrollments stop retrying
-- (replaces the deleted self-heal loop that caused 30x resends)

ALTER TABLE lead_sequences ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE lead_sequences ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;
ALTER TABLE lead_sequences ADD COLUMN IF NOT EXISTS send_attempts INTEGER DEFAULT 0;
