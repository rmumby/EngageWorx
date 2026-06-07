-- 053: SMS conversation reattach — upsert_sms_conversation RPC.
--
-- One SMS thread per (tenant, contact). The RPC reattaches to ANY existing SMS
-- conversation regardless of status (reopen + bump) and only inserts when none
-- exists. It uses SELECT-then-INSERT with a unique_violation EXCEPTION backstop
-- (NOT ON CONFLICT) so it works WITH OR WITHOUT the unique index — there is no
-- inbound-SMS drop at any deploy/apply order. The exception handler only fires
-- once the index in 053b exists, catching genuine concurrent races.
--
-- Apply this function BEFORE the handler code that calls it is pushed (safe: old
-- code doesn't call it). The index ships separately in 053b.

CREATE OR REPLACE FUNCTION public.upsert_sms_conversation(
  p_tenant_id  uuid,
  p_contact_id uuid,
  p_from_phone text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_contact_id IS NULL THEN RETURN NULL; END IF;

  -- Reattach: any existing SMS thread for (tenant, contact), regardless of status.
  SELECT id INTO v_id FROM conversations
    WHERE tenant_id = p_tenant_id AND channel = 'sms' AND contact_id = p_contact_id
    ORDER BY last_message_at DESC NULLS LAST
    LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE conversations
       SET status = 'active', last_message_at = now(), unread_count = COALESCE(unread_count, 0) + 1, updated_at = now()
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  -- None exists — plain INSERT (no ON CONFLICT, so no index dependency).
  BEGIN
    INSERT INTO conversations (tenant_id, contact_id, channel, status, subject, last_message_at, unread_count, created_at, updated_at)
    VALUES (p_tenant_id, p_contact_id, 'sms', 'active', 'SMS from ' || COALESCE(p_from_phone, ''), now(), 1, now(), now())
    RETURNING id INTO v_id;
    RETURN v_id;
  EXCEPTION WHEN unique_violation THEN
    -- Race backstop (only possible once 053b's index exists): a concurrent inbound
    -- won the insert — re-select and reopen the winning row instead of erroring.
    SELECT id INTO v_id FROM conversations
      WHERE tenant_id = p_tenant_id AND channel = 'sms' AND contact_id = p_contact_id
      ORDER BY last_message_at DESC NULLS LAST
      LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE conversations
         SET status = 'active', last_message_at = now(), unread_count = COALESCE(unread_count, 0) + 1, updated_at = now()
       WHERE id = v_id;
    END IF;
    RETURN v_id;
  END;
END; $$;

REVOKE ALL ON FUNCTION public.upsert_sms_conversation(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_sms_conversation(uuid, uuid, text) TO authenticated, service_role;
