-- 070: Keep ein_dup_match_tenant superadmin-only (no cross-tenant id leak).
--
-- ein_dup_match_tenant holds ANOTHER tenant's id. The "Members can read own tcr submissions"
-- RLS policy lets any active member read their tenant's rows — and RLS can't hide a column —
-- so a tenant reading its own flagged row would see another tenant's id. Close it at the
-- column-grant level: revoke table-wide SELECT from anon/authenticated, then re-grant SELECT
-- on every column EXCEPT ein_dup_match_tenant. service_role is untouched (writes the flag in
-- api/tcr.js and remains the only reader of the matched tenant — e.g. for superadmin tooling).
--
-- ein_dup_flagged stays readable (a boolean reveals no other tenant's identity).
-- NOTE: new tcr_submissions columns are NOT auto-granted to anon/authenticated — re-run this
-- grant (or add the column to a follow-up grant) when adding tenant-readable columns. Fail-safe:
-- an un-granted column is simply unreadable, never a leak.
--
-- Idempotent. RLS row-scoping is unchanged; this only narrows column visibility.

REVOKE SELECT ON public.tcr_submissions FROM anon, authenticated;

DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'tcr_submissions'
    AND column_name <> 'ein_dup_match_tenant';
  EXECUTE format('GRANT SELECT (%s) ON public.tcr_submissions TO anon, authenticated', cols);
END $$;
