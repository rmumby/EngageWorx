-- 20260522_012: Add sender_email_override to tenant_members
-- Per-tenant-membership from-address override for LiveInbox sends.
-- NULL = use login email (existing behaviour).

ALTER TABLE public.tenant_members
  ADD COLUMN IF NOT EXISTS sender_email_override text;

COMMENT ON COLUMN public.tenant_members.sender_email_override IS
  'Optional from-address override when this team member sends via LiveInbox. NULL = use login email.';
