-- 093_integrations_public_browser_flag
-- Path B hardening for /api/webhook-inbound: a per-integration switch marking an integration as a
-- PUBLIC, browser-posted form. When true, the endpoint additionally requires a bot-challenge token,
-- restricts CORS to the tenant's allowed_origins, and rate-limits that integration's inbound leads.
-- Default false = server-to-server (today's behavior, unchanged). Additive + idempotent.

alter table public.integrations
  add column if not exists public_browser boolean not null default false;

comment on column public.integrations.public_browser is
  'true = /api/webhook-inbound treats this integration as a public browser form (bot-challenge token + CORS allow-list + per-integration rate limit). false (default) = server-to-server, unchanged.';
