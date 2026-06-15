-- Captured verbatim from the live migration ledger (supabase_migrations.schema_migrations, version 20260607141930).
-- Applied via MCP/SQL-editor and never committed as a file; this back-fills the repo so it is complete.
-- SQL is the originally-applied statement, unmodified (not rewritten for idempotency).
-- Capture-only: not re-applied here; canonical migration mechanism still undecided.

CREATE UNIQUE INDEX IF NOT EXISTS conversations_tenant_contact_sms_uniq
  ON conversations (tenant_id, contact_id)
  WHERE channel = 'sms' AND contact_id IS NOT NULL;