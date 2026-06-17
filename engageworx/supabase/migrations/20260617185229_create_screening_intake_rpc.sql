-- Durable-first atomic write for the public screening/lead intake (/api/screening-intake).
-- Applied via MCP, ledger 20260617185229. Idempotent (CREATE OR REPLACE).
--
-- Mirrors create_intake_request (Campus Dentist): SECURITY DEFINER, pinned search_path,
-- resolve-or-insert the contact's OPEN sms conversation (honors uniq_open_convo_per_contact_channel),
-- inbound message with the screening note in the body (tenant-scoped — surfaces in Live Inbox),
-- SMS/CASL consent written once into message metadata. The endpoint authenticates the tenant via
-- tenants.ingest_token before calling; this guard re-checks the tenant exists. service_role only
-- (Supabase default privileges grant EXECUTE to anon/authenticated, which REVOKE FROM PUBLIC alone
-- does not remove).
CREATE OR REPLACE FUNCTION public.create_screening_intake(
  p_tenant_id        uuid,
  p_name             text,
  p_phone            text,
  p_email            text DEFAULT NULL,
  p_service_interest text DEFAULT NULL,
  p_message          text DEFAULT NULL,
  p_consent_sms      boolean DEFAULT false,
  p_consent_version  text DEFAULT NULL,
  p_consent_at       timestamptz DEFAULT NULL,
  p_source           text DEFAULT 'screening_form',
  p_page_url         text DEFAULT NULL,
  p_utm              jsonb DEFAULT NULL,
  p_dedup_window_minutes int DEFAULT 10
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tenant_id uuid;
  v_contact_id uuid;
  v_conversation_id uuid;
  v_phone text := nullif(trim(coalesce(p_phone,'')), '');
  v_email text := lower(nullif(trim(coalesce(p_email,'')), ''));
  v_name  text := nullif(trim(coalesce(p_name,'')), '');
  v_first text;
  v_last  text;
  v_existing uuid;
  v_preview text := left(coalesce(nullif(trim(p_service_interest),''), nullif(trim(p_message),''), 'Screening request'), 120);
BEGIN
  -- Tenant must exist (endpoint enforces token auth; this is defense in depth).
  SELECT id INTO v_tenant_id FROM public.tenants WHERE id = p_tenant_id LIMIT 1;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'invalid_tenant'; END IF;

  -- Required fields (defense in depth behind the endpoint's 422).
  IF v_name IS NULL OR v_phone IS NULL THEN RAISE EXCEPTION 'missing_required_fields'; END IF;
  IF coalesce(p_consent_sms, false) IS NOT TRUE THEN RAISE EXCEPTION 'consent_required'; END IF;

  -- Double-submit guard: same tenant+phone inside the window → return the existing conversation.
  SELECT c.id INTO v_existing
  FROM public.conversations c
  JOIN public.contacts ct ON ct.id = c.contact_id
  WHERE c.tenant_id = v_tenant_id
    AND ct.phone = v_phone
    AND c.created_at > now() - make_interval(mins => greatest(p_dedup_window_minutes, 0))
  ORDER BY c.created_at DESC
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('deduped', true, 'tenant_id', v_tenant_id, 'conversation_id', v_existing,
                              'contact_id', (SELECT contact_id FROM public.conversations WHERE id = v_existing));
  END IF;

  v_first := split_part(v_name, ' ', 1);
  v_last  := nullif(trim(substr(v_name, length(v_first) + 1)), '');

  -- Find-or-create the contact (tenant-scoped on phone — the SMS-screening key).
  SELECT id INTO v_contact_id FROM public.contacts
  WHERE tenant_id = v_tenant_id AND phone = v_phone LIMIT 1;
  IF v_contact_id IS NULL THEN
    INSERT INTO public.contacts (tenant_id, first_name, last_name, phone, email, source, source_detail, status, is_lead)
    VALUES (v_tenant_id, v_first, v_last, v_phone, v_email, coalesce(nullif(trim(p_source),''),'screening_form'), 'web_form', 'active', true)
    RETURNING id INTO v_contact_id;
  ELSE
    UPDATE public.contacts
       SET email = coalesce(email, v_email),
           first_name = coalesce(first_name, v_first),
           last_name = coalesce(last_name, v_last),
           updated_at = now()
     WHERE id = v_contact_id;
  END IF;

  -- Honor uniq_open_convo_per_contact_channel: thread into the open sms conversation, else open one.
  SELECT id INTO v_conversation_id FROM public.conversations
  WHERE tenant_id = v_tenant_id AND contact_id = v_contact_id AND channel = 'sms'
    AND status = ANY (ARRAY['active','waiting'])
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations
      (tenant_id, contact_id, channel, status, subject, last_message_at, last_message_preview, unread_count, needs_attention)
    VALUES
      (v_tenant_id, v_contact_id, 'sms', 'active',
       'Screening: ' || coalesce(nullif(trim(p_service_interest), ''), 'new patient'),
       now(), v_preview, 1, true)
    RETURNING id INTO v_conversation_id;
  ELSE
    UPDATE public.conversations
       SET needs_attention = true, last_message_at = now(),
           last_message_preview = v_preview, unread_count = coalesce(unread_count, 0) + 1, updated_at = now()
     WHERE id = v_conversation_id;
  END IF;

  -- Inbound message: screening details in body (tenant-scoped, NON-PHI in logs); write-once consent
  -- + intake context in metadata.
  INSERT INTO public.messages
    (tenant_id, conversation_id, contact_id, direction, channel, body, status, sender_type, metadata)
  VALUES
    (v_tenant_id, v_conversation_id, v_contact_id, 'inbound', 'sms',
     'Screening request'
       || coalesce(' — interest: ' || nullif(trim(p_service_interest), ''), '')
       || coalesce(' — note: ' || nullif(trim(p_message), ''), ''),
     'delivered', 'contact',
     jsonb_strip_nulls(jsonb_build_object(
       'source', coalesce(nullif(trim(p_source),''),'screening_form'),
       'service_interest', nullif(trim(p_service_interest), ''),
       'page_url', nullif(trim(p_page_url), ''),
       'utm', p_utm,
       'consent', jsonb_build_object(
         'sms_consent', p_consent_sms,
         'text_version', p_consent_version,
         'at', p_consent_at,
         'channel', 'web_form'))));

  RETURN jsonb_build_object('deduped', false, 'tenant_id', v_tenant_id,
                            'contact_id', v_contact_id, 'conversation_id', v_conversation_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_screening_intake(uuid,text,text,text,text,text,boolean,text,timestamptz,text,text,jsonb,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_screening_intake(uuid,text,text,text,text,text,boolean,text,timestamptz,text,text,jsonb,int) TO service_role;
