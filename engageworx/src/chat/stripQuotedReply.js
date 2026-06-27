// src/chat/stripQuotedReply.js
// Client-side, PLAINTEXT-ONLY quoted-reply + optional signature trimming for the chat/
// email render path. Mirrors the conservative quote markers in api/_lib/strip-quoted-reply.js
// but returns a structured result so the UI can show a "show quoted text" expander:
//
//   stripQuotedReply(text, { trimSignature, signatures }) -> { visible, quoted, sigTrimmed }
//     visible    — the fresh reply to render (quote cut; signature cut when trimSignature)
//     quoted     — the quoted original (from the earliest quote marker onward), or '' (string)
//     sigTrimmed — boolean: whether a trailing signature was removed
//   signatures: RegExp[] of signature markers to try (caller supplies, typically
//   signaturesFor(tenantId) from signatureRegistry). Without it, no signature trimming runs.
//   The full original is always recoverable by the caller from the untrimmed input.
//
// Guarantees:
//   - Never loses the sender's words: if a cut would leave visible empty, the cut is skipped.
//   - No-op when there's no marker: visible === text (line endings normalized to \n), quoted/sigTrimmed ''.
//   - PLAINTEXT ONLY. There is intentionally no HTML branch — pass the plain-text body;
//     HTML emails are rendered as-is by the caller and not trimmed here.
//
// Markers are line-anchored (/m), so callers MUST pass text with newlines intact (not
// whitespace-collapsed) or the markers won't match.

// Quote markers — same set as the canonical server util.
var QUOTE_MARKERS = [
  // Gmail/Apple "On … wrote:" — date-format-agnostic (US, iOS "On 17 Jun 2026, at 14:29,",
  // British long-form/BST, numeric dd/mm/yyyy). Tolerates a leading indent AND a soft-wrap that
  // pushes a trailing "wrote:" onto its own line ("… <email>\nwrote:"). CRLF is normalized to \n
  // first, so only the single \n needs handling here.
  /^[ \t]*On\b[^\n]*(?:\n[ \t]*)?\bwrote:[ \t]*$/m,
  /^-{2,}\s*Original Message\s*-{2,}/mi,      // Outlook "-----Original Message-----"
  /^From:[ \t].+\r?\n(Sent|Date):[ \t]/mi,    // Outlook reply header block
  /^_{10,}[ \t]*$/m,                          // Outlook underscore divider
  // Backstop: a contiguous >-quoted block (≥2 lines). An independent cut point so an unknown or
  // itself-quoted attribution ("> On 10/06/2026 … wrote:") still gets cut at the start of the quote.
  /^>.*(?:\n>.*)+/m,
];

// Signature markers are NOT defined here — the caller passes opts.signatures (per-tenant +
// generic) from src/chat/signatureRegistry.js, so the registry is the single source of truth.

// After cutting the signature block, an EngageWorx sig can stack a dangling valediction ("Best!")
// and/or a logo/header line ("EW") ABOVE the matched name line. The post-cut cleanup in
// stripQuotedReply strips those from the tail ITERATIVELY until the text stops shrinking, so a
// "…Best!\n\nEW" tail collapses fully rather than leaving "…Best!" behind.

function earliestMarker(text, markers) {
  var cutAt = -1;
  for (var i = 0; i < markers.length; i++) {
    var m = text.match(markers[i]);
    if (m && typeof m.index === 'number' && (cutAt === -1 || m.index < cutAt)) cutAt = m.index;
  }
  return cutAt;
}

function stripQuotedReply(text, opts) {
  opts = opts || {};
  if (text == null || text === '') {
    return { visible: text, quoted: '', sigTrimmed: false };
  }
  // Normalize line endings FIRST, before any marker runs. Markers are line-anchored, and a
  // lone \r left by CRLF would sit before the line end and defeat the "…wrote:$" attribution
  // match on outbound mail — load-bearing for every \r\n email. (\r\n AND lone \r → \n.)
  var src = String(text).replace(/\r\n?/g, '\n');
  var visible = src;
  var quoted = '';
  var sigTrimmed = false;

  // 1) Cut at the earliest quote marker (if any).
  var qAt = earliestMarker(src, QUOTE_MARKERS);
  if (qAt !== -1) {
    var beforeQ = src.slice(0, qAt).replace(/\s+$/, ''); // drop trailing whitespace only
    if (beforeQ.length > 0) {                            // never lose the sender's words
      quoted = src.slice(qAt);
      visible = beforeQ;
    }
  }

  // 2) Optionally trim a trailing signature, using the caller-supplied marker set. Cut at the
  //    earliest matching marker, then drop any dangling valediction ("Best!", "Thanks,"), then
  //    trim trailing whitespace. Skipped if it would empty the visible text (never-lose guard).
  if (opts.trimSignature && opts.signatures && opts.signatures.length) {
    var cut = visible.length;
    for (var s = 0; s < opts.signatures.length; s++) {
      var sm = visible.match(opts.signatures[s]);
      if (sm && typeof sm.index === 'number' && sm.index >= 0 && sm.index < cut) cut = sm.index;
    }
    if (cut < visible.length) {
      var cand = visible.slice(0, cut), prev;
      do {
        prev = cand;
        cand = cand
          .replace(/\n[ \t]*(?:Best|Thanks|Thank you|Many thanks|Regards|Kind regards|Cheers|Sincerely|Warm regards)[!,. ]*[ \t]*$/i, '')
          .replace(/\n[ \t]*EW[ \t]*$/, '')   // EngageWorx sig logo/header line
          .replace(/\s+$/, '');               // trimEnd
      } while (cand !== prev);
      if (cand.length > 0) {                   // never lose the sender's words
        visible = cand;
        sigTrimmed = true;
      }
    }
  }

  return { visible: visible, quoted: quoted, sigTrimmed: sigTrimmed };
}

module.exports = { stripQuotedReply: stripQuotedReply };
