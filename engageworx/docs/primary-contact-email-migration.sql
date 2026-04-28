-- Primary contact email on tenants
-- Run in Supabase SQL Editor

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS primary_contact_email TEXT;

-- Backfill from digest_email where available
UPDATE tenants SET primary_contact_email = digest_email
WHERE primary_contact_email IS NULL AND digest_email IS NOT NULL;
