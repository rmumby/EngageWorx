-- 20260521_010: Auto-enrollment controls
-- Adds sequences.auto_enroll_enabled + leads.auto_sequence_opt_out
-- Replaces enrol_unqualified_in_qualification_seq() to remove SP tenant
-- hardcoded fallback and respect both new flags.

-- 1. Schema additions
ALTER TABLE public.sequences
  ADD COLUMN IF NOT EXISTS auto_enroll_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS auto_sequence_opt_out boolean NOT NULL DEFAULT false;

-- 2. Replace trigger function
CREATE OR REPLACE FUNCTION public.enrol_unqualified_in_qualification_seq()
RETURNS trigger
LANGUAGE plpgsql
AS $$
declare
  v_seq_id uuid;
  v_delay  int;
begin
  -- Skip qualified leads
  if NEW.qualified = true then return NEW; end if;

  -- Skip leads with no email (sequences require a deliverable address)
  if NEW.email is null or length(trim(NEW.email)) = 0 then
    return NEW;
  end if;

  -- Skip leads that opted out of auto-enrollment
  if NEW.auto_sequence_opt_out = true then
    return NEW;
  end if;

  -- Find an active Contact Qualification sequence for THIS tenant only
  -- (no cross-tenant fallback — removed per tenant isolation policy)
  select id into v_seq_id
    from public.sequences
   where tenant_id = NEW.tenant_id
     and name ilike '%contact qualification%'
     and status = 'active'
     and auto_enroll_enabled = true
   order by created_at asc
   limit 1;

  if v_seq_id is null then return NEW; end if;

  -- Get first step delay
  select coalesce(delay_days, 0) into v_delay
    from public.sequence_steps
   where sequence_id = v_seq_id and step_number = 1
   limit 1;

  -- Enrol (upsert — no-op if already enrolled)
  insert into public.lead_sequences
    (tenant_id, lead_id, sequence_id, current_step, status, enrolled_at, next_step_at)
  values
    (NEW.tenant_id, NEW.id, v_seq_id, 0, 'active', now(),
     now() + make_interval(days => coalesce(v_delay, 0)))
  on conflict (lead_id, sequence_id) do nothing;

  return NEW;
end;
$$;

-- 3. Sanity check
do $$
declare
  v_has_auto_enroll bool;
  v_has_opt_out bool;
  v_no_sp_fallback bool;
begin
  select count(*) > 0 into v_has_auto_enroll
    from information_schema.columns
    where table_name = 'sequences' and column_name = 'auto_enroll_enabled';

  select count(*) > 0 into v_has_opt_out
    from information_schema.columns
    where table_name = 'leads' and column_name = 'auto_sequence_opt_out';

  select position('c1bc59a8' in prosrc) = 0 into v_no_sp_fallback
    from pg_proc
    where proname = 'enrol_unqualified_in_qualification_seq';

  raise notice 'sequences.auto_enroll_enabled exists: %  (expected t)', v_has_auto_enroll;
  raise notice 'leads.auto_sequence_opt_out exists: %  (expected t)', v_has_opt_out;
  raise notice 'SP tenant fallback removed from trigger: %  (expected t)', v_no_sp_fallback;
end $$;
