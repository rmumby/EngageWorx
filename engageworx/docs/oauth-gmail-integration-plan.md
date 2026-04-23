# OAuth Gmail Integration — Inbound Email Auto-Capture

**Status:** Planning — DO NOT BUILD  
**Author:** Rob Mumby / Claude  
**Date:** 2026-04-23  
**Version:** 1.0

---

## 1. Google Cloud Console Setup

### Steps
1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create or select the EngageWorx project
2. Enable the **Gmail API** under APIs & Services → Library
3. Configure **OAuth consent screen**:
   - App name: EngageWorx
   - User support email: rob@engwx.com
   - App logo: EngageWorx logo (must be under 1MB)
   - App domain: portal.engwx.com
   - Authorized domains: engwx.com
   - Developer contact: rob@engwx.com
   - Scopes: see section 2
4. Create **OAuth 2.0 Client ID**:
   - Type: Web application
   - Name: EngageWorx Portal
   - Authorized JavaScript origins: `https://portal.engwx.com`
   - Authorized redirect URIs: `https://portal.engwx.com/api/gmail-oauth-callback`
5. Note the **Client ID** and **Client Secret** → store in Vercel env vars:
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`

### Environment Variables Required
```
GOOGLE_OAUTH_CLIENT_ID=<from console>
GOOGLE_OAUTH_CLIENT_SECRET=<from console>
GOOGLE_OAUTH_REDIRECT_URI=https://portal.engwx.com/api/gmail-oauth-callback
```

---

## 2. OAuth Scopes

### Minimum Viable (Phase 1)
| Scope | Purpose |
|-------|---------|
| `https://www.googleapis.com/auth/gmail.readonly` | Read emails and metadata. Enough for inbound capture. |
| `https://www.googleapis.com/auth/userinfo.email` | Identify the connected Google account email. |
| `openid` | Required for ID token. |

### Ideal (Phase 2 — if we want to send via Gmail API)
| Scope | Purpose |
|-------|---------|
| `https://www.googleapis.com/auth/gmail.send` | Send email as the user (replaces SMTP relay). |
| `https://www.googleapis.com/auth/gmail.modify` | Mark messages as read, archive, label after processing. |

### Recommendation
Start with `gmail.readonly` + `userinfo.email` + `openid`. This avoids Google's "sensitive scope" review for send/modify. `gmail.readonly` is still a restricted scope requiring verification, but the review is simpler than `gmail.send`.

---

## 3. Google Verification Requirements & Timeline

### Scope Classification
- `gmail.readonly` is a **restricted scope** — requires Google OAuth verification
- `gmail.send` / `gmail.modify` are also restricted — same tier

### Verification Process
1. Submit OAuth consent screen for review in Google Cloud Console
2. Google requires:
   - Privacy policy URL (must be on engwx.com domain)
   - Terms of service URL
   - App homepage
   - Explanation of why each scope is needed (written justification)
   - YouTube video demonstrating the OAuth flow (screen recording showing consent, data usage)
   - CASA Tier 2 security assessment (for restricted scopes) — this is a third-party audit
3. **Timeline: 4-8 weeks** for restricted scope verification
4. **Interim:** During development, use "Testing" mode (limited to 100 test users manually added in the console). Production launch requires completed verification.

### Workaround for Development
- Keep consent screen in "Testing" mode
- Manually add test Google accounts (rob@engwx.com, team accounts)
- Up to 100 test users — enough for SP Admin + early tenants
- Move to "Production" mode only when the CASA assessment is done

---

## 4. Schema Additions

### New Table: `gmail_connections`
```sql
CREATE TABLE public.gmail_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  google_email TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{}',
  history_id BIGINT,                -- Gmail push notification cursor
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'active', -- active | paused | error | revoked
  sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, google_email)
);

-- RLS: users can only see their own connections
ALTER TABLE gmail_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own" ON gmail_connections
  FOR ALL USING (user_id = auth.uid());
```

### New Table: `gmail_sync_log`
```sql
CREATE TABLE public.gmail_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES gmail_connections(id) ON DELETE CASCADE,
  synced_at TIMESTAMPTZ DEFAULT now(),
  messages_fetched INT DEFAULT 0,
  messages_imported INT DEFAULT 0,
  messages_skipped INT DEFAULT 0,
  error TEXT,
  duration_ms INT
);
```

### Column Additions to Existing Tables
```sql
-- messages table: track Gmail source
ALTER TABLE messages ADD COLUMN IF NOT EXISTS gmail_message_id TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS gmail_thread_id TEXT;

-- contacts table: track which contacts have Gmail-linked conversations
-- (no changes needed — existing email field is sufficient for matching)
```

---

## 5. Sync Strategy

### Option A: Pub/Sub Push (Recommended)
Google Cloud Pub/Sub push notifications:
1. Create a Pub/Sub topic: `projects/engwx/topics/gmail-push`
2. Create a push subscription pointing to: `https://portal.engwx.com/api/gmail-push-webhook`
3. When a user connects, call `users.watch()` → Gmail sends push notifications to our webhook on every new message
4. Webhook receives `{ emailAddress, historyId }` → fetch new messages since last `historyId`
5. `users.watch()` must be renewed every 7 days (cron job)

**Pros:** Real-time (< 10s latency), no polling waste, respects rate limits  
**Cons:** Requires Google Cloud Pub/Sub setup, webhook must be publicly accessible, watch renewal cron

### Option B: Polling (Simpler, Higher Latency)
1. Cron job every 2-5 minutes: `GET /users/me/messages?q=after:<last_sync_timestamp>`
2. Fetch new messages, match contacts, import

**Pros:** Simpler setup, no Pub/Sub dependency  
**Cons:** 2-5 min latency, wastes API quota on empty polls, harder to scale

### Recommendation
**Phase 1: Polling** (cron every 3 minutes) — get it working, validate the contact-match logic  
**Phase 2: Pub/Sub push** — switch to real-time once polling is proven

### Rate Limits
- Gmail API: 250 quota units/user/second, 25,000 quota units/user/day
- `messages.get`: 5 units per call
- `messages.list`: 5 units per call
- `history.list`: 2 units per call
- Practical limit: ~5,000 message fetches/user/day (more than enough)
- Batch requests: up to 100 calls per batch (reduces HTTP overhead)

---

## 6. Contact-Match Logic

### Which Threads to Import
1. Extract all participants from each Gmail thread (From, To, Cc)
2. For each participant email:
   - Query `contacts` table: `SELECT id FROM contacts WHERE email = $1 AND tenant_id = $2`
   - If match → import this thread into the contact's conversation in Live Inbox
   - If no match → skip (don't create contacts from Gmail — that's the user's CRM)
3. Import the **latest message per thread** that hasn't been imported yet (deduplicate by `gmail_message_id`)

### What to Skip
- Threads where NO participant matches a known contact → skip entirely
- Messages already imported (check `gmail_message_id` in messages table)
- Messages sent BY the connected user (direction = outbound) — import these too for full thread context, but mark as `direction: 'outbound'`
- Draft messages → skip
- Spam/Trash labels → skip
- Mailing list messages (List-Unsubscribe header present) → skip (use the ingestion filter from inbound-email.js)

### Thread Mapping
- One Gmail thread → one EngageWorx conversation
- Store `gmail_thread_id` on the conversation for future sync
- If conversation already exists for that contact+email channel → append messages to it
- If not → create new conversation

### Message Direction Detection
- From = connected user's Google email → `direction: 'outbound'`, `sender_type: 'agent'`
- From = anyone else → `direction: 'inbound'`, `sender_type: 'contact'`

---

## 7. UI Flow

### Connect Gmail Button Location
- **Settings → Channels → Email** section: "Connect Gmail" card below the existing SendGrid config
- **Also accessible from:** AI Omni Digest setup checklist, Live Inbox empty state

### Connect Flow
1. User clicks "Connect Gmail"
2. Info modal explains:
   - "EngageWorx will read your Gmail inbox to automatically capture conversations with your contacts"
   - "Only emails from contacts already in your CRM are imported"
   - "EngageWorx cannot send emails, delete emails, or access other Google services"
   - Scope explanation in plain English
3. User clicks "Continue with Google" → redirect to Google OAuth consent screen
4. User approves → redirect back to `/api/gmail-oauth-callback`
5. Callback exchanges code for tokens, stores encrypted, starts initial sync
6. UI shows: "✅ Connected as rob@engwx.com — syncing last 7 days of emails..."
7. Initial sync completes → "✅ Gmail connected — 47 conversations imported"

### Connected State UI
- Show connected Google email address
- Last sync timestamp
- Sync status badge (Active / Syncing / Error)
- "Disconnect" button (with confirmation)
- "Sync Now" manual trigger button
- Stats: messages imported today, total imported

### Disconnect Flow
1. User clicks "Disconnect Gmail"
2. Confirmation: "This will stop importing emails. Existing imported messages will remain."
3. Revoke Google token via `https://oauth2.googleapis.com/revoke`
4. Delete `gmail_connections` row (cascade deletes sync_log)
5. Imported messages remain in Live Inbox (don't delete)

---

## 8. Error States & Recovery

| Error | Detection | Recovery |
|-------|-----------|----------|
| Token expired | 401 from Gmail API | Auto-refresh using refresh_token |
| Token revoked by user | 401 + refresh fails | Set sync_status='revoked', show "Reconnect" button |
| Refresh token missing | Token exchange didn't return one | Prompt re-auth with `access_type=offline&prompt=consent` |
| API quota exhausted | 429 from Gmail API | Exponential backoff, pause sync for 1 hour, log to sync_log |
| User deleted from platform | ON DELETE CASCADE | Tokens auto-deleted, sync stops |
| Google account deleted | 404 from Gmail API | Set sync_status='error', notify user |
| Network timeout | Fetch timeout | Retry 3x with backoff, then skip cycle |
| Malformed email body | Parse error | Skip message, log to sync_log.error, continue |

### Token Refresh Flow
1. Before any Gmail API call, check `token_expires_at`
2. If expired (or within 5 minutes of expiry):
   - POST `https://oauth2.googleapis.com/token` with `grant_type=refresh_token`
   - Update `access_token_encrypted` and `token_expires_at`
3. If refresh fails with `invalid_grant`:
   - Set `sync_status='revoked'`
   - Show "Your Gmail connection has expired. Click to reconnect."

---

## 9. Security Considerations

### Token Storage
- **Never store tokens in plaintext.** Use AES-256-GCM encryption at rest.
- Encryption key: `GMAIL_TOKEN_ENCRYPTION_KEY` env var (32-byte hex)
- Encrypt before INSERT, decrypt before use
- Token columns use `_encrypted` suffix as reminder

### Scope Minimization
- Request only `gmail.readonly` (Phase 1) — cannot send, delete, or modify
- Do not request `gmail.compose`, `gmail.insert`, or `gmail.settings.basic`
- Display granted scopes in UI so user knows exactly what's permitted

### Data Handling
- Only import message body text (strip HTML), subject, from/to, timestamp
- Do not store attachments (Phase 1) — just note "attachment present"
- Body text truncated to 10,000 chars per message
- Images/inline content stripped

### Access Control
- `gmail_connections` has RLS: users see only their own connections
- Server-side: all Gmail API calls scoped to the connection's stored tokens
- Admin (SP) can view connection status (connected/error) but NOT access tokens
- ON DELETE CASCADE ensures cleanup when user or tenant is removed

### Audit Trail
- `gmail_sync_log` records every sync cycle with counts and errors
- Token refresh events logged with timestamp
- Connection/disconnection events logged

---

## 10. Estimated Effort

| Task | Estimate | Dependencies |
|------|----------|-------------|
| Google Cloud Console setup (OAuth, consent screen) | 1 hour | Google Cloud access |
| Schema migration (tables, columns) | 30 min | Supabase access |
| OAuth flow endpoints (authorize, callback, disconnect) | 3 hours | Client ID + Secret |
| Token encryption/decryption helper | 1.5 hours | Encryption key |
| Gmail API sync function (fetch, parse, match, import) | 4 hours | Schema + OAuth flow |
| Polling cron job (every 3 min) | 1 hour | Sync function |
| Settings UI (Connect/Disconnect/Status) | 2 hours | OAuth endpoints |
| Contact-match and dedup logic | 2 hours | Sync function |
| Error handling and token refresh | 1.5 hours | OAuth flow |
| Testing with real Gmail accounts | 2 hours | All above |
| **Total Phase 1 (polling)** | **~18 hours** | |
| Pub/Sub push migration (Phase 2) | 4 hours | Phase 1 complete |
| Google verification submission | 2 hours + 4-8 week wait | Privacy policy, video |

---

## 11. Prerequisites & Dependencies

### Must Be Done BEFORE This Feature
1. **Privacy policy page** on engwx.com — required for Google verification
2. **Terms of service page** on engwx.com — required for Google verification
3. **GMAIL_TOKEN_ENCRYPTION_KEY** generated and stored in Vercel env vars
4. **Google Cloud project** created with billing enabled (for Pub/Sub in Phase 2)

### Can Be Built ALONGSIDE
- Outbound email tracking BCC fix (already done — no conflict)
- AI Omni BCC feature (already done — no conflict)
- Voice channel fixes (independent)
- Live Inbox dedup (independent — Gmail imports will use the same dedup logic)

### Should Be Built AFTER
- **Layered system prompt** (done) — Gmail-imported emails will use the same AI reply path
- **Inbound email SendGrid fix** (done) — ensures AI replies actually send
- **Email ingestion filter** (done) — Gmail imports should also respect blocked domains
- **Contact management stabilization** — Gmail import relies on stable contact records

### Recommended Build Order
1. ~~Layered system prompt~~ ✅
2. ~~Inbound email send fix~~ ✅
3. ~~Email ingestion filter~~ ✅
4. **Google Cloud Console setup** ← do this now (no code, just config)
5. **Privacy policy + ToS pages** ← needed for verification
6. **Submit for Google verification** ← start the 4-8 week clock
7. **Build OAuth flow** ← can develop in Testing mode with 100 users
8. **Build sync + import** ← bulk of the work
9. **Build UI** ← final step
10. **Google verification completes** ← production launch

### Risk: CASA Assessment
Google requires a CASA Tier 2 security assessment for restricted scopes (gmail.readonly). This is a third-party audit costing $2,000-$15,000 depending on the assessor. The timeline is 2-6 weeks after submission. This is the primary blocker for production launch.

**Mitigation:** Start with Testing mode (100 users). If EngageWorx has fewer than 100 Gmail-connected users initially, this is sufficient. Submit for verification in parallel.

---

## Open Questions

1. **Should each team member connect their own Gmail, or does one admin connect and import for the whole tenant?**
   - Recommendation: Per-user. Each agent connects their own inbox. Imported threads are visible to the whole tenant in Live Inbox.

2. **What's the initial sync window?**
   - Recommendation: 7 days of history on first connect. Going further back risks importing thousands of irrelevant messages.

3. **Should we support Google Workspace (formerly G Suite) service accounts?**
   - Service accounts with domain-wide delegation can access all users' Gmail without individual OAuth. Better for enterprise tenants but adds complexity.
   - Recommendation: Defer to Phase 3.

4. **Should imported Gmail messages trigger AI auto-reply?**
   - Probably not — the user has already seen and possibly replied to these emails in Gmail.
   - Recommendation: Import as read-only context. Only trigger AI for NEW inbound messages arriving after connection.
