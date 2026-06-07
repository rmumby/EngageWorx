-- 052: contacts dedup — find_or_create_contact RPC + parity index.
--
-- contacts_tenant_email_uniq is ALREADY LIVE (applied directly this session); the
-- CREATE below is repo/DB parity (IF NOT EXISTS, no-op on live).
--
-- find_or_create_contact is the canonical, ALWAYS tenant-scoped find-or-create used
-- by the email-inbound + compose paths. Routing compose through it fixes the
-- cross-tenant attach in e0aa1f4f (a foreign-tenant contact could be attached to
-- this tenant's conversation). Email creation is race-safe via ON CONFLICT on the
-- partial expression index; phone-only contacts dedup by a tenant-scoped select.
--
-- Apply to live DB before/with the code that calls it (contacts index already live).

CREATE UNIQUE INDEX IF NOT EXISTS contacts_tenant_email_uniq
  ON contacts (tenant_id, lower(email))
  WHERE email IS NOT NULL AND email <> '';

CREATE OR REPLACE FUNCTION public.find_or_create_contact(
  p_tenant_id   uuid,
  p_email       text DEFAULT NULL,
  p_phone       text DEFAULT NULL,
  p_first_name  text DEFAULT NULL,
  p_last_name   text DEFAULT NULL,
  p_source      text DEFAULT 'inbound'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id    uuid;
  v_email text := NULLIF(btrim(p_email), '');
  v_phone text := NULLIF(btrim(p_phone), '');
BEGIN
  IF p_tenant_id IS NULL THEN RETURN NULL; END IF;

  -- Email contact: atomic upsert on the partial expression unique index.
  IF v_email IS NOT NULL THEN
    INSERT INTO contacts (tenant_id, email, phone, first_name, last_name, status, source, created_at, updated_at)
    VALUES (p_tenant_id, v_email, v_phone,
            COALESCE(NULLIF(btrim(p_first_name), ''), split_part(v_email, '@', 1)),
            p_last_name, 'active', p_source, now(), now())
    ON CONFLICT (tenant_id, lower(email)) WHERE email IS NOT NULL AND email <> ''
    DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  -- Phone-only contact: no unique phone index — tenant-scoped select-then-insert.
  IF v_phone IS NOT NULL THEN
    SELECT id INTO v_id FROM contacts
      WHERE tenant_id = p_tenant_id
        AND (phone = v_phone OR mobile_phone = v_phone OR whatsapp_number = v_phone)
      LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    INSERT INTO contacts (tenant_id, phone, mobile_phone, first_name, last_name, status, source, created_at, updated_at)
    VALUES (p_tenant_id, v_phone, v_phone,
            COALESCE(NULLIF(btrim(p_first_name), ''), v_phone),
            p_last_name, 'active', p_source, now(), now())
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  RETURN NULL;
END; $$;

REVOKE ALL ON FUNCTION public.find_or_create_contact(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_or_create_contact(uuid, text, text, text, text, text) TO authenticated, service_role;
