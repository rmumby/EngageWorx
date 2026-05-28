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

Current pipeline stages are SaaS-sales-specific and unsuitable for non-SaaS tenants 
(dental, restaurant, CSP, wedding venue). Need either (A) vertical preset stage 
templates chosen at onboarding, or (B) fully custom per-tenant stages 
(name/order/color/win-loss semantics) managed in Settings. Likely path: A then B, 
with presets seeding the custom builder.

Investigation complete 2026-05-28: pipeline_stages IS already a per-tenant DB table 
with tenant_id, stage_key, display_name, stage_type, display_order. Win/loss semantics 
come from stage_type ('lead', 'active', 'closed_won', 'closed_lost') not stage names — 
renames are safe. All backend consumers (email-inbound, sequences, crons, whatsapp) 
use stage_type for business logic, not display_name. This is a seed-data + UI task, 
not a schema migration.

Scope:
- Stage editor UI in Settings (rename, reorder, add, remove stages within the 4 types)
- Vertical preset templates at tenant creation (SaaS, Wedding, Dental, Restaurant, Generic)
- Updated onboarding flow to select vertical → seed appropriate stages
- No schema changes needed — existing table + constraints are sufficient

**Found**: 2026-05-28
**Priority**: P1 — blocks credible multi-vertical onboarding
**Status**: Open — investigation complete, ready to build
