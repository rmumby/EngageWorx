-- 063: structured step number on sequence events. Enables the send worker's exact
-- send-idempotency check (skip if a 'sent' event already exists for this lead + sequence +
-- step) instead of parsing the free-text reason. Additive, nullable; safe to (re)apply.

ALTER TABLE public.lead_sequence_events
  ADD COLUMN IF NOT EXISTS step_number integer;
