// api/_lib/blocklist.js — shared inbound blocklist matcher.
// Single source of truth for matching a sender/subject against a tenant's
// blocked_domains / blocked_keywords (both JSONB arrays of strings).
//
// blocked_domains entries support three shapes (matched against the lowercased sender):
//   - domain (no '@'):        sender domain == entry  OR  ends-with '.'+entry  (domain + subdomains)
//   - pattern '<local>@':     sender starts-with entry  (e.g. 'noreply@' matches noreply@any.com)
//   - full address:           exact match
// blocked_keywords: case-insensitive substring match on the subject.

function asList(arr) { return Array.isArray(arr) ? arr : []; }

// Returns the matched entry string, or null.
function matchBlockedSender(senderEmail, domains) {
  var s = String(senderEmail || '').toLowerCase().trim();
  if (!s) return null;
  var sDomain = s.indexOf('@') > -1 ? s.split('@')[1] : '';
  var list = asList(domains);
  for (var i = 0; i < list.length; i++) {
    var entry = String(list[i] || '').toLowerCase().trim();
    if (!entry) continue;
    if (entry.charAt(entry.length - 1) === '@') {
      // pattern '<local>@' → sender local-part prefix match
      if (s.indexOf(entry) === 0) return entry;
    } else if (entry.indexOf('@') > -1) {
      // full address → exact match
      if (s === entry) return entry;
    } else {
      // domain → exact domain or subdomain
      if (sDomain && (sDomain === entry || sDomain.endsWith('.' + entry))) return entry;
    }
  }
  return null;
}

// Returns the matched keyword string, or null.
function matchBlockedKeyword(subject, keywords) {
  var subj = String(subject || '').toLowerCase();
  if (!subj) return null;
  var list = asList(keywords);
  for (var i = 0; i < list.length; i++) {
    var k = String(list[i] || '').toLowerCase().trim();
    if (k && subj.indexOf(k) !== -1) return k;
  }
  return null;
}

// Combined inbound gate. opts: { domains, keywords }.
// Returns { blocked: bool, matched: 'domain:x'|'keyword:y'|null }.
function checkInboundBlock(senderEmail, subject, opts) {
  opts = opts || {};
  var d = matchBlockedSender(senderEmail, opts.domains);
  if (d) return { blocked: true, matched: 'domain:' + d };
  var k = matchBlockedKeyword(subject, opts.keywords);
  if (k) return { blocked: true, matched: 'keyword:' + k };
  return { blocked: false, matched: null };
}

module.exports = { matchBlockedSender: matchBlockedSender, matchBlockedKeyword: matchBlockedKeyword, checkInboundBlock: checkInboundBlock };
