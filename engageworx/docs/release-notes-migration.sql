-- Release Notes + Platform Updates enhancements
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.release_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commit_sha TEXT UNIQUE NOT NULL,
  commit_message TEXT,
  commit_author TEXT,
  shipped_at TIMESTAMPTZ,
  title TEXT,
  summary TEXT,
  audience TEXT DEFAULT 'all',
  feature_area TEXT,
  tenant_facing BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_release_notes_shipped ON release_notes(shipped_at);

ALTER TABLE release_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON release_notes FOR ALL USING (true) WITH CHECK (true);

-- Add status column to platform_updates for approval workflow
ALTER TABLE platform_updates ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
ALTER TABLE platform_updates ADD COLUMN IF NOT EXISTS source_release_notes JSONB;

-- Backfill: published rows get status='published', unpublished get 'draft'
UPDATE platform_updates SET status = 'published' WHERE published_at IS NOT NULL AND (status IS NULL OR status = 'draft');

-- Add AI prompt configs to platform_config
ALTER TABLE platform_config ADD COLUMN IF NOT EXISTS release_note_ai_prompt TEXT;
ALTER TABLE platform_config ADD COLUMN IF NOT EXISTS weekly_digest_ai_prompt TEXT;
