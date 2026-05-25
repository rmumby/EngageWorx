-- 20260525_022: Escalation rules v2 — multi-action support + concierge pause
-- Adds `actions` jsonb array column to escalation_rules for multi-action support.
-- Adds concierge_paused columns to conversations for pause-on-escalation.
-- Existing singular action_type/action_config columns kept for backward compat.

-- 1. Add actions array to escalation_rules
ALTER TABLE public.escalation_rules
  ADD COLUMN IF NOT EXISTS actions jsonb NOT NULL DEFAULT '[]';

-- 2. Add concierge pause columns to conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS concierge_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS concierge_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS concierge_paused_by_rule_id uuid REFERENCES public.escalation_rules(id) ON DELETE SET NULL;

-- 3. Index for fast lookup of paused conversations
CREATE INDEX IF NOT EXISTS idx_conversations_concierge_paused
  ON public.conversations(tenant_id) WHERE concierge_paused = true;
