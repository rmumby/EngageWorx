-- 068: Duplicate-EIN audit columns on tcr_submissions
--
-- When a TCR brand is registered with an EIN already present under a DIFFERENT tenant,
-- we FLAG for superadmin review (never hard-block — legit collisions exist: holding
-- companies, re-registration after a failed brand). The registration path (api/tcr.js
-- submit-draft) sets these when a cross-tenant normalized-EIN match is found.
--
-- ein_dup_flagged      true when this submission's EIN matches a non-rejected submission
--                      under another tenant_id at submit time.
-- ein_dup_match_tenant the other tenant_id we matched against (for the review surface).
--
-- Idempotent: safe to re-run. Flag-not-block by design; no unique constraint on ein.

ALTER TABLE public.tcr_submissions
  ADD COLUMN IF NOT EXISTS ein_dup_flagged boolean NOT NULL DEFAULT false;

ALTER TABLE public.tcr_submissions
  ADD COLUMN IF NOT EXISTS ein_dup_match_tenant uuid;

COMMENT ON COLUMN public.tcr_submissions.ein_dup_flagged IS
  'Cross-tenant EIN duplicate detected at registration; flagged for superadmin review (not blocked).';
COMMENT ON COLUMN public.tcr_submissions.ein_dup_match_tenant IS
  'tenant_id of the existing non-rejected submission whose normalized EIN matched.';
