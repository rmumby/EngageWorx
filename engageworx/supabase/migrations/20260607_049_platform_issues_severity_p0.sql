-- 049: platform_issues severity — add 'P0'
-- Parity capture: this was applied directly to the live DB outside any migration
-- run. Committed so repo = DB. Prior definition (038) was IN ('P1','P2','P3').
-- The constraint was created inline in 038, so it is auto-named
-- platform_issues_severity_check.

ALTER TABLE platform_issues DROP CONSTRAINT IF EXISTS platform_issues_severity_check;
ALTER TABLE platform_issues ADD CONSTRAINT platform_issues_severity_check
  CHECK (severity IN ('P0','P1','P2','P3'));
