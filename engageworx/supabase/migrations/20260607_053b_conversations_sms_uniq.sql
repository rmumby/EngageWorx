-- 053b: SMS one-thread-per-contact unique index.
--
-- Split from 053 so live-apply order matches the repo: the upsert_sms_conversation
-- RPC (053) no longer DEPENDS on this index (it uses SELECT-then-INSERT with a
-- unique_violation backstop), so this index is a pure invariant that can land
-- AFTER the reattach RPC + handler code are live — with no inbound-SMS drop.
--
-- Apply only AFTER 053's RPC and the calling code are deployed. Once live, the
-- RPC's exception handler catches concurrent races (dupe → reattach, never drop).

CREATE UNIQUE INDEX IF NOT EXISTS conversations_tenant_contact_sms_uniq
  ON conversations (tenant_id, contact_id)
  WHERE channel = 'sms' AND contact_id IS NOT NULL;
