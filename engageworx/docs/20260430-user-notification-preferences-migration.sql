-- 2026-04-30: user_notification_preferences table + RLS
-- Phase 1 of AI Action Board — single source of truth for notification settings

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  channel_health_email_enabled    BOOLEAN DEFAULT true,
  channel_health_frequency        TEXT DEFAULT 'daily'
    CHECK (channel_health_frequency IN ('off', 'daily', 'weekly')),

  action_board_email_enabled      BOOLEAN DEFAULT true,
  action_board_frequency          TEXT DEFAULT 'live'
    CHECK (action_board_frequency IN ('off', 'live', 'morning', 'twice_daily', 'weekly')),

  stale_lead_email_enabled        BOOLEAN DEFAULT true,
  stale_lead_frequency            TEXT DEFAULT 'daily'
    CHECK (stale_lead_frequency IN ('off', 'daily', 'weekly')),

  escalation_email_enabled        BOOLEAN DEFAULT true,
  escalation_sms_enabled          BOOLEAN DEFAULT false,

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_user_notification_prefs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_notification_prefs_updated ON user_notification_preferences;
CREATE TRIGGER trg_user_notification_prefs_updated
  BEFORE UPDATE ON user_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_user_notification_prefs_updated_at();

ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notification preferences" ON user_notification_preferences
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Tenant admins read team preferences" ON user_notification_preferences
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
      AND role IN ('admin', 'owner', 'manager')
    )
  );
