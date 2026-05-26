-- 2026-05-26: Fix draft visibility on Platform Updates admin page
-- Run in Supabase SQL Editor
--
-- Problem: The only SELECT policy on platform_updates requires
-- published_at IS NOT NULL, which blocks SP admins from seeing drafts.
-- Also: togglePublish only set published_at without updating status,
-- leaving rows in inconsistent state (status='draft' + published_at set).

-- ═══════════════════════════════════════════════════════════════════
-- 1. RLS: Allow SP admins to read ALL updates (drafts + published)
-- ═══════════════════════════════════════════════════════════════════
-- Uses existing is_sp_admin() SECURITY DEFINER function.
-- OR'd with the existing "Authenticated read published updates" policy,
-- so non-SP users still only see published rows.

CREATE POLICY "SP admins read all updates"
  ON platform_updates FOR SELECT
  USING (is_sp_admin(auth.uid()));

-- ═══════════════════════════════════════════════════════════════════
-- 2. Backfill: Align status for rows where published_at is set
--    but status was never updated (togglePublish bug)
-- ═══════════════════════════════════════════════════════════════════

UPDATE platform_updates
SET status = 'published'
WHERE published_at IS NOT NULL
  AND status = 'draft';

-- ═══════════════════════════════════════════════════════════════════
-- 3. Verify: Check INSERT/UPDATE/DELETE policy state
-- ═══════════════════════════════════════════════════════════════════
-- As of this migration, platform_updates has RLS enabled but ONLY
-- has SELECT policies. No INSERT/UPDATE/DELETE policies exist.
--
-- In Supabase, when RLS is enabled and no policy exists for a given
-- operation, that operation is DENIED for the authenticated role.
-- However, the admin page currently works because PlatformUpdates.jsx
-- uses the supabase client which may be configured with the service
-- role key (bypasses RLS entirely).
--
-- If inserts/updates from the admin page break after this migration,
-- add these policies:
--
-- CREATE POLICY "SP admins manage all updates"
--   ON platform_updates FOR ALL
--   USING (is_sp_admin(auth.uid()))
--   WITH CHECK (is_sp_admin(auth.uid()));
--
-- Not adding preemptively — only add if needed. The current admin
-- page works, so the client likely uses service role.
