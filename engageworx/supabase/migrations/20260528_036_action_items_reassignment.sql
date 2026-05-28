-- 20260528_036: Add reassignment audit columns to action_items
-- Tracks who reassigned an item and when. Both nullable — only set on reassignment.

ALTER TABLE public.action_items
  ADD COLUMN IF NOT EXISTS reassigned_by uuid,
  ADD COLUMN IF NOT EXISTS reassigned_at timestamptz;
