-- 092_real_tenants_view_and_rebase_live
-- Data-wiring RC1 refinement: split the "exclude demo/sandbox" concept from the "is it live"
-- (active|trial) concept, so management surfaces can reach suspended/churned tenants while
-- analytics/pickers stay limited to active|trial.
--
--   real_tenants          = not demo, not sandbox (ANY status). For management screens
--                           (AdminTenants, TenantManagement) that layer their own status filter.
--   live_tenants          = real_tenants AND status in ('active','trial'). REBASED onto
--                           real_tenants (same end-set as 091; now expressed as a refinement).
--   live_business_tenants = unchanged (defined in 091): live_tenants narrowed to leaf business
--                           tenants. Still valid because live_tenants keeps its name + columns.
--
-- Idempotent (create or replace). security_invoker = true so the views respect caller RLS.
-- Order matters: real_tenants must exist before live_tenants is replaced to read from it.

create or replace view public.real_tenants
with (security_invoker = true) as
select *
from public.tenants
where is_demo = false
  and is_sandbox = false;

comment on view public.real_tenants is
  'RC1 data-wiring: tenants excluding demo + sandbox, ANY status. For management surfaces that apply their own status filter (would otherwise never reach suspended/churned tenants).';

create or replace view public.live_tenants
with (security_invoker = true) as
select *
from public.real_tenants
where status in ('active','trial');

comment on view public.live_tenants is
  'RC1 data-wiring: real_tenants narrowed to status active|trial. For analytics/rollups/pickers. Rebased onto real_tenants in 092 (same set as 091).';
