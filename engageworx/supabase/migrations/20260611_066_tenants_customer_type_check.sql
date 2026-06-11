-- 066: canonical customer_type guard (Bug 3).
--
-- APPLIED LIVE VIA MCP (outside recorded migration history) — joins the 059/060/064 reconciliation
-- list. This file mirrors the live state EXACTLY and is fully idempotent, so a future
-- `supabase db push` reconciliation is a no-op and never tries to re-add. Live state on
-- tenants.customer_type: DEFAULT 'direct', NOT NULL, CHECK (tenants_customer_type_check) over the
-- canonical set {internal, master_agent, agent, csp_partner, direct}.
--
-- Purpose: stop a non-canonical write recurring — the convert path wrote 'csp' (and 'business')
-- instead of 'csp_partner'/'direct', breaking feature gates that check csp_partner (lost Tenant
-- Management). All existing rows were verified canonical before apply. tenant_type is intentionally
-- left unconstrained (messier — separate cleanup).
--
-- ⚠ Note: the NOT NULL default 'direct' means any insert that omits customer_type silently becomes
-- 'direct' — every creation path must set it explicitly (the manual-create form was fixed alongside).

-- Default + NOT NULL (both idempotent — re-running is a no-op).
ALTER TABLE public.tenants ALTER COLUMN customer_type SET DEFAULT 'direct';
ALTER TABLE public.tenants ALTER COLUMN customer_type SET NOT NULL;

-- CHECK constraint — guarded by name (ADD CONSTRAINT has no IF NOT EXISTS), so re-applying is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tenants_customer_type_check'
       AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_customer_type_check
      CHECK (customer_type = ANY (ARRAY['internal', 'master_agent', 'agent', 'csp_partner', 'direct']));
  END IF;
END $$;
