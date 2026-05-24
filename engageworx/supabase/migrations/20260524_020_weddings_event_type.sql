-- 20260524_020: Add event_type to weddings table
-- Generalises the weddings table to support non-wedding events.
-- Existing rows auto-tagged 'wedding' via DEFAULT.

ALTER TABLE public.weddings
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'wedding';
