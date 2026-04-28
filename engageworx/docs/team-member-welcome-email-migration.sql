-- Team member welcome email config columns
-- Run in Supabase SQL Editor

ALTER TABLE platform_config ADD COLUMN IF NOT EXISTS team_member_welcome_email_subject TEXT;
ALTER TABLE platform_config ADD COLUMN IF NOT EXISTS team_member_welcome_email_template TEXT;
