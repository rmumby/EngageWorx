-- One active sequence per lead — Postgres trigger
-- Run in Supabase SQL Editor

CREATE OR REPLACE FUNCTION enforce_one_active_sequence_per_lead()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'active' THEN
    IF EXISTS (
      SELECT 1 FROM lead_sequences
      WHERE lead_id = NEW.lead_id
        AND status = 'active'
        AND id != NEW.id
    ) THEN
      RAISE EXCEPTION 'Lead already has an active sequence enrollment (lead_id: %)', NEW.lead_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_one_active_sequence_per_lead ON lead_sequences;

CREATE TRIGGER trg_one_active_sequence_per_lead
  BEFORE INSERT OR UPDATE ON lead_sequences
  FOR EACH ROW
  EXECUTE FUNCTION enforce_one_active_sequence_per_lead();
