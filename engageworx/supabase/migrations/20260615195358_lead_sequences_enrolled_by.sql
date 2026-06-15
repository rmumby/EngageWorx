-- 2c (platform_issues ccd17c9a): deterministic [Your Name] resolution.
-- enrolled_by = the user who enrolled this lead, so [Your Name] resolves to the
-- enrolling/sending admin (not "first active admin by insertion order"). NULLABLE
-- and no FK: system/cron/legacy enrollments leave it null and fall back to the
-- admin proxy; the unfilled-token refuse-gate remains the backstop.
--
-- Applied via MCP apply_migration (ledger version 20260615195358); committed here
-- so the repo matches the live ledger. Idempotent — re-runs as a no-op.
ALTER TABLE public.lead_sequences
  ADD COLUMN IF NOT EXISTS enrolled_by uuid;

COMMENT ON COLUMN public.lead_sequences.enrolled_by IS
  'User who enrolled this lead; resolves [Your Name] deterministically. Nullable — null for system/cron/legacy enrollments (fall back to admin proxy).';
