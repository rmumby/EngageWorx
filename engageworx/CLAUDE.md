# EngageWorx — Claude Code Build Principles

This is the standing instruction set for every Claude Code session on the EngageWorx repo. Read this before any build, refactor, or fix.

## Primary Goals (in priority order)

1. **AI-first** — every feature asks "can AI reduce user effort here?" before asking "how do we build a form for it?"
2. **Multi-tenant safety** — every DB write, every query, every cache key is tenant-scoped. No cross-tenant leakage ever.
3. **No hardcoding** — tenant names, branding, URLs, contact details, bot names, plan names, support info, copy — ALL read from config (`platform_ai_config` for SP-level, `chatbot_configs` for per-tenant). No "EngageWorx" strings in code. No "hello@engwx.com" in code. No "+1 786 982 7800" in code.
4. **Portal must stay usable** — changes don't break existing tenants. Migrations are forward-compatible. UI changes degrade gracefully for older data.
5. **Confidentiality** — no tenant sees another tenant's data, contacts, conversations, configs, or existence. No customer data in logs. No infrastructure vendor names surfaced to customers except where the platform prompt explicitly approves disclosure.

## Build Workflow Expectations

- Every build request: check assumptions against this file. If a proposal hardcodes anything or skips multi-tenant isolation, **flag it before building**.
- After every build: suggest **ONE** optimization or simplification that would improve the feature without scope creep. Rob decides if it's in or deferred.
- After every build: flag **ONE** thing that could streamline via AI that currently requires manual work or clicks.
- Never add new config storage (new table, new JSON blob) without checking if existing config infrastructure can be extended instead.
- ### Documentation Sync Requirement

Any change that adds or modifies the following must be reflected in the
platform reference doc (the EngageWorx project's `engageworx-platform-code-reference.md`)
in the SAME commit/PR:

- New database tables or significant column additions (Section 5)
- New API endpoints or routes (Section 8)
- New environment variables (Section 6)
- New tech stack components or vendor changes (Section 3)
- Changes to pricing tiers or plan limits (Section 7)
- Changes to tenant architecture or customer types (Section 2)
- New recurring issue patterns or fixes worth documenting (Section 9)
- TCR/compliance pattern changes (Section 10)

If the platform reference doc lives outside this repo, output the exact
markdown diff to apply, clearly labeled, at the end of the build summary
so Rob can paste it into the project doc immediately.

Rationale: The platform reference doc is the source of truth shared across
all Claude surfaces (chat sessions, other Claude Code sessions, AI
collaborators). Stale docs cause duplicate tables, conflicting migrations,
and rework. Doc-in-the-same-PR is non-negotiable.

## Code Quality

- Validation happens server-side first; client-side validation is UX sugar, not security.
- Every endpoint checks auth + tenant ownership before any DB operation.
- Errors return actionable messages; never leak stack traces or internal IDs.
- Log the `tenant_id` on every significant operation for audit and debugging.

## Information Protection

These vendors are NEVER named in customer-facing content (UI copy, email templates, help docs, error messages, marketing pages):

- **Twilio** → "tier-1 carrier-grade messaging and voice rails"
- **SendGrid / Resend** → "enterprise-class email infrastructure"
- **Supabase** → "proprietary cloud database"
- **Vercel** → "proprietary cloud hosting"
- **Anthropic / Claude** → "a leading enterprise AI provider"
- **Cloudflare** (DNS) → "proprietary cloud infrastructure"

Internal code, comments, env vars, and developer-facing docs can name vendors freely. Only customer-facing surfaces are restricted.

Exception: Anthropic Claude can be confirmed if a customer asks directly about AI provider. Never volunteer it.

## When in Doubt

- **Tenant isolation question?** Default to most restrictive interpretation. Ask before relaxing.
- **Hardcoding a value?** Stop. Move it to `platform_ai_config` or `chatbot_configs`.
- **Naming an underlying vendor in customer-facing content?** Use the approved language above.
- **New table or schema change?** Check if existing tables can be extended first. Migrations must be forward-compatible.
- **Big change to a live tenant-facing surface?** Pause and confirm with Rob before proceeding.

## Architecture Notes

### Pipeline Stages
- **`pipeline_stages`** is the authoritative pipeline definition per tenant. Each tenant has its own stage set (default 7, SP has 8 with sandbox_shared/demo_shared).
- `leads.pipeline_stage_id` references `pipeline_stages.id` (nullable, no FK yet — backfill in Action Board Phase 2).
- `leads.stage` (text) is deprecated but kept for backward compat during transition. New code should use `pipeline_stage_id`.
- Stage mapping: inquiry→lead, sandbox_shared→active_sandbox_shared (SP) or active_qualified (other), demo_shared→active_demo_shared (SP) or active_demo_scheduled (other), opportunity→active_pricing_sent, customer→closed_won, dormant→closed_lost.

### Action Items (replaces email_actions)
- **`action_items`** replaces `email_actions` long-term. Three tiers: priority, engagement, bulk.
- Dedup via `target_key` generated column: `COALESCE(contact_id, lead_id, conversation_id, ticket_id, related_tenant_id)`. Partial unique index on `(tenant_id, user_id, source, target_key) WHERE status = 'pending'`.
- Autonomous mode creates items with `status='resolved_auto'` + `final_sent_html` for visibility and AI learning.
- `email_actions` kept alive during Phase 2 transition (both systems write for one release cycle).

### RLS Pattern
- **Always use `tenant_members`** for RLS subqueries, not `user_profiles`. Pattern: `USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() AND status = 'active'))`.
- **Never add `USING(true)` service-role policies.** Service role bypasses RLS by default in Supabase. Adding `USING(true)` on the `authenticated` role overrides restrictive policies because policies are OR'd.
- **Recursion warning:** If table A's RLS policy subqueries table B, table B must have its own RLS policy allowing the read. Otherwise the subquery returns empty and the policy blocks everything. The keystone tables are `tenant_members` (needs `USING (user_id = auth.uid())`) and `user_profiles` (needs `USING (id = auth.uid())`).
- **SECURITY DEFINER functions (created 2026-04-30, policies rolled back):**
  Three functions exist in the database: `get_user_tenant_ids(UUID)`, `is_tenant_admin(UUID, UUID)`, `is_sp_admin(UUID)`. These bypass RLS internally to avoid recursion. Functions are harmless without policies calling them. GRANT EXECUTE restricted to `authenticated` role only.
- **Tenant-admin RLS: three failed attempts.** Adding policies that let tenant admins manage their own team has broken superadmin login each time. The subscription gate (`view = "no_tenant"`) fires because AuthContext queries `user_profiles` during login. The suspected culprit is the "Members read tenant teammate profiles" policy on `user_profiles` — it calls `get_user_tenant_ids()` which reads `tenant_members`, and something in that chain causes the `user_profiles` SELECT in `fetchProfile` (AuthContext.js line 25-29) to return empty for the superadmin user.
  **Retry approach:** Add ONE policy at a time, test superadmin login between each. Order: (1) tenant_members SELECT, (2) tenant_members INSERT, (3) tenant_members UPDATE, (4) tenant_members DELETE, (5) user_profiles teammate SELECT — stop at whichever breaks login. The `user_profiles` policy is highest risk and should be added last.
  **Ruled out:** Superadmin (Rob) DOES have tenant_members rows (SP tenant + one other, both admin/active). The bug is not a missing membership row. Root cause unknown — needs one-at-a-time diagnosis. Do NOT batch-deploy multiple policies.

### Known Dedup Bugs (fix in Action Board Phase 2)
- **Signup-recovery feeds stale-leads:** `cron-signup-recovery` creates leads that `cron-stale-leads` picks up 7 days later, generating duplicate outreach. Fix: tag recovery leads with `source='signup_recovery'` so stale-leads skips them for 14 days.
- **No cross-source dedup:** `cron-tenant-engagement` and `cron-stale-leads` each dedup within their own source but not across sources. Same tenant/lead can appear in both.
- **Manual cron re-triggers create duplicates:** No idempotency guard beyond time-window checks (5 days for stale, 7 days for health). Deploy races or manual triggers can insert duplicates.

## Completed Phases

- **Phase 1** — Chat primitives extracted to `src/components/chat/` (MessageBubble, TypingIndicator, ChatInput, ChatThread). Unified message shape `{role, content, timestamp?, metadata?}`. 5 consumers refactored. (2026-04-28)
- **Phase 2** — Streaming infrastructure: `api/ai-stream.js` (SSE, claude-sonnet-4-20250514), `src/hooks/useClaudeStream.js`, StreamingTest page (internal-only). Rate-limited 30 req/min/tenant. (2026-04-28)
- **Phase 3** — AIConfigBuilder: `src/components/AIConfigBuilder.jsx` (generic conversational config builder), `api/ai-config-builder.js` (schema validation + retry), `EscalationRulesConfig.jsx` (first call site), `recipient_picker` message type with team member selector, `notification_only` role with auth gate, `api/team-members/create.js`. (2026-04-28)
- **Action Board Phase 1** — Data model: `pipeline_stages` (per-tenant, SP has 8 stages, others 7), `action_items` (3-tier with target_key dedup), VIP/priority flags on contacts+leads, `user_notification_preferences`. Dedup audit + source mapping completed. (2026-04-30)

## Future Work

- [ ] **P1 — Per-tenant autonomous outreach config** — Autonomous send timing/cadence/threshold is currently a single SP-wide toggle in `sp_settings`. Needs per-tenant configuration via Settings → Sequences UI: autonomous mode on/off, stale threshold (days), max nudges per lead, send time window (business hours), nudge template tone (learns user voice via AI learning loop). Build as AIConfigBuilder flow (conversational config, not form fields — extends commit bc06fe6 pattern). (Identified 2026-05-01)
- [ ] **Action Board Phase 2** — Action ingestion: `action-item-generator.js`, `action-items.js` endpoint, cron refactor to populate action_items, dedup enforcement, AI signature in drafts. (Scoped 2026-04-30)
- [ ] **P2 — Digest schedule UI** — `digest_send_time` and `digest_timezone` are per-tenant in the DB but have no UI. All non-SP tenants default to 08:00 America/New_York regardless of location. Settings → Notifications page (Action Board Phase 3) should include: time picker + timezone selector, default to browser timezone on first load, tenant admin can change. Affects stale-leads firing window (digest_send_time + 1hr), email digest delivery, and future Action Board summary emails. International tenants affected: Delamere Manor (UK), Telennovatiq, 0wire (likely PT). (Identified 2026-05-02)
- [ ] **P1 — WhatsApp 24h template window handling** — WhatsApp only allows free-text messages within 24 hours of the customer's last inbound. After 24h, must send a pre-approved template via `/api/whatsapp?action=template`. Current Live Inbox sends free-text regardless — fails silently after 24h. Fix: detect when last inbound > 24h, show template picker instead of free-text compose, call template endpoint. Also affects new-conversation flow (cold outreach always requires template). (Identified 2026-05-02)
- [ ] **P2 — Optimistic message status bug** — Live Inbox inserts messages with `status: 'delivered'` BEFORE the actual channel send (SMS/WhatsApp/email). If the send fails (rate limit, 24h window, bad credentials), the DB says 'delivered' but the message was never sent. Fix: insert as `status: 'pending'`, attempt send, update to `'delivered'` or `'failed'` based on result. Affects LiveInboxV2.js `handleSendLive` (line 802-813) and LiveInbox.js (line 489-500). Larger refactor of the optimistic-update pattern. (Identified 2026-05-02)
- [ ] **P3 — AIChatbot preview alignment convention** — AIChatbot preview and StreamingTest use "your input on right, AI response on left" (ChatGPT convention). Live Inbox uses the inverse: "customer on left, us on right" (messaging convention). MessageBubble.jsx defaults to ChatGPT convention (`user=right, assistant=left`). Live Inbox now overrides via explicit `align` prop. Worth revisiting whether AIChatbot preview should follow messaging convention instead — design discussion, not a code fix. (Identified 2026-05-02)
- [ ] **Action Board Phase 3** — Portal UI: ActionBoard component, ActionCard variants, DraftEditor, VIP/Priority toggles, notification settings page, pipeline stages settings.
- [ ] **Digest → Action Board migration (next week)** — AI Omnichannel Digest unused by tenants beyond EngageWorx. Plan: (1) hide digest sidebar nav item, replace with Action Board for all tenants, (2) remove daily digest email — Action Board is the work queue, (3) migrate digest-specific features (priority sorting, AI summaries) into Action Board. Keep cron-stale-leads + cron-tenant-engagement running — they feed Action Board via action_items table. Keep cron infrastructure intact (hosts execution paths). Do NOT remove email_actions table yet — transition period. (Scheduled 2026-05-05 week)
- [ ] **VIP AI-suggested system** — Weekly cron evaluates contacts against behavioral/positional signals, flags VIP candidates in Action Board for human confirmation. Never auto-sets is_vip. Full scope: `docs/vip-suggestion-scope.md`. Estimated: 1-2 days. (Scoped 2026-05-03)
- [ ] **Gmail Drafts hybrid integration** — Push-to-Gmail-Drafts as parallel send path from Action Board. Option B polling for send confirmation. Testing mode rollout + parallel CASA Tier 2 verification. Full scope: `docs/gmail-drafts-integration-scope.md`. Estimated: 1-1.5 weeks code + 2-8 weeks Google verification. (Scoped 2026-05-03)
- [ ] **Digest 3-phase sunset** — Phase 1 (next week): hide digest nav item for all tenants, Action Board replaces it. Phase 2 (week after): disable daily digest email send, keep crons running to feed action_items. Phase 3 (2 weeks out): remove EmailDigest.jsx component, mark email_actions table as deprecated (keep for audit, stop writing new rows). cron-stale-leads and cron-tenant-engagement continue indefinitely — they're the event sources. (Planned 2026-05-03)
- [ ] **Action Board Phase 4** — Mobile/Gmail: draft-to-Gmail-Drafts flow, action board summary emails, one-click action links. Depends on Gmail Drafts integration above.
- [ ] **Action Board Phase 5** — AI learning: `ai_learning_signals` table, edit diff capture, override pattern detection, personalized prompt injection.
- [ ] **P2 — Plan-tenant type validation** — Platform allows assigning plans to tenants with incompatible customer_types (e.g. starter with customer_types=['direct'] assigned to an agent tenant). Add validation to plan-change UI (handleSaveTenantConfig in App.jsx) and API (invite-tenant.js): only allow plans where the plan's customer_types array includes the tenant's customer_type. Exposed when Tochenet (agent) was assigned starter (direct-only). (Identified 2026-05-01)
- [ ] **AIChatbot streaming rewire** — Replace canned mock responses in AIChatbot.js preview with real Claude streaming calls via `useClaudeStream`. (Approved 2026-04-28)
- [ ] **ChatInput forwardRef** — Expose `ref` prop on `ChatInput` via `React.forwardRef` so consumers (LiveInbox, LiveInboxV2) can restore post-send textarea focus. (Approved 2026-04-28)
- [ ] **Proactive system-trigger escalation rules** — Escalation rules that fire from internal system events (e.g. failed payment, SLA breach) rather than conversation content. Needs design discussion. (Identified 2026-04-28)
- [ ] **CSP pricing layer (interim fix — ship tomorrow)** — In TenantManagement Invite Tenant flow, check if caller is SP admin (superadmin on SP tenant) vs non-SP tenant admin (CSP/agent). SP admin sees all 12 plans. Non-SP admin sees plan dropdown replaced with "Custom" placeholder + note: "Sub-tenant pricing managed by you outside the platform for now. Per-CSP pricing layer coming soon." Prevents wholesale price exposure to CSP customers. (Identified 2026-04-30)
- [ ] **CSP pricing layer (long-term)** — Full per-CSP/agent plan management:
  - CSP/agent admins get their own plan management screen in their tenant portal
  - Per-tenant plans stored as `plans` JSONB on tenant row or a `tenant_plans` table
  - When CSP/agent invites a sub-tenant, dropdown reads from THEIR retail plans, not platform_config
  - Plan margin tracking: CSP buys at wholesale (e.g. csp_platform $499), sells at their retail price, platform shows the spread for analytics
  - Discuss with Erik @ 0wire as design partner before building. (Identified 2026-04-30)
