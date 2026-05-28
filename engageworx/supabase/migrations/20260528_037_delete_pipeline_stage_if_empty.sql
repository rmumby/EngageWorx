-- 20260528_037: Atomic delete-if-empty RPC for pipeline stages
-- Deletes a pipeline_stages row ONLY if zero leads reference it.
-- Returns rows_deleted (0 = blocked because leads exist, 1 = deleted).
-- SECURITY DEFINER with locked search_path — callable by authenticated role.

CREATE OR REPLACE FUNCTION public.delete_pipeline_stage_if_empty(
  p_tenant_id uuid,
  p_stage_id  uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows_deleted integer;
BEGIN
  DELETE FROM public.pipeline_stages ps
  WHERE ps.id = p_stage_id
    AND ps.tenant_id = p_tenant_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.pipeline_stage_id = ps.id
        AND l.tenant_id = p_tenant_id
    );

  GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
  RETURN v_rows_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_pipeline_stage_if_empty(uuid, uuid) TO authenticated;
