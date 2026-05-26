-- 2026-05-26: Fix draft visibility on Platform Updates admin page
-- Run in Supabase SQL Editor
--
-- Problem: The only SELECT policy on platform_updates requires
-- published_at IS NOT NULL, which blocks SP admins from seeing drafts.
-- Also: togglePublish only set published_at without updating status,
-- leaving rows in inconsistent state (status='draft' + published_at set).
--
-- Prior attempts:
--   v1: is_sp_admin(auth.uid()) — function not in migrations, may not exist
--   v2: EXISTS(SELECT 1 FROM user_profiles WHERE ...) — user_profiles has
--       RLS that causes recursion/empty results in policy subqueries
--       (documented in CLAUDE.md as a known issue)
--   v3 (this): Check tenant_members for SP tenant membership. tenant_members
--       RLS uses USING(user_id = auth.uid()) which is the keystone
--       non-recursive pattern per CLAUDE.md.

-- ═══════════════════════════════════════════════════════════════════
-- 1. Drop prior broken policies
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "SP admins read all updates" ON platform_updates;

-- ═══════════════════════════════════════════════════════════════════
-- 2. RLS: Allow SP tenant admins to read ALL updates (drafts + published)
-- ═══════════════════════════════════════════════════════════════════
-- Checks tenant_members for admin-role membership in the SP tenant.
-- Avoids user_profiles RLS recursion. Uses the same tenant_members
-- subquery pattern as the existing "Authenticated read published updates"
-- policy on this same table.
-- OR'd with existing published-only policy, so non-SP users still
-- only see published rows.

CREATE POLICY "SP admins read all updates"
  ON platform_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE user_id = auth.uid()
        AND tenant_id = 'c1bc59a8-5235-4921-9755-02514b574387'::uuid
        AND status = 'active'
        AND role IN ('admin', 'owner')
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
