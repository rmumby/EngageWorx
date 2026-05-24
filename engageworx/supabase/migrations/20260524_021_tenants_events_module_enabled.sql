-- 20260524_021: Add events_module_enabled to tenants
-- Gates the Events admin section per tenant. Delamere already has wedding_portal_enabled
-- but that column doesn't exist yet — create fresh as events_module_enabled.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS events_module_enabled boolean NOT NULL DEFAULT false;
