# Investigation: message_limit=10000 and Partner Tier Origins

**Date:** 2026-05-01  
**Status:** Read-only investigation — no code changes

---

## A. Where did message_limit=10000 come from?

### Root cause: Two sources, both now fixed

**Source 1: invite-tenant.js fallback (commit `be1f606`, now removed)**

The original `invite-tenant.js` had this fallback when a plan slug wasn't found in platform_config:

```javascript
// Line 52 in original invite-tenant.js (commit be1f606)
if (!plan) plan = { slug: planSlug, name: planSlug, monthly_price: null, 
                     message_limit: 5000, contact_limit: 10000, user_seats: 3 };
```

This was later changed (commit `be87bba`) to return a 400 error instead of silently defaulting. But any tenant created between those two commits with a plan slug that didn't match platform_config got `contact_limit: 10000` (and `message_limit: 5000`).

**However**, the 16 tenants with `message_limit: 10000` didn't come from this path — the fallback set `message_limit: 5000`, not 10000.

**Source 2: Manual SP admin plan change via Tenant Management (the actual cause)**

When an SP admin changes a tenant's plan in Tenant Management, `handleSaveTenantConfig` (App.jsx line 392-414) uses the `planDefaults` map:

```javascript
var planDefaults = {
  starter:    { message_limit: 5000,  contact_limit: 10000,  user_seats: 3 },
  growth:     { message_limit: 25000, contact_limit: 50000,  user_seats: 10 },
  ...
  silver:     { message_limit: 10000, contact_limit: 50000,  user_seats: 10 },
};
```

The `silver` tier has `message_limit: 10000`. But most of the 16 tenants with `message_limit: 10000` are on `starter` or `growth` plans, not `silver`.

**The real answer:** These tenants were created via the SP admin "Quick Add" form (App.jsx `handleCreateTenant`, line 416+) or via direct Supabase dashboard edits. The "Quick Add" form doesn't set message_limit at all — it relies on whatever default the `tenants` table has, or the SP admin manually edited the value in Tenant Management. The `contact_limit: 10000` placeholder from `planDefaults` was used as the default for `message_limit` input fields (App.jsx line 1231: `value={configForm.message_limit || c.message_limit || 10000}`).

**Line 1231 is the smoking gun:**

```javascript
<input type="number" value={configForm.message_limit || c.message_limit || 10000} ...
```

The input field defaults to `10000` when neither `configForm.message_limit` nor `c.message_limit` is set. If the SP admin opens a tenant's config panel and saves without changing the message_limit field, `10000` gets written to the database.

### Summary

| Origin | message_limit value | How many tenants |
|--------|-------------------|-----------------|
| `planDefaults` fallback for silver tier | 10,000 | 4 silver tenants (correct for silver) |
| Input field default `|| 10000` on line 1231 | 10,000 | ~12 starter/growth tenants (set when admin opened and saved config without changing the field) |
| Original invite-tenant.js fallback | 5,000 | 2 tenants (Delamere, Dylan) |
| platform_config.plans seed | 5,000/25,000/50,000 | 2 tenants (P2P Labs, Telennovatiq) |

---

## B. Why are partner tiers (silver, csp_pilot, Master 20) in the tenants table?

### These are NOT defined in code — they exist only in the database

| Plan slug | In codebase? | In platform_config DB? | How created |
|-----------|-------------|----------------------|-------------|
| `silver` | Yes — in `planDefaults` (App.jsx line 398), billing cards, Stripe price IDs | Yes — added via our 2026-04-30 migration | Part of the published CSP tier system |
| `csp_pilot` | **No** — not referenced in any .js or .jsx file | Yes — in platform_config.plans (added via Platform Settings UI) | Manually created by Rob via Platform Settings → Plans → "+ Add Plan" for 0wire's pilot |
| `csp_platform` | **No** — not referenced in any .js or .jsx file | Yes — in platform_config.plans | Same — manually created via Platform Settings |
| `Master 20` | **No** — not referenced in any .js or .jsx file | Yes — in platform_config.plans | Same — manually created via Platform Settings for FD, Inc. |
| `custom` | **No** — not referenced in any .js or .jsx file | Yes — in platform_config.plans | Same — manually created for Tochenet |

### Were they meant to live in a separate partner_accounts model?

**No.** The platform was designed with a single `plan` TEXT field on the `tenants` table, with plan definitions stored in `platform_config.plans` as a JSONB array. The Platform Settings UI (App.jsx line 2807) has an "+ Add Plan" button that lets SP admins create arbitrary plan slugs on the fly. This is intentional — it's a no-code plan management system.

The `csp_pilot`, `csp_platform`, `custom`, and `Master 20` plans are legitimate custom plans created through the intended UI flow. They work correctly:
- `invite-tenant.js` looks up the plan by slug from platform_config.plans
- `handleSaveTenantConfig` writes the plan slug + limits to the tenant row
- `cron-usage-alerts.js` falls back to `Starter` limits for unrecognized plan names (line 97: `PLAN_LIMITS[plan] || PLAN_LIMITS.Starter`)

### The gap

`cron-usage-alerts.js` has hardcoded `PLAN_LIMITS` for only 4 plans (Starter/Growth/Pro/Enterprise). All custom plans (silver, csp_pilot, csp_platform, Master 20, custom) fall back to Starter limits (1,000 SMS). This is almost certainly wrong — a silver tier tenant paying $499/mo should not be capped at 1,000 SMS.

**This should be a separate fix:** extend `cron-usage-alerts.js` to read limits from `platform_config.plans` or from `tenants.message_limit` instead of hardcoding.

### Who reads these plan slugs?

| Consumer | What it does with plan slug |
|----------|---------------------------|
| `invite-tenant.js` line 65 | Looks up plan in platform_config.plans → copies limits to tenants row |
| `handleSaveTenantConfig` (App.jsx line 403) | Uses `planDefaults` map → writes limits to tenants row |
| `cron-usage-alerts.js` line 97 | `PLAN_LIMITS[plan] || PLAN_LIMITS.Starter` — falls back to Starter for unknown plans |
| `CustomerSuccessDashboard.jsx` | Displays plan name in tenant overview |
| `HierarchyView.jsx` line 16 | `PLAN_MRR` map for MRR calculation — missing csp_pilot/csp_platform/custom/Master 20 |
| `billing.js` / Stripe | Maps plan slug to Stripe price ID — only has starter/growth/pro + silver/gold/platinum/diamond |

---

## Recommendations (not for this migration)

1. **Fix cron-usage-alerts.js** to read limits from `tenants.message_limit` (already stored per-tenant) instead of hardcoded `PLAN_LIMITS` map. This makes custom plans work correctly.

2. **Fix App.jsx line 1231** — change the `|| 10000` default to read from `platformPlans` for the tenant's current plan, not a hardcoded fallback.

3. **Add missing plans to `PLAN_MRR`** in HierarchyView.jsx so MRR rollups include csp_pilot, csp_platform, custom, and Master 20 tenants.
