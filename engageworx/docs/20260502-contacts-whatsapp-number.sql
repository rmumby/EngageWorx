-- 2026-05-02: Add whatsapp_number to contacts
-- Separate from mobile_phone — many people have different numbers for SMS vs WhatsApp
-- WhatsApp send logic prefers whatsapp_number, falls back to mobile_phone, then phone

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
