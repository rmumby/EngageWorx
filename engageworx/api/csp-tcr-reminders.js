// api/csp-tcr-reminders.js
// CSP triggers a reminder email to a list of their tenants who haven't started TCR.
// POST { csp_tenant_id, tenant_ids: [] }

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var body = req.body || {};
  var cspTenantId = body.csp_tenant_id;
  var ids = Array.isArray(body.tenant_ids) ? body.tenant_ids : [];
  if (!cspTenantId || ids.length === 0) return res.status(400).json({ error: 'csp_tenant_id and tenant_ids required' });

  var supabase = getSupabase();
  try {
    var csp = await supabase.from('tenants').select('name, brand_name').eq('id', cspTenantId).maybeSingle();
    var cspName = (csp.data && (csp.data.brand_name || csp.data.name)) || 'your CSP partner';

    var tens = await supabase.from('tenants').select('id, name, digest_email').in('id', ids);
    var members = await supabase.from('tenant_members').select('tenant_id, user_id').in('tenant_id', ids).eq('role', 'admin').eq('status', 'active');
    var memberByTenant = {};
    (members.data || []).forEach(function(m) { if (!memberByTenant[m.tenant_id]) memberByTenant[m.tenant_id] = m.user_id; });
    var userIds = Object.values(memberByTenant);
    var emailByUserId = {};
    if (userIds.length) {
      var profs = await supabase.from('user_profiles').select('id, email').in('id', userIds);
      (profs.data || []).forEach(function(p) { emailByUserId[p.id] = p.email; });
    }

    var sgMail = null;
    if (process.env.SENDGRID_API_KEY) {
      sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    }

    var sent = 0;
    var failed = [];
    for (var t of (tens.data || [])) {
      var to = (t.digest_email && t.digest_email.trim()) || emailByUserId[memberByTenant[t.id]] || null;
      if (!to) { failed.push({ tenant_id: t.id, reason: 'no recipient' }); continue; }
      if (!sgMail) { failed.push({ tenant_id: t.id, reason: 'sendgrid not configured' }); continue; }
      try {
        var html = '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb;">' +
          '<div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">' +
          '<h1 style="font-size:18px;color:#111;margin:0 0 6px;">📋 SMS Registration reminder</h1>' +
          '<p style="color:#475569;font-size:14px;line-height:1.6;">Hi ' + (t.name || 'there') + ',</p>' +
          '<p style="color:#475569;font-size:14px;line-height:1.6;">' + cspName + ' noticed your SMS registration (A2P 10DLC) hasn\'t been started yet. U.S. carriers require this before SMS can be enabled — it usually takes 5 minutes to submit and ~10 days to approve.</p>' +
          '<div style="text-align:center;margin:20px 0;"><a href="https://portal.engwx.com" style="display:inline-block;background:linear-gradient(135deg,#00C9FF,#E040FB);color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Start registration →</a></div>' +
          '<p style="color:#94a3b8;font-size:12px;">Open your portal → Settings → SMS Registration. Reach out to ' + cspName + ' if you need help.</p>' +
          '</div></div>';
        await sgMail.send({
          to: to,
          from: { email: 'notifications@engwx.com', name: cspName },
          subject: '📋 Reminder: complete your SMS registration',
          html: html,
        });
        sent++;
      } catch (e) { failed.push({ tenant_id: t.id, reason: e.message }); }
    }

    return res.status(200).json({ success: true, sent: sent, failed: failed.length, failures: failed });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
