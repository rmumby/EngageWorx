# Setup Flow Data Hygiene Diagnosis

Date: 2026-05-24

## Problem Statement

Production data shows malformed/wrong phone numbers in `channel_configs.config_encrypted` for several tenants:
- **Savitele** has SP's number (`7869827800`) in their SMS config instead of their own (`+17867568817`)
- **Delamere Manor** has garbage (`7869827600`) in their SMS config
- **Amgen** has `channel_configs` rows but no `phone_numbers` row at all

## Inventory: Every Code Path That Writes to channel_configs

| # | File | Trigger | Writes phone_number? | Writes phone_country? | Source of value |
|---|------|---------|---------------------|----------------------|-----------------|
| 1 | `src/Settings.js` saveChannelConfig (line 634) | User saves channel config form | **YES** | **YES** | Direct form input from React state |
| 2 | `src/Settings.js` test connection (line 1363) | User clicks Test Connection | No | No | Only writes `last_tested_at` |
| 3 | `src/AIChatbot.js` saveAIConfig (line 209) | User saves AI config | No | No | Spreads existing config, overlays AI fields only |
| 4 | `src/OnboardingWizard.jsx` persistStep (line 111) | Onboarding step save | No (email/WA only) | No | Email from_email or WA phone_number_id |
| 5 | `src/App.jsx` channel toggle (line 1034) | SP admin toggles channel in TenantMgt | No | No | Only writes enabled/status/updated_at |
| 6 | `src/WhatsAppEmbeddedSignup.jsx` (line 90) | User disconnects WhatsApp | No | No | Wipes config_encrypted to {} |
| 7 | `api/email-setup.js` (line 137) | Email domain setup wizard | No | No | Email domain fields only |
| 8 | `api/whatsapp-signup.js` (line 103) | WA Embedded Signup OAuth | No | No | WA-specific fields from Meta API |
| 9 | `api/whatsapp-verify.js` (line 45) | WA credential verification | No | No | Updates display name/verified status |
| 10 | `api/support-triage.js` (line 39) | Auto-fix from support triage | No | No | Patches voice/WA operational fields |

**Conclusion: Settings.js `saveChannelConfig()` is the ONLY code path that writes `phone_number` and `phone_country` to SMS/voice channel configs.**

## Inventory: Code Paths That Write to phone_numbers

**ZERO.** There is no code anywhere in the codebase that inserts or updates `phone_numbers` rows. The table is read-only from the application's perspective. Phone number rows are provisioned manually via Supabase SQL Editor or an external process.

## Root Cause Analysis

### The Bug: React State Leakage in Settings.js

The `saveChannelConfig()` function (line 634) has a merge vulnerability:

1. `channelConfigs` React state is loaded at line 626 via `supabase.from("channel_configs").select("*").eq("tenant_id", tenantId)`
2. `tenantId` is `resolvedTenantId || currentTenantId`
3. When an SP admin drills into a tenant via Tenant Management, `resolvedTenantId` changes
4. `loadChannelConfigs` re-runs via useEffect (line 632), but **React state from the PREVIOUS tenant's config may still be in the form fields during the render cycle gap**
5. If the admin clicks Save before the new data loads, `configData` contains the previous tenant's phone number
6. The merge at line 677 (`{ ...existingConfig, ...filteredNew }`) writes the stale number to the new tenant's row

### Contributing Factor: SP Number as Placeholder

Line 34 of Settings.js has `placeholder: "7869827800"` for the SMS phone_number field — this is SP's actual number used as placeholder text. While placeholders aren't saved to the DB, this creates confusion: an admin seeing `7869827800` in the field may not realize it's placeholder vs. actual data, and may save without changing it.

### Case-by-Case Hypotheses

**Savitele SMS has SP's number (7869827800):**
- Most likely: SP admin opened Settings → Channels while viewing SP config (phone_number=7869827800), then drilled into Savitele's portal, navigated to Channels, and saved. The form still displayed SP's phone number from the previous state. The save wrote SP's number to Savitele's config.
- Alternative: Someone manually typed the SP number into Savitele's SMS config, mistaking it for Savitele's number.

**Delamere SMS has 7869827600:**
- Likely a typo during manual configuration. The correct SP number is 7869827800 — `7869827600` differs by one digit (8→6). Someone may have been typing the SP number from memory and mistyped it, or this was a test entry.
- Delamere is a UK tenant with voice number `+447958018585` — this US-format number shouldn't be in their SMS config at all.

**Amgen has channel_configs but no phone_numbers:**
- Expected behavior — the application NEVER creates `phone_numbers` rows. Every `channel_configs` creation path (toggle, onboarding, etc.) creates the config row without a corresponding `phone_numbers` row. The `phone_numbers` table is only populated via manual SQL.
- This means: for any tenant that wasn't manually provisioned with a phone number in Supabase, they'll have channel configs but no routing-authoritative phone number.

## Recommended Fixes (for PR D scope)

### Fix 1: Prevent React state leakage in saveChannelConfig

When `resolvedTenantId` or `currentTenantId` changes, `loadChannelConfigs` should:
- Clear the form state immediately (set all config fields to loading/empty state)
- Block the Save button until the new config is fully loaded
- Add a `loading` guard: `if (channelConfigsLoading) return;` at the top of `saveChannelConfig`

### Fix 2: Remove SP number from placeholder

Replace `placeholder: "7869827800"` (line 34) with a generic placeholder like `placeholder: "5551234567"` or an instructional placeholder like `placeholder: "Your phone number"`.

### Fix 3: Auto-create phone_numbers row on tenant provisioning

When `api/invite-tenant.js` or `api/csp.js?action=create` provisions a new tenant, the flow should also create a `phone_numbers` row if a phone number is assigned. This closes the gap where `channel_configs` exists but `phone_numbers` doesn't.

### Fix 4: Validate phone_number on save

In `saveChannelConfig`, before writing, validate that the phone_number:
- Is in E.164 format (`+` prefix + digits only)
- Is not the SP's own number (unless the tenant IS the SP)
- Matches a row in `phone_numbers` for this tenant (warn if not)

### Fix 5: Audit and backfill existing bad data

Run a one-time data cleanup query to null out `phone_number`/`phone_country` from all `channel_configs` rows (the migration in Commit 4 of this PR does this). Then update the `phone_numbers` table to have correct entries for all active tenants.
