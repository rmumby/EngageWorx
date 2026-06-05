-- 041: Post-approval candidacy name capture states + RPC
-- Extends candidacy_state CHECK, adds name-ask template, contact tags, capture RPC

-- 1. Expand candidacy_state CHECK to include new states
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_candidacy_state_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_candidacy_state_check
  CHECK (candidacy_state IS NULL OR candidacy_state IN (
    'auto', 'awaiting_candidacy_approval', 'approved', 'rejected',
    'awaiting_candidate_name', 'candidate_complete'
  ));

-- 2. Add name-ask template to chatbot_configs (tenant-configurable copy)
ALTER TABLE chatbot_configs ADD COLUMN IF NOT EXISTS candidacy_name_ask_template TEXT;

-- 3. Add tags array to contacts (for approved_candidate tag and future use)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- 4. RPC: complete_candidate_capture — tenant-scoped name + phone + tag + state transition
CREATE OR REPLACE FUNCTION public.complete_candidate_capture(
  p_tenant_id UUID,
  p_contact_id UUID,
  p_conversation_id UUID,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Update contact: name (only if provided), phone (only if missing), add tag
  UPDATE contacts SET
    first_name  = COALESCE(p_first_name, first_name),
    last_name   = COALESCE(p_last_name, last_name),
    phone       = COALESCE(phone, p_phone),
    tags        = CASE
                    WHEN NOT ('approved_candidate' = ANY(COALESCE(tags, '{}')))
                    THEN array_append(COALESCE(tags, '{}'), 'approved_candidate')
                    ELSE tags
                  END,
    updated_at  = NOW()
  WHERE id = p_contact_id AND tenant_id = p_tenant_id;

  -- Transition conversation to candidate_complete
  UPDATE conversations SET
    candidacy_state = 'candidate_complete',
    updated_at = NOW()
  WHERE id = p_conversation_id AND tenant_id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_candidate_capture TO service_role;
