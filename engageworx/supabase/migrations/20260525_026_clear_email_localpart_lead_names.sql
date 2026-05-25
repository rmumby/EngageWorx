-- 20260525_026: Clear leads.name where it was set to the email local-part fallback.
-- Scoped to SP tenant only. Platform-wide application deferred pending review.

UPDATE leads
SET name = NULL
WHERE tenant_id = 'c1bc59a8-5235-4921-9755-02514b574387'
  AND email IS NOT NULL
  AND name IS NOT NULL
  AND lower(name) = lower(split_part(email, '@', 1));
