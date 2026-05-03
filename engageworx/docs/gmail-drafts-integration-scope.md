# Gmail Drafts Hybrid Integration — Scope

**Status:** Scoped, not started
**Identified:** 2026-05-03
**Estimated build:** 1-1.5 weeks (code) + 2-8 weeks (Google verification)
**Dependencies:** Action Board Phase 3 (shipped), user_notification_preferences (shipped)
**Related:** docs/oauth-gmail-integration-plan.md (inbound email capture — separate scope)

---

## Overview

Two parallel send paths from the Action Board:

1. **Send Now** — sends via Resend immediately (current behavior, stays default)
2. **Push to Gmail Drafts** — creates a draft in the user's Gmail, they review
   and send from their phone/desktop Gmail client

User chooses per-action or sets a default. Gmail connection is per-user, not
per-tenant (multiple users in a tenant can each connect their own Gmail).

---

## Rollout Strategy

### Phase 1: Testing Mode (week 1)
- Google OAuth app in "Testing" mode — up to 100 test users
- Deploy full feature behind `gmail_draft_enabled` feature flag on sp_settings
- Rob + internal team test end-to-end
- No Google verification needed for Testing mode

### Phase 2: Google Verification (parallel, weeks 2-8)
- Submit for Google CASA Tier 2 security assessment ($2-15K, 2-6 weeks)
- Required because `gmail.compose` is a restricted scope
- Prerequisites: privacy policy (shipped), terms of service (shipped),
  domain verification (engwx.com verified)
- Start verification in parallel with Phase 1 testing

### Phase 3: Production Rollout
- Once verified, remove 100-user cap
- Roll out to all users with Gmail accounts
- Monitor draft creation success rate + send-through rate

---

## Gmail OAuth Flow

### Scopes

```
https://www.googleapis.com/auth/gmail.compose    — create drafts, send on behalf
https://www.googleapis.com/auth/gmail.readonly    — check draft status (polling)
```

### Flow

1. User clicks "Connect Gmail" in Settings → Notifications
2. Redirect to Google OAuth consent screen with scopes + `access_type=offline`
   (needed for refresh token)
3. Google redirects to `/api/gmail-oauth-callback` with authorization code
4. Callback exchanges code for `access_token` + `refresh_token`
5. Store in `gmail_connections` table (encrypted at rest)
6. Redirect user back to Settings with success message
7. Token refresh: before every Gmail API call, check `token_expiry`. If expired,
   use `refresh_token` to get a new `access_token`. Update stored token.

### Disconnect Flow

User clicks "Disconnect Gmail" in Settings:
1. Revoke token via Google API: `POST https://oauth2.googleapis.com/revoke?token=...`
2. Delete `gmail_connections` row
3. Any action_items with `status='sent_to_drafts'` stay as-is (draft already in Gmail)

---

## Schema

### New table: `gmail_connections`

```sql
CREATE TABLE IF NOT EXISTS gmail_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT NOT NULL,
  token_expiry    TIMESTAMPTZ,
  gmail_email     TEXT NOT NULL,       -- the connected Gmail address
  scopes          TEXT[],
  connected_at    TIMESTAMPTZ DEFAULT now(),
  last_used_at    TIMESTAMPTZ
);

ALTER TABLE gmail_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own gmail connection" ON gmail_connections
  FOR ALL USING (user_id = auth.uid());
```

### action_items columns

```sql
ALTER TABLE action_items
  ADD COLUMN IF NOT EXISTS gmail_draft_id TEXT,
  ADD COLUMN IF NOT EXISTS gmail_draft_pushed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_via TEXT;  -- 'portal' | 'gmail_draft' | 'resend'
```

### user_notification_preferences column

```sql
ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS default_send_method TEXT DEFAULT 'portal'
    CHECK (default_send_method IN ('portal', 'gmail_draft'));
```

---

## Architecture: Push → Poll → Confirm

### Push to Gmail Drafts

```
User clicks "Push to Gmail" on action card
  → POST /api/action-items/push-to-gmail { action_item_id }
  → Read gmail_connections for auth.uid()
  → Refresh access_token if expired
  → Gmail API: POST /gmail/v1/users/me/drafts
      Body: { message: { raw: base64url(RFC 2822 email with To/Subject/HTML body) } }
  → Store gmail_draft_id + gmail_draft_pushed_at on action_item
  → Set status = 'sent_to_drafts', sent_via = 'gmail_draft'
  → UI updates card: "Draft pushed to Gmail — send when ready"
```

### Polling for Send Confirmation (Option B)

```
Cron: cron-gmail-draft-poll.js (every 30 minutes)
  → For each user with gmail_connections:
    → Query action_items WHERE status='sent_to_drafts' AND gmail_draft_id IS NOT NULL
    → For each, check Gmail API: GET /gmail/v1/users/me/drafts/{draft_id}
      → If 404 (draft no longer exists): draft was sent or deleted
        → Check Sent folder for message with matching subject+recipient
        → If found: mark status='sent', sent_at=message.internalDate
        → If not found: mark status='dismissed' (user deleted the draft)
      → If 200 (draft still exists): no action, still pending
    → Update last_used_at on gmail_connections
```

### Rate Limits

Gmail API quota: 250 quota units per user per second, 15K per minute.
`drafts.create` = 10 units. `drafts.get` = 5 units.
Polling 50 drafts per user per 30min = 250 units = well within limits.

---

## UI Changes to Action Board Card

### When user HAS gmail_connections row:

The "Approve & Send" button splits into two:

```
┌──────────────────────────────────────────────────────────┐
│ [Send Now]              [Push to Gmail ✉️]               │
│  gradient button          ghost button with Gmail icon   │
│  sends via Resend         creates draft in Gmail         │
└──────────────────────────────────────────────────────────┘
```

Default highlighted button follows `user_notification_preferences.default_send_method`.

### When user does NOT have gmail_connections:

Single "Approve & Send" button (current behavior).
Small text link below card actions: "Connect Gmail for draft mode →"
Links to Settings → Notifications.

### After push-to-drafts:

Card stays visible with updated state:

```
┌──────────────────────────────────────────────────────────┐
│ ✉️ Draft pushed to Gmail · 2 minutes ago                 │
│ Status: waiting for you to send from Gmail               │
│                                                          │
│ [Open in Gmail ↗]    [Cancel Draft]                      │
└──────────────────────────────────────────────────────────┘
```

"Open in Gmail" deep-links to `https://mail.google.com/mail/u/0/#drafts`.
"Cancel Draft" deletes the Gmail draft via API and marks action_item dismissed.

### Settings → Notifications additions

```
Gmail Connection
  ✉️ rob@engwx.com · Connected since May 3, 2026
  Default send method: [Send Now ▾ | Push to Gmail Drafts]
  [Disconnect Gmail]
```

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/gmail-oauth-start` | GET | Redirect to Google consent screen |
| `/api/gmail-oauth-callback` | GET | Exchange code for tokens, store connection |
| `/api/action-items/push-to-gmail` | POST | Create Gmail draft from action_item |
| `/api/cron-gmail-draft-poll` | POST | Poll sent status for pushed drafts |

---

## Build Estimate

| Task | Time | Blocker |
|------|------|---------|
| Google Cloud Console setup (OAuth client, scopes, consent screen) | 1 hour | None |
| gmail_connections migration + RLS | 30 min | None |
| action_items + preferences migrations | 30 min | None |
| OAuth flow endpoints (start + callback + disconnect) | 3-4 hours | None |
| Push-to-gmail endpoint (draft creation, RFC 2822 encoding) | 2-3 hours | None |
| Draft polling cron | 2-3 hours | None |
| Action Board UI split button + draft-pushed state | 2-3 hours | None |
| Settings → Notifications Gmail section | 1-2 hours | None |
| Token refresh logic + error handling | 1-2 hours | None |
| Testing in Testing mode (100 users) | 2-3 hours | None |
| **Total code work** | **~1-1.5 weeks** | |
| Google CASA Tier 2 assessment | 2-6 weeks | External, $2-15K |
| **Total including verification** | **3-8 weeks** | Google timeline |

---

## Security Considerations

- Access tokens and refresh tokens encrypted at rest in gmail_connections
- RLS: users can only read/modify their own connection
- Token refresh happens server-side only — tokens never sent to client
- Disconnect revokes token at Google before deleting local record
- OAuth callback validates `state` parameter to prevent CSRF
- Scopes are minimal: compose + readonly (no full gmail.modify)

---

## References

- docs/oauth-gmail-integration-plan.md: related but separate scope (inbound email capture)
- user_notification_preferences: Action Board Phase 1 (2026-04-30)
- action_items table: Action Board Phase 1
- Action Board UI: Phase 3 (commit 7f5f803)
