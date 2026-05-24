# Outbound Channel Routing Audit

Date: 2026-05-24
Scope: Every outbound sender that picks a phone number / sender identity for a tenant

---

## Findings

### 1. SMS — `api/sms.js` sendSMS helper (line 205) + action='send' (line 381)

| Attribute | Detail |
|-----------|--------|
| Credential source | SP env vars only: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` |
| Sender number | Caller-supplied `from` param, else `TWILIO_PHONE_NUMBER` env var, else `TWILIO_MESSAGING_SERVICE_SID` |
| phone_numbers table | Not queried |
| channel_configs JSONB | Not queried |
| SP fallback | Always — all tenants send through SP credentials |
| phone_supplier aware | No |
| Bug class match | No JSONB reconstruction, but no per-tenant credential isolation either |

### 2. Sequence SMS — `api/sequences.js` sendStep (line 233)

| Attribute | Detail |
|-----------|--------|
| Credential source | SP env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` |
| Sender number | `channel_configs.config_encrypted.phone_number` (JSONB) → fallback to `TWILIO_PHONE_NUMBER` env var |
| phone_numbers table | Not queried |
| channel_configs JSONB | **Yes — same bug class as old inbound resolvers.** Reads `phone_number` from JSONB which has malformed data in production (double country codes). |
| SP fallback | Yes — credentials always SP |
| phone_supplier aware | No |
| Impact | A tenant with a number in `phone_numbers` but malformed data in `channel_configs` JSONB would send from the wrong number or fall back to SP number |

### 3. Sequence Email — `api/sequences.js` sendStep (line 167)

| Attribute | Detail |
|-----------|--------|
| Credential source | `channel_configs.config_encrypted.from_email` → passed to `sendTenantEmail()` |
| sendTenantEmail routing | `tenant.email_send_method` column (gmail/smtp/resend) |
| SP fallback | Via sendTenantEmail grace period (platform Resend) with violation logging |
| phone_supplier aware | N/A (email) |
| Bug class match | Clean — no JSONB phone reconstruction |

### 4. WhatsApp Send — `api/whatsapp.js` action='send' (line 225)

| Attribute | Detail |
|-----------|--------|
| Credential source | `channel_configs` for Meta path (phone_number_id + access_token from JSONB). SP env vars for Twilio path. |
| Gateway decision | If JSONB has `phone_number_id` + `access_token` → Meta. Else → Twilio (SP credentials). |
| phone_numbers table | Not queried |
| channel_configs JSONB | Yes — reads Meta credentials from JSONB (correct path, not the malformed phone_number field) |
| SP fallback | Twilio path uses SP credentials as default |
| phone_supplier aware | No |
| Bug class match | Partially — Meta path reads correct fields. Twilio fallback is SP-only. |

### 5. Voice Outbound — `api/twilio-voice.js`

Three outbound paths:

**a) Forward-to dial (line 347):**
- Uses `body.From` (caller's number) as callerId
- Dials `config.forward_to` number
- Credentials: SP env vars
- No tenant sender resolution

**b) Department routing (line 486):**
- Reconstructs destination from `config_encrypted.departments[].country` + `departments[].number`
- Uses `body.To` (tenant's number) as callerId — correct
- Credentials: SP env vars

**c) Calendly SMS (line 199):**
- Sends SMS using SP env vars
- From: the inbound call's To number (tenant's number, passed through)
- No tenant credential lookup

| phone_numbers table | Not queried in any outbound path |
| phone_supplier aware | No |

### 6. Email — `api/_lib/send-tenant-email.js` (line 83)

| Attribute | Detail |
|-----------|--------|
| Credential source | `tenant.email_send_method` → gmail (env SMTP) / smtp (`tenant.smtp_config_encrypted`) / resend (global `RESEND_API_KEY` + tenant's verified domain) |
| SP fallback | Grace period: platform Resend with violation logging. Strict mode: throws. |
| phone_supplier aware | N/A (email) |
| Bug class match | Clean — proper per-tenant routing via `email_send_method` column |

### 7. Email Sender Display — `api/_lib/get-tenant-sender.js` (line 12)

Email display-name resolution only. Cascade: user sender override → chatbot config → tenant primary contact → platform default. No phone logic. Clean.

---

## Summary Table

| Outbound Path | Uses phone_numbers? | JSONB phone bug? | SP credential fallback? | phone_supplier aware? |
|---|---|---|---|---|
| sms.js sendSMS | No | No | Always | No |
| sequences.js SMS | No | **Yes** | Always | No |
| whatsapp.js send (Meta) | No | No (reads correct fields) | No | No |
| whatsapp.js send (Twilio) | No | No | Always | No |
| twilio-voice.js forward/dept | No | No | Always | No |
| sendTenantEmail | N/A | N/A | Grace period | N/A |

---

## Recommended Follow-Up (not in this PR)

1. **Sequence SMS sender number:** Replace `channel_configs.config_encrypted.phone_number` JSONB read with a `phone_numbers` table query: `SELECT number FROM phone_numbers WHERE tenant_id = $1 AND status = 'active' LIMIT 1`. This fixes the malformed JSONB data issue for outbound.

2. **Per-tenant SMS credentials:** When BYOC (Bring Your Own Carrier) tenants exist, the `sendSMS` helper needs to accept per-tenant credentials instead of always using SP env vars. This requires a `getTenantSmsCredentials(tenantId)` helper that reads from `channel_configs` or a future `tenant_carrier_credentials` table.

3. **phone_supplier routing:** All SMS/voice outbound paths need a supplier check: if `tenant.phone_supplier === 'telnyx'`, route through Telnyx API instead of Twilio. Currently only TCR flows read this field.

4. **WhatsApp template send:** The template action (line 402) always uses Twilio via `sendWhatsApp()`, even for Meta-connected tenants. Should check gateway and route through Meta Graph API for Meta tenants.
