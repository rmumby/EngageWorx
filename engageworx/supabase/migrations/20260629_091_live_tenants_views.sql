-- 091_live_tenants_views
-- RC1 of the demo-vs-live data-wiring cluster (Platform Issues workstream B).
-- Canonical "live tenant" definitions so SA selectors/rollups stop counting demo + sandbox
-- tenants. Idempotent (create or replace). security_invoker = true so the views respect the
-- caller's RLS in this multi-tenant DB.
--
-- live_tenants          = not demo, not sandbox, status active|trial. Includes the EngageWorx
--                         internal row + CSP/agent/master_agent entities (all is_demo=false).
-- live_business_tenants = live_tenants narrowed to leaf business tenants (entity_tier='tenant',
--                         tenant_type<>'internal') for customer tenant pickers / per-tenant rollups.
--
-- Binding targets: Global Analytics tenant filter + every super-admin aggregate that enumerates
-- tenants should select from live_tenants (or live_business_tenants) instead of public.tenants.

create or replace view public.live_tenants
with (security_invoker = true) as
select *
from public.tenants
where is_demo = false
  and is_sandbox = false
  and status in ('active','trial');

comment on view public.live_tenants is
  'RC1 data-wiring: live tenants for SA selectors/rollups = not demo, not sandbox, status active|trial. Includes internal/CSP/agent entities. security_invoker respects caller RLS.';

create or replace view public.live_business_tenants
with (security_invoker = true) as
select *
from public.live_tenants
where entity_tier = 'tenant'
  and tenant_type <> 'internal';

comment on view public.live_business_tenants is
  'RC1 data-wiring: live_tenants narrowed to leaf business tenants (entity_tier=tenant, tenant_type<>internal). For customer tenant pickers / per-tenant rollups.';
