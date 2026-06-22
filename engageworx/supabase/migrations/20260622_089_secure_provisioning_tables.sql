-- 089_secure_provisioning_tables.sql
-- Close 3 tables that had RLS disabled + no policies while anon held read/write.
-- Service-role bypasses RLS (provisioning RPCs unaffected); SP-admin manages via console.
-- authenticated keeps grants (grants are checked before RLS; the SP-admin policy needs
-- them to function via the authenticated JWT) — RLS denies non-SP authenticated.
-- anon is fully revoked (defense-in-depth; RLS already denies it).
-- Pre-check (grep): no client/api/ access to any of the 3 — only provision_tenant_and_bind
-- (SECURITY DEFINER -> bypasses RLS) reads the config tables + writes idempotency_keys. So no
-- authenticated-read policy is needed.

ALTER TABLE public.idempotency_keys                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provisioning_pipeline_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_provisioning_specs       ENABLE ROW LEVEL SECURITY;

-- Service role explicit ALL (service_role also bypasses RLS; explicit for parity/clarity)
CREATE POLICY "Service role full access" ON public.idempotency_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.provisioning_pipeline_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.tenant_provisioning_specs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- SP admin full access (console / debugging), via authenticated JWT
CREATE POLICY "SP admin full access" ON public.idempotency_keys
  FOR ALL TO authenticated USING (is_sp_admin(auth.uid())) WITH CHECK (is_sp_admin(auth.uid()));
CREATE POLICY "SP admin full access" ON public.provisioning_pipeline_templates
  FOR ALL TO authenticated USING (is_sp_admin(auth.uid())) WITH CHECK (is_sp_admin(auth.uid()));
CREATE POLICY "SP admin full access" ON public.tenant_provisioning_specs
  FOR ALL TO authenticated USING (is_sp_admin(auth.uid())) WITH CHECK (is_sp_admin(auth.uid()));

-- Revoke anon entirely (RLS already denies; this is least-privilege defense-in-depth)
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.idempotency_keys                FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.provisioning_pipeline_templates FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.tenant_provisioning_specs       FROM anon;
