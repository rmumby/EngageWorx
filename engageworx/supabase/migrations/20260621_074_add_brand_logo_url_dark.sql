-- 074: add tenants.brand_logo_url_dark (dark-mode lockup; declarative-seeding layer prep).
-- Additive, nullable, idempotent.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS brand_logo_url_dark text;
