-- Captured verbatim from the live migration ledger (supabase_migrations.schema_migrations, version 20260614174623).
-- Applied via MCP/SQL-editor and never committed as a file; this back-fills the repo so it is complete.
-- SQL is the originally-applied statement, unmodified (not rewritten for idempotency).
-- Capture-only: not re-applied here; canonical migration mechanism still undecided.

CREATE OR REPLACE FUNCTION public.auto_create_referral_on_referred_by()
RETURNS trigger LANGUAGE plpgsql AS $function$
declare
  v_entity_type text;
  v_existing    int;
begin
  if new.referred_by is null then return new; end if;
  if new.referred_by = new.id then return new; end if;
  if not exists (select 1 from public.tenants where id = new.referred_by) then
    return new;
  end if;

  select count(*) into v_existing
    from public.referrals
   where referrer_id = new.referred_by
     and referred_entity_id = new.id;
  if v_existing > 0 then return new; end if;

  v_entity_type := case
    when new.entity_tier in ('master_agent','agent','csp') then new.entity_tier
    else 'tenant'
  end;

  begin
    insert into public.referrals
      (referrer_id, referred_entity_id, referred_entity_type,
       commission_model, commission_value, effective_date)
    values
      (new.referred_by, new.id, v_entity_type,
       'percent', 0.10, current_date);
  exception when others then
    null;
  end;

  return new;
end;
$function$;