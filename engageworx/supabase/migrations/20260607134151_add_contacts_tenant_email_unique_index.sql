-- Captured verbatim from the live migration ledger (supabase_migrations.schema_migrations, version 20260607134151).
-- Applied via MCP/SQL-editor and never committed as a file; this back-fills the repo so it is complete.
-- SQL is the originally-applied statement, unmodified (not rewritten for idempotency).
-- Capture-only: not re-applied here; canonical migration mechanism still undecided.

CREATE UNIQUE INDEX IF NOT EXISTS contacts_tenant_email_uniq
  ON contacts (tenant_id, lower(email))
  WHERE email IS NOT NULL AND email <> '';