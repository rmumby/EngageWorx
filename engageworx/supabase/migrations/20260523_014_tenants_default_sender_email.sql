-- 20260523_014: Add default_sender_email to tenants
-- Single source of truth for the tenant's outbound From address.

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS default_sender_email text;

-- Backfill from resend_domain where available
UPDATE public.tenants
SET default_sender_email = 'weddings@' || resend_domain
WHERE resend_domain IS NOT NULL AND default_sender_email IS NULL;
