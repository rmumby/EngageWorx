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
