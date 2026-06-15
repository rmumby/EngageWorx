-- Captured verbatim from the live migration ledger (supabase_migrations.schema_migrations, version 20260601135529).
-- Applied via MCP/SQL-editor and never committed as a file; this back-fills the repo so it is complete.
-- SQL is the originally-applied statement, unmodified (not rewritten for idempotency).
-- Capture-only: not re-applied here; canonical migration mechanism still undecided.

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_superadmin_read ON public.audit_log;
CREATE POLICY audit_log_superadmin_read ON public.audit_log
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'superadmin'
  ));

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action        text,
  p_resource_type text,
  p_tenant_id     uuid DEFAULT NULL,
  p_user_id       uuid DEFAULT NULL,
  p_resource_id   uuid DEFAULT NULL,
  p_details       jsonb DEFAULT '{}'::jsonb,
  p_ip_address    inet DEFAULT NULL,
  p_user_agent    text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.audit_log(
    tenant_id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
  VALUES (p_tenant_id, p_user_id, p_action, p_resource_type, p_resource_id,
          coalesce(p_details,'{}'::jsonb), p_ip_address, p_user_agent)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.log_audit_event(text,text,uuid,uuid,uuid,jsonb,inet,text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text,text,uuid,uuid,uuid,jsonb,inet,text) TO authenticated, service_role;