-- 20260524_019: Add wedding couple fields to contacts
-- Allows marking a contact as a wedding couple, linking to weddings table.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS is_wedding_couple boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wedding_id uuid NULL REFERENCES public.weddings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_wedding_id ON public.contacts(wedding_id) WHERE wedding_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_wedding_couple ON public.contacts(tenant_id) WHERE is_wedding_couple = true;
