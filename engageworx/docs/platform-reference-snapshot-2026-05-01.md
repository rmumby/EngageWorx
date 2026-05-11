# EngageWorx Platform Reference — Code-Derived Snapshot
**Generated:** 2026-05-01 from codebase at commit `597a5dc`
**Purpose:** Compare against external `engageworx-platform-code-reference.md`

---

## 1. Build Principles (from CLAUDE.md)

1. **AI-first** — every feature asks "can AI reduce user effort here?"
2. **Multi-tenant safety** — every DB write, query, cache key is tenant-scoped
3. **No hardcoding** — all config from `platform_ai_config` (SP) or `chatbot_configs` (per-tenant)
4. **Portal must stay usable** — forward-compatible migrations, graceful degradation
5. **Confidentiality** — no cross-tenant data leakage, no vendor names in customer-facing content

**Documentation sync requirement:** Any change to tables, API routes, env vars, pricing, tenant architecture, or compliance must update the platform reference doc in the same commit/PR.

---

## 2. Tenant Architecture

### Customer Types (customer_type on tenants table)
| Value | Description |
|-------|-------------|
| `direct` | Business signed up directly |
| `csp_partner` | Channel Service Provider / white-label partner |
| `agent` | Reseller agent |
| `internal` | EngageWorx internal tenant |
| `custom` | Manual/special assignment |

### Entity Tiers (entity_tier on tenants table)
| Value | Description |
|-------|-------------|
| `super_admin` | Platform-level admin (EngageWorx) |
| `csp` | CSP with sub-tenants |
| `master_agent` | Master agent with sub-agents |
| `agent` | Agent/reseller |
| `tenant` | Standard direct tenant (default) |

### Hierarchy
- `parent_tenant_id` / `parent_entity_id` create parent-child relationships
- `legal_entity_id` groups multiple tenant rows for the same legal entity (multi-role modeling)
- `contract_type` TEXT — per-row contract tracking

### Auth Roles (tenant_members.role)
| Role | Portal Access | Description |
|------|--------------|-------------|
| `admin` | Yes | Full access, can manage team |
| `owner` | Yes | Same as admin |
| `manager` | Yes | Can manage team, limited settings |
| `agent` | Yes | Support agent |
| `analyst` | Yes | Read-only analytics |
| `readonly` | Yes | Read-only |
| `viewer` | Yes | Read-only (via invite) |
| `notification_only` | **No** | Receives escalation notifications only, no portal login |

### Auth Flow (AuthContext.js)
- `user_profiles` queried first (`id = auth.uid()`)
- Enriched with `tenants` data (`customer_type`, `entity_tier`, `aup_accepted`)
- Fallback: `tenant_members` if `user_profiles` has no `tenant_id`
- `isCSP` accepts both `'csp'` and `'csp_partner'`
- `notification_only` role blocked at portal gate (shows sign-out only)

---

## 3. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React (CRA) | 18.2.0 |
| Hosting | Vercel (Serverless Functions) | — |
| Database | Supabase (PostgreSQL) | — |
| AI | Anthropic Claude | claude-sonnet-4-20250514 |
| SMS/Voice | Twilio | 5.0.0 |
| Email (primary) | Resend | API v1 |
| Email (legacy) | SendGrid | 8.0.0 (migration in progress) |
| Email (SMTP) | Nodemailer | 8.0.5 (Gmail SMTP path) |
| WhatsApp | Meta Business API | via Twilio |
| i18n | i18next | 22.5.1 |
| Node | 24.x LTS | — |

### Email Migration Status
- `api/_lib/send-email.js` migrated from SendGrid to **Resend** (2026-04-29)
- `api/_lib/send-tenant-email.js` is the **mandatory path** for all external-recipient emails. Enforces Layer 1 (email-as-name sanitization via `opts.recipient`) and Layer 2 (18 blocked AI meta-language patterns scanned unconditionally). Returns `{ sent: false, blocked: true }` if Layer 2 triggers — email never reaches a provider.
- `api/_lib/email-safety-gates.js` — shared helpers: `checkBlockedPatterns`, `sanitizeEmailAsName`, `looksLikeEmail`, `cleanEmailToName`. Used by both sendTenantEmail and sequences.js.
- Customer-facing paths migrated to sendTenantEmail: sequences, email-inbound auto-reply, cron-signup-recovery, helpdesk, stripe-webhook, fire-escalation, action-items/send
- Direct `sgMail` callers remain in ~20 internal admin notification paths (P3 migration deferred)

---

## 4. Vendor Masking (Customer-Facing Content)

| Vendor | Approved Language |
|--------|-------------------|
| Twilio | "tier-1 carrier-grade messaging and voice rails" |
| SendGrid / Resend | "enterprise-class email infrastructure" |
| Supabase | "proprietary cloud database" |
| Vercel | "proprietary cloud hosting" |
| Anthropic / Claude | "a leading enterprise AI provider" |
| Cloudflare | "proprietary cloud infrastructure" |

Exception: Anthropic Claude can be confirmed if customer asks directly.

Both Telnyx and Twilio are undisclosed externally — refer to as "underlying CSP infrastructure" regardless of which supplier a tenant uses.

---

## 4b. Supplier Strategy

Hybrid supplier model: Telnyx for new tenants (lower cost, campaignBuilder API), Twilio for existing tenants (already provisioned).

- `tenants.phone_supplier` column controls routing: `'twilio'` (default for existing) or `'telnyx'`
- TCR wizard routes via `api/_lib/tcr-supplier.js` dispatcher → loads `tcr-supplier-telnyx.js` or `tcr-supplier-twilio.js` per tenant
- Voice, SMS send paths will follow the same pattern when supplier-aware routing extends beyond TCR
- Conecta Cloud (tenant `8bb1ab11`) is the first tenant on Telnyx

---

## 5. Database Tables

### Core Tables
| Table | Purpose | RLS | Key Columns |
|-------|---------|-----|-------------|
| `tenants` | Tenant records | Yes | id, name, customer_type, entity_tier, parent_tenant_id, legal_entity_id, plan, email_send_method, phone_supplier ('twilio'\|'telnyx'), parent_product_label, display_alias, primary_contact_email, primary_contact_first_name, primary_contact_last_name, contract_type |
| `tenant_members` | User-tenant membership | Yes | user_id, tenant_id, role, status, notify_email, notify_on_escalation/signup/payment/new_lead |
| `user_profiles` | User data | Yes | id, email, full_name, tenant_id, role, phone_number, sender_email |
| `contacts` | Customer contacts | Yes | tenant_id, email, first_name, last_name, company, title, is_vip, vip_marked_at, priority_until |
| `leads` | Pipeline leads | Yes | tenant_id, name, email, company, phone, stage, pipeline_stage_id, is_priority, priority_until |
| `conversations` | Message threads | Yes | tenant_id, contact_id, channel, status, subject |
| `messages` | Individual messages | Yes | tenant_id, conversation_id, contact_id, channel, direction, body, status |
| `channel_configs` | Per-tenant channel setup | Yes | tenant_id, channel, config_encrypted, enabled, provider, status |

### AI & Config Tables
| Table | Purpose | RLS |
|-------|---------|-----|
| `chatbot_configs` | Per-tenant AI agent config | Yes |
| `platform_config` | Platform-level settings (plans, templates, etc.) | Yes |
| `platform_ai_config` | SP-level AI config | — |
| `ai_config_sessions` | AI config builder conversation logs | Yes |
| `escalation_rules` | Per-tenant escalation rules | Yes |
| `escalation_log` | Escalation audit trail | Yes |

### Pipeline & Action Board Tables (Phase 1, 2026-04-30)
| Table | Purpose | RLS |
|-------|---------|-----|
| `pipeline_stages` | Per-tenant pipeline definition (7 default, 8 for SP) | Yes |
| `action_items` | 3-tier action queue (priority/engagement/bulk), dedup via target_key | Yes |
| `user_notification_preferences` | Per-user notification settings | Yes |

### Sequence Tables
| Table | Purpose |
|-------|---------|
| `sequences` | Sequence definitions |
| `sequence_steps` | Steps within sequences |
| `lead_sequences` | Lead enrollment in sequences |
| `lead_sequence_events` | Sequence event audit log |

### Communication Tables
| Table | Purpose |
|-------|---------|
| `calls` | Voice call records |
| `sent_emails` | Email send tracking |
| `email_actions` | Digest/action items (being replaced by action_items) |
| `sms_optins` | SMS opt-in records |
| `whatsapp_templates` | WhatsApp message templates |
| `whatsapp_provisioning` | WhatsApp setup progress |

### Notification Tables
| Table | Purpose |
|-------|---------|
| `tenant_admin_notifications` | Queue for unrouted tenant admin notifications (no recipients configured). Surfaced in admin UI. |

### TCR Wizard Tables
| Table | Purpose |
|-------|---------|
| `tcr_wizard_sessions` | Self-service TCR registration sessions. Tracks brand_data, campaign_data, ai_validations, supplier IDs, fee, rejection_history, campaign_status (Telnyx: PENDING/ACTIVE/EXPIRED/SUSPENDED/REJECTED), mno_status (per-carrier JSONB). Status: in_progress → submitted → approved/rejected. |
| `tcr_fee_schedule` | Fee schedule for brand + campaign registration. Seeded with Telnyx standard rates. |

### Support Tables
| Table | Purpose |
|-------|---------|
| `support_tickets` | Help desk tickets (includes AI root-cause: `root_cause_type`, `root_cause_confidence`, `root_cause_reasoning`) |
| `ticket_messages` | Messages within tickets |
| `support_ticket_responses` | Responses to tickets |
| `support_triage` | Auto-triage results |
| `helpdesk_kb_articles` | Knowledge base |

### TCR & Compliance Tables
| Table | Purpose |
|-------|---------|
| `tcr_submissions` | A2P 10DLC registration submissions |
| `tcr_approved_templates` | Approved message templates for TCR |

### Other Tables
| Table | Purpose |
|-------|---------|
| `companies` | Company/organization records |
| `integrations` | Third-party integrations |
| `platform_updates` | Release notes / announcements |
| `release_notes` | Platform changelog |
| `sp_settings` | SP-level key-value settings |
| `channel_health_log` | Channel health check results |
| `poland_carrier_configs` | Polish carrier configs |
| `usage_metering` | Per-tenant usage tracking |
| `usage_alerts` | Usage threshold alerts |
| `usage_topups` | Message top-up purchases |
| `plan_limits` | Plan limit definitions |
| `phone_numbers` | Provisioned phone numbers |
| `inbound_emails` | Raw inbound email storage |
| `ai_usage_log` | AI API call logging |
| `debug_logs` | Debug/diagnostic logs |

---

## 6. Environment Variables

### Required for Core Functionality
| Variable | Purpose |
|----------|---------|
| `REACT_APP_SUPABASE_URL` / `SUPABASE_URL` | Supabase project URL |
| `REACT_APP_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY` | Supabase anonymous key (frontend) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (API only) |
| `ANTHROPIC_API_KEY` / `REACT_APP_ANTHROPIC_API_KEY` | Claude AI API key |
| `RESEND_API_KEY` | Resend email API key (primary email provider) |
| `SENDGRID_API_KEY` | SendGrid API key (legacy, used by some crons) |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` / `TWILIO_FROM_NUMBER` | Default Twilio phone number |
| `TWILIO_MESSAGING_SERVICE_SID` | Twilio messaging service SID |
| `STRIPE_SECRET_KEY` | Stripe billing API key |

### Platform Configuration
| Variable | Purpose |
|----------|---------|
| `REACT_APP_SP_TENANT_ID` / `SP_TENANT_ID` | EngageWorx SP tenant UUID (`c1bc59a8-5235-4921-9755-02514b574387`) |
| `PLATFORM_FROM_EMAIL` / `REACT_APP_PLATFORM_FROM_EMAIL` | Default from email |
| `PLATFORM_ADMIN_EMAIL` / `REACT_APP_PLATFORM_ADMIN_EMAIL` | Admin notification email |
| `PLATFORM_NAME` | Platform display name |
| `PORTAL_URL` | Portal URL |
| `CRON_SECRET` | Auth secret for cron endpoints |

### Channel-Specific
| Variable | Purpose |
|----------|---------|
| `TWILIO_A2P_PROFILE_SID` | Twilio A2P trust profile |
| `TWILIO_CUSTOMER_PROFILE_SID` | Twilio customer/brand profile |
| `TWILIO_WHATSAPP_NUMBER` | WhatsApp phone number |
| `WHATSAPP_VERIFY_TOKEN` | WhatsApp webhook verification |
| `FACEBOOK_APP_ID` / `REACT_APP_FACEBOOK_APP_ID` | Meta app ID (WhatsApp embedded signup) |
| `FACEBOOK_APP_SECRET` | Meta app secret |
| `GMAIL_SMTP_USER` / `GMAIL_SMTP_PASS` | Gmail SMTP credentials |

### Infrastructure
| Variable | Purpose |
|----------|---------|
| `VERCEL_API_TOKEN` | Vercel deployment API |
| `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` | Vercel project identifiers |
| `GITHUB_TOKEN` / `GITHUB_REPO` | GitHub integration |
| `GITHUB_WEBHOOK_SECRET` | GitHub webhook verification |
| `TURNSTILE_SECRET` | Cloudflare Turnstile CAPTCHA |
| `DEFAULT_EMAIL_METHOD` | Default email send method |
| `ALERT_EMAIL` | Alert recipient email |

---

## 7. Pricing / Plans

### Plan Visibility Classification

Plans have a `visibility` field in `platform_config.plans` JSONB:
- **`public`** — shown to all tenants in Billing and to SP admin for assignment
- **`csp_only`** — shown to SP admin ONLY when target tenant.customer_type is 'csp_partner' or 'agent'
- **`custom`** — never auto-rendered in any card/dropdown view. Created via manual flow only.

Backward compatibility: if `visibility` field is missing, the code heuristic derives it from `is_csp_tier` and `monthly_price === null`.

### Direct Business Plans (visibility: public)
| Slug | Name | Price | SMS Limit | Contacts | Seats | Channels |
|------|------|-------|-----------|----------|-------|----------|
| starter | Starter | $99/mo | 5,000 | 10,000 | 3 | 2 |
| growth | Growth | $249/mo | 25,000 | 50,000 | 10 | 4 |
| pro | Pro | $499/mo | 50,000 | 100,000 | 25 | 6 |

### CSP Tiers (visibility: csp_only)
| Slug | Name | Price | Published | SMS Limit | Contacts | Seats |
|------|------|-------|-----------|-----------|----------|-------|
| silver | Silver | $499/mo | Yes | 10,000 | 50,000 | 10 |
| gold | Gold | $1,499/mo | No | 50,000 | 200,000 | 50 |
| platinum | Platinum | $3,999/mo | No | 200,000 | 500,000 | 200 |
| diamond | Diamond | $7,999/mo | No | 500,000 | 1,000,000 | 500 |

### Custom Plans (visibility: custom — never auto-rendered)
| Slug | Name | Notes |
|------|------|-------|
| enterprise | Enterprise | Custom pricing, assigned via sales |
| csp_pilot | CSP Pilot | Active (0wire uses this) |
| csp_platform | CSP Platform | Active partner tier |
| custom | Custom | Manual assignment |
| Master 20 | Master 20 | Master agent tier |

### Stripe Price IDs
| Plan | Stripe Price ID |
|------|----------------|
| starter | price_1T4OeIPEs1sluBAUuRIaD8Cq |
| growth | price_1T4OefPEs1sluBAUuZVAaBJ3 |
| pro | price_1T4Of6PEs1sluBAURFjaViRv |
| silver | price_1TH2NHPEs1sluBAUNIR1PA9c |
| gold | price_1TH2SdPEs1sluBAU8q5eR3aT |
| platinum | price_1TH2cNPEs1sluBAUqbAYGQEO |
| diamond | price_1TH2ekPEs1sluBAUCnNXN3SX |
| topup_10k | price_1TH2mKPEs1sluBAU6aHkXzYN |

### Enforced Limits (from cron-usage-alerts.js)
| Plan | SMS | WhatsApp | Email | AI Calls | Voice (min) |
|------|-----|----------|-------|----------|-------------|
| Starter | 1,000 | 1,000 | 5,000 | 500 | 200 |
| Growth | 5,000 | 5,000 | 25,000 | 2,500 | 1,000 |
| Pro | 20,000 | 20,000 | 100,000 | 10,000 | 4,000 |
| Enterprise | 999,999 | 999,999 | 999,999 | 999,999 | 999,999 |

**Note:** SMS limits in platform_config (5K/25K/50K) differ from enforced limits in cron-usage-alerts.js (1K/5K/20K). The cron enforces the lower numbers. This discrepancy needs resolution.

### Plan Limit Enforcement
- **SMS/WhatsApp/Email:** Hard-enforced via `increment_usage` RPC. Returns 429 at limit.
- **Contacts:** Stored in `tenants.contact_limit` but NOT enforced.
- **User seats:** Stored in `tenants.user_seats` but NOT enforced.
- **Top-up pricing:** 10K=$150, 50K=$600, 100K=$1,000, 250K=$2,000, 500K=$3,500.

---

## 8. API Endpoints

### AI Endpoints
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/ai` | POST | AI completion (respond, classify, test actions) |
| `/api/ai-stream` | POST | SSE streaming Claude responses |
| `/api/ai-config-builder` | POST | Conversational config builder |
| `/api/ai-advisor` | POST | AI advisor for drafting |
| `/api/demo-ai` | POST | Demo AI for unauthenticated users |
| `/api/improve-draft` | POST | AI-improve draft message |
| `/api/generate-followup` | POST | AI follow-up generation |
| `/api/vip-research` | POST | AI VIP contact research |
| `/api/vip-followup` | POST | AI VIP follow-up draft. Sender via getTenantSender (no hardcoded rob@). |
| `/api/read-card` | POST | OCR business card reading |
| `/api/detect-brand` | POST | Brand detection from URL |
| `/api/check-models` | GET | Verify available AI models |

### Messaging Endpoints
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/sms` | POST | SMS send/webhook. Qualify/reactivation/inbound notifications via notifyTenantAdmins (no Rob fallback). |
| `/api/whatsapp` | POST | WhatsApp send/webhook. Qualify notifications via notifyTenantAdmins. |
| `/api/meta-whatsapp` | POST | Meta WhatsApp API |
| `/api/email` | POST | Email send/test/template |
| `/api/send-email-gmail` | — | **DELETED** (unauthenticated orphan, security risk). Gmail SMTP handled by sendTenantEmail. |
| `/api/twilio-voice` | POST | Voice call webhook |

### Tenant & User Management
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/invite-tenant` | POST | Create new tenant + admin |
| `/api/invite-member` | POST | Add member to tenant |
| `/api/team-members/create` | POST | Create notification-only member |
| `/api/csp` | POST | CSP operations (create sub-tenant, etc.) |
| `/api/resend-welcome` | POST | Re-send welcome email |
| `/api/platform-config` | GET/PATCH | Platform config read/update |

### Pipeline & Actions
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/sequences` | POST/GET | Sequence engine (enrol, process, list, etc.) |
| `/api/action-items/test` | POST | Test action-item generator (SP-admin only) |
| `/api/contacts` | POST | Contact dedup/validation |
| `/api/escalation-rules` | GET/POST/PATCH/DELETE | Escalation rule CRUD |

### Billing
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/billing` | POST/GET | Stripe checkout/portal/status |
| `/api/create-checkout-session` | POST | Create Stripe checkout |
| `/api/stripe-webhook` | POST | Stripe event webhook (welcome + SP notify via sendTenantEmail, no direct SendGrid) |
| `/api/usage` | POST/GET | Usage metering |

### Support
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/helpdesk` | POST/GET | Ticket management. AI response + status mapping only — root-cause classification delegated to api/support-triage.js. AI [ESCALATE] prefix sets status=escalated in DB; NO email sent. Visibility via needs_platform_review + dashboard badge. Manual escalation routes via notifyTenantAdmins (queues if no recipients). |
| `/api/support-triage` | POST | Auto-triage tickets (single source of truth for classification). Maps USER_ERROR/CONFIG_ISSUE/CODE_BUG/UNKNOWN → support_tickets.root_cause_type (user_level/tenant_level/platform_level/unknown). CODE_BUG and UNKNOWN flag via support_tickets.needs_platform_review. |
| `/api/send-digest-reply` | POST | Digest reply as email |

### Shared Helpers (`api/_lib/`)
| Module | Purpose |
|--------|---------|
| `send-tenant-email.js` | Tenant→customer outbound routing (resend/gmail/smtp) with Layer 1+2 safety |
| `email-safety-gates.js` | Layer 1 (email-as-name sanitization) + Layer 2 (blocked pattern gate) |
| `notify-tenant-admins.js` | Route admin notifications to tenant's configured recipients. Queues to tenant_admin_notifications if no recipients. Never falls back to rob@engwx.com. |
| `get-tenant-sender.js` | Resolve tenant's outbound sender address (user sender_email → chatbot config → primary_contact_email → platform fallback) |
| `action-item-generator.js` | AI action-item generator for pipeline/engagement events |
| `reply-thread.js` | Email thread ID generation + reply-to address builder |
| `platform-config.js` | Platform config loader with caching |
| `tcr-supplier.js` | Tenant-aware TCR supplier dispatcher. Routes to telnyx or twilio adapter based on tenants.phone_supplier. Exports loadSupplier(supabase, tenantId). |
| `tcr-supplier-telnyx.js` | Telnyx TCR adapter (/v2/10dlc/campaignBuilder). Mock + live modes. Exponential backoff for 429s. |
| `tcr-supplier-twilio.js` | Twilio TCR adapter (stub). Mock mode functional; live mode throws "not yet implemented". |

### TCR / Compliance
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/tcr-wizard` | GET/POST | Self-service TCR wizard (PC-02). Actions: start, save_step, ai_validate, ai_pre_fill, submit, interpret_rejection, status. Tenant-facing, no Rob in loop. Uses tcr-supplier.js adapter (mock/live). AI validation via Claude Sonnet against EngageWorx reference campaign. |
| `/api/tcr` | GET/POST | TCR registration (legacy — prefill, validate, submit) |
| `/api/tcr-webhook` | POST | Twilio TCR status webhook |
| `/api/csp-tcr-reminders` | POST | CSP TCR reminder cron |
| `/api/kyc` | POST/GET | KYC compliance checks |
| `/api/sms-optin` | POST/GET | SMS opt-in management |

### WhatsApp Setup
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/whatsapp-signup` | POST | Embedded signup flow |
| `/api/whatsapp-verify` | POST | Verify credentials |
| `/api/whatsapp-provisioning` | POST | Provisioning status |
| `/api/whatsapp-templates` | POST/GET | Template management |

### Cron Jobs
| Route | Schedule | Purpose |
|-------|----------|---------|
| `/api/cron-stale-leads` | Hourly | Flag stale pipeline leads. Recipients via tenant config; queues if none (no Rob fallback). |
| `/api/cron-tenant-engagement` | Daily | Tenant health/engagement |
| `/api/cron-signup-recovery` | Every 6h | Recover abandoned signups. Creates lead/contact + enrolls in Abandoned Checkout Recovery sequence. Does NOT send email directly — sequence engine handles all outreach. Dedup via user_profiles.recovery_email_sent_at (set after successful enrollment). |
| `/api/cron-email-digest` | Hourly | Generate/send email digests. Recipients via tenant config; queues if none (no Rob fallback). |
| `/api/cron-digest-scheduled` | 30min | Execute scheduled digest actions |
| `/api/cron-usage-alerts` | Daily | Usage threshold alerts. Via notifyTenantAdmins; no CC-to-Rob at 90%. |
| `/api/cron-channel-health` | Daily | Channel health checks |
| `/api/cron-archive-leads` | Daily | Archive old leads |
| `/api/cron-weekly-update` | Weekly | Platform update summary |
| `/api/cron-health-check` | Hourly | Platform health monitoring |
| `/api/cron-sequences` | Every 4h | Process due sequence steps |
| `/api/cron-tcr-poll` | Hourly | Poll Twilio TCR status |
| `/api/cron-weekly-summary` | Hourly | Per-user weekly summary email (fires when user's configured day + tenant send hour match) |

### Webhooks (Inbound)
| Route | Source | Purpose |
|-------|--------|---------|
| `/api/email-inbound` | SendGrid Inbound Parse | Inbound email processing |
| `/api/inbound-email` | Custom handler | Alternative inbound email |
| `/api/webhook-inbound` | Generic | Inbound webhook handler |
| `/api/github-webhook` | GitHub | Commit/PR → platform updates |
| `/api/track-outbound` | BCC tracking | Track outbound emails |

### Other
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/fetch-logs` | POST | Internal log viewer |
| `/api/env-test` | GET | Environment variable test |
| `/api/poland-carrier` | POST/GET | Polish carrier integration |
| `/api/calendly-connect` | POST | Calendly connection |
| `/api/send-onboarding-reminder` | POST | Onboarding nudge |
| `/api/signup-notify` | POST | Signup alert via notifyTenantAdmins to SP tenant. Also handles signup errors (error field → queues to tenant_admin_notifications). |
| `/api/notify-admin` | POST | Admin notification |
| `/api/intake` | POST | Lead intake form |

---

## 9. Recurring Issues & Patterns

### RLS (Row Level Security)
- Always use `tenant_members` for subqueries, not `user_profiles`
- Never add `USING(true)` service-role policies (policies are OR'd, overrides restrictions)
- SECURITY DEFINER functions exist (`get_user_tenant_ids`, `is_tenant_admin`, `is_sp_admin`) but policies using them were rolled back due to login breakage
- Tenant-admin team management RLS has failed 3 times — needs one-at-a-time retry

### Dedup Bugs (email_actions / digest)
- `cron-signup-recovery` creates leads that `cron-stale-leads` picks up 7 days later
- No cross-source dedup between `cron-tenant-engagement` and `cron-stale-leads`
- Manual cron re-triggers can create duplicates (no idempotency guard)
- Fix planned for Action Board Phase 2 via `action_items` dedup index

### Email Provider
- Shared helper (`api/_lib/send-email.js`) migrated to Resend (2026-04-29)
- Direct `sgMail` callers in ~15 files still use SendGrid
- Welcome email errors now surfaced in API responses and UI (commit 2391351)

### AuthContext Race Condition (fixed 2026-04-30)
- `onAuthStateChange` re-fetched profile without await, could overwrite good profile
- Fixed: guard with `if (!profile)` to prevent redundant fetch

### Sequence Runaway Sends (fixed 2026-05-07)

Two-day, ten-bug incident. ~130 broken emails to a single lead over 36 hours.

**Day 1 root causes:**
- **Self-heal loop (deleted):** Lines 405-427 reset `next_step_at` on stuck enrollments every 4h, causing infinite retry when `sendStep` threw. Amplified 1 broken send into 30.
- **Silent catch:** Error catch left enrollment `status: 'active'` — rewritten to set `status: 'error'` with `last_error`, `last_error_at`, `send_attempts` columns.
- **Vercel timeout:** 60s function timeout killed mid-batch sends. Fixed: `maxDuration: 300s` + `processing_started_at` in-flight lock (5-min window, cleared on success/error).
- **13 raw upserts:** `lead_sequences.upsert()` across 9 files overwrote `paused_emergency`/`error` statuses to `active`. Consolidated into `_lib/safe-enrol-sequence.js` with sticky-status guard.
- **Stripe re-activation:** Every Stripe webhook event upserted enrollment to `active`. Now uses `safeEnrolSequence`.
- **DB trigger bypass:** `enrol_unqualified_in_qualification_seq()` trigger wrote directly to `lead_sequences`, bypassing API null-email guards. Added `IF NEW.email IS NULL` guard in trigger function.

**Day 2 root causes:**
- **AI scratchpad shipping:** `personaliseMessage()` returned Claude's reasoning ("I don't have the lead's first name...") when lead had no name/company. Layer 1: skip AI entirely when no personalisable data. Layer 2: 18 blocked meta-language patterns scanned before every send.
- **Email-as-name:** 5 upstream intake files defaulted `name = email` when no real name provided. Fixed to `name: null`. `resolveContactFields` now detects email-shaped names.
- **Generic prefix names:** `cleanEmailToName` now blocks `info@`, `sales@`, `support@` etc. and requires ≥2 alpha characters.

**Commits:** bb0d645, b4b37ba, 1a6f8de, 635745d, 0706111, d7caaff, de18b23, 05a3a0d, 0ed3f85, 6e37c3c.

**Diagnostic fingerprints:** Identical-millisecond `next_step_at` across rows = self-heal/bulk-update; Vercel Runtime Timeout mid-batch = function killed; email says "Hi rob@engwx.com" = mergePlaceholders not sanitizing; email says "I don't have the lead's first name" = AI scratchpad (Layer 2 blocks, Layer 1 is the proper fix).

**Smoke test pattern:** Dedicated test sequence on isolated tenant. Three cases: clean lead, null-name lead, email-as-name lead. `curl -X POST .../api/sequences?action=process`. Verify completion + body content. Fire second curl to verify no duplicate send.

### Sequence Runaway Sends — Round 3, May 7, 2026 (afternoon)

After re-enabling cron from round 1+2 fixes, broken AI scratchpad emails fired again at 1:00 PM ET to multiple leads (Anith, Daniel, Tom). Investigation revealed:

- Source was `api/cron-signup-recovery.js` (NOT `api/sequences.js`) — separate cron with its own AI personalization that bypassed Layer 1 + Layer 2 entirely
- Plus 33 dormant `sgMail.send()` calls across the codebase, inherited from pre-Apr 29 SendGrid setup, all bypassing the hardened sendTenantEmail path

**Architectural fix:**
- Layer 1 (skip AI when name empty/email-shaped) and Layer 2 (block 18 meta-language patterns) moved INTO `sendTenantEmail()` itself, via new shared module `api/_lib/email-safety-gates.js`
- Layer 2 is unconditional on every send through sendTenantEmail, regardless of caller. Returns `{ sent: false, blocked: true }` if patterns match.
- 5 customer-facing direct `sgMail.send()` calls migrated to sendTenantEmail (helpdesk ×2, stripe-webhook ×2, fire-escalation ×1)
- `cron-signup-recovery` rewritten: dedup via `user_profiles.recovery_email_sent_at`, route through sendTenantEmail, write to messages table for audit
- Schedule changed: cron-signup-recovery from hourly to every 6 hours

**Banned pattern** (added to CLAUDE.md): direct SMTP sends to leads/contacts. ALL must go through sendTenantEmail. Internal admin notifications may still use direct SMTP if recipient is hardcoded to a known internal address.

**Outstanding cleanup (tracked in backlog):**
- Tier 2: cron-digest-scheduled still uses `sgMail.send()` to tenant admins (lower urgency). cron-email-digest and cron-stale-leads migrated to notifyTenantAdmins in Phase 7.
- Tier 3: 17 internal admin notification sites still use sgMail
- `send-email-gmail.js` — orphaned unauthenticated endpoint, no callers found, safe to delete or auth-protect

**Diagnostic patterns added:**
- Mixed clean/scratchpad emails to same recipient = parallel send path bypassing safety. Search for direct SMTP calls.
- "Sent emails not appearing in messages table" = code path skips the audit insert. Hunt that path.

### Sequence/recovery duplicate sender — Round 4, May 7, 2026 (evening)

Symptom: 5pm send despite morning dedup work — same recipient received emails May 5, 1pm today, 5pm today. Investigation revealed cron-signup-recovery had TWO output paths: a direct `sendTenantEmail` call AND a `safeEnrolSequence` call into the Abandoned Checkout Recovery sequence. When `cron-sequences` fired 4 hours later, it processed the sequence step and sent a second email to the same recipient.

Fix: removed the direct `sendTenantEmail` from cron-signup-recovery entirely. The cron now ONLY creates lead/contact + enrolls in the sequence. The sequence engine is the sole sender. `recovery_email_sent_at` semantic changed — now stamps after enrollment success (with retry-if-failed safety), not after email send.

New architectural principle added to CLAUDE.md: **"Single sender per outreach event"** — for any given event, only one code path sends the email. If a cron enrolls a lead in a sequence, the sequence engine sends. The cron does NOT also send.

**Diagnostic pattern added:** Same recipient getting emails from two different sources (cron direct + sequence) = dual-sender architecture. Check if the cron both sends AND enrolls.

### AI escalation duplicate-send — Round 4.5, May 7 evening

Symptom: Phase 8 verification ticket (TKT-202605-0014) emailed Rob with subject "AI Escalation: TKT-202605-0014" despite the new `flagForPlatformReview()` DB path being live and working. Rob received the email hours after the ticket was created.

Root cause: `api/helpdesk.js` `runAIResponse()` had a SEPARATE email path (37 lines) that fired on AI `[ESCALATE]` prefix — completely parallel to the `needs_platform_review` DB flag + dashboard badge built in Phase 5. Two visibility paths for the same event: DB flag (correct) + direct email (legacy).

Fix: deleted the entire AI escalation email block from `runAIResponse()`. AI escalation visibility is now entirely via `status=escalated` + `needs_platform_review=true` in DB, surfaced in HelpDesk dashboard with red badge + stat card + Mark Reviewed button.

Pattern: third instance today of "duplicate sender" structural debt (Round 3: cron + sequences, Round 4: cron-signup-recovery + sequences, Round 4.5: DB flag + email). Each closed one at a time as it surfaced. The "Single sender per outreach event" CLAUDE.md principle was added after Round 4 to prevent future instances.

### safeEnrolSequence sticky-status overwrite — Round 5, May 8, 2026

Symptom: 6 cancelled enrollments resurrected to active overnight by signup-recovery cron, then sent emails (Tom + 5 others). All had `lead_sequences.status = 'cancelled'` from the Round 4 cleanup SQL, but were overwritten back to `active` by `safeEnrolSequence`.

Root cause: `STICKY_STATUSES` blocklist in `api/_lib/safe-enrol-sequence.js` was `['error', 'paused_emergency', 'paused', 'cancelled_invalid_lead', 'completed']` — missing `'cancelled'` and all `cancelled_*` variants. When `cron-signup-recovery` called `safeEnrolSequence` for an existing cancelled row, the check passed (not in blocklist), and the upsert overwrote `cancelled` → `active`. The sequence engine then processed the active enrollment and sent the email.

Fix: inverted from blocklist to allowlist. `OVERWRITABLE_STATUSES = ['active']` — only `active` rows can be overwritten. Every other status (cancelled, completed, paused, error, and any future variant) is protected by default. New status strings are safe without code changes.

Pattern lesson: **Allowlist beats blocklist for state-machine guards.** This is the same lesson as the AI safety gates (Layer 2 blocks specific bad patterns, but Layer 1's "skip when name is empty" is the structural safety). Allowlists fail closed; blocklists fail open.

### Single-sender audit cleanup — Round 5.5, May 8, 2026 evening

Two final DUPLICATE SENDER sites resolved per the single-sender audit:

1. **stripe-webhook.js** (`checkout.session.expired`): handler enrolled lead in Abandoned Checkout Recovery sequence AND sent a direct sgMail recovery email. Same bug class as Round 4. Fix: deleted 27-line sgMail.send block. Sequence handles recovery.

2. **email-inbound.js** (reactivation + auto_reply): when an archived lead's email arrives, `reactivateArchivedLeadsForContact()` enrolls the lead in "New Lead — General Outreach" sequence, AND the AI decision may independently return `auto_reply` (direct send). Fix: `reactivateArchivedLeadsForContact` now returns the count synchronously (awaited, not fire-and-forget). If count > 0, auto_reply is skipped — sequence handles all outreach.

**Single-sender principle is now structurally enforced across all known outreach paths in the codebase.** The audit found 2 DUPLICATE SENDER, 11 SEQUENTIAL (OK), 1 TRANSACTIONAL (OK), 4 ACCEPTABLE (infrastructure), 2 CLEAN (already fixed). Zero DUPLICATE SENDER sites remain.

### Helpdesk ticket stuck in "AI handled + Open" state — May 7, 2026

Cause: AI response handler in api/helpdesk.js mapped to invalid status strings ('ai_active') that silently failed DB update due to missing status CHECK enforcement at app layer. Fix: explicit status mapping for [RESOLVED]/[PENDING]/[ESCALATE] prefixes, plus 'pending_review' fallback for unparseable AI output. Update errors now logged loudly instead of swallowed.

---

## 10. TCR / Compliance

### TCR Registration Flow
- **Provider:** Telnyx /v2/10dlc/campaignBuilder (PC-02 wizard). Legacy Twilio path in api/tcr.js still exists.
- **UI:** TCR Wizard (Day 2) — 6-step: Brand → Vetting → Campaign → Consent → Review → Status. Self-service, tenant-facing. Steps 1-3 are form-based with pre-populated templates (no AI assist). AI value reserved for Step 5 validation gate (Layer 3).
- **AI:** Step 5 validation gate uses Claude Sonnet to validate against use case enum + check URL compliance. generate_bundle endpoint available for future Step 4 repurpose.
- **Telnyx use case enum (15 values):** CUSTOMER_CARE, DELIVERY_NOTIFICATION, ACCOUNT_NOTIFICATION, MARKETING, 2FA, SECURITY_ALERT, POLLING_VOTING, CHARITY, POLITICAL, MIXED, LOW_VOLUME, SOLE_PROPRIETOR, EMERGENCY, AGENTS_FRANCHISES, SWEEPSTAKES
- **MNO status tracking:** Per-carrier (tmobile, att, verizon, uscc) provisioning status in `tcr_wizard_sessions.mno_status` JSONB. Campaign status: PENDING → ACTIVE when all MNOs active.
- **Supplier adapter:** `api/_lib/tcr-supplier.js` — mock mode (default) simulates per-carrier progression. Live mode calls Telnyx API with exponential backoff (1s/2s/4s/8s + jitter, 3 retries for 429s).
- **Webhook:** `tcr-webhook.js` receives Twilio status updates (legacy), Claude generates rejection coaching
- **Rejection coaching:** AI interprets carrier rejection text → plain-English explanation + specific fix + which wizard step to update

### WhatsApp Registration
- **Flow:** Meta Embedded Signup SDK → code exchange → WABA + phone provisioning
- **Tracking:** 5-stage provisioning in `whatsapp_provisioning` table
- **Gap:** No Meta Business verification check — customer can be "connected" but unable to send
- **Gap:** Auto-picks first WABA/phone (no selector for multi-WABA accounts)
- **Gap:** Template sync is manual (click to refresh)

### RCS
- **Status:** UI scaffolding only, no backend implementation
- **Gap:** No registration flow, no send/receive, no webhook handling
- `rcs_agents` table referenced but never created

### SMS Compliance
- Opt-in tracking via `sms_optins` table
- STOP/HELP keyword handling in `api/sms.js`
- A2P profile SID and customer profile SID stored as env vars

---

## 11. Pipeline Stages (from pipeline_stages table, 2026-04-30)

### Default Stages (all non-SP tenants, 7 stages)
| Order | Key | Display | Type | Auto-Advance |
|-------|-----|---------|------|-------------|
| 1 | lead | Lead | lead | No |
| 2 | active_qualified | Qualified | active | No |
| 3 | active_demo_scheduled | Demo Scheduled | active | Yes |
| 4 | active_pricing_sent | Pricing Sent | active | Yes |
| 5 | active_negotiating | Negotiating | active | No |
| 6 | closed_won | Customer | closed_won | No |
| 7 | closed_lost | Closed Lost | closed_lost | No |

### SP Tenant Stages (EngageWorx, 8 stages)
| Order | Key | Display | Type | Auto-Advance |
|-------|-----|---------|------|-------------|
| 1 | lead | Lead | lead | No |
| 2 | active_qualified | Qualified | active | No |
| 3 | active_sandbox_shared | Sandbox Shared | active | Yes |
| 4 | active_demo_shared | Demo Shared | active | Yes |
| 5 | active_pricing_sent | Pricing Sent | active | Yes |
| 6 | active_negotiating | Negotiating | active | No |
| 7 | closed_won | Customer | closed_won | No |
| 8 | closed_lost | Closed Lost | closed_lost | No |

### Stage Mapping (leads.stage → pipeline_stage_id)
| Old stage value | → stage_key (SP) | → stage_key (other) |
|----------------|-------------------|---------------------|
| inquiry | lead | lead |
| sandbox_shared | active_sandbox_shared | active_qualified |
| demo_shared | active_demo_shared | active_demo_scheduled |
| opportunity | active_pricing_sent | active_pricing_sent |
| customer | closed_won | closed_won |
| dormant | closed_lost | closed_lost |
