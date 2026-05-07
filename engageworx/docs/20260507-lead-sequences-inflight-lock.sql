-- 2026-05-07: Add in-flight processing lock to lead_sequences
-- Prevents re-processing when Vercel kills a function mid-send.
-- Row is locked for 5 minutes; cleared on success or error.

ALTER TABLE lead_sequences ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;
