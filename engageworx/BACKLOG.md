# Platform Backlog

Captured technical debt, known bugs, deferred work, and process improvements. 
Update as items are completed (mark Status: Done with completion date) or closed.

---

## PLATFORM-AI-KNOWLEDGE-FEEDBACK-LOOP (P1)

Origin: Darren/Michelle at Delamere May 29 — manually answering the same questions
across couples is wasted effort. The AI doesn't carry knowledge from one couple's
exchange to another's.

Core problem: each new couple's question goes through the AI fresh. No mechanism for
"we already answered this brilliantly for couple A — reuse that for couple B."

Investigation findings (2026-05-29):
- wedding_kb_articles IS populated (28 articles for Delamere, ~9.5K chars total)
- Retrieval IS wired up: wedding-concierge.js loads all published KB articles and
  injects into system prompt as full-context (not top-k semantic search)
- Current approach: full injection works at 28 articles but won't scale past ~50
- System prompt is strong (7K chars, Cheshire voice, scope limits, escalation rules)
- Gap is KB CONTENT (no cross-couple patterns) and CAPTURE WORKFLOW (no way for
  Darren to promote a good reply into a KB article from Live Inbox)

PHASE 1 — Retrieval upgrade (current: full injection → target: semantic top-k):
- Embed KB articles via text-embedding-3-small (or equivalent)
- On inbound: embed question, retrieve top-k relevant articles
- Include retrieved articles in prompt context instead of all articles
- Scales to 500+ articles per tenant without prompt bloat

PHASE 2 — Knowledge capture workflow (highest impact, build first):
- Live Inbox: "Add to KB" action on any sent message
- Pre-fills modal with Q (inbound) + A (outbound) as draft KB article
- Darren edits title/content, confirms → inserts wedding_kb_articles row
- Auto-suggest "FAQ candidate" when same question pattern recurs across couples
- Bulk KB seeding via document upload (FAQ doc, venue handbook)

PHASE 3 — KB management UI:
- Admin view to browse, edit, deactivate KB articles
- Usage stats: retrieval frequency, question types, AI confidence
- Version control for article edits

PHASE 4 — Quality improvement loop:
- Capture manual overrides/corrections as improvement signals
- Use corrections to update KB articles or flag low-quality retrievals
- Every human correction makes AI better for next couple

Generalises to non-wedding tenants — same RAG loop for helpdesk surface.
Delamere is the test case: Darren is willing, use case is concrete, 28 articles
already seeded.

Supersedes: PLATFORM-DELAMERE-CONCIERGE-INTELLIGENCE-UPGRADE (fold in here)

**Found**: 2026-05-29 during Delamere concierge intelligence investigation
**Priority**: P1 — make-or-break for AI ROI in customer eyes
**Status**: Open — Phase 1 confirmed working (full injection), Phase 2 is next build
**Sequencing**: Phase 2 first (capture workflow delivers 80% of value), then Phase 1
upgrade (semantic retrieval), then Phases 3-4

---

## PLATFORM-ISSUE-CAPTURE-INTERFACE (P1)

Phase 1 COMPLETE (PRs #68/#69/#70): SA floating 🚩 button, capture modal with
auto-context, Platform Issues page with filters + inline triage,
api/platform-issues.js, platform_issues table with SA-only RLS. SAFlagButton
extracted as reusable component, renders in SP shell + tenant drilldown.
Live in production 2026-05-30/31.

RENDER CONDITION MATRIX (source of truth for all phases):
- SA + SP shell → render, no tenant context (Phase 1 DONE)
- SA + tenant drilldown → render, capture drilled tenant UUID (Phase 1 DONE, PR #70)
- Tenant admin + their own portal → render, capture their tenant_id (Phase 2)
- CSP admin + CSP dashboard → render, capture CSP tenant UUID (Phase 3)
- CSP admin + tenant drilldown → render, capture drilled tenant UUID (Phase 3)
- Anyone else → don't render

Phase 2 — Tenant admin access (scope refined Rob May 31, build mid-week):

Capture:
- Floating 🚩 button visible to tenant admins (role check on tenant_members)
- Modal scoped to their tenant — tenant_context_id auto-set from session
- Tenant categories (simpler): broken / confusing / missing feature / looks wrong
- Design render-condition alongside role detection so Phase 3 reuses cleanly

Tenant visibility ("My Feedback" or "Reported Issues" — label TBD):
- Tenant Portal sidebar item for their submissions
- List view: description, category, status badge, created_at
- Expanded view: full description, status, public_notes (SA-written), their
  own append history
- Can append additional context (timestamp-prefixed, append-only)
- Notification email on status → fixed/wontfix via Resend
- Per-tenant notification toggle in settings (default ON)

What tenants DON'T see:
- Other tenants' issues (RLS)
- Severity column (SA-internal triage)
- internal_notes (SA working notes)
- reporter_user_id

Schema refinement — split notes into three fields:
- internal_notes (text) — SA working notes, never visible to tenant
- public_notes (text) — SA-written updates visible to tenant ("Resolved in
  update June 3rd", "Investigating with engineering")
- tenant_notes (text) — tenant's own append-only context, timestamp-prefixed
Migration: rename existing 'notes' → 'internal_notes', add public_notes +
tenant_notes columns (nullable, no breaking change)

SA triage UI refinement:
- Two note areas in expanded issue: "Internal Notes" (default) + "Public Update"
- Default to internal (most notes are working notes)
- "Add public update" action explicitly writes to public_notes
- Optional "Send notification" checkbox when writing public update — fires email
  to tenant admin with the update text

RLS changes for Phase 2:
- Tenant admin SELECT via view (tenant_visible_issues): exposes description,
  category, status, public_notes, tenant_notes, created_at, updated_at.
  Excludes: severity, internal_notes, reporter_user_id.
  WHERE tenant_context_id = their tenant_members.tenant_id
- Tenant admin INSERT: WITH CHECK tenant_context_id = their tenant_members.tenant_id
- Tenant admin UPDATE: tenant_notes column only on their own issues
- SA policy unchanged (sees everything via platform_issues directly)

Phase 3 — CSP access (deferred until CSP-side flagging is meaningful):
- CSP admins see all issues for downstream tenants
- "is CSP admin?" role check (entity_tier or similar)
- CSP dashboard + CSP drilldown both render button
- CSP drilldown may render same as SA drilldown but with CSP-scoped RLS query
- Can add notes/triage suggestions, cannot see other CSPs' tenants

Phase 4 — AI-assisted triage (deferred):
- Claude suggests priority based on description + context
- Duplicate detection, backlog item linking

**Found**: 2026-05-30
**Priority**: P1 — path from internal bug tracker to customer feedback channel
**Status**: Phase 1 complete (SP shell + drilldown). Phase 2 scoped, Monday design,
mid-week build.

---

## PLATFORM-AI-CHATBOT-MODULE-IA-CONSOLIDATION (P2)

AI Chatbot module configuration is scattered across multiple locations. Observed
Sunday May 31 (3 platform_issues rows filed):

1. Knowledge Base management exists in both AI Chatbot module AND Settings —
   should consolidate into AI Chatbot
2. Escalation Rules live in Settings — should move into AI Chatbot (chatbot
   behavior config, not general settings)
3. AI Chatbot > Analytics tab is blank — either wire up with chatbot-specific
   metrics (resolution rate, escalation rate, response time, KB hit rate) or remove

Underlying principle: "AI Chatbot module should own ALL chatbot configuration."
Tenant admins shouldn't hunt across Settings to configure their bot.

Scope:
- Audit ALL AI-Chatbot-related config surfaces across the platform
- Identify canonical location for each (probably AI Chatbot module for most)
- Plan migration that doesn't break existing user flows (redirects from old
  Settings paths to new AI Chatbot paths)
- One coherent PR that consolidates

Sub-decisions needed:
- Shared infrastructure config (channel_configs, signatures) — probably stays in
  Settings since those affect more than just the chatbot
- Does Analytics tab make sense as chatbot-specific KPIs? Or remove and rely on
  Global Analytics?
- Should "Knowledge Base" be a top-level nav item separate from AI Chatbot?
  Or always nested?

**Found**: 2026-05-31 during Sunday morning platform walkthrough
**Priority**: P2 — IA quality, not blocking functionality
**Status**: Open — post-Phase-2 issue capture, likely next week
**Timing**: After PLATFORM-ISSUE-CAPTURE Phase 2 ships

---

## PLATFORM-STRATEGIC-PLAN-MAINTENANCE (P2)

May 27 handoff doc described 6-PR surface refactor (PRs 2-6 planned). Friday's
hot-fix to email-inbound-concierge.js for hello@engwx.com partially completed
PR 4's scope tactically (hardcoded CONCIERGE_SURFACES array instead of DB lookup
against tenant_ai_surfaces table from PR #46). Strategic plan wasn't updated.

Pattern: tactical P0/P1 fixes obsoleting strategic plans without formal update,
causing drift between "what's planned" and "what's actually built."

Mitigation:
- After any hot-fix that touches a system on a planned refactor path, update the
  strategic plan or close the relevant planned item
- Handoff docs are living documents, not static snapshots
- When a backlog item is partially addressed by emergency work, update its status
  to reflect what's done vs remaining (not just "Open")
- Surface refactor current state: PR #46 (schema) done, PR 4 (handler generics)
  partially done via PRs #64/#66, PRs 2/3/5/6 untouched

**Found**: 2026-05-30 during Sunday morning state check
**Priority**: P2 — process improvement, not blocking
**Status**: Open — update handoff doc and surface refactor plan to reflect current state

---

## PLATFORM-SA-OVERVIEW-DATA-WIRING (P1)

SA Platform Overview shows misleading data — first screen SAs see on login:
- Tenant list: query has race/auth-resolve bug, returns empty ("No tenants yet"
  despite 13+ tenants). useLiveData runs before isSuperAdmin resolves.
- Stat cards: totalMessages, totalRevenue, totalCampaigns hardcoded to 0 in
  useLiveData (lines 153-155). Never wired to real queries. Only activeCustomers
  has a real count (but fails when tenant list is empty).
- Channel Usage: hardcoded placeholder percentages (42/24/18/8/5/3) with no
  demoMode guard. Renders in live mode as if real. RCS at 5% with zero RCS
  implementation. Most misleading element.
- Tenant Comparison: implemented but starved — maps customer.stats.revenue which
  doesn't exist on liveTenants objects.

Fix sequence:
1. IMMEDIATE: hide Channel Usage when !demoMode (fake data on live screen)
2. Fix tenant list race: ensure useLiveData re-fetches after auth resolves
3. Wire totalMessages: aggregate from messages table
4. Wire activeCustomers: standalone count, not dependent on tenant list loading
5. DEFERRED: revenue wiring (Stripe integration), campaign count, Tenant Comparison

Root cause: screens built with stub data and never wired to production. Missing
build-step: verification that features show real data, not scaffolding.

**Found**: 2026-05-30 during SA Platform Overview investigation
**Priority**: P1 — SA's primary dashboard is non-functional in live mode
**Status**: Open — CSPPortal confirmed clean (separate audit), SA-only issue

---

## PLATFORM-KB-BUTTON-AI-REPLY-FILTER (P3 — verify)

Report: "Add to KB" button renders on AI-generated replies. Investigation shows
the filter IS implemented (line 1498: returns undefined when msg.metadata.botName
is truthy). DB confirms clean split: sender_type='bot' for AI (39 msgs),
sender_type='agent' for human (2 msgs). isBot flag maps correctly.

Code logic appears correct. If observed in browser, likely an edge case:
- A message with unexpected sender_type (not 'bot' or 'agent')
- A message where sender_type was null/missing at insert time

Action: verify in browser on Delamere conversations. If the button appears on a
message that has the AI Assistant label, inspect that message's sender_type in DB.
If code is working correctly, close as verified.

**Found**: 2026-05-30 during KB feature review
**Priority**: P3 — filter logic is implemented, needs browser verification only
**Status**: Open — verify post-deploy

---

## PLATFORM-KB-ADD-BUTTON-MOBILE-UX (P3)

"Add to KB" button uses opacity-on-hover for visibility. On touch devices with no
hover state, behavior may be either always-50% (too subtle) or always-100% (too
prominent). Verify on mobile after first deploy, adjust if needed. Acceptable
trade-off for v1 since admin use of Live Inbox is largely desktop.

**Found**: 2026-05-30 during KB feedback loop build
**Priority**: P3 — cosmetic, desktop-primary feature
**Status**: Open — verify post-deploy on mobile

---

## PLATFORM-SA-TENANT-DRILLDOWN-CONTEXT (P1)

When SA "View Portal" drills into a tenant, some components query the SA's home tenant 
instead of the drilled-into tenant. Observed today on LiveInbox: 
chatbot_configs?tenant_id=c1bc59a8-... (EngageWorx) fires when viewing Delamere 
(should be 2e057a7a-...).

Same class of bug as Sunday's KB editor tenant resolution (fixed in PR #36 by passing 
tenantId as prop through the component chain).

**Affected**: KBArticleEditor (fixed), LiveInbox (in flight today), likely others
**Audit needed**: every component used in SA drill-down view should receive tenantId 
as prop from parent and use that, not infer from SA's session
**Found**: 2026-05-27 during LiveInbox TDZ debugging  
**Priority**: P1
**Status**: Open

---

## PLATFORM-MIGRATION-SYSTEM-AUDIT (P2)

Two parallel migration application paths exist in this project:
- `supabase_migrations.schema_migrations` tracker (6 entries, May 5-18, mostly abandoned)
- Direct SQL Editor / manual application (all migrations May 24 onward, bypassing tracker)

Need to formalise a single process going forward. Decisions to make:
- Continue with sequential numbered files (018, 019, ...) and skip the tracker
- Or adopt Supabase CLI / timestamp-versioned files with tracker
- Either way, document the process in CLAUDE.md so future contributors and AI 
  assistants don't create more parallel systems

Duplicate file cleanup completed in PR #50 (018-021 renumbered to 032-035).

**Found**: 2026-05-27 during migration file duplicate cleanup
**Priority**: P2 (not blocking, but should be resolved before more tenants onboard)
**Status**: Open

---

## PLATFORM-AI-PERSONA-STUDIO-UI (P2)

Build the Studio UI to edit the 5 structured AI persona fields (ai_persona, ai_voice, 
ai_scope, ai_escalation_instructions, ai_custom_instructions) plus coordinator_names. 
Foundation work (Migration 028 + assemble-system-prompt.js assembler with && gate) 
already merged. Closing PR #31 left this work paused.

Scope when picked up:
- Editor cards in AI Chatbot Studio for each field
- Persona/voice/scope templates as starting points
- Validation: assembler activates only when ALL 5 populated
- Migration path for tenants with legacy prompts: extract sections into structured 
  fields, preserve the working tone
- Coordinator names as comma-separated input
- Preview pane showing assembled prompt before save

**Found**: 2026-05-27 during PR #31 close
**Priority**: P2 — legacy prompts work; this is upgrade work, not fix work
**Status**: Open — picks up when Studio UX gets a focused session

---

## PLATFORM-OUTBOUND-EMAIL-FROM-NAME-AUDIT (P2)

Verify outbound email From Name behaviour across all tenants. PR #33 was closed as 
stale; some of its scope (channel_configs.config_encrypted.from_name as authoritative 
source for sendTenantEmail) may not have been independently addressed. Audit: send a 
test outbound from each tenant, confirm From Name matches channel_configs setting. If 
broken, implement as focused new PR.

**Found**: 2026-05-27 during PR triage
**Priority**: P2 (cosmetic, not blocking)
**Status**: Open — audit needed

---

## PLATFORM-AI-REVIEW-NOTIFICATION-PATH (P1)

EngageWorx tenant (and any tenant using email-inbound.js) — when Claude classifies 
inbound as action: "review", the action_items row is created silently. No email, no 
Slack, no in-portal badge, no digest. Coordinator must manually open Action Board to 
discover items.

Confirmed gap: the retired digest crons (cron-email-digest.js, cron-digest-scheduled.js) 
were sunset per "AI Omni Digest sunset" in CLAUDE.md. The notification layer that was 
supposed to replace them was stubbed (line 576 of email-inbound.js has 
'[Reactivate] ADMIN NOTIFY (not sent)' placeholder) but never built.

Build options:
- Minimum: in-portal unread badge on Action Board nav item (1-2 hours)
- Better: daily digest email to tenant admin summarising pending review items (4-6 hours)
- Best: configurable per-tenant notification (badge + optional daily/weekly digest + 
  optional Slack), with severity thresholds (4-8 hours)

**Found**: 2026-05-27 — Rob confirmed he doesn't monitor EngageWorx or Delamere Live 
Inbox daily, meaning silent review items currently rely on monitoring habit that 
doesn't exist.
**Priority**: P1
**Status**: Open

---

## PLATFORM-ACTION-BOARD-ACTIONABILITY (P2 — downgraded)

AUDIT COMPLETE — board is already a functional queue (send via direct + Gmail Drafts, 
edit, dismiss, snooze, proper status lifecycle with CHECK constraint). Tier 2 mostly 
already built. Only gap: reassignment.

Tiers:
- Tier 1 (discoverability): unread badge SHIPPED (PR #56) + notification path 
  (see PLATFORM-AI-REVIEW-NOTIFICATION-PATH)
- Tier 2 (actionability): send/edit/dismiss/snooze ALL EXIST. Only missing: 
  reassignment (see PLATFORM-ACTION-BOARD-REASSIGNMENT below)
- Tier 3 (intelligence): priority sorting, grouping, SLA/age indicators, bulk actions 
  — deferred, not blocking

**Found**: 2026-05-27 — Rob asked whether Action Board needs further functionality work.
**Priority**: P2 — downgraded from P1 after audit confirmed existing capabilities.
**Status**: Audit complete 2026-05-28. Remaining scope is reassignment only.

---

## PLATFORM-ACTION-BOARD-REASSIGNMENT (P2)

Action Board has no way to reassign an action_item to a different team member (no UI, 
no endpoint to change user_id). All items assigned to first admin tenant member at 
creation. Matters for multi-member tenants (e.g. Delamere: Emma + Darren) where one 
person should hand an item to another. Build: reassign dropdown listing tenant_members 
+ endpoint to update user_id + audit-trail entry.

**Found**: 2026-05-28 during Action Board actionability audit
**Priority**: P2 — only relevant for multi-member tenants actively sharing the board
**Status**: Open

---

## PLATFORM-AI-CONCIERGE-QUALITY-AUDIT-LAYER (P2)

Delamere concierge (email-inbound-concierge.js) always sends a reply for RESOLVED and 
PENDING classifications. No human audit layer — coordinator only learns the AI gave a 
poor answer if the couple complains or if the coordinator manually reads Live Inbox.

For wedding planning where precision matters (dates, costs, supplier names, dietary 
requirements), wrong-but-confident AI answers could cause real problems.

Build options:
- Optional human-review queue: tenant can flag certain conversation patterns 
  (high-stakes keywords, first-contact emails, end-of-engagement) for coordinator 
  review BEFORE the AI reply sends
- Coordinator-side audit: daily digest of recent AI replies for spot-checking 
  (lower urgency than pre-send)
- Couple satisfaction signal: thumbs-up/down in the email itself, low-rated responses 
  bubble up to coordinator attention

**Found**: 2026-05-27 — surfaced during PR #54 verification when discussing 
notification paths.
**Priority**: P2 (concierge currently works well, but worth designing before scaling 
to more couples or venues)
**Status**: Open

---

## PLATFORM-CONFIGURABLE-PIPELINE-STAGES (P1)

STRATEGIC CONTEXT: Immediate revenue opps are Dean's Dental (dental practice) and 
Conecta (CSP) — both NON-SaaS, both prove the multi-vertical case. Delamere uses GHL 
for their pipeline and likely WON'T use the EngageWorx pipeline — so Delamere is NO 
LONGER the first test case. First test case = Dean's Dental; second = Conecta. The 
AI-assisted build ("describe your business → AI builds your pipeline") is a SELLING 
POINT, positioned against GHL's manual setup — so AI proposal quality must be high 
(feels like polishing, not repairing).

BUILD PHASING:
Phase 1 (deterministic foundation, no AI): validation layer (1 lead / >=1 closed_won / 
>=1 closed_lost / clean display_order) + stage CRUD endpoints + editor UI with two 
guards (structural-type protection; delete-safety: block delete of non-empty stage or 
force move-leads-to-[stage] first, since no FK on leads.pipeline_stage_id). AI output 
flows THROUGH this. Build + test standalone.

Phase 2 (AI layer): business description (or reuse detect-brand.js) → AI proposes 
stages + suggested stage_type → validation layer checks/corrects (AI never writes 
pipeline_stages directly) → human review/tweak → confirm → seedPipelineStages writes. 
Use few-shot vertical exemplars (dental, CSP, restaurant, SaaS) for proposal quality — 
NOT rigid templates.

Phase 3 (demo polish): make Phase 2 sellable — the "watch it build itself" moment 
for prospects like Dean.

Investigation findings (2026-05-28):
- pipeline_stages IS already per-tenant (tenant_id NOT NULL, UNIQUE(tenant_id, stage_key))
- All business logic keys off stage_type NOT stage names — renames safe
- No second stage source (funnel in screenshots is Delamere's external CRM, not platform)
- No sub_stage uniqueness constraint — many 'active' stages fine
- display_order freely rewritable, no gaps constraint
- Seed-at-creation fixed in PR #58 (new tenants get default 7 SaaS stages)
- Backend-required stage_keys: 'lead' (12 refs), 'closed_won' (3), 'closed_lost' (3). 
  Middle stages free to rename/remove — backend degrades gracefully
- No CRUD endpoint for stages yet — needs building

**Found**: 2026-05-28
**Priority**: P1 — direct selling point for active revenue opps (Dean's Dental, Conecta)
**Status**: Spec ready. Phase 1 is the next build. No code yet.

---

## PLATFORM-WHATSAPP-FINISH (P2, gap #1 is P1)

INVESTIGATION COMPLETE — WhatsApp is ~80% built, needs finish + test (~2-3 days).

Built already:
- Embedded Signup UI (WhatsAppEmbeddedSignup.jsx) — full Facebook OAuth flow
- Backend signup (api/whatsapp-signup.js) — code exchange, WABA discovery, phone 
  fetch, webhook subscription, credential storage
- Credential verification (api/whatsapp-verify.js)
- Template management with AI drafting + Meta submission/approval sync 
  (api/whatsapp-templates.js + WhatsAppTemplatesTab.jsx)
- Provisioning tracking (api/whatsapp-provisioning.js)
- Wired into Settings.js:1410
- Self-serve WABA onboarding is DONE — needs testing/polish, not greenfield

Three gaps to close:
1. [P1] 24h session window NOT enforced — free-text sends after 24h fail SILENTLY 
   (already flagged P1 in CLAUDE.md). WhatsApp requires approved template outside 
   24h window; current code drops the message with no error. Silent data-loss bug. 
   Fix: detect last-inbound timestamp, force template path outside 24h, surface 
   error if no template.
2. Template send routed via Twilio, not Meta Cloud API — reconcile (templates 
   submitted/approved via Meta but sent via Twilio = inconsistency).
3. Optimistic message status — marks delivered before send confirms; UI misreports 
   delivery.

Dual code path duplication: meta-whatsapp.js (Meta direct, 235 lines) vs whatsapp.js 
(Twilio+Meta dual, 747 lines). Both handle inbound + AI reply. Consolidation needed.

**Found**: 2026-05-28
**Priority**: P2 overall, but gap #1 (24h silent failure) = P1 standalone
**Status**: Investigation complete, ready to build

---

## PLATFORM-RCS-INTEGRATION (P3 — deferred)

Pure greenfield — zero implementation. Only marketing copy and channel icon placeholders.

Path: Twilio → Google RBM (Rich Business Messaging). Requires:
- Google brand/agent registration per business
- Carrier approval (multi-week per brand, not self-serve)
- RCS availability inconsistent by carrier/device/region
- UK penetration unverified

DEFER — validate demand + UK RCS reach before any build investment. The send API 
is similar to SMS via Twilio (they abstract it), but onboarding is heavy and 
per-tenant registration is a manual multi-week process.

**Found**: 2026-05-28
**Priority**: P3 — decision gate: confirm real demand + UK RCS reach first
**Status**: Deferred — no build until demand validated

---

## PLATFORM-PIPELINE-BULK-LEAD-REASSIGN (P3)

The stage editor's delete-safety 409 sends users to move leads one-at-a-time via 
the lead detail modal. For a stage with many leads that's heavy friction. Add a bulk 
"move all leads from stage X to stage Y" action — either in the editor's 
blocked-stage error UI or the Pipeline view.

**Found**: 2026-05-28 during Phase 1 Part B review
**Priority**: P3 — works today, friction only at scale
**Status**: Open

---

## PLATFORM-LIGHT-MODE-LOGO-ASSETS (P2)

White-on-transparent logo PNGs (uploaded via brand_logo_url) vanish on light backgrounds.
BrandLogo.jsx correctly handles text-logo and default EngageWorx paths (fixed in PR #62),
but the image-logo path passes the PNG through as-is — no theme awareness.

46 Labs is the first concrete tenant hitting this — white-on-transparent logo designed
for dark mode has low/no contrast on light backgrounds.

Two-path solution:
- Per-tenant: upload two assets (logo_light_url, logo_dark_url) on tenants branding
  fields. BrandLogo.jsx picks based on isDark from ThemeContext.
- Fallback: if only one asset uploaded, use it for both (current behavior preserved)
- UI: branding settings page gains "Logo for light mode" upload field with help text
  explaining when to use it ("Upload a dark-colored version of your logo for use on
  light/white backgrounds")
- Schema: add brand_logo_light_url column to tenants table (nullable, no migration
  impact — existing tenants keep current behavior)

Decision pending: 46 Labs Wednesday call — whether they want platform-level fix or
just upload a second asset manually as interim.

**Found**: 2026-05-28 during light-mode theming fix (PR #62)
**Updated**: 2026-05-30 — upgraded P3→P2 after 46 Labs feedback confirmed real impact
**Priority**: P2 — 46 Labs actively affected, blocks their light-mode rollout
**Status**: Open — waiting on 46 Labs decision (platform fix vs manual asset upload)

---

## PLATFORM-LOGO-SUBTITLE-THEME-AWARE (P3)

"PARTNER PORTAL" subtitle text (or similar tenant-configured subtitle) rendered in a
hardcoded color that vanishes in dark mode for 46 Labs. Same class of bug as the
text-logo fix in PR #62 — needs isDark conditional on the subtitle color.

Audit: find where subtitle text is rendered in BrandLogo.jsx or the portal header
component. Apply same pattern as PR #62: isDark ? '#fff' : '#111827' (or appropriate
muted variant for subtitles).

May be in BrandLogo.jsx (if subtitle is part of the logo component) or in the
CSPPortal/CustomerPortal header layout. Quick grep for "PARTNER PORTAL" or
subtitle-related rendering will locate it.

**Found**: 2026-05-30 during 46 Labs light-mode review
**Priority**: P3 — cosmetic, same fix pattern as PR #62
**Status**: Open

---

## PLATFORM-INBOUND-EMAIL-REGRESSION-AUDIT (P1)

hello@engwx.com worked end-to-end on May 5 via email-inbound.js (SendGrid Inbound
Parse path). Delamere onboarding introduced email-inbound-concierge.js (Resend path)
and silently re-routed inbound infrastructure. Old path broke (SendGrid trial expired,
MX pointing at dead mx.sendgrid.net, Google Workspace routing rule forwarding to
ai@parse.engwx.com which also points at dead SendGrid). No alerts fired. Bug went
undetected for 24 days until Friday May 29.

ROOT CAUSE: no monitoring on primary inbound paths, no integration tests for the
platform's own public address, no change-review process that flagged adding a new
handler should preserve the existing one's behavior.

ACTIONS:
1. Integration test: daily external email to hello@engwx.com, verify AI reply arrives,
   alert on failure (cron + Resend send + webhook check)
2. Code review checklist: "does this change touch a working production path?" —
   add to CLAUDE.md build principles
3. Audit other shared handlers for tenant-specific assumptions that broke generality
   (email-inbound-concierge.js assumed wedding_concierge surface — now fixed in PR #64,
   but pattern may exist elsewhere)
4. Clean up stale DNS: parse.engwx.com and track.engwx.com MX still point at dead
   SendGrid. Google Workspace routing rule for ai@parse.engwx.com should be disabled
   now that hello@inbound.engwx.com path is live.

**Found**: 2026-05-29 during hello@engwx.com inbound investigation
**Priority**: P1 — monitoring gap, not a current outage (fixed in PRs #64/#65)
**Status**: Open — monitoring + cleanup actions pending

---

## PLATFORM-CONCIERGE-HELPDESK-AI-REPLY (P1)

Helpdesk-surface tenants routed through email-inbound-concierge.js hit "No wedding
for sender" and never get an AI reply. The handler's post-resolution logic assumes
wedding_concierge surface: requires weddingId to proceed to AI, falls back to
unrecognised_sender_ticket without it.

Need to branch post-resolution logic by matchedSurface:
- wedding_concierge: existing flow (require wedding, couple resolution)
- helpdesk: skip wedding lookup entirely, go straight to AI with the tenant's
  helpdesk system_prompt. Contact resolution still applies (find-or-create).

Architectural change — the handler currently interleaves wedding-specific logic
throughout steps 4-8. Clean separation needed. Fresh-session work.

**Found**: 2026-05-29 during hello@engwx.com inbound fix
**Priority**: P1 — blocks AI auto-reply for all non-wedding tenants using this path
**Status**: Open — persistence fix shipped (PR #65), AI reply path deferred

---

## PLATFORM-MANUAL-AUTH-USER-CREATION-BROKEN (P1)

Creating an auth user via direct SQL with all five layers present (auth.users,
auth.identities, user_profiles, tenant_members, tenants) — matching an existing working
user's shape exactly — still produces "Database error querying schema" on sign-in.

The normal signup flow does additional steps that manual SQL creation misses. Suspects:
- A trigger on auth.users INSERT that sets up additional GoTrue state (sessions table,
  refresh tokens, MFA factors, or similar)
- RLS policies that require a specific auth context set during the real signup flow
- PostgREST schema cache not recognizing the manually-created user
- auth.users columns with NOT NULL defaults that the real signup path populates but
  our INSERT skipped (phone, banned_until, deleted_at, etc.)

Debug approach (tomorrow):
1. Check GoTrue logs for the specific schema-query failure text
2. Compare ALL columns of auth.users between the new user and Phillip (not just the
   ones we checked — dump the full row diff)
3. Check auth.sessions, auth.refresh_tokens, auth.mfa_factors for rows that exist
   for working users but not the new one
4. Test: create a user via the Supabase Admin API (not SQL) and compare

Affects: SA's ability to verify tenant views, manual user provisioning, debugging
onboarding issues. Likely related to PLATFORM-PASSWORD-RESET-EMAIL-DELIVERY and
PLATFORM-SA-VIEW-AS-USER.

rob+46labs@engwx.com user left in place — do not mutate further until root cause found.

**Found**: 2026-05-28 during 46 Labs admin login attempt
**Priority**: P1 — blocks tenant view verification
**Status**: Open — debug tomorrow with GoTrue logs

---

## PLATFORM-PASSWORD-RESET-EMAIL-DELIVERY (P1)

Password reset emails not arriving. Confirmed broken for Gmail recipients; broader scope
unknown. Rob spent an hour cycling through Supabase dashboard reset, direct reset links,
and standard forgot-password flow — no email delivered in any case. Workaround: created
auth users directly via SQL with pre-set passwords to bypass the email path entirely.

Investigate:
- Resend delivery logs (bounces, deferrals, blocks)
- Sender reputation for the sending domain
- SPF/DKIM/DMARC alignment for auth emails (may differ from transactional emails)
- Whether Supabase auth emails route through the same Resend pipeline as sendTenantEmail
- Gmail-specific: check if auth emails land in spam or are silently rejected

Affects all tenant onboarding — new users invited via the platform can't set their
password if reset emails don't arrive.

**Found**: 2026-05-28 during 46 Labs admin login attempt
**Priority**: P1 — blocks tenant onboarding and password recovery for all users
**Status**: Open

---

## PLATFORM-SA-VIEW-AS-USER (P2)

SA needs a one-click "log in as this tenant user" capability for verification. Currently
requires manually creating a separate auth account via SQL (what we did for 46 Labs on
2026-05-28). The SA-drilldown view is unreliable for tenant-perspective testing (profile
prop = SA's profile, useAuth() returns SA identity, Settings userRole = 'superadmin' —
see drilldown context bug audit).

Build: SA-side button on TenantManagement that creates a time-limited impersonation
session — real tenant auth context, correct profile, correct useAuth(), correct RLS.
Options: (a) Supabase admin generateLink for the tenant user + auto-redirect,
(b) synthetic JWT with tenant user claims, (c) service-role session swap. Design
discussion needed — security implications of each approach differ.

**Found**: 2026-05-28 during 46 Labs verification fire drill
**Priority**: P2 — quality-of-life for SA verification; workaround exists (manual SQL)
**Status**: Open

---

## PLATFORM-BUTTON-COMPONENT-CONSOLIDATION (P3)

65 files contain inline-styled buttons with linear-gradient backgrounds (~164 occurrences).
No shared Button component exists. Created src/components/ui/Button.jsx (variants:
primary/secondary/ghost/danger, brand_primary from BrandingContext, WCAG auto-contrast
text). First migration pass covers tenant-facing portal components. Long tail of
non-tenant-facing surfaces (LandingPage 36 gradients, EngageWorxDemo 9, etc.) remains
inline-styled.

Scope: migrate remaining inline button styles to shared Button component across all
portal surfaces. LandingPage explicitly excluded (marketing visual identity, not
tenant-facing).

**Found**: 2026-05-28 during 46 Labs gradient removal request
**Priority**: P3 — functional today, but inline styles create drift and inconsistency
**Status**: In progress — Button.jsx created, ActionBoard migrated, remaining portal
components in flight

---

## PLATFORM-MIGRATION-FILE-DUPLICATES (P3)

Migrations 018, 019, 020, 021 each have two files with same sequence numbers but
different content. Originally flagged in May 27 handoff doc. PR #50 renumbered
duplicates to 032-035 but the underlying issue (which file in each pair is canonical)
was not resolved — just renamed to avoid filename collisions.

Cleanup needed: for each pair, identify the canonical migration (the one that was
actually applied to production), remove the orphan, document which was kept and why.
Risk: confusion when reviewing migration history or building a new migration runner.
Not breaking anything — both files exist, only one was applied per pair.

**Found**: 2026-05-27 during migration audit, re-flagged 2026-05-30
**Priority**: P3 — not breaking, technical debt
**Status**: Open

---

## PLATFORM-DEAD-MESSAGE-TABLES-AUDIT (P3)

conversation_messages and call_messages appear to be unused schema tombstones — zero 
code reads, zero code writes across the entire codebase. conversation_messages caused 
a wrong-table claim during demo-seed work (CC asserted it didn't exist; it does exist 
in the schema but has no code references). The original platform brief listed 
conversation_messages as a key table — likely renamed to messages at some point, with 
the old table left behind.

Future cleanup: confirm both tables are genuinely dead (no triggers, no views, no 
external integrations referencing them), then DROP to reduce schema confusion. Also 
audit inbound_email_messages (backend-only archive, not rendered) for the same.

**Found**: 2026-05-28 during demo-seed table investigation
**Priority**: P3 — no runtime impact, but schema confusion is a recurring source of bugs
**Status**: Open
