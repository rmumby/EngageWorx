# Email Template Colors

Email templates cannot use CSS variables (most clients don't support them). They require inline styles with literal hex values. Brand colors must be injected at send time.

## Templates by Branding Readiness

### Already Brand-Aware (dynamic brand injection)

| Template | File | Dynamic Colors | Notes |
|----------|------|---------------|-------|
| Welcome email (post-checkout) | `api/stripe-webhook.js` | `tenants.brand_primary` → gradient start, links, badges | Secondary `#E040FB` still hardcoded. Signature hardcoded "Rob Mumby / Founder & CEO, EngageWorx" |
| Tenant welcome (invite flow) | `api/invite-tenant.js` | Full HTML from `platform_config.welcome_email_html_template` | CSP-overridable. Depends on what's stored in DB. |
| Team member welcome | `api/invite-member.js` | Template from `platform_config.team_member_welcome_email_template` | Default fallback has hardcoded EngageWorx colors |
| Digest reply body | `api/send-digest-reply.js` | Routes through `sendTenantEmail` | Signature dynamic via `_email-signature.js` |
| Sequence step body | `api/sequences.js` | Signature dynamic per tenant | Wrapper only has `#1e293b` text color |

### Needs Per-Tenant Branding (customer-facing, hardcoded)

| Template | File | Purpose | Hardcoded Colors | Priority |
|----------|------|---------|-----------------|----------|
| CSP TCR reminder | `api/csp-tcr-reminders.js` | Sent to sub-tenants on CSP's behalf | `#00C9FF`→`#E040FB` gradient button, standard light layout | HIGH — represents CSP brand |
| Usage alerts | `api/cron-usage-alerts.js` | 75%/90%/100% threshold emails to tenant admins | Semantic reds/ambers + `#00C9FF`→`#E040FB` CTA | HIGH |
| Onboarding reminder | `api/send-onboarding-reminder.js` | Nudge to incomplete tenants | Full hardcoded layout | HIGH |
| Stale lead digest | `api/cron-stale-leads.js` | Summary email to tenant admins | `#6366f1`→`#E040FB` header, full layout | MEDIUM |
| Escalation notification | `api/_lib/fire-escalation.js` | Alert to tenant team members | Red heading, `#00C9FF` CTA | MEDIUM |
| Team invite (server) | `api/team/invite.js` | Welcome to new team member | Purple `#6366f1`→`#8b5cf6` CTA (wrong brand!) | MEDIUM |

### Internal Only (SP admin, no branding needed)

| Template | File | Purpose |
|----------|------|---------|
| Weekly update draft | `api/cron-weekly-update.js` | Notifies SP admin of release notes |
| Channel health report | `api/cron-channel-health.js` | Daily channel health to SP |
| Config health check | `api/cron-health-check.js` | Daily config health to SP |
| Signup notification | `api/signup-notify.js` | New signup alert to SP |

---

## Recurring Hardcoded Color Palette in Email Templates

| Color | Usage | Frequency |
|-------|-------|-----------|
| `linear-gradient(135deg,#00C9FF,#E040FB)` | CTA button gradient | 10+ files |
| `#f9fafb` / `#f8fafc` | Page background | All templates |
| `#ffffff` | Card background | All templates |
| `#e5e7eb` / `#f1f5f9` | Borders, dividers | All templates |
| `#1e293b` | Heading text | All templates |
| `#475569` | Body text | All templates |
| `#64748b` / `#94a3b8` | Muted/footer text | All templates |
| `#000` | CTA button text (on gradient) | All CTA buttons |
| `#dc2626` | Error/escalation | 5 files |
| `#d97706` | Warning amber | 3 files |
| `#10b981` / `#059669` | Success green | 3 files |

---

## Recommended Approach for Phase 3+

Email templates should NOT use CSS variables. Instead:

1. Create a shared `buildEmailShell(tenantId)` helper that:
   - Loads `tenants.brand_primary` and `tenants.brand_secondary`
   - Returns an HTML shell with brand colors injected at known positions
   - Provides consistent header/footer/CTA structure
   - Falls back to platform defaults if tenant has no brand colors

2. The CTA button gradient (`linear-gradient(135deg, brand_primary, brand_secondary)`) is the single highest-impact thing to make dynamic — it appears in every customer-facing email.

3. Text/layout colors (`#1e293b`, `#475569`, etc.) should stay hardcoded — email clients need a guaranteed-readable palette, and emails don't support dark mode switching in the same way the portal does.
