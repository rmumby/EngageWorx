-- 062: DB backstop for the sequence enrollment guard — at most one ACTIVE enrollment per
-- (lead, sequence). Makes same-sequence duplicate active rows impossible even if a code path
-- misses the safeEnrolSequence guard (the root cause of the 2026-06-11 double-send).
--
-- APPLY NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction block — apply this
-- statement on its own; do NOT wrap it in BEGIN/COMMIT. If applying via MCP, run it as a
-- single standalone statement. Verified 2026-06-11: zero existing duplicate active rows, so
-- creation will not fail on existing data.
--
-- (Cross-sequence "one active outreach per lead" is NOT expressible as a plain partial index —
-- it's enforced in code in api/_lib/safe-enrol-sequence.js.)

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_seq_one_active_per_seq
  ON public.lead_sequences (lead_id, sequence_id)
  WHERE status = 'active';
