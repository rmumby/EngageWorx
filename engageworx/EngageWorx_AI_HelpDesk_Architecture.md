# EngageWorx AI Help Desk — Full Architecture Specification
**Version 1.0 | March 2026 | INTERNAL — NOT FOR DISTRIBUTION**

---

## 1. Overview

The EngageWorx AI Help Desk is a multi-tier, omnichannel autonomous support system. It handles customer enquiries end-to-end via AI until an issue requires human intervention, at which point it escalates with full context to the appropriate agent layer.

The system must accommodate three distinct operator models:

| Model | Description |
|---|---|
| **Direct Tenant** | Business signed up directly at engwx.com (self-serve or manually onboarded). Agents are their own staff. |
| **CSP White-Label (Full)** | CSP deploys EW under their brand. Their end-customers see the CSP brand only. Tickets and agents are fully within the CSP's layer. |
| **CSP White-Label (Hybrid)** | CSP has their own helpdesk. AI resolves Tier 1. Escalations go to CSP agents first. Issues beyond CSP capability open a ticket upstream to EW support. |

---

## 2. Tenant Hierarchy

```
EngageWorx (Platform Layer)
│
├── EW Support Team (EW Agents — for platform/infra issues)
│
├── Direct Tenants (engwx.com signups)
│   ├── AI Agent (Tier 1 — autonomous)
│   ├── Tenant Agents (Tier 2 — escalated human)
│   └── → EW Support (Tier 3 — platform issues only)
│
└── CSPs (White-Label Partners)
    ├── CSP Admin Layer
    │   ├── AI Agent (Tier 1 — autonomous, CSP-branded)
    │   ├── CSP Agents (Tier 2 — escalated human)
    │   └── → EW Support (Tier 3 — upstream only, invisible to end customer)
    │
    └── CSP Sub-Tenants (CSP's clients)
        └── Inherit CSP's AI + Agent setup
```

**Key rule:** End customers never know they are talking to EW infrastructure unless the CSP explicitly exposes it. EW branding is suppressed at the CSP layer.

---

## 3. Channel Strategy

Customers choose their preferred channel. The AI handles all channels identically. Channel selection is captured at conversation start and persists for the session.

| Channel | Inbound | Outbound | AI Capable | Live Agent Capable | Notes |
|---|---|---|---|---|---|
| **SMS** | ✅ | ✅ | ✅ | ✅ | A2P TCR required |
| **MMS** | ✅ | ✅ | ✅ | ✅ | Images from customers forwarded to agent |
| **WhatsApp** | ✅ | ✅ | ✅ | ✅ | Meta Business API |
| **Email** | ✅ | ✅ | ✅ | ✅ | Threaded; best for complex issues |
| **Voice** | ✅ | ✅ (outbound callback) | ✅ (IVR + NLU) | ✅ (warm transfer) | Twilio Voice; transcription to ticket |
| **RCS** | ✅ | ✅ | ✅ | ✅ | Rich cards for FAQs |
| **Web Chat** | ✅ | ✅ | ✅ | ✅ | Embedded widget on tenant site |

**Channel preference logic:**
1. Customer initiates on any channel
2. System records `preferred_channel` on the conversation
3. AI continues on same channel unless customer requests switch
4. If escalating to human, agent is notified on their agent inbox; they respond on the same channel the customer is using
5. Voice escalations trigger either: (a) live transfer to agent, or (b) callback request + ticket if no agent available

---

## 4. AI Agent Configuration (Per Tenant)

Each tenant configures their AI agent via the portal. Configuration stored in `ai_agent_config` table per tenant.

### 4.1 Configuration Fields

| Field | Description |
|---|---|
| `agent_name` | Display name shown to customers (e.g. "Aria") |
| `persona_prompt` | Business context, tone, FAQs injected into system prompt |
| `escalation_triggers` | Array of trigger types: complaint, refund, security, explicit_request, repeat_fail, legal |
| `escalation_mode` | `immediate` (first signal), `attempt_once` (try to resolve, escalate on second fail) |
| `business_hours` | JSON: days + time ranges per timezone |
| `out_of_hours_behaviour` | `queue` (ticket + notify) or `voicemail` (voice only) or `async_ai` (AI continues, agent notified) |
| `max_ai_turns` | Hard cap on AI turns before forced escalation (default: 10) |
| `allowed_channels` | Which channels this tenant has enabled for support |
| `kb_enabled` | Whether to inject knowledge base articles into context |
| `handoff_message` | What the AI says when escalating |

### 4.2 Escalation Trigger Types

| Trigger | Description |
|---|---|
| `complaint` | Detected negative sentiment / dissatisfaction |
| `refund_billing` | Any mention of refund, charge dispute, cancellation |
| `security` | Account access, password, data concerns |
| `explicit_request` | Customer directly asks for human |
| `repeat_fail` | AI attempted resolution twice, customer still unsatisfied |
| `legal` | Legal language, threats, regulatory references |
| `data_loss` | Reports of missing data or outage impact |
| `custom` | Tenant-defined keyword/phrase triggers |

---

## 5. Conversation & Ticket Flow

### 5.1 Standard AI-Resolved Flow
```
Customer contacts (any channel)
    → Conversation created in `conversations` table
    → AI responds autonomously
    → Issue resolved
    → Conversation marked `resolved_by_ai`
    → CSAT survey sent (optional, configurable)
```

### 5.2 Escalation Flow — Direct Tenant
```
Customer contacts
    → AI handles Tier 1
    → Escalation trigger detected
    → Ticket created in `support_tickets` (status: `pending_agent`)
    → Available agents notified (in-portal + email/SMS)
    → Agent accepts ticket → status: `agent_active`
    → Agent replies on same channel as customer
    → Issue resolved → status: `resolved_by_agent`
    → CSAT sent
```

### 5.3 Escalation Flow — CSP Full White-Label
```
Customer contacts CSP-branded widget
    → AI handles Tier 1 (CSP persona, CSP branding)
    → Escalation trigger detected
    → Ticket created under CSP's tenant in EW
    → CSP agents notified
    → CSP agent resolves
    → EW is never surfaced to end customer
    [If CSP agent cannot resolve — platform issue]
    → CSP agent opens upstream ticket to EW Support manually
    → EW Support ticket linked to original (internal reference only)
```

### 5.4 Escalation Flow — CSP Hybrid
```
Customer contacts
    → AI handles Tier 1
    → Escalation trigger detected
    → Ticket goes to CSP's own helpdesk system via webhook
        (EW sends full transcript + metadata as webhook payload)
    → CSP helpdesk agent handles in their own tool
    → If platform-level issue identified:
        → CSP opens ticket with EW Support via EW portal or API
        → EW Support ticket created, linked to CSP tenant
        → Resolution communicated back to CSP
```

---

## 6. Supabase Schema

### Core Tables

```sql
-- Tenant hierarchy
tenants (
  id uuid PK,
  parent_tenant_id uuid FK → tenants.id,  -- NULL for direct; CSP id for sub-tenants
  tenant_type  ENUM('direct', 'csp', 'csp_sub_tenant'),
  csp_mode     ENUM('full_whitelabel', 'hybrid') NULLABLE,  -- CSP only
  name text,
  brand_name text,  -- shown to end customers
  plan ENUM('starter','growth','pro','enterprise'),
  created_at timestamptz
)

-- AI agent config per tenant
ai_agent_configs (
  id uuid PK,
  tenant_id uuid FK → tenants.id UNIQUE,
  agent_name text DEFAULT 'Support Agent',
  persona_prompt text,
  escalation_triggers text[],  -- array of trigger type enums
  escalation_mode ENUM('immediate','attempt_once') DEFAULT 'attempt_once',
  business_hours jsonb,
  out_of_hours_behaviour ENUM('queue','voicemail','async_ai') DEFAULT 'queue',
  max_ai_turns int DEFAULT 10,
  allowed_channels text[],
  kb_enabled boolean DEFAULT false,
  handoff_message text,
  webhook_url text NULLABLE,  -- for hybrid CSP escalation
  updated_at timestamptz
)

-- All conversations across all channels
conversations (
  id uuid PK,
  tenant_id uuid FK → tenants.id,
  contact_id uuid FK → contacts.id,
  channel ENUM('sms','mms','whatsapp','email','voice','rcs','web_chat'),
  preferred_channel ENUM(...) NULLABLE,
  status ENUM('ai_active','escalated','agent_active','resolved_ai','resolved_agent','closed'),
  ai_turn_count int DEFAULT 0,
  escalation_reason text NULLABLE,
  escalated_at timestamptz NULLABLE,
  resolved_at timestamptz NULLABLE,
  resolved_by ENUM('ai','agent') NULLABLE,
  csat_score int NULLABLE,  -- 1-5
  created_at timestamptz,
  updated_at timestamptz
)

-- Messages within conversations
messages (
  id uuid PK,
  conversation_id uuid FK → conversations.id,
  role ENUM('customer','ai','agent','system'),
  content text,
  channel ENUM(...),
  media_urls text[],  -- MMS/RCS attachments
  is_escalation_trigger boolean DEFAULT false,
  sent_at timestamptz
)

-- Support tickets (created on escalation)
support_tickets (
  id uuid PK,
  ticket_number text UNIQUE,  -- e.g. TKT-20260001
  tenant_id uuid FK → tenants.id,
  conversation_id uuid FK → conversations.id,
  assigned_agent_id uuid FK → agents.id NULLABLE,
  parent_ticket_id uuid FK → support_tickets.id NULLABLE,  -- upstream EW ticket
  priority ENUM('low','medium','high','critical') DEFAULT 'medium',
  status ENUM('pending_agent','agent_active','pending_upstream','resolved','closed'),
  escalation_reason text,
  summary text,  -- AI-generated summary of issue
  transcript_snapshot jsonb,  -- full conversation at time of escalation
  webhook_dispatched boolean DEFAULT false,  -- for hybrid CSP
  webhook_response jsonb NULLABLE,
  created_at timestamptz,
  updated_at timestamptz
)

-- Human agents
agents (
  id uuid PK,
  tenant_id uuid FK → tenants.id,
  user_id uuid FK → auth.users.id,
  display_name text,
  role ENUM('agent','supervisor','admin'),
  notification_channels text[],  -- how to alert them: email, sms, in_portal
  is_available boolean DEFAULT true,
  current_ticket_count int DEFAULT 0,
  created_at timestamptz
)

-- Agent activity / audit
agent_activity (
  id uuid PK,
  agent_id uuid FK → agents.id,
  ticket_id uuid FK → support_tickets.id,
  action ENUM('accepted','replied','transferred','resolved','escalated_upstream'),
  note text NULLABLE,
  created_at timestamptz
)

-- Knowledge base articles (for AI context injection)
kb_articles (
  id uuid PK,
  tenant_id uuid FK → tenants.id,
  title text,
  content text,
  tags text[],
  is_active boolean DEFAULT true,
  created_at timestamptz
)
```

---

## 7. Agent Inbox — Feature Scope

### 7.1 Agent View (All Roles)
- Live ticket queue filtered to assigned + unassigned for their tenant
- Full conversation transcript with channel indicator
- Reply box — sends via same channel customer used
- Internal notes (not visible to customer)
- Transfer to another agent
- Mark resolved / close

### 7.2 Supervisor View (Additional)
- All tickets across all agents in their tenant
- Agent availability dashboard (online/offline/busy)
- Assignment override — reassign any ticket
- Live monitoring — view ongoing AI conversations before escalation
- Intervention — supervisor can "intercept" an AI conversation and take over without waiting for escalation trigger

### 7.3 EW Admin View (Additional — Rob / EW Staff)
- All tickets across all tenants (filtered by tenant)
- Upstream tickets from CSP hybrid escalations
- Platform health indicators
- Tenant configuration access

---

## 8. Notification Routing

When a ticket is created, notifications fire based on agent preferences:

| Trigger | Notification |
|---|---|
| New escalated ticket | In-portal alert + configured channels (email/SMS) |
| Ticket unacknowledged > N mins | Re-alert + supervisor notified |
| Customer replies to pending ticket | Agent notified immediately |
| Ticket assigned to agent | Agent notified |
| Upstream ticket created (hybrid CSP) | EW Support team notified |

---

## 9. Voice-Specific Escalation

Voice calls handled by `twilio-voice.js`. During an AI-handled IVR call:

- If escalation trigger detected mid-call → warm transfer to available agent
- If no agent available → collect callback number + create ticket → agent calls back
- Full call transcript (via Twilio transcription) appended to ticket
- Recording URL stored in `messages` table as `media_url`

---

## 10. Implementation Phases

| Phase | Scope | Target |
|---|---|---|
| **Phase 1** | Supabase schema, AI agent config UI, basic web chat widget | Now |
| **Phase 2** | Agent inbox (all roles), ticket management, notifications | Next |
| **Phase 3** | All channel integrations (SMS/WhatsApp/Email/Voice/RCS) | Following |
| **Phase 4** | CSP hybrid webhook escalation, upstream tickets | Following |
| **Phase 5** | KB integration, CSAT, reporting dashboard | Following |

---

*This document is the canonical architecture reference. All development should align to this spec. Update version number on any structural change.*
