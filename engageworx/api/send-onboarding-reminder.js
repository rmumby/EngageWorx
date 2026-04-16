// api/send-onboarding-reminder.js
// One-click endpoint Rob can hit straight from the daily health-check email to nudge
// a tenant who hasn't finished onboarding. Validates an HMAC token derived from the
// tenant_id so the link is unguessable.
//
// GET /api/send-onboarding-reminder?tenant_id=…&token=…  →  HTML confirmation page
// POST same body                                          →  JSON response

var { createClient } = require('@supabase/supabase-js');
var crypto = require('crypto');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function tokenFor(tenantId) {
  var secret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret';
  return crypto.createHmac('sha256', secret).update(String(tenantId)).digest('hex').slice(0, 24);
}

function htmlPage(title, body, color) {
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + title + '</title></head>' +
    '<body style="font-family:Arial,sans-serif;background:#0a0d14;color:#fff;padding:60px 20px;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;">' +
    '<div style="max-width:520px;background:#0d1425;border:1px solid ' + color + ';border-radius:14px;padding:32px;">' +
    body +
    '<div style="text-align:center;margin-top:20px;"><a href="https://portal.engwx.com" style="color:#00C9FF;text-decoration:none;font-size:13px;">← Back to portal</a></div>' +
    '</div></body></html>';
}

module.exports = async function handler(req, res) {
  var params = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  var tenantId = params.tenant_id;
  var token = params.token;
  var isJson = req.method === 'POST' || (req.headers && req.headers.accept && req.headers.accept.indexOf('application/json') !== -1);

  function fail(code, msg) {
    if (isJson) return res.status(code).json({ error: msg });
    res.setHeader('Content-Type', 'text/html');
    return res.status(code).end(htmlPage('Error', '<h1 style="color:#dc2626;font-size:20px;margin:0 0 8px;">⚠️ ' + msg + '</h1>', 'rgba(220,38,38,0.4)'));
  }

  if (!tenantId || !token) return fail(400, 'tenant_id and token required');
  if (token !== tokenFor(tenantId)) return fail(403, 'Invalid token — link may have been tampered with.');

  var supabase = getSupabase();
  try {
    var t = await supabase.from('tenants').select('id, name, brand_name, digest_email, onboarding_completed').eq('id', tenantId).maybeSingle();
    if (!t.data) return fail(404, 'Tenant not found.');

    // Resolve recipient: digest_email → admin tenant_member email → bail
    var to = (t.data.digest_email && t.data.digest_email.trim()) || null;
    if (!to) {
      try {
        var m = await supabase.from('tenant_members').select('user_id').eq('tenant_id', tenantId).eq('role', 'admin').eq('status', 'active').limit(1).maybeSingle();
        if (m.data && m.data.user_id) {
          var p = await supabase.from('user_profiles').select('email').eq('id', m.data.user_id).maybeSingle();
          if (p.data && p.data.email) to = p.data.email;
        }
      } catch (e) {}
    }
    if (!to) return fail(400, 'No recipient found for this tenant — they have no digest_email and no admin tenant_member.');

    if (!process.env.SENDGRID_API_KEY) return fail(500, 'SENDGRID_API_KEY not configured.');
    var sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    var brand = (t.data.brand_name || t.data.name || 'your business').trim();
    var html = '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb;">' +
      '<div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e5e7eb;">' +
      '<h1 style="font-size:20px;color:#111;margin:0 0 8px;">👋 Let\'s finish setting up ' + brand + '</h1>' +
      '<p style="color:#475569;font-size:14px;line-height:1.6;">Hi there — Rob from EngageWorx here. We noticed your portal hasn\'t been fully configured yet. Most tenants finish in under 5 minutes:</p>' +
      '<ul style="color:#475569;font-size:14px;line-height:1.8;padding-left:20px;">' +
        '<li>Add your brand name + logo</li>' +
        '<li>Connect your email (SendGrid API key)</li>' +
        '<li>Set up Aria with your business info + FAQs</li>' +
      '</ul>' +
      '<div style="text-align:center;margin:24px 0;">' +
      '<a href="https://portal.engwx.com" style="display:inline-block;background:linear-gradient(135deg,#00C9FF,#E040FB);color:#000;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;">Open setup wizard →</a>' +
      '</div>' +
      '<p style="color:#94a3b8;font-size:12px;margin:0;">Reply to this email if you\'re stuck — we\'re here to help.</p>' +
      '</div></div>';

    await sgMail.send({
      to: to,
      from: { email: 'hello@engwx.com', name: 'Rob at EngageWorx' },
      replyTo: 'rob@engwx.com',
      subject: '👋 Let\'s finish setting up ' + brand,
      html: html,
    });

    var msg = 'Reminder sent to ' + to + ' for ' + brand + '.';
    if (isJson) return res.status(200).json({ success: true, sent_to: to, tenant: brand });
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).end(htmlPage('Reminder sent', '<h1 style="color:#10b981;font-size:22px;margin:0 0 8px;">✅ Reminder sent</h1><p style="color:#cbd5e1;font-size:14px;margin:0;">' + msg + '</p>', 'rgba(16,185,129,0.4)'));
  } catch (err) {
    console.error('[onboarding-reminder] error:', err.message);
    return fail(500, err.message);
  }
};

module.exports.tokenFor = tokenFor;
