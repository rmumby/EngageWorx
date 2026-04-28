-- Legal Entity ID — multi-role tenant modeling
-- Run in Supabase SQL Editor

-- Backfill: each tenant without legal_entity_id gets its own unique value
UPDATE tenants SET legal_entity_id = id WHERE legal_entity_id IS NULL;

-- Index for grouping queries
CREATE INDEX IF NOT EXISTS idx_tenants_legal_entity ON tenants(legal_entity_id) WHERE legal_entity_id IS NOT NULL;

-- Prevent duplicate roles per legal entity (e.g. two 'direct' rows for same entity)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_legal_entity_type
ON tenants(legal_entity_id, customer_type)
WHERE legal_entity_id IS NOT NULL AND customer_type IS NOT NULL;

-- Contract type column
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contract_type TEXT;
