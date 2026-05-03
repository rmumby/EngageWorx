# VIP AI-Suggested System — Scope

**Status:** Scoped, not started
**Identified:** 2026-05-03
**Estimated build:** 1-2 days
**Dependencies:** Action Board Phase 3 (shipped), action_items table (shipped)

---

## Overview

AI evaluates contacts/leads weekly against behavioral and positional signals,
flags VIP candidates with a confidence score and reason, surfaces them in the
Action Board for human confirmation. Never auto-sets `is_vip` — always requires
human approval.

---

## Schema Additions

```sql
-- On contacts table (already has is_vip, vip_marked_at, priority_until)
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS vip_suggested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vip_suggested_reason TEXT,
  ADD COLUMN IF NOT EXISTS vip_suggested_score INT;  -- 0-100 confidence
```

No new tables. Suggestions are flags on the contact row, surfaced as action_items
with source `'vip_suggestion'`.

---

## Signal Criteria

| Signal | Weight | Source | Measurement |
|--------|--------|--------|-------------|
| C-level title | High (30pts) | contacts.title | CEO, CTO, CFO, COO, VP, President, Founder, Owner, Director |
| Deal value > $5K | High (25pts) | leads.deal_value or leads.estimated_value | Any associated lead with value above threshold |
| Response time < 2hr avg | Medium (15pts) | messages table | Average time between inbound msg and next agent/bot reply |
| 5+ conversations in 90 days | Medium (15pts) | conversations table | Count WHERE contact_id AND created_at > 90 days ago |
| Referred other contacts/tenants | High (20pts) | tenants.referred_by | Parent tenant or referral chain includes this contact |
| Manual priority flag 3+ times | Medium (10pts) | action_items WHERE manually_promoted = true | Count of manually promoted items for this contact |
| Plan tier weighting | Modifier | tenants.plan | Enterprise/Pro contacts weighted 1.5x, Starter weighted 0.8x |
| Escalation target in rules | Low (5pts) | escalation_rules.action_config.notify_user_id | Contact is already a configured escalation target |

**Scoring:** Sum of applicable signal points × plan tier modifier. Threshold
for suggestion: score >= 60. Maximum theoretical score: ~120 (before modifier).

---

## Surfacing Logic

### New cron: `cron-vip-suggestions.js`

Runs weekly (Sunday 10:00 UTC). For each tenant:

1. Query all contacts WHERE `is_vip = false` AND (`vip_suggested_score IS NULL`
   OR `vip_suggested_score = 0` AND `vip_suggested_at < now() - interval '90 days'`)
2. For each contact, compute signal score using DB queries
3. For contacts scoring >= 60, call Claude Haiku with signal summary to generate
   a one-sentence `vip_suggested_reason`
4. Set `vip_suggested_at`, `vip_suggested_reason`, `vip_suggested_score` on
   the contact row
5. Create action_item with:
   - `source: 'vip_suggestion'`
   - `tier: 'priority'`
   - `contact_id: contact.id`
   - `title: "Mark {name} as VIP?"`
   - `context: "{reason}. Score: {score}/100."`
   - `suggested_action: "Confirm VIP status"`

### Dedup

The action_items dedup index prevents duplicate suggestions for the same
contact. If a suggestion is dismissed, the contact's `vip_suggested_score`
is set to 0, suppressing re-suggestion for 90 days (the WHERE clause
in step 1 checks this).

---

## Confirmation Flow in UI

### Action Board card variant for `vip_suggestion`

When `source === 'vip_suggestion'`, the card renders differently:

- **Title:** "Mark Andy Grasso as VIP?"
- **Context:** "CEO at White Label Comms. 8 conversations in 90 days, avg
  response time 45min, $50K deal value. Score: 85/100."
- **Two buttons only** (not the standard four):
  - **"Confirm VIP"** (primary gradient button)
    → `contacts.is_vip = true`, `vip_marked_at = now()`
    → action_item `status = 'sent'` (reusing sent as "actioned")
  - **"Not VIP"** (ghost button)
    → `contacts.vip_suggested_score = 0` (suppresses 90 days)
    → action_item `status = 'dismissed'`
- **No** Edit, Snooze, or Approve & Send buttons
- **No** draft preview section (not an email action)

### Signal breakdown

Below the context line, show a collapsible signal breakdown:

```
▶ Signal breakdown
  ✓ C-level title: CEO (30pts)
  ✓ Deal value: $50,000 (25pts)
  ✓ Response time: avg 45min (15pts)
  ✓ 8 conversations in 90 days (15pts)
  ✗ No referrals detected (0pts)
  Plan modifier: Pro (1.0x)
  Total: 85/100
```

---

## Build Estimate

| Task | Time |
|------|------|
| Migration (3 columns on contacts) | 30 min |
| `cron-vip-suggestions.js` + Haiku scoring | 3-4 hours |
| Action Board card variant (confirm/reject UI) | 1-2 hours |
| Signal breakdown collapsible | 30 min |
| Testing + edge cases | 1-2 hours |
| **Total** | **6-9 hours** |

---

## References

- contacts.is_vip, vip_marked_at: added in Action Board Phase 1 (2026-04-30)
- C-level title detection: action-item-generator.js determineTier()
- action_items table + dedup index: Action Board Phase 1
- Action Board UI: Phase 3 (commit 7f5f803)
