# EngageWorx UI/IA Audit — Findings

Audit date: 2026-05-23
Scope: Every file in `src/`, every file in `api/`, every route in App.jsx, every menu config.
Method: Full code read of every file. No guesses from filenames.

---

## 1. Duplications

### 1.1 Three Branding Editors

| ID | File | Table | Save Method | Personas | UI Style |
|----|------|-------|-------------|----------|----------|
| 51 | `BrandingEditor.jsx` | `tenants` | Direct Supabase update | SP/CSP/Agent (cascading perms) | Dark, multi-field with parent chain |
| 52 | `WhiteLabelBranding.jsx` | `tenant_branding` | Direct (own Supabase client) | SP/CSP | Dark, 8-preset themes + CSS injection |
| 53 | `TenantBranding.jsx` | `tenants` | RPC `update_tenant_branding` | Tenant admin | Light-mode unique style |

**Canonical:** `BrandingEditor.jsx` (id 51) — it has cascading permission enforcement, inherited branding resolution, and is used by TenantManagement (SP), TenantBrandingManager (CSP), AgentPortal, and MasterAgentPortal.

**Migration path:**
- `WhiteLabelBranding.jsx` (52) writes to a *different table* (`tenant_branding`) which nothing else reads consistently. Its theme presets and CSS injection features should be merged into BrandingEditor or a new "Advanced Branding" tab. The standalone Supabase client must be removed.
- `TenantBranding.jsx` (53) is embedded in Settings.js branding tab. Replace with a simplified render of BrandingEditor, inheriting its permission model. Update Settings.js refs.

### 1.2 Two AgentInbox Components — Both Dead

| ID | File | Architecture | Data |
|----|------|-------------|------|
| 86 | `src/AgentInbox.jsx` | Inline UI + ThemeContext | MOCK_TICKETS / MOCK_AGENTS (hardcoded) |
| 87 | `src/components/AgentInbox.jsx` | ChatThread/ChatInput primitives | Identical MOCK_TICKETS / MOCK_AGENTS |

**Neither is imported by App.jsx or any other file.** Both are mock-only prototypes. The HelpDeskModule (id 20) serves the actual support inbox function.

**Action:** Delete both files. If an agent-specific inbox is needed in the future, build on HelpDeskModule.

### 1.3 LiveInbox v1 vs v2

| ID | File | Status |
|----|------|--------|
| 89 | `src/LiveInbox.js` | **Dead.** Not imported anywhere. |
| 19 | `src/components/LiveInboxV2.js` | **Active.** Imported by App.jsx as `LiveInbox`. |

**Action:** Delete `src/LiveInbox.js`. Its demo data (AGENTS, CHANNELS, CANNED_RESPONSES, generateConversations) is copy-pasted identically into LiveInboxV2.

### 1.4 ContactManager.jsx vs ContactsModule.js

| ID | File | Status | Issue |
|----|------|--------|-------|
| 88 | `src/ContactManager.jsx` | **Dead.** Not imported anywhere. | Creates own Supabase client; queries contacts WITHOUT tenant_id filter |
| 18 | `src/ContactsModule.js` | **Active.** Used in all portals. | Comprehensive: companies, VIP, dedup, CSV import, promote-to-lead |

**Action:** Delete `ContactManager.jsx`. It has a multi-tenant safety bug (no tenant_id filter on contact queries, relies entirely on RLS).

### 1.5 Three CSV Import Implementations

| Location | Notes |
|----------|-------|
| `src/ImportLeads.jsx` (id 13) | SP-only, hardcoded to SP_TENANT_ID. CPExpo sequence pre-selected. |
| `src/ContactsModule.js` (id 18) | In-module import tab, tenant-scoped. |
| `src/ContactManager.jsx` (id 88) | Dead code. |

**Canonical:** ContactsModule.js. ImportLeads.jsx serves a different purpose (SP field sales bulk import with sequence enrollment) and should remain but needs to be made multi-tenant safe.

### 1.6 Duplicate Stripe Webhook Handlers

| ID | File | Purpose |
|----|------|---------|
| 114 | `api/billing.js?action=webhook` | Handles Stripe webhook events |
| 115 | `api/stripe-webhook.js` | Handles Stripe webhook events (more comprehensive) |

Both handle `checkout.session.completed` and other Stripe events but with different logic and different tenant creation flows. Only one should be authoritative.

**Canonical:** `api/stripe-webhook.js` (id 115) — it handles more event types and has the AI-personalized welcome email flow.

### 1.7 Two Brand Detection Endpoints

| ID | File | Method |
|----|------|--------|
| 116 | `api/detect-brand.js` | Claude Sonnet AI analysis |
| 117 | `api/detect-branding.js` | Pure HTML parsing (no AI) |

Not true duplicates — `detect-branding.js` is a lightweight fallback. Both are actively used for different callers. Keep both but consider renaming for clarity.

### 1.8 renderContent() in Blog

`Blog.jsx` and `BlogAdmin.jsx` both contain a near-identical `renderContent()` markdown renderer. Extract to a shared utility.

### 1.9 Partially Dead _aiReply.js

`api/_aiReply.js` (id 185) exports AI reply functions, but `sms.js` and `email-inbound.js` have their own inline implementations instead of importing it. The helper is partially dead — either consolidate or remove.

---

## 2. Dead Code Candidates

These have **no callers** (referenced_by empty) AND no route/menu entry:

| ID | File | Reason |
|----|------|--------|
| 86 | `src/AgentInbox.jsx` | Mock-only, not imported by any file |
| 87 | `src/components/AgentInbox.jsx` | Mock-only, not imported by any file |
| 88 | `src/ContactManager.jsx` | Not imported by any file. Full duplicate of ContactsModule.js |
| 89 | `src/LiveInbox.js` | Superseded by LiveInboxV2.js. Not imported anywhere. |

### Legacy (nav removed, code retained, route may still be reachable):

| ID | File | Reason |
|----|------|--------|
| 33 | `src/EmailDigest.jsx` | Nav entry removed per digest sunset 2026-05-13. BUT: route still exists in App.jsx (lines 1850, 2703). Scheduled for Phase 3 cleanup. |
| 90 | `src/digestStore.js` | Only consumed by EmailDigest.jsx. Scheduled for Phase 3 cleanup. |
| 182 | `api/cron-email-digest.js` | No-op handler (retired 2026-05-13) |
| 183 | `api/cron-digest-scheduled.js` | No-op handler (retired 2026-05-13) |
| 188 | `api/_omnichannel-insight.js` | Feeds deprecated `email_actions` table. Still runs on every inbound interaction but downstream consumer (digest email) is retired. |
| 148 | `api/send-digest-reply.js` | Primary consumer (EmailDigest) is sunset. May still be used by LiveInboxV2 for email sends — verify before removing. |

### Unclear (no obvious caller found):

| ID | File | Notes |
|----|------|-------|
| 52 | `src/WhiteLabelBranding.jsx` | No obvious import found in App.jsx or other portals. May be loaded dynamically or orphaned. |
| 55 | `src/ChatbotConfig.jsx` | No obvious import in App.jsx. AIChatbot.js serves the chatbot config role. |
| 70 | `src/DemoMode.jsx` | May be reached from SP portal demo page but MobileDemo.jsx is the actual nav target. |
| 71 | `src/StreamingTest.jsx` | Explicitly marked "NOT production — remove after Phase 2 verification." Reachable only for customer_type=internal in CustomerPortal. |
| 74 | `src/AdminTenants.jsx` | Reachable via `setView("admin_tenants")` but no nav entry points there. Superseded by TenantManagement. |
| 77 | `src/NLCampaignBuilder.jsx` | Creates own Supabase client. No obvious caller found. |
| 84 | `src/admin/TenantKnowledgeDocuments.jsx` | No obvious nav entry or caller found. |
| 128 | `api/create-checkout-session.js` | Possibly superseded by `billing.js?action=checkout`. But App.jsx no_tenant page calls it (line 2175). |
| 185 | `api/_aiReply.js` | Exported functions appear unused by main consumers which have inline implementations. |
| 193 | `api/env-test.js` | Developer debugging endpoint. Should not be deployed to production. |

---

## 3. Persona Leaks

Per Section 2 of the reference doc, feature gates should read `customer_type` from the tenants table. **Never hardcode tenant IDs in feature checks.**

### 3.1 Hardcoded Tenant ID Gating (BUGS)

The SP tenant UUID `c1bc59a8-5235-4921-9755-02514b574387` is hardcoded as a fallback in **18+ API files** and **6+ frontend files**. While it's wrapped in `process.env.SP_TENANT_ID || '...'`, the fallback means any deployment missing the env var silently falls back to a hardcoded UUID.

**Files with hardcoded SP_TENANT_ID:**
- Frontend: Settings.js (3x), PipelineDashboard.jsx, ContactsModule.js, ImportLeads.jsx, LeadScan.jsx, EmailDigest.jsx, MobileDemo.jsx, App.jsx (multiple)
- API: sms.js, twilio-voice.js, email-inbound.js, stripe-webhook.js, billing.js, helpdesk.js, cron-stale-leads.js, cron-signup-recovery.js, cron-tenant-engagement.js, cron-weekly-update.js, cron-health-check.js, intake.js, signup-notify.js, whatsapp.js, tcr-wizard.js, tcr.js, notify-admin.js, improve-draft.js

### 3.2 Hardcoded Sequence ID

`CPEXPO_SEQUENCE_ID = '2cc4658f-46f6-4425-8300-95bc9213b720'` appears in:
- `src/ImportLeads.jsx` (line 4)
- `src/LeadScan.jsx` (line 16)

This is an event-specific sequence UUID baked into the code. Any tenant using Import Leads sees a "CPExpo" badge and pre-selection for this SP-specific sequence.

### 3.3 Forced SP Routing by Phone Number

`api/twilio-voice.js` contains a hardcoded check: if the called number contains `7869827800`, force tenant resolution to SP_TENANT_ID. This should be resolved from the `phone_numbers` table like all other numbers.

### 3.4 Delamere Manor Hardcoded

`api/email-inbound-concierge.js` hardcodes `"Delamere Manor"` as `from_name` for wedding concierge email replies and escalation emails. Should read from tenant/chatbot config.

### 3.5 TenantBrandingManager Permission Bypass

`src/TenantBrandingManager.jsx` (line 53) hardcodes the actor as `{ entityTier: 'csp', isSuperAdmin: false, mspEnabled: true, loaOnFile: true }`, bypassing actual MSP/LOA permission checks. A CSP without LOA on file would still get full branding edit access.

### 3.6 ChatbotConfig tenant_id: null

`src/ChatbotConfig.jsx` saves chatbot config with `tenant_id: null` (line 235). This is a multi-tenant safety concern — the config is not properly scoped. However, this component may not be actively called (see Dead Code section).

### 3.7 StreamingTest Gated by customer_type

`StreamingTest.jsx` is only rendered when `customerType === 'internal'` (App.jsx line 1848). This is a proper use of customer_type gating — not a leak. But the component itself is marked "NOT production."

### 3.8 Auth Gaps on API Endpoints

Many endpoints have **no auth check**: email.js, ai.js, ai-advisor.js, demo-ai.js, contacts.js, helpdesk.js, csp.js, billing.js (non-webhook), sms.js (send/test), invite-tenant.js, invite-member.js. Only ai-stream.js, ai-config-builder.js, and email-setup.js verify JWTs.

---

## 4. Hardcoded Values

Per CLAUDE.md Section 1 Rule 3: "No 'EngageWorx' strings in code. No 'hello@engwx.com' in code. No '+1 786 982 7800' in code."

### 4.1 Email Addresses

| Email | Files |
|-------|-------|
| `hello@engwx.com` | Settings.js, AgentPortal.jsx, EmailDigest.jsx (6x), WelcomeEmailSettings.jsx, ApiDocs.jsx, LandingPage.jsx, LegalContent.js, DemoRequestForm.jsx, EngageWorxDemo.jsx, ContactsModule.js, App.jsx, email-inbound.js, email.js, stripe-webhook.js, twilio-voice.js, csp.js, _aiReply.js, sequences.js |
| `rob@engwx.com` | Settings.js (alert placeholder), ContactsModule.js (blocklist), email-inbound.js (INTERNAL_ADDRS), intake.js (ALERT_EMAIL), demo-ai.js |
| `support@engwx.com` | AUPModal.jsx, LegalContent.js, LandingPage.jsx, ContactsModule.js, email-inbound.js |
| `notifications@engwx.com` | ContactsModule.js, email-inbound.js |
| `privacy@engwx.com` | LegalContent.js |
| `legal@engwx.com` | LegalContent.js |
| `accessibility@engwx.com` | LegalContent.js |

### 4.2 Phone Numbers

| Phone | Files |
|-------|-------|
| `+1 (786) 982-7800` / `7869827800` / `+17869827800` | Settings.js (2x placeholder), AUPModal.jsx, ApiDocs.jsx, LandingPage.jsx, LegalContent.js (6x), EngageWorxDemo.jsx, DemoRequestForm.jsx, App.jsx (no_tenant page), sms.js, twilio-voice.js (force check), _aiReply.js, sms-optin.js, poland-carrier.js, email-inbound.js, stripe-webhook.js, intake.js |
| `+1 (305) 810-8877` | demo-ai.js |
| `+48732080851` | PolandCarrierCard.jsx (placeholder — may be real) |

### 4.3 URLs

| URL | Files |
|-----|-------|
| `portal.engwx.com` | App.jsx (4x), CSPPortal.jsx (3x), AgentPortal.jsx (3x), CreateSandbox.jsx, EngageWorxDemo.jsx, BrandingEditor.jsx, ApiDocs.jsx, LandingPage.jsx, ~30 API files |
| `engwx.com` | Blog.jsx, LandingPage.jsx, AgentPortal.jsx, email-inbound.js, stripe-webhook.js, email.js |
| `calendly.com/rob-engwx/30min` | OnboardingWizard.jsx, PipelineDashboard.jsx, DemoRequestForm.jsx, email-inbound.js, stripe-webhook.js, intake.js |
| `calendly.com/rob-engwx/cpexpo-the-venetian` | csp.js |
| `api.engwx.com/v1` | ApiDocs.jsx, Settings.js |
| `docs.engwx.com` | AgentPortal.jsx |
| `track.engwx.com` | EmailTrackingInstructions.jsx, email-setup.js |
| `inbound.engwx.com` | email-forwarded-inbox.js |

### 4.4 Brand Name "EngageWorx"

Appears in customer-facing contexts in: AUPModal.jsx, AdminTenants.jsx, Settings.js, AIChatbot.js, CampaignsModule.js, PipelineDashboard.jsx, SequenceBuilder.jsx, LeadScan.jsx, NLCampaignBuilder.jsx, ApiDocs.jsx, LandingPage.jsx, Blog.jsx, EngageWorxDemo.jsx, CreateSandbox.jsx, BrandingContext.js, plus nearly every API file's email templates and system prompts.

### 4.5 Personal Names

| Name | Files |
|------|-------|
| `Rob Mumby` | AIChatbot.js (sigFromName default), stripe-webhook.js (welcome email signature), intake.js (email signature) |
| `Rob at EngageWorx` | WelcomeEmailSettings.jsx (placeholder) |
| `Aria` | OnboardingWizard.jsx, BrandingContext.js, twilio-voice.js (default bot name) |

### 4.6 Vendor Names in Customer-Facing UI

| Vendor | File | Context |
|--------|------|---------|
| Supabase | CreateSandbox.jsx | "Assign a phone number in Supabase" — visible to admin users |
| Stripe Identity | FeatureGate.jsx (KycStartBanner) | "Powered by Stripe Identity" — visible to all tenants |
| MoneyPenny | EngageWorxDemo.jsx | Competitor name in demo narration |

### 4.7 Stripe Price IDs

`api/billing.js` contains 14 hardcoded Stripe price IDs. Should be in platform_config or env vars.

### 4.8 Plan/Pricing Data

PLAN_MRR maps are duplicated across 4 files with **inconsistencies**:
- `AgentPortal.jsx`: 8 plans (starter through diamond)
- `MasterAgentPortal.jsx`: 8 plans (same)
- `HierarchyView.jsx`: 8 plans (both cases: Starter + starter)
- `CustomerSuccessDashboard.jsx`: 4 plans only (missing silver/gold/platinum/diamond)

PLAN_LIMITS in `CustomerSuccessDashboard.jsx` are hardcoded with a TODO to read from `tenants.message_limit`.

---

## 5. Settings Sprawl

### 5.1 Email Settings

| Location | What's configured |
|----------|------------------|
| Settings.js > channels > Email | From email, SMTP/Resend config, email tracking slug, sending domain |
| Settings.js > channels > Email sub-components | EmailSetupWizard (domain setup), EmailTrackingInstructions (BCC tracking), WelcomeEmailSettings (welcome email config) |
| Platform Settings (App.jsx inline) | Welcome email subject/HTML templates, from email |
| CSP Platform Settings (CustomerPortal inline) | Welcome email subject/HTML template overrides |

**Issue:** Welcome email config lives in three places: WelcomeEmailSettings component (saves to `tenants` table fields), SP Platform Settings (saves to `platform_config`), and CSP Platform Settings (saves to per-tenant override). The resolution order is unclear.

### 5.2 SMS / TCR Settings

| Location | What's configured |
|----------|------------------|
| Settings.js > channels > SMS | Twilio credentials, phone number, messaging service SID |
| Settings.js > channels > Voice | Same Twilio credentials (shared config) |
| RegistrationsPage > TCR tab | TCR brand + campaign registration |
| TCRQueue (SP admin) | TCR submission review + Twilio submission |
| CSPSMSRegistration | CSP's own TCR + child tenant TCR monitoring |

**Issue:** Twilio credentials appear in both SMS and Voice channel configs. BYOC (Bring Your Own Carrier) fields are gated by `spOnly` but the gate is a UI-only flag on the field definition, not a server-side check.

### 5.3 Branding Settings

| Location | What's configured |
|----------|------------------|
| Settings.js > branding tab | TenantBranding (simple form) |
| BrandingEditor.jsx | Full cascading editor (used in TenantManagement, Agent/MasterAgent portals) |
| WhiteLabelBranding.jsx | Theme presets, CSS injection, powered-by toggle (unclear caller) |
| OnboardingWizard step 2 | Brand colors, logo, AI auto-detect |
| TenantManagement inline | Website URL + auto-detect + BrandingEditor |

**Issue:** Five places to configure branding. Three different components. Two different tables (`tenants` vs `tenant_branding`). A tenant admin could set branding in Settings, then an SP admin could override it in TenantManagement, with no conflict resolution or audit trail.

### 5.4 Billing Settings

| Location | What's configured |
|----------|------------------|
| Settings.js > billing tab | Subscription status, plan, usage meters, Stripe portal link, top-ups |
| Platform Settings > Plans | Plan definitions (slug, price, limits, customer_types) |
| TenantManagement > Configure | Per-tenant plan assignment, message/contact/seat limits |

**Issue:** Plan limits can be set at the platform level (Platform Settings) and overridden per-tenant (TenantManagement Configure). The precedence between `platform_config.plans[].message_limit` and `tenants.message_limit` is resolved at save time in `handleSaveTenantConfig`, but there's no UI indication of which value is the override vs the default.

### 5.5 Channel Configuration

| Location | What's configured |
|----------|------------------|
| Settings.js > channels | SMS, Email, WhatsApp, RCS, Voice, MMS — each with sub-panels |
| TenantManagement > Configure > Active Channels | Channel toggle checkboxes |
| OnboardingWizard steps 3-5 | Email, AI, WhatsApp setup |
| WhatsAppEmbeddedSignup | WhatsApp via Meta Embedded Signup |
| PolandCarrierCard | Poland-specific carrier |

**Issue:** Channel enable/disable lives in TenantManagement (writes `channel_configs.enabled`) AND in Settings.js channel tabs (also writes `channel_configs`). Both write to the same table but use different UI patterns and different loading flows.

### 5.6 User / Team Management

| Location | What's configured |
|----------|------------------|
| Settings.js > team tab | List members, roles, notification prefs |
| TenantManagement > Configure > Add Team Member | Inline invite with temp password |
| Platform Settings > Customer Type Options | Customer type labels for invite flow |

**Issue:** Team member invitation happens in two different UIs: Settings team tab uses a full panel, TenantManagement uses an inline row. Both call `/api/invite-member`. The Settings team tab is per-tenant (tenant admin can manage their own team), while TenantManagement is SP-scoped (SP admin adds members to any tenant).

---

## 6. Navigation Depth

### Primary tasks and their click depth per persona:

| Task | Primary Persona | Clicks from Login | Notes |
|------|----------------|-------------------|-------|
| Send a message | direct | 2 (sidebar → Live Inbox → compose) | OK |
| View contacts | direct | 1 (sidebar → Contacts) | OK |
| Check billing | direct | 2 (sidebar → Settings → Billing tab) | Billing is a tab inside Settings, not a top-level nav item. Could be 1 click. |
| Configure chatbot | direct | 1 (sidebar → AI Chatbot) | OK |
| Register for TCR | direct | 1 (sidebar → Registrations) | OK |
| Create a tenant | sp_admin | 2 (sidebar → Tenant Management → Invite Tenant) | OK |
| View tenant hierarchy | sp_admin | 1 (sidebar → Hierarchy) | OK |
| Review TCR submissions | sp_admin | No nav entry (tcr-queue route exists but no nav item) | **BUG: TCR Queue has no nav entry.** Must navigate programmatically. |
| Configure platform plans | sp_admin | 1 (sidebar → Platform Settings) | OK |
| View action board | sp_admin | 1 (sidebar → Action Board, superadmin only) | OK |
| Manage CSP sub-tenants | csp_partner | 2 (sidebar → Tenant Management → select tenant) | OK |
| View agent commissions | agent | 1 (sidebar → Commissions) | OK |
| Upload KB document | sp_admin | No nav entry found | **TenantKnowledgeDocuments.jsx has no obvious route or nav item.** |
| Email digest (legacy) | sp_admin | Route exists but no nav entry | Correct per sunset plan |
| NL Campaign Builder | all | No nav entry found | **NLCampaignBuilder.jsx has no obvious route or nav item.** |

### Click depth concerns:
- **Billing** for direct tenants is 2 clicks (Settings → Billing tab) when it could be a top-level nav item. The navMenu.js doesn't include billing as a standalone item.
- **TCR Queue** (SP admin) is unreachable from the sidebar. It should be nested under Registrations or added as a superadminOnly nav item.
- **TenantKnowledgeDocuments** and **NLCampaignBuilder** appear to be orphaned components with no navigation path.

---

## Appendix: Files Creating Own Supabase Client

These files create their own `createClient()` instead of importing from `src/supabaseClient.js`, violating the single-instance pattern documented in CLAUDE.md Section 9:

1. `src/ChatbotConfig.jsx`
2. `src/WhiteLabelBranding.jsx`
3. `src/FlowBuilder.js`
4. `src/ContactManager.jsx` (dead code)
5. `src/DemoMode.jsx`
6. `src/NLCampaignBuilder.jsx`

## Appendix: Module Registry vs Reality

`src/lib/modules.js` lists `ai_omni_digest` module (route: `ai_digest`) with `defaultEnabled: false`. The digest has been sunset (CLAUDE.md confirms nav removed 2026-05-13), but the module definition remains in the registry. If a tenant manually enables it via the Modules settings tab, the route would render the legacy EmailDigest component.
