-- Migration: Add surface_id FK to chatbot_configs
-- Links chatbot_configs rows to the normalized tenant_ai_surfaces table.
-- Nullable initially — backfill migration (029) populates it.
-- Existing code continues to read chatbot_configs.surface text column.

ALTER TABLE chatbot_configs
  ADD COLUMN IF NOT EXISTS surface_id uuid
    REFERENCES tenant_ai_surfaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chatbot_configs_surface_id_idx
  ON chatbot_configs(surface_id) WHERE surface_id IS NOT NULL;
