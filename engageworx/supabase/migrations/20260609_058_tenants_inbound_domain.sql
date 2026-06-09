-- 058: dedicated inbound-domain key for tenant routing.
--
-- PARITY ONLY. Already applied to the live DB (column + unique index; Delamere set to
-- inbound.delameremanor.co.uk). Re-applies as a no-op.
--
-- WHY a dedicated column (not custom_domain): custom_domain is the PORTAL/branding domain
-- (BrandingEditor "Custom Domain", BrandingContext host match). Reusing it for inbound would
-- hijack a tenant's portal. inbound_domain is the authoritative INBOUND destination key,
-- matched (exact + subdomain) by the inbound handlers ahead of custom_domain/resend_domain.

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS inbound_domain text;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_inbound_domain_uniq
  ON public.tenants (lower(inbound_domain))
  WHERE inbound_domain IS NOT NULL;
