-- 2026-05-26: Fix draft visibility on Platform Updates admin page
-- Run in Supabase SQL Editor
--
-- Problem: The only SELECT policy on platform_updates requires
-- published_at IS NOT NULL, which blocks SP admins from seeing drafts.
-- Also: togglePublish only set published_at without updating status,
-- leaving rows in inconsistent state (status='draft' + published_at set).

-- ═══════════════════════════════════════════════════════════════════
-- 1. Drop broken policy if it exists (prior attempt referenced
--    is_sp_admin() function that may not exist in DB)
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "SP admins read all updates" ON platform_updates;

-- ═══════════════════════════════════════════════════════════════════
-- 2. RLS: Allow SP admins to read ALL updates (drafts + published)
-- ═══════════════════════════════════════════════════════════════════
-- Inline check against user_profiles.role — same pattern used in
-- every RPC (save_tenant_branding, save_channel_config, etc.).
-- OR'd with "Authenticated read published updates" policy, so
-- non-SP users still only see published rows.

CREATE POLICY "SP admins read all updates"
  ON platform_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND role IN ('superadmin', 'super_admin', 'sp_admin')
    )
  );

-- ═══════════════════════════════════════════════════════════════════
-- 3. Backfill: Align status for rows where published_at is set
--    but status was never updated (togglePublish bug)
-- ═══════════════════════════════════════════════════════════════════

UPDATE platform_updates
SET status = 'published'
WHERE published_at IS NOT NULL
  AND status = 'draft';
