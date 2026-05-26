-- 20260526_031: Fix leads RLS — replace wide-open policy with tenant-scoped + superadmin bypass
-- ALREADY APPLIED via SQL Editor on 2026-05-26. This file tracks the change in the repo.

DROP POLICY IF EXISTS "Authenticated users can do everything" ON leads;

CREATE POLICY "Tenant members read own leads" ON leads
FOR SELECT USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'superadmin'
  )
);

CREATE POLICY "Tenant members write own leads" ON leads
FOR INSERT WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'superadmin'
  )
);

CREATE POLICY "Tenant members update own leads" ON leads
FOR UPDATE USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'superadmin'
  )
);

CREATE POLICY "Tenant members delete own leads" ON leads
FOR DELETE USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'superadmin'
  )
);
