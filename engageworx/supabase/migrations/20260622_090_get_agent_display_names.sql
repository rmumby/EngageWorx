-- 090_get_agent_display_names.sql
-- Name-only resolver for outbound agent attribution in Live Inbox.
-- user_profiles SELECT RLS is own-row-only ("Users can read own profile", qual auth.uid() = id), so a
-- direct client select of other users' profiles is silently RLS-filtered to the viewer's own row and can
-- never resolve another agent's name. This SECURITY DEFINER RPC returns full_name (only) for the given
-- ids, bypassing RLS. EXECUTE granted to authenticated + service_role (never anon/PUBLIC).
--
-- DB is already ahead of the ledger (applied + verified out-of-band) — this file backfills the migration
-- record to MATCH the live definition. Idempotent (CREATE OR REPLACE + REVOKE/GRANT); do NOT db push.

CREATE OR REPLACE FUNCTION public.get_agent_display_names(p_ids uuid[])
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT up.id, up.full_name
  FROM public.user_profiles up
  WHERE up.id = ANY(p_ids);
$function$;

REVOKE ALL ON FUNCTION public.get_agent_display_names(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_agent_display_names(uuid[]) TO authenticated, service_role;
