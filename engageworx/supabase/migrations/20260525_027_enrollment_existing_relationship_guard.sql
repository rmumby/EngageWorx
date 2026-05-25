-- 20260525_027: Add existing-relationship guards to auto-enrollment trigger
-- Prevents enrolling leads that already have a relationship with the tenant:
-- 1. Existing contact with same email
-- 2. Existing conversation for that contact email
-- 3. Already active in any sequence

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
  if NEW.auto_sequence_opt_out = true then return NEW; end if;

  -- GUARD 1: Skip if a contact with this email already exists in the tenant.
  select id into v_existing_contact_id
    from public.contacts
   where tenant_id = NEW.tenant_id
     and lower(email) = lower(NEW.email)
   limit 1;
  if v_existing_contact_id is not null then return NEW; end if;

  -- GUARD 2: Skip if any conversation exists for this contact email in tenant.
  select count(*) into v_existing_conv_count
    from public.conversations c
    join public.contacts ct on ct.id = c.contact_id
   where c.tenant_id = NEW.tenant_id
     and lower(ct.email) = lower(NEW.email);
  if v_existing_conv_count > 0 then return NEW; end if;

  -- GUARD 3: Skip if this lead already has an active enrollment in ANY sequence.
  select count(*) into v_existing_active_enrollment
    from public.lead_sequences
   where lead_id = NEW.id
     and status = 'active';
  if v_existing_active_enrollment > 0 then return NEW; end if;

  -- Find active Contact Qualification sequence for this tenant
  select id into v_seq_id
    from public.sequences
   where tenant_id = NEW.tenant_id
     and name ilike '%contact qualification%'
     and status = 'active'
     and coalesce(auto_enroll_enabled, true) = true
   order by created_at asc
   limit 1;

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
