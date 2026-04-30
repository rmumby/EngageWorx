-- 2026-04-30: action_items table + target_key dedup + RLS
-- Phase 1 of AI Action Board — replaces email_actions long-term

CREATE TABLE IF NOT EXISTS action_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL,

  tier                TEXT NOT NULL CHECK (tier IN ('priority', 'engagement', 'bulk')),
  source              TEXT NOT NULL,

  contact_id          UUID,
  lead_id             UUID,
  conversation_id     UUID,
  ticket_id           UUID,
  related_tenant_id   UUID,

  target_key          UUID GENERATED ALWAYS AS (
    COALESCE(contact_id, lead_id, conversation_id, ticket_id, related_tenant_id)
  ) STORED,

  title               TEXT NOT NULL,
  context             TEXT,
  suggested_action    TEXT,
  draft_subject       TEXT,
  draft_body_html     TEXT,
  draft_recipients    JSONB,

  predicted_stage_id  UUID REFERENCES pipeline_stages(id),
  stage_advance_type  TEXT CHECK (stage_advance_type IN ('mechanical', 'judgment', 'none')),

  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'snoozed', 'sent', 'dismissed', 'resolved_auto')),
  snooze_until        TIMESTAMPTZ,
  dismissed_at        TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,

  manually_promoted   BOOLEAN DEFAULT false,
  is_vip_action       BOOLEAN DEFAULT false,

  draft_edits_count   INT DEFAULT 0,
  final_sent_html     TEXT,

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_items_user_status
  ON action_items(user_id, status, tier, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_items_tenant
  ON action_items(tenant_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_action_items_dedup
  ON action_items(tenant_id, user_id, source, target_key)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION update_action_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_action_items_updated ON action_items;
CREATE TRIGGER trg_action_items_updated
  BEFORE UPDATE ON action_items
  FOR EACH ROW EXECUTE FUNCTION update_action_items_updated_at();

ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;

-- No service role policy — service_role key bypasses RLS by default.
-- Adding USING(true) would override restrictive policies below because
-- policies are OR'd within a role.

CREATE POLICY "Users read own action items" ON action_items
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users modify own action items" ON action_items
  FOR UPDATE USING (user_id = auth.uid());

-- NOTE: This policy lets any tenant member see ALL action_items in their
-- tenant, not just their own. Acceptable because Phase 3 UI filters to
-- user_id = auth.uid() by default. When team-view admin UX is built,
-- add explicit permission checks in the UI layer.
CREATE POLICY "Tenant members read tenant action items" ON action_items
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );
