// api/_lib/unsubscribe-token.js — HMAC-signed unsubscribe tokens.
//
// A token encodes the tenant_id + recipient email so the /api/unsubscribe endpoint can set
// suppression for exactly that (tenant, email) pair. Signed with HMAC-SHA256 so a token can't
// be forged to unsubscribe an arbitrary contact. No expiry — unsubscribe links must not rot.
//
// Secret: UNSUBSCRIBE_SECRET (preferred). Falls back to the service-role key so the feature
// works without a new env var — both are stable, server-only secrets and never reach the client.

var crypto = require('crypto');

function getSecret() {
  return process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  var s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}
function sign(payloadStr, secret) {
  return b64url(crypto.createHmac('sha256', secret).update(payloadStr).digest());
}

// Build a token for (tenantId, email). Returns '' if no secret is configured (caller omits the link).
function makeUnsubscribeToken(tenantId, email) {
  var secret = getSecret();
  if (!secret || !tenantId || !email) return '';
  var payload = b64url(JSON.stringify({ t: tenantId, e: String(email).toLowerCase().trim() }));
  return payload + '.' + sign(payload, secret);
}

// Verify a token. Returns { tenant_id, email } on success, or null on any failure/forgery.
function verifyUnsubscribeToken(token) {
  try {
    var secret = getSecret();
    if (!secret || !token || token.indexOf('.') === -1) return null;
    var parts = String(token).split('.');
    if (parts.length !== 2) return null;
    var expected = sign(parts[0], secret);
    // constant-time compare
    var a = Buffer.from(parts[1]);
    var b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    var obj = JSON.parse(b64urlDecode(parts[0]));
    if (!obj || !obj.t || !obj.e) return null;
    return { tenant_id: obj.t, email: String(obj.e).toLowerCase().trim() };
  } catch (e) {
    return null;
  }
}

module.exports = { makeUnsubscribeToken: makeUnsubscribeToken, verifyUnsubscribeToken: verifyUnsubscribeToken };
