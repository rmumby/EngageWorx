-- 069: Expand tcr_submissions to match the registration code/form (schema reconciliation).
--
-- The registration path (api/tcr.js submit-draft) and the form (src/TCRRegistration.jsx)
-- write/collect a column set the live table never received — so every insert 500'd on a
-- missing column and the table stayed empty. These columns are the INTENDED registration
-- schema (confirmed against the form's POST payload), so we expand the table to match.
--
-- Decisions (signed off):
--  - use_case_description added as its own column; campaign_description kept (distinct — it's
--    the snapshot stored in tcr_approved_templates, never written back to tcr_submissions).
--  - granular street/city/state/zip/country added; existing single `address` kept (forward-compat).
--  - message_volume is TEXT — TCR volume is a tier selector ("100,000", "10,000,000+"), not an int.
--  - claude_score/claude_issues/claude_fix NOT dropped (dead but kept; separate cleanup ticket).
--  - brand_score (Twilio carrier trust score) is distinct from claude_score (AI compliance score).
--
-- Idempotent + additive + nullable → forward-compatible. DDL via MCP apply_migration.

ALTER TABLE public.tcr_submissions
  ADD COLUMN IF NOT EXISTS dba                  text,
  ADD COLUMN IF NOT EXISTS entity_type          text,
  ADD COLUMN IF NOT EXISTS vertical             text,
  ADD COLUMN IF NOT EXISTS country              text,
  ADD COLUMN IF NOT EXISTS state                text,
  ADD COLUMN IF NOT EXISTS city                 text,
  ADD COLUMN IF NOT EXISTS zip                  text,
  ADD COLUMN IF NOT EXISTS street               text,
  ADD COLUMN IF NOT EXISTS contact_first_name   text,
  ADD COLUMN IF NOT EXISTS contact_last_name    text,
  ADD COLUMN IF NOT EXISTS contact_email        text,
  ADD COLUMN IF NOT EXISTS contact_phone        text,
  ADD COLUMN IF NOT EXISTS contact_title        text,
  ADD COLUMN IF NOT EXISTS use_case_description text,
  ADD COLUMN IF NOT EXISTS message_volume       text,
  ADD COLUMN IF NOT EXISTS opt_in_method        text,
  ADD COLUMN IF NOT EXISTS has_opt_in           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_opt_out          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_help             boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_age_gated        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_embedded_links   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_embedded_phone   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_review_result     jsonb,
  ADD COLUMN IF NOT EXISTS ai_reviewed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS current_step         integer,
  ADD COLUMN IF NOT EXISTS brand_score          integer;
