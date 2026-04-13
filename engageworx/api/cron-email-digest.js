// api/cron-email-digest.js — Daily email digest to rob@engwx.com at 8am ET
// Scheduled in vercel.json at 12:00 UTC (= 8am EDT, 7am EST)

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  var authHeader = req.headers['authorization'];
  var cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  var supabase = getSupabase();
  var dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  console.log('[Cron] Email digest window:', dayAgo, '→ now');

  try {
    var actionsRes = await supabase.from('email_actions')
      .select('id, email_from, email_subject, email_body_summary, claude_action, claude_reasoning, claude_reply_draft, status, contact_id, lead_id, tenant_id, created_at')
      .gte('created_at', dayAgo)
      .order('created_at', { ascending: false });

    var actions = actionsRes.data || [];
    var total = actions.length;
    var auto = actions.filter(function(a) { return a.status === 'actioned'; }).length;
    var pending = actions.filter(function(a) { return a.status === 'pending' && a.claude_action === 'review'; }).length;
    var dismissed = actions.filter(function(a) { return a.status === 'dismissed'; }).length;
    var matched = actions.filter(function(a) { return a.contact_id || a.lead_id || a.tenant_id; }).length;

    function row(a) {
      var actionBadge = '<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:#e0e7ff;color:#4338ca;text-transform:uppercase;">' + a.claude_action.replace('_', ' ') + '</span>';
      var statusBadge = a.status === 'actioned'
        ? '<span style="font-size:11px;color:#059669;">✓ Actioned</span>'
        : a.status === 'dismissed'
          ? '<span style="font-size:11px;color:#94a3b8;">Dismissed</span>'
          : '<span style="font-size:11px;color:#d97706;">⏳ Pending</span>';
      return '<tr>' +
        '<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">' +
          '<div style="font-weight:700;color:#1e293b;font-size:13px;">' + (a.email_from || '—') + '</div>' +
          '<div style="color:#64748b;font-size:11px;margin-top:2px;">' + (a.email_subject || '(no subject)') + '</div>' +
          '<div style="color:#475569;font-size:12px;margin-top:6px;line-height:1.4;">' + (a.email_body_summary || '') + '</div>' +
          (a.claude_reasoning ? '<div style="color:#64748b;font-size:11px;margin-top:6px;font-style:italic;">🤖 ' + a.claude_reasoning + '</div>' : '') +
        '</td>' +
        '<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;white-space:nowrap;">' + actionBadge + '<br>' + statusBadge + '</td>' +
      '</tr>';
    }

    var rows = actions.map(row).join('');
    var pendingRows = actions.filter(function(a) { return a.status === 'pending'; }).map(row).join('');

    var html = '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:20px;">' +
      '<div style="max-width:720px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;">' +
      '<div style="background:linear-gradient(135deg,#00C9FF,#E040FB);color:#fff;padding:20px;border-radius:10px;margin-bottom:20px;">' +
        '<div style="font-size:22px;font-weight:900;">📧 Daily Email Digest</div>' +
        '<div style="font-size:13px;opacity:0.9;margin-top:4px;">' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + '</div>' +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse;margin-bottom:20px;">' +
        '<tr>' +
          '<td style="text-align:center;padding:14px;background:#f1f5f9;border-radius:8px;width:25%;"><div style="font-size:24px;font-weight:900;color:#0ea5e9;">' + total + '</div><div style="font-size:11px;color:#64748b;text-transform:uppercase;">Processed</div></td>' +
          '<td style="width:8px;"></td>' +
          '<td style="text-align:center;padding:14px;background:#f1f5f9;border-radius:8px;width:25%;"><div style="font-size:24px;font-weight:900;color:#10b981;">' + auto + '</div><div style="font-size:11px;color:#64748b;text-transform:uppercase;">Auto-resolved</div></td>' +
          '<td style="width:8px;"></td>' +
          '<td style="text-align:center;padding:14px;background:#fef3c7;border-radius:8px;width:25%;"><div style="font-size:24px;font-weight:900;color:#d97706;">' + pending + '</div><div style="font-size:11px;color:#64748b;text-transform:uppercase;">Needs Review</div></td>' +
          '<td style="width:8px;"></td>' +
          '<td style="text-align:center;padding:14px;background:#f1f5f9;border-radius:8px;width:25%;"><div style="font-size:24px;font-weight:900;color:#6366f1;">' + matched + '</div><div style="font-size:11px;color:#64748b;text-transform:uppercase;">Matched</div></td>' +
        '</tr>' +
      '</table>' +
      (pendingRows ? '<h2 style="font-size:16px;color:#1e293b;margin:20px 0 10px;">⏳ Needs your review</h2><table style="width:100%;border-collapse:collapse;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;overflow:hidden;">' + pendingRows + '</table>' : '') +
      (rows ? '<h2 style="font-size:16px;color:#1e293b;margin:20px 0 10px;">All emails</h2><table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">' + rows + '</table>' : '<div style="text-align:center;padding:40px;color:#94a3b8;">No emails processed in the last 24 hours.</div>') +
      '<div style="text-align:center;margin-top:20px;"><a href="https://portal.engwx.com" style="display:inline-block;background:linear-gradient(135deg,#00C9FF,#E040FB);color:#000;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Open AI Email Digest →</a></div>' +
      '</div></body></html>';

    if (process.env.SENDGRID_API_KEY) {
      var sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      await sgMail.send({
        to: 'rob@engwx.com',
        from: { email: 'notifications@engwx.com', name: 'EngageWorx' },
        subject: '📧 Daily Email Digest — ' + total + ' processed, ' + pending + ' need review',
        html: html,
      });
      console.log('[Cron] Digest sent. Total:', total, 'auto:', auto, 'pending:', pending);
    }
    return res.status(200).json({ success: true, total: total, auto_resolved: auto, needs_review: pending });
  } catch (err) {
    console.error('[Cron] Digest error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
