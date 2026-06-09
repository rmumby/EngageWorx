-- 057: prepopulate every tenant's blocked_domains with the canonical suspect union.
--
-- PARITY/DATA ONLY. Already applied to the live DB. Idempotent: each canonical entry is
-- appended only where not already present (@> guard), preserving existing entries + order,
-- no duplicates. Re-running is a no-op.
--
-- Mix of shapes (matched by the shared inbound matcher, api/_lib/blocklist.js):
--   domains:   linkedin.com, facebookmail.com, fb.com, twitter.com, x.com, mailer-daemon.com
--   patterns:  notifications@, noreply@, no-reply@, newsletter@

DO $$
DECLARE
  v_canon text[] := ARRAY[
    'linkedin.com','facebookmail.com','fb.com','twitter.com','x.com','mailer-daemon.com',
    'notifications@','noreply@','no-reply@','newsletter@'
  ];
  v_entry text;
BEGIN
  FOREACH v_entry IN ARRAY v_canon LOOP
    UPDATE public.tenants
       SET blocked_domains = coalesce(blocked_domains, '[]'::jsonb) || to_jsonb(v_entry)
     WHERE NOT (coalesce(blocked_domains, '[]'::jsonb) @> to_jsonb(v_entry));
  END LOOP;
END $$;
