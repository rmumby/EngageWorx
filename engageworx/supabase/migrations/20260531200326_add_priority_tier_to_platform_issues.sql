-- Captured verbatim from the live migration ledger (supabase_migrations.schema_migrations, version 20260531200326).
-- Applied via MCP/SQL-editor and never committed as a file; this back-fills the repo so it is complete.
-- SQL is the originally-applied statement, unmodified (not rewritten for idempotency).
-- Capture-only: not re-applied here; canonical migration mechanism still undecided.

ALTER TABLE platform_issues
  ADD COLUMN IF NOT EXISTS priority_tier smallint;
COMMENT ON COLUMN platform_issues.priority_tier IS '0=this-week security/isolation; 1=this-week customer-facing; 2=near-term critical; 3=Jun8 sprint; 4=backlog/triage';