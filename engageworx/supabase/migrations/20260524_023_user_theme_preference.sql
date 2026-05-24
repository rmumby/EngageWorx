-- Migration: User theme preference column and RPC
-- Persists per-user theme mode preference ('dark', 'light', 'system')
-- to user_profiles. ThemeContext reads on mount and persists changes.
-- SP admin users are locked to 'dark' at the application layer regardless
-- of stored value.

-- Add column with default 'system' (follows OS preference)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS theme_preference text
    NOT NULL DEFAULT 'system'
    CHECK (theme_preference IN ('dark', 'light', 'system'));

-- RPC to save user's theme preference (authenticated users only)
CREATE OR REPLACE FUNCTION public.save_user_theme_preference(
  p_preference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_preference NOT IN ('dark', 'light', 'system') THEN
    RAISE EXCEPTION 'Invalid theme preference: %. Must be dark, light, or system.', p_preference;
  END IF;

  UPDATE user_profiles
  SET theme_preference = p_preference,
      updated_at = now()
  WHERE id = v_caller_id;

  RETURN jsonb_build_object('preference', p_preference, 'success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.save_user_theme_preference(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_user_theme_preference(text) TO authenticated;
