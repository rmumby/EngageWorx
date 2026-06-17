-- Per-tenant ingestion auth + CORS allow-list for public token-authed ingestion endpoints
-- (e.g. /api/screening-intake). Applied via MCP, ledger 20260617185155. Additive, idempotent.
-- The token/origin VALUES are seeded as tenant-config data (not in this migration — secrets must
-- not live in git history).
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS ingest_token text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS allowed_origins text[];

-- A token maps to exactly one tenant (prevents accidental token reuse across tenants).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenant_ingest_token
  ON public.tenants (ingest_token) WHERE ingest_token IS NOT NULL;

COMMENT ON COLUMN public.tenants.ingest_token IS
  'Per-tenant secret for authenticating public ingestion endpoints (e.g. /api/screening-intake). Validated server-side; never exposed to clients.';
COMMENT ON COLUMN public.tenants.allowed_origins IS
  'Browser Origins permitted to call this tenant''s public ingestion endpoints (CORS allow-list).';
