-- Platform Config v2 — add onboarding config columns
-- Run in Supabase SQL Editor

ALTER TABLE platform_config
  ADD COLUMN IF NOT EXISTS welcome_contact_source TEXT,
  ADD COLUMN IF NOT EXISTS welcome_contact_tags JSONB,
  ADD COLUMN IF NOT EXISTS customer_type_options JSONB;
