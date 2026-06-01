-- One Smile Aesthetics: schema additions for photo screening + training examples

-- Add qualification_rubric and photo_screening_prompt to chatbot_configs
ALTER TABLE chatbot_configs ADD COLUMN IF NOT EXISTS qualification_rubric TEXT;
ALTER TABLE chatbot_configs ADD COLUMN IF NOT EXISTS photo_screening_prompt TEXT;

-- New table: conversation_training_examples
CREATE TABLE IF NOT EXISTS conversation_training_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  conversation_data JSONB NOT NULL,
  outcome_label TEXT,
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: tenant-scoped (mirrors helpdesk_kb_articles pattern)
ALTER TABLE conversation_training_examples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read own training examples" ON conversation_training_examples
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Tenant admins insert training examples" ON conversation_training_examples
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin', 'owner')
    )
  );

CREATE POLICY "SA full access training examples" ON conversation_training_examples
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('superadmin', 'super_admin', 'sp_admin')
    )
  );
