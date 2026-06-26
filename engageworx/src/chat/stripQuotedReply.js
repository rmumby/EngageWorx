// src/chat/stripQuotedReply.js
// Client-side, PLAINTEXT-ONLY quoted-reply + optional signature trimming for the chat/
// email render path. Mirrors the conservative quote markers in api/_lib/strip-quoted-reply.js
// but returns a structured result so the UI can show a "show quoted text" expander:
//
//   stripQuotedReply(text, { trimSignature }) -> { visible, quoted, sigTrimmed }
//     visible    — the fresh reply to render (quote cut; signature cut when trimSignature)
//     quoted     — the quoted original (from the earliest quote marker onward), or ''
//     sigTrimmed — the trailing signature that was removed (when trimSignature), or ''
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

// Conservative trailing-signature markers. Only used when { trimSignature: true }.
var SIG_MARKERS = [
  /^--[ \t]*$/m,                                                       // RFC 3676 "-- " delimiter
  /^Sent from my (iPhone|iPad|Android|mobile|phone|Samsung|BlackBerry)\b.*$/mi,
  /^Get Outlook for (iOS|Android)\b.*$/mi,
];

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
    return { visible: text, quoted: '', sigTrimmed: '' };
  }
  // Normalize line endings FIRST, before any marker runs. Markers are line-anchored, and a
  // lone \r left by CRLF would sit before the line end and defeat the "…wrote:$" attribution
  // match on outbound mail — load-bearing for every \r\n email. (\r\n AND lone \r → \n.)
  var src = String(text).replace(/\r\n?/g, '\n');
  var visible = src;
  var quoted = '';
  var sigTrimmed = '';

  // 1) Cut at the earliest quote marker (if any).
  var qAt = earliestMarker(src, QUOTE_MARKERS);
  if (qAt !== -1) {
    var beforeQ = src.slice(0, qAt).replace(/\s+$/, ''); // drop trailing whitespace only
    if (beforeQ.length > 0) {                            // never lose the sender's words
      quoted = src.slice(qAt);
      visible = beforeQ;
    }
  }

  // 2) Optionally trim a trailing signature from what remains visible.
  if (opts.trimSignature && visible) {
    var sAt = earliestMarker(visible, SIG_MARKERS);
    if (sAt !== -1) {
      var beforeS = visible.slice(0, sAt).replace(/\s+$/, '');
      if (beforeS.length > 0) {                          // never lose the sender's words
        sigTrimmed = visible.slice(sAt);
        visible = beforeS;
      }
    }
  }

  return { visible: visible, quoted: quoted, sigTrimmed: sigTrimmed };
}

module.exports = { stripQuotedReply: stripQuotedReply };
