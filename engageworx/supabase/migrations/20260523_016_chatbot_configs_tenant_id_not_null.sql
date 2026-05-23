-- Migration: Require tenant_id on chatbot_configs
--
-- Before applying the constraint, check for null rows. If any exist,
-- this migration will FAIL with a descriptive error so the operator
-- can decide how to handle them before re-running.

DO $$
DECLARE
  null_count integer;
BEGIN
  SELECT count(*) INTO null_count
    FROM chatbot_configs
   WHERE tenant_id IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION 'Found % chatbot_configs row(s) with tenant_id IS NULL. Fix these before applying the NOT NULL constraint. Run: SELECT id, bot_name, created_at FROM chatbot_configs WHERE tenant_id IS NULL;', null_count;
  END IF;
END $$;

-- Safe to add constraint — no null rows exist
ALTER TABLE chatbot_configs
  ADD CONSTRAINT chatbot_configs_tenant_id_not_null
  CHECK (tenant_id IS NOT NULL);
