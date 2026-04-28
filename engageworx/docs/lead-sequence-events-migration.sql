-- Lead sequence events audit log
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.lead_sequence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  lead_id UUID NOT NULL,
  sequence_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lse_lead ON lead_sequence_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lse_sequence ON lead_sequence_events(sequence_id);

ALTER TABLE lead_sequence_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON lead_sequence_events FOR ALL USING (true) WITH CHECK (true);
