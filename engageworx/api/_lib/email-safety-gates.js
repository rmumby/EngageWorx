// api/_lib/email-safety-gates.js — Shared Layer 1 + Layer 2 safety for ALL email sends
// Imported by sendTenantEmail (enforced on every send) and sequences.js (pre-send).

// Layer 2: blocked patterns — AI meta-language, scratchpad reasoning, unfilled tokens
var BLOCKED_BODY_PATTERNS = [
  "i don't have", "i do not have", "could you please provide",
  "could you provide", "the data provided", "to personalize this message",
  "information is missing", "information needed", "the lead's first name",
  "the lead's company", "once you provide", "once i have these details",
  "the email shows", "the email suggests", "i'd need", "i would need",
  "{first_name}", "{company_name}", "[firstname]", "[company]",
  "[calendly_link]", "[your name]",
];

// Layer 1 helpers
var GENERIC_LOCAL_PARTS = ['info','sales','team','support','admin','hello','contact','noreply','hi','mail','billing','accounts','office','enquiries','help','service'];

function looksLikeEmail(str) {
  return str && str.indexOf('@') !== -1 && str.indexOf('.') !== -1;
}

function cleanEmailToName(email) {
  if (!email) return 'there';
  var local = email.split('@')[0] || '';
  var cleaned = local.replace(/[._\-0-9]+/g, ' ').trim();
  if (!cleaned) return 'there';
  var firstWord = cleaned.split(' ')[0].toLowerCase();
  if (GENERIC_LOCAL_PARTS.indexOf(firstWord) !== -1) return 'there';
  if (firstWord.replace(/[^a-z]/gi, '').length < 2) return 'there';
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
}

// Layer 2: scan text for blocked patterns. Returns { blocked, pattern } or { blocked: false }.
function checkBlockedPatterns(text) {
  if (!text) return { blocked: false };
  var lower = text.toLowerCase();
  for (var i = 0; i < BLOCKED_BODY_PATTERNS.length; i++) {
    if (lower.indexOf(BLOCKED_BODY_PATTERNS[i].toLowerCase()) !== -1) {
      return { blocked: true, pattern: BLOCKED_BODY_PATTERNS[i] };
    }
  }
  return { blocked: false };
}

// Layer 1: sanitize email-as-name in subject/body text.
// If recipient.name looks like an email and appears in the text, replace with cleaned version.
function sanitizeEmailAsName(text, recipient) {
  if (!text || !recipient) return text;
  var name = (recipient.name || recipient.first_name || '').trim();
  var email = (recipient.email || '').trim();
  if (!name) return text;

  // Check if name is email-shaped or matches recipient email
  var nameIsEmail = looksLikeEmail(name);
  var nameMatchesEmail = email && name.toLowerCase() === email.toLowerCase();

  if (nameIsEmail || nameMatchesEmail) {
    // Replace occurrences of the email-as-name with a cleaned version
    var replacement = cleanEmailToName(email);
    // Case-insensitive replace of the raw name in the text
    var escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(escaped, 'gi'), replacement);
  }

  return text;
}

module.exports = {
  BLOCKED_BODY_PATTERNS: BLOCKED_BODY_PATTERNS,
  GENERIC_LOCAL_PARTS: GENERIC_LOCAL_PARTS,
  looksLikeEmail: looksLikeEmail,
  cleanEmailToName: cleanEmailToName,
  checkBlockedPatterns: checkBlockedPatterns,
  sanitizeEmailAsName: sanitizeEmailAsName,
};
