-- Platform Issues: SA-only bug/observation capture table
CREATE TABLE IF NOT EXISTS platform_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id),
  tenant_context_id UUID,
  url_context TEXT,
  screen_label TEXT,
  description TEXT NOT NULL,
  notes TEXT,
  category TEXT CHECK (category IN ('visual','functional','data','copy','accessibility','other')),
  severity TEXT CHECK (severity IN ('P1','P2','P3')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','triaged','in_progress','fixed','wontfix','duplicate')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: SA-only access
ALTER TABLE platform_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SA read all issues" ON platform_issues
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('superadmin', 'super_admin', 'sp_admin')
    )
  );

CREATE POLICY "SA insert issues" ON platform_issues
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('superadmin', 'super_admin', 'sp_admin')
    )
  );

CREATE POLICY "SA update issues" ON platform_issues
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('superadmin', 'super_admin', 'sp_admin')
    )
  );
