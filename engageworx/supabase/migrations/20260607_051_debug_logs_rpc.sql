-- 051: debug_logs SECURITY DEFINER RPC — supersedes the interim authenticated
-- INSERT policy from 050. Client (authenticated) writes now go through
-- log_debug() instead of inserting into debug_logs directly, so they no longer
-- depend on an RLS INSERT policy. Service-role server writes are unaffected
-- (service role bypasses RLS regardless).
--
-- NOTE: no migration runner in this repo — apply directly to the live DB, same
-- as 047/048. Harmless if applied before the client deploy: client log_debug()
-- calls are fire-and-forget and swallow errors until the function exists.

CREATE OR REPLACE FUNCTION public.log_debug(p_endpoint text, p_action text, p_payload jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.debug_logs (endpoint, action, payload) VALUES (p_endpoint, p_action, p_payload);
$$;

-- Lock down: only authenticated callers may invoke it (not anon/public).
REVOKE ALL ON FUNCTION public.log_debug(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_debug(text, text, jsonb) TO authenticated;

-- Interim INSERT policy (050) now superseded by the RPC above.
DROP POLICY IF EXISTS debug_logs_authenticated_insert ON public.debug_logs;
