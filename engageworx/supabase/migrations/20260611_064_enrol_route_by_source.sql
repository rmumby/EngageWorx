-- 064: route new-lead auto-enrollment by source (closes the double-enroll incident).
--
-- The creation-time matcher is the AFTER-INSERT trigger enrol_unqualified_in_qualification_seq()
-- on leads. It previously enrolled EVERY new unqualified lead into Contact Qualification
-- regardless of source — so an abandoned_checkout lead got Contact Qualification at creation AND
-- Abandoned Checkout Recovery from the midnight orphan sweep. Make it a 2-way, mutually-exclusive
-- split by source:
--   source = 'abandoned_checkout'  -> Abandoned Checkout Recovery
--   everything else                -> Contact Qualification
--
-- All other guards are unchanged (skip qualified, no-email, existing contact/conversation, or any
-- existing active enrollment; ON CONFLICT DO NOTHING). Hardcoded for now; the planned fast-follow
-- replaces the name match with per-sequence enroll_criteria + priority config.

CREATE OR REPLACE FUNCTION public.enrol_unqualified_in_qualification_seq()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_seq_id uuid;
  v_delay  int;
  v_existing_contact_id uuid;
  v_existing_conv_count int;
  v_existing_active_enrollment int;
begin
  if NEW.qualified = true then return NEW; end if;
  if NEW.email is null or length(trim(NEW.email)) = 0 then return NEW; end if;

  -- GUARD 1: Skip if a contact with this email already exists in the tenant.
  select id into v_existing_contact_id
    from public.contacts
   where tenant_id = NEW.tenant_id
     and lower(email) = lower(NEW.email)
   limit 1;
  if v_existing_contact_id is not null then return NEW; end if;

  -- GUARD 2: Skip if any conversation exists for this email in tenant.
  select count(*) into v_existing_conv_count
    from public.conversations c
    join public.contacts ct on ct.id = c.contact_id
   where c.tenant_id = NEW.tenant_id
     and lower(ct.email) = lower(NEW.email);
  if v_existing_conv_count > 0 then return NEW; end if;

  -- GUARD 3: Skip if this lead already has an active enrollment in any sequence.
  select count(*) into v_existing_active_enrollment
    from public.lead_sequences
   where lead_id = NEW.id
     and status = 'active';
  if v_existing_active_enrollment > 0 then return NEW; end if;

  -- Route by source (2-way, mutually exclusive).
  if NEW.source = 'abandoned_checkout' then
    select id into v_seq_id
      from public.sequences
     where tenant_id = NEW.tenant_id
       and name ilike '%abandoned checkout recovery%'
       and status = 'active'
       and coalesce(auto_enroll_enabled, true) = true
     order by created_at asc
     limit 1;
  else
    select id into v_seq_id
      from public.sequences
     where tenant_id = NEW.tenant_id
       and name ilike '%contact qualification%'
       and status = 'active'
       and coalesce(auto_enroll_enabled, true) = true
     order by created_at asc
     limit 1;
  end if;

  if v_seq_id is null then return NEW; end if;

  select coalesce(delay_days, 0) into v_delay
    from public.sequence_steps
   where sequence_id = v_seq_id and step_number = 1
   limit 1;

  insert into public.lead_sequences
    (tenant_id, lead_id, sequence_id, current_step, status, enrolled_at, next_step_at)
  values
    (NEW.tenant_id, NEW.id, v_seq_id, 0, 'active', now(),
     now() + make_interval(days => coalesce(v_delay, 0)))
  on conflict (lead_id, sequence_id) do nothing;

  return NEW;
end;
$function$;
