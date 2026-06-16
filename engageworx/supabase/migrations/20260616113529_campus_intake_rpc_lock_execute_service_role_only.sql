-- Lock create_intake_request to service_role only (applied via MCP, ledger 20260616113529).
-- Supabase default privileges grant EXECUTE to anon + authenticated on new functions, and
-- REVOKE FROM PUBLIC does not remove those role-specific grants. A SECURITY DEFINER function that
-- bypasses RLS and writes PHI must not be callable by anon/authenticated — the public request form
-- calls it server-side via service_role only. Idempotent.
REVOKE EXECUTE ON FUNCTION public.create_intake_request(text,text,text,text,text,text,text,text,text,text,text,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_intake_request(text,text,text,text,text,text,text,text,text,text,text,int) TO service_role;
