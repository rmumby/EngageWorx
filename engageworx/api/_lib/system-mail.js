// api/_lib/system-mail.js — recognise the platform's own system/notification email.
//
// Every platform-generated notification (escalation alerts, etc.) is stamped with a neutral,
// white-label-safe header. The inbound pipeline drops any mail carrying it, so an outbound
// notification can never be re-ingested as customer inbound and re-trigger the rule that sent
// it (incident: Delamere "Cancellation mentions" self-referential escalation loop, 2026-06-15).
//
// The header name is intentionally brand-neutral — it travels in raw headers of mail sent from a
// white-label tenant's own domain, so it must not leak the platform name. Stamp and detection MUST
// use this single constant to avoid drift (a mismatch silently reopens the loop).

var SYSTEM_MAIL_HEADER = 'X-System-Notification';

// Build the headers object to spread into sendTenantEmail({ headers }). `kind` is a free-form tag
// (e.g. 'escalation') for debuggability; detection only checks the header's presence.
function systemMailHeaders(kind) {
  var h = {};
  h[SYSTEM_MAIL_HEADER] = kind || 'notification';
  return h;
}

// Detect our own system mail. Accepts either a raw header blob (string, as the multipart inbound
// webhook delivers in body.headers) or a parsed [{name, value}] array (as the concierge SDK fetch
// returns). Case-insensitive on the header name.
function isSystemMail(headers) {
  if (!headers) return false;
  var needle = SYSTEM_MAIL_HEADER.toLowerCase();
  if (Array.isArray(headers)) {
    for (var i = 0; i < headers.length; i++) {
      var x = headers[i];
      if (x && x.name && String(x.name).toLowerCase() === needle) return true;
    }
    return false;
  }
  return String(headers).toLowerCase().indexOf(needle) !== -1;
}

module.exports = {
  SYSTEM_MAIL_HEADER: SYSTEM_MAIL_HEADER,
  systemMailHeaders: systemMailHeaders,
  isSystemMail: isSystemMail,
};
