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

## Completed Phases

- **Phase 1** — Chat primitives extracted to `src/components/chat/` (MessageBubble, TypingIndicator, ChatInput, ChatThread). Unified message shape `{role, content, timestamp?, metadata?}`. 5 consumers refactored. (2026-04-28)
- **Phase 2** — Streaming infrastructure: `api/ai-stream.js` (SSE, claude-sonnet-4-20250514), `src/hooks/useClaudeStream.js`, StreamingTest page (internal-only). Rate-limited 30 req/min/tenant. (2026-04-28)
- **Phase 3** — AIConfigBuilder: `src/components/AIConfigBuilder.jsx` (generic conversational config builder), `api/ai-config-builder.js` (schema validation + retry), `EscalationRulesConfig.jsx` (first call site), `recipient_picker` message type with team member selector, `notification_only` role with auth gate, `api/team-members/create.js`. (2026-04-28)

## Future Work

- [ ] **AIChatbot streaming rewire** — Replace canned mock responses in AIChatbot.js preview with real Claude streaming calls via `useClaudeStream`. Approved after Phase 2 streaming is proven. (Approved 2026-04-28)
- [ ] **ChatInput forwardRef** — Expose `ref` prop on `ChatInput` via `React.forwardRef` so consumers (LiveInbox, LiveInboxV2) can restore post-send textarea focus. Do when next touching ChatInput. (Approved 2026-04-28)
- [ ] **Proactive system-trigger escalation rules** — Phase 4 candidate. Escalation rules that fire from internal system events (e.g. failed payment, SLA breach) rather than conversation content. Needs design discussion before implementation. (Identified 2026-04-28)
