-- Root-cause fix for TEST 2 (applied via MCP, ledger 20260616152247).
-- create_intake_request blind-INSERTed a conversation, colliding with the partial unique index
-- uniq_open_convo_per_contact_channel (one OPEN active/waiting email conversation per tenant+contact)
-- → unique_violation → endpoint 502 for returning patients outside the 10-min dedup window.
-- Fix: resolve the contact's OPEN conversation and thread the new request into it (flag needs_attention)
-- instead of opening a second one. Honors the index; preserves PHI-in-custom_fields and write-once
-- consent on the message. Idempotent (CREATE OR REPLACE). Only the conversation block changed vs
-- 20260616113356; grants from 20260616113529 remain (service_role only).
CREATE OR REPLACE FUNCTION public.create_intake_request(
  p_form_key          text,
  p_full_name         text,
  p_email             text,
  p_phone             text DEFAULT NULL,
  p_address           text DEFAULT NULL,
  p_dob               text DEFAULT NULL,
  p_student_id        text DEFAULT NULL,
  p_insurance         text DEFAULT NULL,
  p_preferred_windows text DEFAULT NULL,
  p_reason            text DEFAULT NULL,
  p_consent_text      text DEFAULT NULL,
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
  v_email text := lower(trim(coalesce(p_email,'')));
  v_first text;
  v_last  text;
  v_phi   jsonb;
  v_existing uuid;
  v_preview text := left(coalesce(nullif(trim(p_reason),''), 'Appointment request'), 120);
BEGIN
  -- Resolve + validate tenant from the opaque form key. Never trust a caller-supplied tenant id.
  SELECT tenant_id INTO v_tenant_id
  FROM public.channel_configs
  WHERE channel = 'email'
    AND config_encrypted->'booking_integration'->>'form_key' = p_form_key
  LIMIT 1;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'invalid_form_key'; END IF;

  -- Server-side required-field guard (defense in depth behind the endpoint).
  IF v_email = '' OR coalesce(trim(p_full_name),'') = '' OR coalesce(trim(p_consent_text),'') = '' THEN
    RAISE EXCEPTION 'missing_required_fields';
  END IF;

  -- Double-submit guard: a conversation for this tenant+email inside the window → return it, no dupe.
  SELECT c.id INTO v_existing
  FROM public.conversations c
  JOIN public.contacts ct ON ct.id = c.contact_id
  WHERE c.tenant_id = v_tenant_id
    AND lower(ct.email) = v_email
    AND c.created_at > now() - make_interval(mins => greatest(p_dedup_window_minutes, 0))
  ORDER BY c.created_at DESC
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('deduped', true, 'tenant_id', v_tenant_id, 'conversation_id', v_existing);
  END IF;

  v_first := split_part(trim(p_full_name), ' ', 1);
  v_last  := nullif(trim(substr(trim(p_full_name), length(v_first) + 1)), '');

  -- PHI lives only here (tenant-scoped). Never logged, never emailed.
  v_phi := jsonb_strip_nulls(jsonb_build_object(
    'address', p_address, 'date_of_birth', p_dob,
    'student_id', p_student_id, 'insurance', p_insurance,
    'preferred_windows', p_preferred_windows));

  -- Find-or-create the contact (tenant-scoped on email).
  SELECT id INTO v_contact_id FROM public.contacts
  WHERE tenant_id = v_tenant_id AND lower(email) = v_email LIMIT 1;
  IF v_contact_id IS NULL THEN
    INSERT INTO public.contacts (tenant_id, first_name, last_name, email, phone, custom_fields, source, source_detail, status, is_lead)
    VALUES (v_tenant_id, v_first, v_last, v_email, p_phone, v_phi, 'appointment_request', 'web_form', 'active', true)
    RETURNING id INTO v_contact_id;
  ELSE
    UPDATE public.contacts
       SET custom_fields = coalesce(custom_fields, '{}'::jsonb) || v_phi,
           phone = coalesce(phone, p_phone), updated_at = now()
     WHERE id = v_contact_id;
  END IF;

  -- Honor uniq_open_convo_per_contact_channel (one OPEN active/waiting email convo per tenant+contact).
  -- Thread a returning patient's new request into their open conversation (flag for attention) instead
  -- of blind-INSERTing a second one (which raised unique_violation → 502).
  SELECT id INTO v_conversation_id
  FROM public.conversations
  WHERE tenant_id = v_tenant_id AND contact_id = v_contact_id AND channel = 'email'
    AND status = ANY (ARRAY['active','waiting'])
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations
      (tenant_id, contact_id, channel, status, subject, last_message_at, last_message_preview, unread_count, needs_attention)
    VALUES
      (v_tenant_id, v_contact_id, 'email', 'active',
       'Appointment request: ' || coalesce(nullif(trim(p_reason), ''), 'new patient'),
       now(), v_preview, 1, false)
    RETURNING id INTO v_conversation_id;
  ELSE
    UPDATE public.conversations
       SET needs_attention = true, last_message_at = now(),
           last_message_preview = v_preview, unread_count = coalesce(unread_count, 0) + 1, updated_at = now()
     WHERE id = v_conversation_id;
  END IF;

  -- Inbound message: NON-PHI body only; write-once consent + intake context in metadata.
  INSERT INTO public.messages
    (tenant_id, conversation_id, contact_id, direction, channel, body, status, sender_type, metadata)
  VALUES
    (v_tenant_id, v_conversation_id, v_contact_id, 'inbound', 'email',
     'Appointment request'
       || coalesce(' — reason: ' || nullif(trim(p_reason), ''), '')
       || coalesce(' — preferred: ' || nullif(trim(p_preferred_windows), ''), ''),
     'delivered', 'contact',
     jsonb_build_object(
       'source', 'appointment_request_form',
       'consent', jsonb_build_object('text', p_consent_text, 'at', now(), 'channel', 'web_form')));

  RETURN jsonb_build_object('deduped', false, 'tenant_id', v_tenant_id,
                            'contact_id', v_contact_id, 'conversation_id', v_conversation_id);
END;
$function$;
