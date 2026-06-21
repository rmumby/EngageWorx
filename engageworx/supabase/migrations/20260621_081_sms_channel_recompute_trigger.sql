-- 081: number-ready hook for the sms_enabled guard (§3 v1, SMS-runner slice).
-- The enable condition is last-of-two: TCR-approved (wired in tcr-wizard.js) AND sms channel
-- 'connected' (number + messaging service bound). In v1 the number step is OUT-OF-BAND (no Telnyx
-- auto-purchase yet — tracked separately), so there's no runner code path for the 'connected' event.
-- This trigger is that event hook: any write to a channel_configs sms row re-runs the SCOPED
-- recompute_sms_enabled (which alt-auth-early-returns for SP/Conecta and no-session tenants), so a
-- wizard-sourced tenant flips to sms_enabled=true exactly when its sms channel reaches 'connected'
-- (whoever sets it — ops, admin action, or a future Telnyx runner). Not a global derivation; recompute
-- stays the single authority-aware evaluator.

CREATE OR REPLACE FUNCTION public.channel_sms_recompute_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.channel = 'sms' THEN
    PERFORM public.recompute_sms_enabled(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_channel_sms_recompute ON public.channel_configs;
CREATE TRIGGER trg_channel_sms_recompute
  AFTER INSERT OR UPDATE OF status ON public.channel_configs
  FOR EACH ROW EXECUTE FUNCTION public.channel_sms_recompute_trigger();
