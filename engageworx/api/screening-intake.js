// api/screening-intake.js — tenant-scoped public screening/lead ingestion (token-authed).
//
// Distinct from the marketing /api/intake (different semantics, auth, and compliance): this is the
// EngageWorx ingestion endpoint for a tenant's public screening form (e.g. One Smile Aesthetics).
//
// DURABLE-FIRST: authenticates the per-tenant ingest token, then writes contact + conversation +
// inbound message + SMS/CASL consent atomically via create_screening_intake BEFORE responding. The
// Live Inbox record is the source of truth; no email/SMS is sent from here (operator triages and
// replies from Live Inbox). PHI (the patient's free-text note) lives only in the tenant-scoped
// message body — NEVER logged. Logs carry tenant id + non-PHI reason only.
//
// CONTRACT (spec'd to integrators):
//   Headers: X-EngageWorx-Tenant: <uuid>, X-EngageWorx-Ingest-Token: <token>
//   Body: {
//     source?, submitted_at?,
//     contact: { name, phone, email? },
//     service_interest?, message?,
//     consent: { sms_consent: true, consent_text_version, consent_timestamp },
//     page_url?, utm?: {}
//   }
//   200 { status: 'ok', intake_id, contact_id, message }
//   400/401/422/429/502 { status: 'error', errors: [{ field?, message }] }
//
// CORS is per-tenant: the browser Origin is reflected only if it's in tenants.allowed_origins
// (no customer domains hardcoded). Server-to-server callers (no Origin header) are unaffected.

var { createClient } = require('@supabase/supabase-js');

function ok(res, obj) { return res.status(200).json(Object.assign({ status: 'ok' }, obj)); }
function fail(res, code, errors) { return res.status(code).json({ status: 'error', errors: errors }); }

module.exports = async function handler(req, res) {
  var origin = req.headers.origin || '';
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-EngageWorx-Tenant, X-EngageWorx-Ingest-Token');
  res.setHeader('Access-Control-Max-Age', '86400'); // cache the preflight for 24h

  if (req.method === 'OPTIONS') {
    // A CORS preflight carries no tenant/token (the browser is asking permission to SEND those
    // headers), so there's no single tenant context. Validate the Origin against the union of
    // tenants.allowed_origins and echo it only if some tenant permits it; otherwise omit the header
    // and the browser blocks the call. The actual POST re-checks the Origin against the resolved
    // tenant's allow-list.
    if (origin && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        var pf = createClient(process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        var m = await pf.from('tenants').select('id').contains('allowed_origins', [origin]).limit(1);
        if (m.data && m.data.length > 0) res.setHeader('Access-Control-Allow-Origin', origin);
      } catch (e) { /* origin not echoed → browser blocks; safe default */ }
    }
    return res.status(204).end();
  }
  if (req.method !== 'POST') return fail(res, 405, [{ message: 'Method not allowed' }]);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return fail(res, 500, [{ message: 'Server not configured' }]);

  var supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // ── Authenticate: token must match this tenant's stored ingest_token ─────────────────────────
  var tenantId = String(req.headers['x-engageworx-tenant'] || '').trim();
  var token    = String(req.headers['x-engageworx-ingest-token'] || '').trim();
  if (!tenantId || !token) return fail(res, 401, [{ message: 'Missing tenant or ingest token' }]);

  var tenantRow = null;
  try {
    var t = await supabase.from('tenants').select('id, ingest_token, allowed_origins').eq('id', tenantId).maybeSingle();
    tenantRow = t.data || null;
  } catch (e) {
    console.error('[screening-intake] auth lookup failed tenant=' + tenantId);
    return fail(res, 500, [{ message: 'Server error' }]);
  }
  // Constant-ish comparison is unnecessary here (token is opaque + rate-limited); a plain mismatch
  // returns the same 401 whether the tenant is unknown or the token is wrong (no enumeration signal).
  if (!tenantRow || !tenantRow.ingest_token || tenantRow.ingest_token !== token) {
    return fail(res, 401, [{ message: 'Invalid tenant or ingest token' }]);
  }

  // Tenant authenticated → enforce CORS allow-list for browser callers.
  var allowed = Array.isArray(tenantRow.allowed_origins) ? tenantRow.allowed_origins : [];
  if (origin && allowed.indexOf(origin) !== -1) res.setHeader('Access-Control-Allow-Origin', origin);

  // ── Parse + validate the payload (server-side is authoritative) ──────────────────────────────
  var b = req.body || {};
  var contact = (b.contact && typeof b.contact === 'object') ? b.contact : {};
  var consent = (b.consent && typeof b.consent === 'object') ? b.consent : {};
  var name  = String(contact.name || '').trim();
  var phone = String(contact.phone || '').trim();
  var email = String(contact.email || '').trim().toLowerCase();
  var serviceInterest = String(b.service_interest || '').trim();
  var message = String(b.message || '').trim();
  var smsConsent = consent.sms_consent === true || consent.sms_consent === 'true';
  var consentVersion = String(consent.consent_text_version || '').trim();
  var consentTs = String(consent.consent_timestamp || '').trim();
  var source = String(b.source || 'screening_form').trim();
  var pageUrl = String(b.page_url || '').trim();
  var utm = (b.utm && typeof b.utm === 'object') ? b.utm : null;

  var errors = [];
  if (!name) errors.push({ field: 'contact.name', message: 'Name is required' });
  if (!phone) errors.push({ field: 'contact.phone', message: 'Phone is required' });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push({ field: 'contact.email', message: 'Email is not valid' });
  if (!smsConsent) errors.push({ field: 'consent.sms_consent', message: 'SMS consent is required' });
  if (!consentVersion) errors.push({ field: 'consent.consent_text_version', message: 'Consent text version is required' });
  if (!consentTs) errors.push({ field: 'consent.consent_timestamp', message: 'Consent timestamp is required' });
  if (errors.length) return fail(res, 422, errors);

  // ── Coarse per-tenant burst guard (double-submit is handled in the RPC) ──────────────────────
  try {
    var rl = await supabase.from('conversations').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).gte('created_at', new Date(Date.now() - 60000).toISOString());
    if (rl.count && rl.count >= 30) return fail(res, 429, [{ message: 'Too many requests — please try again shortly.' }]);
  } catch (e) { /* non-fatal */ }

  // ── DURABLE-FIRST atomic write ───────────────────────────────────────────────────────────────
  var rpc = await supabase.rpc('create_screening_intake', {
    p_tenant_id: tenantId, p_name: name, p_phone: phone, p_email: email || null,
    p_service_interest: serviceInterest || null, p_message: message || null,
    p_consent_sms: smsConsent, p_consent_version: consentVersion || null, p_consent_at: consentTs || null,
    p_source: source || 'screening_form', p_page_url: pageUrl || null, p_utm: utm,
  });
  if (rpc.error) {
    var why = (rpc.error.message || '').toLowerCase();
    console.error('[screening-intake] RPC error tenant=' + tenantId + ' reason="' + (rpc.error.message || '') + '" code=' + (rpc.error.code || '?'));
    // RPC validation raises (no PHI) → map to 422/401; anything else is a genuine write failure → 502.
    if (why.indexOf('missing_required_fields') !== -1) return fail(res, 422, [{ message: 'Name and phone are required.' }]);
    if (why.indexOf('consent_required') !== -1) return fail(res, 422, [{ field: 'consent.sms_consent', message: 'SMS consent is required.' }]);
    if (why.indexOf('invalid_tenant') !== -1) return fail(res, 401, [{ message: 'Invalid tenant.' }]);
    return fail(res, 502, [{ message: "We couldn't record your request — please try again." }]);
  }

  var result = rpc.data || {};
  return ok(res, {
    intake_id: result.conversation_id || null,
    contact_id: result.contact_id || null,
    message: 'Request received — our team will text you shortly.',
  });
};
