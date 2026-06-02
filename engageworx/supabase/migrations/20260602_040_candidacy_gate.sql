-- Candidacy gate: per-tenant config flag + conversation state machine

-- Config flag + templates on chatbot_configs
ALTER TABLE chatbot_configs ADD COLUMN IF NOT EXISTS candidacy_gate_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE chatbot_configs ADD COLUMN IF NOT EXISTS candidacy_ack_template TEXT;
ALTER TABLE chatbot_configs ADD COLUMN IF NOT EXISTS candidacy_approve_template TEXT;
ALTER TABLE chatbot_configs ADD COLUMN IF NOT EXISTS candidacy_reject_template TEXT;

-- Conversation state for candidacy flow
-- null = no candidacy flow active (default, backward-compatible)
-- 'awaiting_candidacy_approval' = photo received, waiting for human verdict
-- 'auto' = normal AI auto-response mode (explicitly set after approval)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS candidacy_state TEXT
  CHECK (candidacy_state IS NULL OR candidacy_state IN ('auto', 'awaiting_candidacy_approval', 'approved', 'rejected'));
