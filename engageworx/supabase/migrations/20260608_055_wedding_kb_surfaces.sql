-- 055: wedding KB multi-surface — surfaces text[] + GIN index + coherence trigger.
--
-- PARITY ONLY. Already applied directly to the live DB; this file is repo/DB parity and
-- re-applies as a no-op (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- CREATE OR REPLACE FUNCTION / DROP+CREATE TRIGGER).
--
-- surfaces[] is the new canonical multi-surface tag; legacy `surface` (text) and its
-- (tenant_id, surface) btree index are intentionally KEPT for now. The trigger keeps the
-- two coherent in both directions so old single-surface readers/writers still work during
-- transition. A later contract migration drops the legacy column + index — not in this bundle.

ALTER TABLE public.wedding_kb_articles ADD COLUMN IF NOT EXISTS surfaces text[];

UPDATE public.wedding_kb_articles SET surfaces = ARRAY[surface] WHERE surfaces IS NULL AND surface IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wedding_kb_surfaces ON public.wedding_kb_articles USING gin (surfaces);

CREATE OR REPLACE FUNCTION public.sync_wedding_kb_surfaces() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.surfaces IS NULL OR array_length(NEW.surfaces, 1) IS NULL THEN
    IF NEW.surface IS NOT NULL THEN NEW.surfaces := ARRAY[NEW.surface]; END IF;
  ELSIF NEW.surface IS NULL THEN NEW.surface := NEW.surfaces[1]; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_wedding_kb_surfaces ON public.wedding_kb_articles;
CREATE TRIGGER trg_sync_wedding_kb_surfaces BEFORE INSERT OR UPDATE ON public.wedding_kb_articles
  FOR EACH ROW EXECUTE FUNCTION public.sync_wedding_kb_surfaces();
