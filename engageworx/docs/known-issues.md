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
