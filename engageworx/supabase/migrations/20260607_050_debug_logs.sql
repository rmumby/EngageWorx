-- 050: debug_logs — exists in live DB, never tracked in repo. Parity capture.
-- DDL is byte-faithful to live (PK is the only index; the policy below is the
-- only policy; RLS is on). The interim INSERT policy is superseded by the
-- SECURITY DEFINER RPC introduced in Bug B — do NOT layer additional policies.

CREATE TABLE IF NOT EXISTS public.debug_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint    text,
  action      text,
  payload     jsonb,
  result      jsonb,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.debug_logs ENABLE ROW LEVEL SECURITY;

-- interim unblock; superseded by Bug B SECURITY DEFINER RPC
DROP POLICY IF EXISTS debug_logs_authenticated_insert ON public.debug_logs;
CREATE POLICY debug_logs_authenticated_insert
  ON public.debug_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
