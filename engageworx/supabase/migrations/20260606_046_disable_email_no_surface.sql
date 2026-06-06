-- 046: Disable email channel on tenants with no email-enabled chatbot_configs surface.
-- Prevents silent inbound drops (handler returns 'email_not_active' but sender gets no signal).
-- Re-enable per-tenant during onboarding once a surface is configured.

UPDATE channel_configs
SET enabled = false, status = 'disconnected', updated_at = now()
WHERE channel = 'email'
  AND tenant_id IN (
    '467a8861-c457-486e-a14c-ce73a6203385',  -- Niko Touris
    '4b76bba2-5446-43fc-aaab-325ef61d04b5',  -- P2P Labs
    'b59eec41-8109-47ca-993f-0b0e649b852c'   -- Savitele
  );
