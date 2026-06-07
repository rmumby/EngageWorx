-- parity: pre-existing index, applied directly before migration tracking began
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_convo_per_contact_channel
  ON public.conversations (tenant_id, contact_id, channel)
  WHERE status IN ('active', 'waiting');
