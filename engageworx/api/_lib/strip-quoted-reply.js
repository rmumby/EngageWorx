// api/_lib/strip-quoted-reply.js — shared conservative quoted-reply stripping.
// Cuts at the earliest high-confidence quote marker (Gmail/Apple Mail "On … wrote:",
// Outlook "-----Original Message-----", Outlook "From:…\nSent:…" header block, or the
// Outlook underscore divider). Returns the new reply only. Returns the FULL text
// untouched when no marker is found (fresh email) or when stripping would leave nothing
// — callers retain the full raw body in metadata, so the sender's words are never lost.
//
// NOTE: markers are line-anchored (/m). Apply to the plain-text part (newlines intact),
// NOT to whitespace-collapsed text, or the markers won't match.
function stripQuotedReply(text) {
  if (!text) return text;
  var markers = [
    /^On\b.*\bwrote:[ \t]*$/m,                 // Gmail / Apple Mail "On <date> … wrote:"
    /^-{2,}\s*Original Message\s*-{2,}/mi,      // Outlook "-----Original Message-----"
    /^From:[ \t].+\r?\n(Sent|Date):[ \t]/mi,    // Outlook reply header block
    /^_{10,}[ \t]*$/m,                          // Outlook underscore divider
  ];
  var cutAt = -1;
  for (var i = 0; i < markers.length; i++) {
    var m = text.match(markers[i]);
    if (m && typeof m.index === 'number' && (cutAt === -1 || m.index < cutAt)) cutAt = m.index;
  }
  if (cutAt === -1) return text;                // no quote marker → fresh email, untouched
  var stripped = text.slice(0, cutAt).trim();
  return stripped.length > 0 ? stripped : text; // never lose the sender's words
}

module.exports = { stripQuotedReply: stripQuotedReply };
