-- 084: lock tenant access to channel_configs down to SELECT-only (slice 3 security closure).
-- The "Tenant access channel_configs" policy was cmd=ALL, so any tenant user could INSERT/UPDATE/DELETE
-- their own tenant's channel_configs directly client-side — bypassing activate_channel's authz + cost +
-- TCR gate and save_channel_config's cascade-permission/phone validation. After migrating every client
-- writer to save_channel_config (083), there are no legitimate direct client writes left, so we narrow
-- this policy to SELECT. Writes now go only through SECURITY DEFINER RPCs (save_channel_config,
-- activate_channel) and service-role endpoints (whatsapp-signup/verify, email-setup, ...), all of which
-- bypass RLS. The two SP/superadmin ALL policies are left intact (the console manages directly).
--
-- MUST be applied AFTER the migrated client code is deployed (else live old code's direct writes break).
-- Postgres can't ALTER a policy's command, so drop + recreate as SELECT (same roles/qual as before).

DROP POLICY IF EXISTS "Tenant access channel_configs" ON public.channel_configs;

CREATE POLICY "Tenant access channel_configs"
  ON public.channel_configs
  FOR SELECT
  TO public
  USING (
    tenant_id IN (
      SELECT (user_profiles.tenant_id)::uuid AS tenant_id
      FROM user_profiles
      WHERE user_profiles.id = auth.uid()
    )
  );
