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
- Direct `sgMail` callers in crons/sequences still use SendGrid
- `RESEND_API_KEY` is primary, `SENDGRID_API_KEY` still in use for direct callers

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

---

## 5. Database Tables

### Core Tables
| Table | Purpose | RLS | Key Columns |
|-------|---------|-----|-------------|
| `tenants` | Tenant records | Yes | id, name, customer_type, entity_tier, parent_tenant_id, legal_entity_id, plan, email_send_method, primary_contact_email, primary_contact_first_name, primary_contact_last_name, contract_type |
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

### Support Tables
| Table | Purpose |
|-------|---------|
| `support_tickets` | Help desk tickets |
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

### Direct Business Plans (is_published=true, is_csp_tier=false)
| Slug | Name | Price | SMS Limit | Contacts | Seats | Channels |
|------|------|-------|-----------|----------|-------|----------|
| starter | Starter | $99/mo | 5,000 | 10,000 | 3 | 2 |
| growth | Growth | $249/mo | 25,000 | 50,000 | 10 | 4 |
| pro | Pro | $499/mo | 50,000 | 100,000 | 25 | 6 |
| enterprise | Enterprise | Custom | 250,000 | 500,000 | 100 | 6 |

### CSP Tiers
| Slug | Name | Price | Published | SMS Limit | Contacts | Seats |
|------|------|-------|-----------|-----------|----------|-------|
| silver | Silver | $499/mo | Yes | 10,000 | 50,000 | 10 |
| gold | Gold | $1,499/mo | No | 50,000 | 200,000 | 50 |
| platinum | Platinum | $3,999/mo | No | 200,000 | 500,000 | 200 |
| diamond | Diamond | $7,999/mo | No | 500,000 | 1,000,000 | 500 |

### Other Plans (is_published=false)
| Slug | Name | Notes |
|------|------|-------|
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
| `/api/vip-followup` | POST | AI VIP follow-up draft |
| `/api/read-card` | POST | OCR business card reading |
| `/api/detect-brand` | POST | Brand detection from URL |
| `/api/check-models` | GET | Verify available AI models |

### Messaging Endpoints
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/sms` | POST | SMS send/webhook |
| `/api/whatsapp` | POST | WhatsApp send/webhook |
| `/api/meta-whatsapp` | POST | Meta WhatsApp API |
| `/api/email` | POST | Email send/test/template |
| `/api/send-email-gmail` | POST | Gmail SMTP send |
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
| `/api/stripe-webhook` | POST | Stripe event webhook |
| `/api/usage` | POST/GET | Usage metering |

### Support
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/helpdesk` | POST/GET | Ticket management |
| `/api/support-triage` | POST | Auto-triage tickets |
| `/api/send-digest-reply` | POST | Digest reply as email |

### TCR / Compliance
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/tcr` | GET/POST | TCR registration (prefill, validate, submit) |
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
| `/api/cron-stale-leads` | Hourly | Flag stale pipeline leads |
| `/api/cron-tenant-engagement` | Daily | Tenant health/engagement |
| `/api/cron-signup-recovery` | Hourly | Recover abandoned signups |
| `/api/cron-email-digest` | Hourly | Generate/send email digests |
| `/api/cron-digest-scheduled` | 30min | Execute scheduled digest actions |
| `/api/cron-usage-alerts` | Daily | Usage threshold alerts |
| `/api/cron-channel-health` | Daily | Channel health checks |
| `/api/cron-archive-leads` | Daily | Archive old leads |
| `/api/cron-weekly-update` | Weekly | Platform update summary |
| `/api/cron-health-check` | Hourly | Platform health monitoring |
| `/api/cron-sequences` | 15min | Process due sequence steps |
| `/api/cron-tcr-poll` | Hourly | Poll Twilio TCR status |

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
| `/api/signup-notify` | POST | Signup alert to admin |
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

---

## 10. TCR / Compliance

### TCR Registration Flow
- **Provider:** Twilio A2P 10DLC
- **UI:** 4-step wizard in `TCRRegistration.jsx` (Business Info → AI Copy → Compliance Check → Status)
- **AI:** Claude generates sample messages + validates against rejection patterns (score 0-100, threshold 80)
- **Few-shot:** Pulls approved templates from `tcr_approved_templates` for Claude context
- **Webhook:** `tcr-webhook.js` receives Twilio status updates, Claude generates rejection coaching
- **Gap:** Privacy/terms/consent URLs not collected or validated pre-submission
- **Gap:** Rejection coaching generated by Claude but only shown to SP admin, not customer

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
