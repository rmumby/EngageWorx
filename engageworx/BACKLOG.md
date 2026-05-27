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
