-- 042: Add candidacy completion template to chatbot_configs
ALTER TABLE chatbot_configs ADD COLUMN IF NOT EXISTS candidacy_complete_template TEXT;
