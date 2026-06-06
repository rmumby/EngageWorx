-- 043: Lock down complete_candidate_capture to service_role only
-- CREATE OR REPLACE (migration 041) auto-granted PUBLIC execute.
-- The REVOKE was applied via connector but not captured in the repo —
-- a rebuild from migrations would re-expose the function to authenticated callers.

REVOKE EXECUTE ON FUNCTION public.complete_candidate_capture(UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_candidate_capture(UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_candidate_capture(UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_candidate_capture(UUID, UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
