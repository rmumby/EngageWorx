-- 090: New-user theme default = light.
--
-- New user_profiles rows are seeded by the handle_new_user() signup trigger, which
-- inserts (id, email, full_name, company_name) and omits theme_preference — so the row
-- takes the COLUMN DEFAULT. That default was 'system', meaning a brand-new user on a
-- dark-OS machine landed in dark mode. We want new users to start in light.
--
-- Flipping the column default is the correct seam: it cannot be done purely in the
-- frontend because an unset new user and a user who explicitly chose "Follow system"
-- both store theme_preference='system' — indistinguishable at read time. Changing the
-- seed value is the only place the two diverge.
--
-- SET DEFAULT affects FUTURE inserts only. It does NOT rewrite any existing row. No
-- bulk update is performed here by design — existing users keep their stored choice
-- (dark / light / system). Idempotent: re-running SET DEFAULT to the same value is a no-op.

ALTER TABLE public.user_profiles
  ALTER COLUMN theme_preference SET DEFAULT 'light';
