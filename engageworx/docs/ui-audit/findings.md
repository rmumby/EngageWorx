# EngageWorx UI/IA Audit — Findings (Refresh)

Audit date: 2026-05-24
Previous audit: 2026-05-23 (commit cb2735f)
Delta: 13 commits since original audit, including PRs #2 (UI cleanup), #3 (channel isolation), #4 (branding clear flags)

---

## P0 Fix Verification

| Fix (from PR #2/#3/#4) | Status |
|---|---|
| WhiteLabelBranding.jsx deleted | CONFIRMED |
| TenantBranding.jsx deleted | CONFIRMED |
| Top-level Branding nav removed from navMenu.js | CONFIRMED |
| Top-level Branding module removed from modules.js | CONFIRMED |
| BrandingEditor uses RPC save with clear flags | CONFIRMED |
| TenantBrandingManager hardcoded actor permissions removed | CONFIRMED — derives from AuthContext |
| ImportLeads CPEXPO_SEQUENCE_ID removed | CONFIRMED |
| LeadScan CPEXPO_SEQ_ID removed | CONFIRMED |
| Settings.js imports BrandingEditor (not TenantBranding) | CONFIRMED |
| OnboardingWizard branding save uses RPC | CONFIRMED |
| ChatbotConfig uses shared supabaseClient | CONFIRMED |
| ChatbotConfig tenant_id null fixed | CONFIRMED |
| Voice handler 7869827800 force-route removed | CONFIRMED |
| Voice handler SP_TID inbound catch-all removed | CONFIRMED |
| SMS handler SP_TID inbound catch-all removed | CONFIRMED |
| WhatsApp cross-tenant config fallback removed | CONFIRMED |
| WhatsApp SP_TID catch-all removed | CONFIRMED |
| Vendor names cleaned from customer-facing UI strings | CONFIRMED (17 files, 38 replacements) |
| Email concierge routing prefix strip | CONFIRMED |

---

## 1. Duplications

### 1.1 Dead Code Duplicates (unchanged from original audit — not yet deleted)

| Dead File | Canonical | Notes |
|-----------|-----------|-------|
| `src/AgentInbox.jsx` | HelpDeskModule | Mock-only, not imported |
| `src/components/AgentInbox.jsx` | HelpDeskModule | Mock-only duplicate of above, not imported |
| `src/ContactManager.jsx` | ContactsModule.js | Not imported. Multi-tenant safety bug (no tenant_id filter). Creates own Supabase client. |
| `src/LiveInbox.js` | components/LiveInboxV2.js | Not imported. Superseded. |
| `src/ChatbotConfig.jsx` | AIChatbot.js | Not imported. Superseded. P0 fixes applied defensively but file is dead. |
| `src/NLCampaignBuilder.jsx` | None (orphaned) | Not imported. Creates own Supabase client. No navigation path. |

### 1.2 Legacy (sunset, not yet deleted)

| File | Notes |
|------|-------|
| `src/EmailDigest.jsx` | Nav removed, route still exists. Scheduled Phase 3 deletion. |
| `src/digestStore.js` | Only consumer is EmailDigest. Delete together. |
| `api/cron-email-digest.js` | No-op handler |
| `api/cron-digest-scheduled.js` | No-op handler |
| `api/_omnichannel-insight.js` | Feeds deprecated email_actions table |

### 1.3 Active Duplications (NEW finding)

| Duplication | Details |
|-------------|---------|
| **AgentPortal inline branding form** | `AgentPortal.jsx` lines 673-714 has a "Brand Settings" section in the settings page that saves directly via `supabase.from('tenants').update(...)` — bypasses the RPC save path that BrandingEditor uses. This is a separate code path from the BrandingEditor on the branding page. |
| **renderContent() markdown renderer** | Duplicated between `Blog.jsx` and `BlogAdmin.jsx`. Extract to shared utility. |
| **Sequence list loading** | Identical fetch pattern in SequenceBuilder.jsx and SequenceRoster.jsx. Minor. |
| **Supabase client creation** | `FlowBuilder.js` and `DemoMode.jsx` still create their own `createClient()` instead of using shared `supabaseClient.js`. |

### 1.4 Duplicate Stripe Webhook Handlers (unchanged)

Both `api/billing.js?action=webhook` and `api/stripe-webhook.js` handle Stripe events with different logic. `stripe-webhook.js` is more comprehensive.

---

## 2. Dead Code Candidates

**Confirmed dead (not imported, no route, no menu entry):**
- `src/AgentInbox.jsx`
- `src/components/AgentInbox.jsx`
- `src/ContactManager.jsx`
- `src/LiveInbox.js`
- `src/ChatbotConfig.jsx`
- `src/NLCampaignBuilder.jsx`

**Unclear / orphaned:**
- `src/AdminTenants.jsx` — reachable via `setView("admin_tenants")` but no nav entry points there
- `src/DemoMode.jsx` — may be reached from SP portal but MobileDemo.jsx is the nav target
- `src/StreamingTest.jsx` — internal-only, gated by `customer_type=internal`
- `api/_aiReply.js` — exported functions appear unused by main consumers
- `api/env-test.js` — developer debug endpoint, should not be in production

---

## 3. Persona Leaks

### 3.1 FIXED in P0

- CPEXPO sequence ID no longer visible to non-SP tenants in ImportLeads/LeadScan
- SP_TID catch-all removed from voice/SMS/WhatsApp inbound (misconfigured tenant traffic no longer lands in SP inbox)
- Cross-tenant WhatsApp config fallback removed
- TenantBrandingManager no longer bypasses MSP/LOA permission checks

### 3.2 REMAINING

| Issue | Severity | Location |
|-------|----------|----------|
| **Voice ai-reply/voicemail SP_TID fallback** | HIGH | `twilio-voice.js` lines 403, 538 — if `?tenant=` query param missing, defaults to SP tenant config |
| **AIChatbot model selector option values** | LOW | `AIChatbot.js` lines 829-831 — display labels are genericized ("AI Standard") but `<option value="claude-sonnet-4-6">` exposes vendor model ID in DOM |
| **SP_TENANT_ID UUID hardcoded as fallback** | MEDIUM | 15+ files use `process.env.REACT_APP_SP_TENANT_ID \|\| 'c1bc59a8-...'` — acceptable as env fallback but the UUID is in source |
| **Real prospect names in MobileDemo** | LOW | David Hess/Airespring, Philip Cannis/Primo Dialer — confidentiality concern per CLAUDE.md Section 5 |
| **ai_omni_digest in modules.js** | LOW | Sunset module still in registry — tenant could manually enable via Modules settings tab |

---

## 4. Hardcoded Values

### 4.1 CRITICAL — Vendor Names in Customer-Facing Content

| File | Issue |
|------|-------|
| `api/email-inbound.js` line 590 | System prompt says "powered by Claude (Anthropic)" — generates customer-facing AI replies exposing vendor |
| `src/CreateSandbox.jsx` line 143 | "Assign a phone number in Supabase → phone_numbers table, then configure Twilio webhook" — names both Supabase and Twilio |
| `src/TCRQueue.jsx` | "Submit to Twilio TCR" (5 places), "Claude few-shot" (2 places) — SP-admin-only but still violations |
| `src/StreamingTest.jsx` | botName='Claude', claude-sonnet-4-20250514, Anthropic SSE — internal-only but exposed in UI |
| `src/PolandCarrierCard.jsx` line 15 | "Cloud Gateway (Twilio SIP Trunk)" — SP-admin carrier type label |

### 4.2 CRITICAL — Hardcoded Personal Info in Customer-Facing Templates

| File | Issue |
|------|-------|
| `api/stripe-webhook.js` | Welcome email to ALL tenants: "Rob Mumby, Founder & CEO, EngageWorx", +1 (786) 982-7800, engwx.com |
| `api/demo-ai.js` | Personal phone +1 (305) 810-8877, rob@engwx.com in AI system prompt (prospect-facing) |
| `api/send-onboarding-reminder.js` | "Rob from EngageWorx" in customer-facing reminder email |
| `src/AIChatbot.js` | sigFromName default "Rob Mumby", teamSigFromName "The EngageWorx Team" |
| `src/components/LiveInboxV2.js` | "Rob Mumby" hardcoded in "Assign to Me" action |
| `api/cron-stale-leads.js` | System prompt references "Rob" by name in AI-drafted emails |

### 4.3 HIGH — Hardcoded Emails/Phone/URLs

| Value | Files Still Affected |
|-------|---------------------|
| `hello@engwx.com` | Settings.js (2x), AgentPortal (default), ContactsModule (blocklist), LiveInboxV2 (default from), EmailDigest (7x), App.jsx (signup error) |
| `+1 (786) 982-7800` | AUPModal, LegalContent (10x), sms.js (HELP reply), App.jsx (no_tenant page) |
| `portal.engwx.com` | CSPPortal (6x), AgentPortal (4x), CreateSandbox, App.jsx (4x), ~30 API files |
| `calendly.com/rob-engwx/30min` | OnboardingWizard, PipelineDashboard, DemoRequestForm, email-inbound, stripe-webhook, intake |
| `rob@engwx.com` | Settings (alert placeholder), ContactsModule (blocklist), demo-ai |
| `api.engwx.com/v1` | ApiDocs, Settings |

### 4.4 Stripe Price IDs

`api/billing.js` contains 14 hardcoded Stripe price IDs. Should be in platform_config or env vars.

### 4.5 PLAN_MRR Inconsistency

Duplicated across 4 files with different plan counts:
- AgentPortal / MasterAgentPortal / HierarchyView: 8 plans (starter through diamond)
- CustomerSuccessDashboard: 4 plans only (missing silver/gold/platinum/diamond)

---

## 5. Settings Sprawl

### 5.1 Branding — IMPROVED

Previous state: 5 entry points, 3 components, 2 tables.
Current state: **3 entry points, 1 component, 1 table** (after P0 fix).

| Location | Status |
|----------|--------|
| Settings > Branding tab (BrandingEditor) | CANONICAL — uses RPC |
| OnboardingWizard step 2 | Uses RPC (fixed) |
| TenantMgt > Configure > Branding (BrandingEditor) | CANONICAL — uses RPC |
| **AgentPortal > Settings > Brand Settings** | **NEW FINDING: Inline form bypasses RPC, saves directly to tenants table** |

### 5.2 Email Settings (unchanged)

Welcome email config in 3 places: WelcomeEmailSettings (tenants table), SP Platform Settings (platform_config), CSP Platform Settings (per-tenant override). Resolution order unclear.

### 5.3 Channel Configuration (unchanged)

Enable/disable in TenantManagement (channel_configs.enabled) AND Settings channel tabs (same table, different UI). No conflict resolution.

### 5.4 Team Management (unchanged)

Settings team tab + TenantManagement inline invite. Both call /api/invite-member.

---

## 6. Navigation Depth

| Task | Primary Persona | Clicks | Status |
|------|----------------|--------|--------|
| Send a message | direct | 2 | OK |
| View contacts | direct | 1 | OK |
| Check billing | direct | 2 (Settings > Billing) | Could be 1 click |
| Configure chatbot | direct | 1 | OK |
| Register for TCR | direct | 1 | OK |
| Create a tenant | sp_admin | 2 | OK |
| View tenant hierarchy | sp_admin | 1 | OK |
| **Review TCR submissions** | sp_admin | **No nav entry** | BUG — TCR Queue route exists but no nav item |
| Configure platform plans | sp_admin | 1 | OK |
| View action board | sp_admin | 1 | OK |
| **Upload KB document** | sp_admin | **No standalone nav** | Accessed via AIChatbot > KB tab (2 clicks, OK) |
| **NL Campaign Builder** | all | **No nav entry** | DEAD — orphaned component |

---

## 7. API Endpoint Safety — Post-P0 Status

### Inbound Channel Handlers

| Handler | SP Catch-All | Cross-Tenant Leak | Status |
|---------|-------------|-------------------|--------|
| Voice inbound | REMOVED | N/A | FIXED (returns "not configured" TwiML) |
| SMS inbound | REMOVED | N/A | FIXED (returns empty TwiML, logs error) |
| WhatsApp (Twilio) | REMOVED | REMOVED | FIXED (returns 200, logs error) |
| WhatsApp (Meta) | Never had one | N/A | Already correct |
| **Voice ai-reply** | STILL PRESENT | Potential | BUG — defaults to SP when ?tenant= missing |
| **Voice voicemail** | STILL PRESENT | Potential | BUG — defaults to SP when ?tenant= missing |

### sendTenantEmail Violations

| File | Issue |
|------|-------|
| `api/send-onboarding-reminder.js` | Uses direct `sgMail.send` bypassing sendTenantEmail |
| `api/cron-stale-leads.js` | Uses direct `sgMail.send` for digest summary email |

---

## Appendix: Files Creating Own Supabase Client

| File | Status |
|------|--------|
| `src/FlowBuilder.js` | ACTIVE — should use shared client |
| `src/DemoMode.jsx` | UNCLEAR — should use shared client |
| `src/ContactManager.jsx` | DEAD CODE — delete |
| `src/NLCampaignBuilder.jsx` | DEAD CODE — delete |

## Appendix: Module Registry vs Reality

`src/lib/modules.js` still lists `ai_omni_digest` module (route: `ai_digest`) with `defaultEnabled: false`. The digest was sunset 2026-05-13 but the module definition persists. A tenant manually enabling it via Modules settings would render the legacy EmailDigest.
