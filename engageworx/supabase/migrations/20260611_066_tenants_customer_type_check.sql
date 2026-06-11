-- 066: canonical customer_type guard (Bug 3).
--
-- Restricts tenants.customer_type to the canonical set so a non-canonical write can't recur — the
-- convert-to-CSP path wrote 'csp' (and 'business') instead of the canonical 'csp_partner'/'direct',
-- which broke feature gates that check csp_partner (lost Tenant Management). Verified 2026-06-11:
-- all existing rows are canonical (agent, csp_partner, direct, internal, master_agent), so this
-- applies cleanly.
--
-- ⚠ APPLY ORDERING: apply this AFTER the write-path fix (App.jsx Account-Type mapping) is deployed,
-- so the UI produces canonical values before the DB enforces them. If applied while the old
-- dropdown is still live, a 'csp'/'business' write would be rejected (the update silently fails in
-- the caller's try/catch) until the new code ships. Ship together; apply last.
--
-- tenant_type is intentionally left unconstrained — its values are messier (business vs direct for
-- some direct tenants). Flagged as a separate cleanup, not part of this constraint.

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_customer_type_check
  CHECK (customer_type = ANY (ARRAY['internal', 'master_agent', 'agent', 'csp_partner', 'direct']));
