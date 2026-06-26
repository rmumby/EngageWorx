// src/chat/signatureRegistry.js
// Per-tenant outbound signature patterns for stripQuotedReply's signature pass.
//
// v1 is EngageWorx-only: we trim OUR OWN signature off outbound mail so the bubble shows the
// reply, not the boilerplate. Inbound/customer signatures are intentionally left in place — the
// "show quoted text" expander still recovers the full original, so nothing is hidden destructively.
// GENERIC markers (RFC 3676 "-- " delimiter, mobile sigs) are appended for EVERY tenant.

export const ENGAGEWORX = 'c1bc59a8-5235-4921-9755-02514b574387';

export const TENANT_SIGNATURES = {
  // The "Rob Mumby" line only counts as a signature when a title / brand / site / phone follows
  // within ~160 chars (lookahead) — so a "Rob Mumby" that's just prose isn't mistaken for a sig.
  // The `\+\s?1[\s().\-]*\d` arm matches US phone sigs ("+1 (786) 982-7800", "+1-305-464-6560")
  // even when there's no "Founder & CEO" / "EngageWorx" line.
  [ENGAGEWORX]: [
    // relaxed: allow trailing text on the name line ("Rob Mumby   AI-Powered CX"); lookahead keeps it safe
    /^[ \t]*Rob Mumby\b[^\n]*$(?=[\s\S]{0,160}?(?:Founder & CEO|EngageWorx|engwx\.com|\+\s?1[\s().\-]*\d))/im,
    // team-name closing (AI-sequence outbound)
    /^[ \t]*(?:The )?EngageWorx Team[ \t]*$/im,
  ],
};

export const GENERIC_SIG_MARKERS = [
  /\n-- ?\n/,                  // RFC 3676 signature delimiter
  /\nSent from my [^\n]+/i,    // iOS / Android mobile sig
  /\nGet Outlook for [^\n]+/i, // Outlook mobile sig
];

export const signaturesFor = (tenantId) =>
  [...(TENANT_SIGNATURES[tenantId] || []), ...GENERIC_SIG_MARKERS];
