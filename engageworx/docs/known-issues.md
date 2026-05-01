# Known Issues

Tracked issues that need fixing but aren't blocking. Each entry includes
the file, the problem, and the planned fix.

---

## CustomerSuccessDashboard.jsx — hardcoded PLAN_LIMITS (lines 3-8)

**Status:** Open  
**Priority:** Low (display-only, SP admin view)  
**Identified:** 2026-05-01

The Customer Success Dashboard has a hardcoded `PLAN_LIMITS` map for
rendering usage gauge percentages. It only knows Starter/Growth/Pro/Enterprise.
Custom plans (silver, csp_pilot, csp_platform, Master 20) fall back to
Starter limits in the display, showing incorrect gauge percentages.

**Fix:** Read limits from `tenants.message_limit` per tenant (same approach
as the `cron-usage-alerts.js` fix). Derive other channel limits using the
standard multipliers (WhatsApp 1x, email 5x, AI 0.5x, voice 0.2x).

**Related commit:** `cc83d46` (cron-usage-alerts.js switched to per-tenant limits)

---

## action-item-generator.js — bulk_setup_nudge produces draft_recipients=null

**Status:** Open (Phase 2 follow-up)  
**Priority:** Medium (action card renders with no "to" line)  
**Identified:** 2026-05-01

When source is `bulk_setup_nudge` or `bulk_inactive_check`, the event has
`related_tenant_id` but no `contact_id` or `lead_id`. The recipient
resolution (line 401) only checks `contact.email` and `lead.email`, so
`draft_recipients` is null.

**Fix:** After the existing recipient check (line 401), add a fallback for
tenant-targeted events:
1. Check `enriched.relatedTenant` → read `primary_contact_email` from tenants row
2. If null, query `tenant_members` for first active admin of the related tenant,
   join `user_profiles` for their email
3. Set `draft_recipients` from whichever resolves

**Location:** `api/_lib/action-item-generator.js` line 400-402

**Related:** Action Board Phase 2 will wire bulk sources to crons — this
must be fixed before `bulk_setup_nudge` goes live.
