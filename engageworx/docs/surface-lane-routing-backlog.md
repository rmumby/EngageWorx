# Surface Lane Routing — Backlog

## Intent

Delamere Manor operates three distinct inbound lanes:

| Lane | Surface | Audience | Planned inbound address |
|------|---------|----------|------------------------|
| Concierge | `wedding_concierge` | Booked couples | weddings@delameremanor.co.uk |
| Enquiry | `wedding_enquiry` | Prospects / new leads | enquiries@delameremanor.co.uk |
| Supplier | `wedding_supplier` | Vendor coordination | suppliers@delameremanor.co.uk |

Each lane should have its own AI persona, reply mode, and signature — all of
which are already configurable per-surface in `chatbot_configs`.

## Current State

The inbound handler (`api/email-inbound-concierge.js`) resolves the tenant by
domain, then picks the **first email-enabled `chatbot_configs` surface** from a
hardcoded list:

```js
var CONCIERGE_SURFACES = ['wedding_concierge', 'helpdesk'];
```

Only `wedding_concierge` and `helpdesk` are reachable. `wedding_enquiry` and
`wedding_supplier` exist in the DB with full config but are never matched by
inbound email — any setting (including `ai_reply_mode`) on those surfaces is
inert.

The Reply Mode UI hides non-routable tabs via the shared constant
`ROUTABLE_INBOUND_SURFACES` in `src/lib/routableSurfaces.js`.

## Required Work to Enable Lanes

1. **Per-lane inbound address → surface mapping.** Add a column or lookup
   (e.g. `chatbot_configs.inbound_email`) that maps a specific recipient address
   to its surface. The handler reads this at inbound time instead of iterating a
   hardcoded list.

2. **Handler routing update.** Replace the `CONCIERGE_SURFACES` loop with a
   lookup: resolve tenant → match recipient email to a surface → load that
   surface's config. Fall back to the first email-enabled surface if no exact
   match.

3. **Update the routable set.** Add `wedding_enquiry` and `wedding_supplier` to
   `ROUTABLE_INBOUND_SURFACES` once the mapping is live. The Reply Mode tabs
   auto-appear.

4. **DNS + Resend inbound config.** Add MX/inbound rules for each lane address
   so Resend forwards to the same webhook. The handler distinguishes lanes by
   recipient, not by webhook endpoint.

## Until Then

- `weddings@delameremanor.co.uk` → `wedding_concierge` surface only.
- Enquiry and supplier lanes are configured in the DB but dormant for inbound.
- Reply Mode tabs for those surfaces are hidden in the UI.
