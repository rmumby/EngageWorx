# Platform Backlog

Captured technical debt, known bugs, deferred work, and process improvements. 
Update as items are completed (mark Status: Done with completion date) or closed.

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

DECISION: Drop vertical templates (would trap us in endless per-vertical maintenance 
and still guess wrong — proven by Delamere's real 12-stage flow matching no template). 
Approach: per-tenant custom stages, created via AI-ASSISTED build.

Architecture (AI proposes, deterministic code enforces):
1. Tenant describes business (or inferred via existing detect-brand.js at signup)
2. AI proposes stage list: names + order + suggested stage_type per stage
3. DETERMINISTIC validation layer (not the AI) enforces invariants before any DB write: 
   exactly one 'lead', >=1 'closed_won', >=1 'closed_lost'; every stage has valid 
   stage_type; display_order clean 1..N. AI never writes pipeline_stages directly.
4. Human review/tweak checkpoint, then confirm
5. Confirmed stages seed via existing seedPipelineStages helper (the safe write path 
   from PR #58)

Plus a manual stage editor underneath (required regardless — for later edits) with guards:
- Block delete of a non-empty stage OR force "move leads to [stage]" first (no FK on 
  leads.pipeline_stage_id — orphan risk). Count query confirmed by CC.
- Never delete the last stage of any structural type (lead/closed_won/closed_lost)
- Reorder rewrites display_order to clean 1..N

Investigation findings (2026-05-28):
- pipeline_stages IS already per-tenant (tenant_id NOT NULL, UNIQUE(tenant_id, stage_key))
- All business logic keys off stage_type NOT stage names — renames safe
- No second stage source (the funnel in screenshots is Delamere's external CRM, not platform)
- No sub_stage uniqueness constraint — many 'active' stages fine
- display_order freely rewritable, no gaps constraint
- Seed-at-creation fixed in PR #58 (new tenants get default 7 SaaS stages)
- Backend-required stage_keys: 'lead' (12 refs), 'closed_won' (3), 'closed_lost' (3). 
  Middle stages free to rename/remove — backend degrades gracefully
- No CRUD endpoint for stages yet — needs building

First real test case: Delamere's actual pipeline (external CRM shows 12 stages: 
Showround Requested → Contacted → Contacted Follow-up → Showround Booked → 
Showround Completed → 1st Follow-up → 2nd Follow-up → Date Held → Contract Sent → 
Booking Confirmed → Left a Review → Won). Confirm with Darren these are intended 
before seeding.

**Found**: 2026-05-28
**Priority**: P1 — blocks credible multi-vertical onboarding
**Status**: Spec ready, build not started. Prerequisite investigation COMPLETE.

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
