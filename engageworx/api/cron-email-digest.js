// api/cron-email-digest.js — Per-tenant daily AI email digest
// Schedule: every hour on the hour. Each tenant fires when their configured
// digest_send_time (local to digest_timezone) matches the current local hour.
// Orphan/untenanted actions fire at 12:00 UTC as a fallback.

var { createClient } = require('@supabase/supabase-js');

function tenantLocalHour(tz) {
  try {
    var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', hour: '2-digit', hour12: false }).formatToParts(new Date());
    var h = parts.find(function(p) { return p.type === 'hour'; });
    return h ? parseInt(h.value, 10) % 24 : null;
  } catch (e) { return null; }
}
function parseHour(timeStr) {
  if (!timeStr) return null;
  var m = /^(\d{1,2}):/.exec(timeStr);
  return m ? parseInt(m[1], 10) : null;
}
function shouldFireForTenant(tenant, offsetHours) {
  var configured = parseHour(tenant.digest_send_time || '08:00');
  if (configured === null) return false;
  var local = tenantLocalHour(tenant.digest_timezone || 'America/New_York');
  if (local === null) return false;
  return local === ((configured + (offsetHours || 0)) % 24);
}

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function resolveRecipient(supabase, tenantId) {
  if (!tenantId) return 'rob@engwx.com';
  try {
    var t = await supabase.from('tenants').select('digest_email, name').eq('id', tenantId).maybeSingle();
    if (t.data && t.data.digest_email && t.data.digest_email.trim()) {
      return { email: t.data.digest_email.trim(), tenantName: t.data.name };
    }
    // Try role='owner' first, then 'admin' (legacy)
    for (var roleCandidate of ['owner', 'admin']) {
      var m = await supabase.from('tenant_members').select('user_id').eq('tenant_id', tenantId).eq('role', roleCandidate).eq('status', 'active').limit(1).maybeSingle();
      if (m.data && m.data.user_id) {
        var p = await supabase.from('user_profiles').select('email').eq('id', m.data.user_id).maybeSingle();
        if (p.data && p.data.email) return { email: p.data.email, tenantName: (t.data || {}).name };
      }
    }
    return { email: 'rob@engwx.com', tenantName: (t.data || {}).name };
  } catch (e) {
    return { email: 'rob@engwx.com', tenantName: null };
  }
}

function renderRow(a) {
  var actionBadge = '<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:#e0e7ff;color:#4338ca;text-transform:uppercase;">' + (a.claude_action || '').replace('_', ' ') + '</span>';
  var statusBadge = a.status === 'actioned'
    ? '<span style="font-size:11px;color:#059669;">✓ Actioned</span>'
    : a.status === 'dismissed'
      ? '<span style="font-size:11px;color:#94a3b8;">Dismissed</span>'
      : '<span style="font-size:11px;color:#d97706;">⏳ Pending</span>';
  var sourceTag = a.source === 'stale_lead'
    ? '<span style="font-size:10px;color:#6366f1;">🔄 Stale Lead</span>'
    : '<span style="font-size:10px;color:#0ea5e9;">📨 Inbound</span>';
  return '<tr>' +
    '<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">' +
      '<div style="margin-bottom:3px;">' + sourceTag + '</div>' +
      '<div style="font-weight:700;color:#1e293b;font-size:13px;">' + (a.email_from || '—') + '</div>' +
      '<div style="color:#64748b;font-size:11px;margin-top:2px;">' + (a.email_subject || '(no subject)') + '</div>' +
      '<div style="color:#475569;font-size:12px;margin-top:6px;line-height:1.4;">' + (a.email_body_summary || '') + '</div>' +
      (a.claude_reasoning ? '<div style="color:#64748b;font-size:11px;margin-top:6px;font-style:italic;">🤖 ' + a.claude_reasoning + '</div>' : '') +
    '</td>' +
    '<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;white-space:nowrap;">' + actionBadge + '<br>' + statusBadge + '</td>' +
  '</tr>';
}

function buildHtml(tenantName, actions) {
  var total = actions.length;
  var auto = actions.filter(function(a) { return a.status === 'actioned'; }).length;
  var pending = actions.filter(function(a) { return a.status === 'pending'; }).length;
  var matched = actions.filter(function(a) { return a.contact_id || a.lead_id || a.tenant_id; }).length;
  var rows = actions.map(renderRow).join('');
  var pendingRows = actions.filter(function(a) { return a.status === 'pending'; }).map(renderRow).join('');
  return '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:20px;">' +
    '<div style="max-width:720px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;">' +
    '<div style="background:linear-gradient(135deg,#00C9FF,#E040FB);color:#fff;padding:20px;border-radius:10px;margin-bottom:20px;">' +
      '<div style="font-size:22px;font-weight:900;">📧 Daily AI Digest' + (tenantName ? ' — ' + tenantName : '') + '</div>' +
      '<div style="font-size:13px;opacity:0.9;margin-top:4px;">' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + '</div>' +
    '</div>' +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:20px;"><tr>' +
      '<td style="text-align:center;padding:14px;background:#f1f5f9;border-radius:8px;width:25%;"><div style="font-size:24px;font-weight:900;color:#0ea5e9;">' + total + '</div><div style="font-size:11px;color:#64748b;text-transform:uppercase;">Processed</div></td>' +
      '<td style="width:8px;"></td>' +
      '<td style="text-align:center;padding:14px;background:#f1f5f9;border-radius:8px;width:25%;"><div style="font-size:24px;font-weight:900;color:#10b981;">' + auto + '</div><div style="font-size:11px;color:#64748b;text-transform:uppercase;">Auto-resolved</div></td>' +
      '<td style="width:8px;"></td>' +
      '<td style="text-align:center;padding:14px;background:#fef3c7;border-radius:8px;width:25%;"><div style="font-size:24px;font-weight:900;color:#d97706;">' + pending + '</div><div style="font-size:11px;color:#64748b;text-transform:uppercase;">Needs Review</div></td>' +
      '<td style="width:8px;"></td>' +
      '<td style="text-align:center;padding:14px;background:#f1f5f9;border-radius:8px;width:25%;"><div style="font-size:24px;font-weight:900;color:#6366f1;">' + matched + '</div><div style="font-size:11px;color:#64748b;text-transform:uppercase;">Matched</div></td>' +
    '</tr></table>' +
    (pendingRows ? '<h2 style="font-size:16px;color:#1e293b;margin:20px 0 10px;">⏳ Needs your review</h2><table style="width:100%;border-collapse:collapse;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;overflow:hidden;">' + pendingRows + '</table>' : '') +
    (rows ? '<h2 style="font-size:16px;color:#1e293b;margin:20px 0 10px;">All items</h2><table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">' + rows + '</table>' : '<div style="text-align:center;padding:40px;color:#94a3b8;">No activity in the last 24 hours.</div>') +
    '<div style="text-align:center;margin-top:20px;"><a href="https://portal.engwx.com" style="display:inline-block;background:linear-gradient(135deg,#00C9FF,#E040FB);color:#000;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Open AI Email Digest →</a></div>' +
    '</div></body></html>';
}

module.exports = async function handler(req, res) {
  var authHeader = req.headers['authorization'];
  var cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) return res.status(401).json({ error: 'Unauthorized' });

  var supabase = getSupabase();
  var dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  var utcHour = new Date().getUTCHours();
  // Force flag: bypass per-tenant hour matching and send digest immediately. Useful for
  // ad-hoc reruns and the "send me my digest now" UI button. Accepts force in body OR query.
  var rawBody = req.body || {};
  var force = rawBody.force === true || rawBody.force === 'true' || (req.query && (req.query.force === '1' || req.query.force === 'true'));
  // Optional: limit a forced run to one tenant via tenant_id
  var forceTenantId = rawBody.tenant_id || (req.query && req.query.tenant_id) || null;
  console.log('[Cron] Email digest window:', dayAgo, '→ now. UTC hour:', utcHour, force ? '(FORCED)' : '');

  try {
    // Determine which tenants should fire this hour (or all of them, when force=true)
    var tenantsQuery = supabase.from('tenants').select('id, name, digest_send_time, digest_timezone, digest_email');
    if (force && forceTenantId) tenantsQuery = tenantsQuery.eq('id', forceTenantId);
    var tenantsRes = await tenantsQuery;
    var allTenants = tenantsRes.data || [];
    var firingIds = {};
    if (force) {
      allTenants.forEach(function(t) { firingIds[t.id] = true; });
    } else {
      allTenants.forEach(function(t) { if (shouldFireForTenant(t, 0)) firingIds[t.id] = true; });
    }
    var firingCount = Object.keys(firingIds).length;
    console.log('[Cron] Tenants firing this hour:', firingCount, '/', allTenants.length, force ? '(force=true)' : '');

    var actionsRes = await supabase.from('email_actions')
      .select('id, email_from, email_subject, email_body_summary, claude_action, claude_reasoning, claude_reply_draft, status, contact_id, lead_id, tenant_id, source, created_at')
      .gte('created_at', dayAgo)
      .order('created_at', { ascending: false });
    var actions = actionsRes.data || [];

    // Group by tenant_id — only include tenants firing this hour.
    // Orphaned (null tenant) actions fire at 12:00 UTC as a fallback (or always when forced).
    var byTenant = {};
    actions.forEach(function(a) {
      if (a.tenant_id) {
        if (!firingIds[a.tenant_id]) return;
        if (!byTenant[a.tenant_id]) byTenant[a.tenant_id] = [];
        byTenant[a.tenant_id].push(a);
      } else if (force || utcHour === 12) {
        if (force && forceTenantId) return; // single-tenant force: skip orphans
        if (!byTenant._orphan) byTenant._orphan = [];
        byTenant._orphan.push(a);
      }
    });
    if (firingCount === 0 && !byTenant._orphan) {
      return res.status(200).json({ success: true, skipped: true, utc_hour: utcHour, forced: force, reason: force ? 'No matching tenants for forced run' : 'No tenants scheduled for this hour' });
    }

    var sgMail = null;
    if (process.env.SENDGRID_API_KEY) {
      sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    }

    var sent = 0;
    var errors = [];
    for (var tenantKey in byTenant) {
      var tenantId = tenantKey === '_orphan' ? null : tenantKey;
      var acts = byTenant[tenantKey];
      var r = tenantId ? await resolveRecipient(supabase, tenantId) : { email: 'rob@engwx.com', tenantName: null };
      var to = r.email;
      var tenantName = r.tenantName;
      var html = buildHtml(tenantName, acts);
      var subject = '📧 Daily AI Digest' + (tenantName ? ' — ' + tenantName : '') + ' · ' + acts.length + ' processed, ' + acts.filter(function(a) { return a.status === 'pending'; }).length + ' need review';

      if (sgMail) {
        try {
          var _sigD = require('./_email-signature');
          var sigDig = await _sigD.getSignature(supabase, { tenantId: tenantId || null, fromEmail: 'notifications@engwx.com', isFirstTouch: false, closingKind: 'reply' });
          await sgMail.send({
            to: to,
            from: { email: 'notifications@engwx.com', name: sigDig.fromName || 'EngageWorx' },
            subject: subject,
            html: html,
          });
          sent++;
          console.log('[Cron] Digest sent to', to, '(tenant:', tenantKey + ')', 'actions:', acts.length);
        } catch (se) { errors.push({ to: to, tenant: tenantKey, error: se.message }); }
      }
    }

    return res.status(200).json({ success: true, tenants_processed: Object.keys(byTenant).length, digests_sent: sent, total_actions: actions.length, errors: errors });
  } catch (err) {
    console.error('[Cron] Digest error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
