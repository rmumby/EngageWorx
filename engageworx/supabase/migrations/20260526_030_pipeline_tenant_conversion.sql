-- 20260526_030: Link pipeline leads to tenants bidirectionally
-- Enables "Convert to Tenant" flow from Pipeline → Invite Tenant

-- Tenant → originating lead (nullable — direct signups have no lead)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS pipeline_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_pipeline_lead_id
  ON public.tenants(pipeline_lead_id) WHERE pipeline_lead_id IS NOT NULL;

-- Lead → resulting tenant (nullable — not all leads convert)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS converted_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_converted_tenant_id
  ON public.leads(converted_tenant_id) WHERE converted_tenant_id IS NOT NULL;
