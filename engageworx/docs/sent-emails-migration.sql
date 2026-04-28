-- Sent emails tracking table for rate limiting
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.sent_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  lead_id UUID,
  contact_id UUID,
  to_email TEXT NOT NULL,
  subject TEXT,
  source TEXT,
  sequence_id UUID,
  sent_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sent_emails_to_sent ON sent_emails(to_email, sent_at DESC);

ALTER TABLE sent_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON sent_emails FOR ALL USING (true) WITH CHECK (true);
