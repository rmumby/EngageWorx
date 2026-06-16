// api/appointment-request.js — public appointment-REQUEST intake (no AI, no booking).
//
// DURABLE-FIRST: writes contact + conversation + inbound message + CASL consent atomically via the
// create_intake_request RPC BEFORE any email. The Live Inbox record is the source of truth; email is
// a notification, never the lifeline. On write failure we return an explicit error with the office
// phone (NEVER a fake confirmation). Tenant is resolved from an opaque form key (no hardcoded ids).
//
// PHI (DOB / insurance / student ID / address) goes only into contacts.custom_fields via the RPC and
// is NEVER logged or placed in any email body (Option 3: bookings@ notification carries name +
// preferred windows + reason only). Logs carry tenant_id + request id only.

var { createClient } = require('@supabase/supabase-js');
var { sendTenantEmail } = require('./_lib/send-tenant-email');

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function sendOk(r) { return !!(r && (r.success === true || r.sent === true) && !r.blocked); }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server not configured' });

  var supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  var b = req.body || {};
  var formKey          = String(b.form_key || '').trim();
  var fullName         = String(b.full_name || b.fullName || '').trim();
  var email            = String(b.email || '').trim().toLowerCase();
  var phone            = String(b.phone || '').trim();
  var address          = String(b.address || '').trim();
  var dob              = String(b.dob || b.date_of_birth || '').trim();
  var studentId        = String(b.student_id || b.studentId || '').trim();
  var insurance        = String(b.insurance || '').trim();
  var preferredWindows = String(b.preferred_windows || b.preferredWindows || '').trim();
  var reason           = String(b.reason || '').trim();
  var consentGiven     = b.consent === true || b.consent === 'true';
  var consentText      = String(b.consent_text || b.consentText || '').trim();

  // ── Server-side validation FIRST (client validation is UX only) ──────────────
  var missing = [];
  if (!formKey) missing.push('form');
  if (!fullName) missing.push('full name');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) missing.push('a valid email');
  if (!phone) missing.push('phone');
  if (!preferredWindows) missing.push('a preferred day/time');
  if (!reason) missing.push('reason for visit');
  if (!consentGiven || !consentText) missing.push('consent');
  if (missing.length) return res.status(400).json({ error: 'Please provide: ' + missing.join(', ') + '.' });

  // ── Resolve tenant config from the opaque form key (notification mailbox + office phone) ─────
  // Read-only; the RPC independently re-resolves + validates the tenant for the write.
  var tenantId = null, notifyEmail = null, officePhone = null;
  try {
    var cfg = await supabase.from('channel_configs')
      .select('tenant_id, config_encrypted')
      .eq('channel', 'email')
      .eq('config_encrypted->booking_integration->>form_key', formKey)
      .maybeSingle();
    if (cfg.data) {
      tenantId = cfg.data.tenant_id;
      var ce = cfg.data.config_encrypted || {};
      var bi = ce.booking_integration || {};
      notifyEmail = ce.inbound_email || ce.from_email || bi.notification_email || null;
      officePhone = bi.office_phone || null;
    }
  } catch (e) { console.error('[appointment-request] config resolve error'); }
  if (!tenantId) return res.status(400).json({ error: 'This request form is not active. Please contact the office.' });

  // ── Coarse rate-limit: per-tenant burst guard (no new storage; double-submit handled in the RPC) ─
  try {
    var rl = await supabase.from('conversations').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).gte('created_at', new Date(Date.now() - 60000).toISOString());
    if (rl.count && rl.count >= 12) return res.status(429).json({ error: 'Too many requests right now — please try again in a minute.' });
  } catch (e) { /* non-fatal */ }

  // ── DURABLE-FIRST write (atomic contact + conversation + message + consent) ──────────────────
  var rpc = await supabase.rpc('create_intake_request', {
    p_form_key: formKey, p_full_name: fullName, p_email: email, p_phone: phone,
    p_address: address || null, p_dob: dob || null, p_student_id: studentId || null,
    p_insurance: insurance || null, p_preferred_windows: preferredWindows || null,
    p_reason: reason || null, p_consent_text: consentText, p_dedup_window_minutes: 10,
  });
  if (rpc.error) {
    // Explicit, non-PHI reason logging (the RPC raises only 'missing_required_fields'/'invalid_form_key'
    // — neither carries PHI), so the next occurrence is unambiguous. Still tenant id + reason only.
    var reason = (rpc.error.message || '').toLowerCase();
    console.error('[appointment-request] RPC error tenant=' + tenantId + ' reason="' + (rpc.error.message || '') + '" code=' + (rpc.error.code || '?'));
    // Validation-class raises are the patient's input, not a system failure → field-level 400, never
    // the office-phone "we couldn't submit" copy (which must mean a genuine durable-write failure).
    if (reason.indexOf('missing_required_fields') !== -1) {
      return res.status(400).json({ error: 'Please complete all required fields, including the consent checkbox.' });
    }
    if (reason.indexOf('invalid_form_key') !== -1) {
      return res.status(400).json({ error: 'This request form is not active. Please contact the office.' });
    }
    // Genuine durable-write failure → NO FALSE SUCCESS; explicit office-phone error.
    var callLine = officePhone ? ('please call us at ' + officePhone) : 'please call our office';
    return res.status(502).json({ error: "We couldn't submit your request — " + callLine + '.' });
  }
  var result = rpc.data || {};
  var requestId = result.conversation_id || null;

  // Deduped (double-submit within window): the request already exists + was already notified. Ack only.
  if (result.deduped) {
    return res.status(200).json({ ok: true, request_id: requestId, message: 'Request received — our team will confirm by email.' });
  }

  // ── Notify the office (Option 3: NON-PHI only — name, preferred windows, reason) ─────────────
  var notifyDelivered = false;
  if (notifyEmail) {
    try {
      var nr = await sendTenantEmail(supabase, {
        tenant_id: tenantId,
        to: notifyEmail,
        subject: 'New appointment request: ' + fullName,
        html: '<div style="font-family:Arial,sans-serif;max-width:560px;">' +
          '<h2 style="margin:0 0 12px;">New appointment request</h2>' +
          '<p><strong>Name:</strong> ' + esc(fullName) + '</p>' +
          '<p><strong>Preferred:</strong> ' + esc(preferredWindows) + '</p>' +
          '<p><strong>Reason:</strong> ' + esc(reason) + '</p>' +
          '<p style="color:#555;">Full details (contact info, date of birth, insurance, student ID) are in the portal — open this request in Live Inbox to review and schedule.</p>' +
          '</div>',
        text: 'New appointment request\nName: ' + fullName + '\nPreferred: ' + preferredWindows +
              '\nReason: ' + reason + '\n\nFull details are in the portal — open this request in Live Inbox.',
      });
      notifyDelivered = sendOk(nr);
    } catch (e) { console.error('[appointment-request] office notify threw tenant=' + tenantId + ' req=' + requestId); }
  }
  if (!notifyDelivered) {
    // Delivery failed/blocked → flag so it stands out in Live Inbox. Never fire-and-forget.
    try { await supabase.from('conversations').update({ needs_attention: true }).eq('id', requestId).eq('tenant_id', tenantId); } catch (e) {}
    console.error('[appointment-request] office notify NOT delivered — flagged needs_attention tenant=' + tenantId + ' req=' + requestId);
  }

  // ── Patient receipt: acknowledgement ONLY (not a booking) ────────────────────────────────────
  var firstName = (fullName.split(' ')[0] || 'there');
  try {
    var pr = await sendTenantEmail(supabase, {
      tenant_id: tenantId,
      to: email,
      subject: 'We received your appointment request',
      html: '<div style="font-family:Arial,sans-serif;max-width:560px;">' +
        '<p>Hi ' + esc(firstName) + ',</p>' +
        '<p>Thanks — we’ve received your appointment request and our team will review it and confirm a time with you by email.</p>' +
        '<p style="color:#555;">This is a request, not a confirmed appointment yet.</p>' +
        '</div>',
      text: 'Hi ' + firstName + ',\n\nWe received your appointment request and our team will confirm a time by email. This is a request, not a confirmed appointment yet.',
    });
    if (!sendOk(pr)) {
      // Bad-email signal: the patient may never see the confirmation → surface it.
      try { await supabase.from('conversations').update({ needs_attention: true }).eq('id', requestId).eq('tenant_id', tenantId); } catch (e) {}
      console.warn('[appointment-request] patient receipt NOT delivered (bad-email signal) tenant=' + tenantId + ' req=' + requestId);
    }
  } catch (e) { console.warn('[appointment-request] patient receipt threw tenant=' + tenantId + ' req=' + requestId); }

  return res.status(200).json({ ok: true, request_id: requestId, message: 'Request received — our team will confirm by email.' });
};
