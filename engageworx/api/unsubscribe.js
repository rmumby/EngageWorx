// api/unsubscribe.js — email opt-out landing + one-click endpoint.
//
// GET  ?token=…  → human clicked the footer link: set suppression, render a confirmation page.
// POST ?token=…  → RFC 8058 one-click (List-Unsubscribe-Post): set suppression, return 200.
//
// Auth is the HMAC-signed token itself (it encodes tenant_id + email; can't be forged without
// the secret). No session — these are unauthenticated mail-client requests. Suppression is the
// only thing this can do, scoped to the token's (tenant, email). Runs as service role.

var { createClient } = require('@supabase/supabase-js');
var { verifyUnsubscribeToken } = require('./_lib/unsubscribe-token');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function page(title, body) {
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + title + '</title></head>' +
    '<body style="font-family:Arial,Helvetica,sans-serif;background:#f5f7fa;margin:0;padding:48px 16px;color:#1e293b;">' +
    '<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;text-align:center;">' +
    body + '</div></body></html>';
}

async function suppress(supabase, tenantId, email) {
  var nowIso = new Date().toISOString();
  // Update the existing contact if present; otherwise create a minimal suppressed row so future
  // enrollment + sends are gated (the send/enroll guards key on contacts.is_blocked).
  var existing = await supabase.from('contacts').select('id').eq('tenant_id', tenantId).ilike('email', email).limit(1).maybeSingle();
  if (existing.data && existing.data.id) {
    await supabase.from('contacts').update({ is_blocked: true, blocked_at: nowIso, status: 'unsubscribed', updated_at: nowIso }).eq('id', existing.data.id);
  } else {
    await supabase.from('contacts').insert({ tenant_id: tenantId, email: email, is_blocked: true, blocked_at: nowIso, status: 'unsubscribed' });
  }
}

module.exports = async function handler(req, res) {
  var token = (req.query && req.query.token) || '';
  var verified = verifyUnsubscribeToken(token);

  // One-click POST (mail clients): respond 200 quickly; never render HTML.
  if (req.method === 'POST') {
    if (!verified) return res.status(400).json({ error: 'invalid token' });
    try { await suppress(getSupabase(), verified.tenant_id, verified.email); }
    catch (e) { console.error('[unsubscribe] POST suppress error:', e.message); return res.status(500).json({ error: 'failed' }); }
    return res.status(200).json({ unsubscribed: true });
  }

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!verified) {
      return res.status(400).send(page('Invalid link',
        '<h2 style="margin:0 0 8px;color:#dc2626;">This unsubscribe link is invalid</h2>' +
        '<p style="color:#64748b;font-size:14px;line-height:1.6;">The link may be malformed or out of date. If you keep receiving unwanted mail, reply with “unsubscribe”.</p>'));
    }
    try { await suppress(getSupabase(), verified.tenant_id, verified.email); }
    catch (e) {
      console.error('[unsubscribe] GET suppress error:', e.message);
      return res.status(500).send(page('Something went wrong',
        '<h2 style="margin:0 0 8px;">We could not process that</h2><p style="color:#64748b;font-size:14px;">Please try again, or reply with “unsubscribe”.</p>'));
    }
    return res.status(200).send(page('Unsubscribed',
      '<h2 style="margin:0 0 8px;color:#16a34a;">You’ve been unsubscribed</h2>' +
      '<p style="color:#64748b;font-size:14px;line-height:1.6;">You will no longer receive emails from this sender at <strong>' +
      String(verified.email).replace(/[<>&]/g, '') + '</strong>. You can close this window.</p>'));
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};
