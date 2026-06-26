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
  /^[ \t]*On\b.*\bwrote:[ \t]*$/m,           // Gmail/Apple "On … wrote:" (tolerates leading indent, e.g. quoted British attributions)
  /^-{2,}\s*Original Message\s*-{2,}/mi,      // Outlook "-----Original Message-----"
  /^From:[ \t].+\r?\n(Sent|Date):[ \t]/mi,    // Outlook reply header block
  /^_{10,}[ \t]*$/m,                          // Outlook underscore divider
];

// Signature markers are NOT defined here — the caller passes opts.signatures (per-tenant +
// generic) from src/chat/signatureRegistry.js, so the registry is the single source of truth.

// Trailing valediction ("Best," / "Thanks," / "Regards," …) left dangling once the signature
// block below it is cut. Removed from the end of the candidate so "…questions.\n\nBest!" → "…questions."
var VALEDICTION_TAIL = /\n[ \t]*(?:Best|Thanks|Thank you|Many thanks|Regards|Kind regards|Cheers|Sincerely|Warm regards)[!,. ]*[ \t]*\n?\s*$/i;

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
      var candidate = visible.slice(0, cut).replace(VALEDICTION_TAIL, '').replace(/\s+$/, '');
      if (candidate.length > 0) {                        // never lose the sender's words
        visible = candidate;
        sigTrimmed = true;
      }
    }
  }

  return { visible: visible, quoted: quoted, sigTrimmed: sigTrimmed };
}

module.exports = { stripQuotedReply: stripQuotedReply };
