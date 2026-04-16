// api/cron-health-check.js
// Daily 14:00 UTC sweep of tenant configuration health. Only emails Rob if at
// least one issue is detected; silent on a clean run.
//
// Checks:
//   1. Non-master tenants whose email channel config still uses an @engwx.com
//      from_email (wrong branding bleeding through from defaults).
//   2. Non-master tenants with NO channel_configs rows (likely never finished
//      onboarding).
//   3. Any (tenant_id, channel) pair with duplicate rows (cross-tenant bleed
//      symptom).

var { createClient } = require('@supabase/supabase-js');
var _reminder = require('./send-onboarding-reminder');

var SP_TENANT_ID = (process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387');
var PORTAL_BASE = process.env.PORTAL_URL || 'https://portal.engwx.com';

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function checkBrandingBleed(supabase) {
  var rows = await supabase
    .from('channel_configs')
    .select('tenant_id, channel, config_encrypted, tenant:tenant_id(id, name, entity_tier, tenant_type)')
    .eq('channel', 'email');
  var issues = [];
  (rows.data || []).forEach(function(r) {
    if (!r.tenant_id || r.tenant_id === SP_TENANT_ID) return;
    var fromEmail = r.config_encrypted && r.config_encrypted.from_email ? String(r.config_encrypted.from_email).toLowerCase() : '';
    if (!fromEmail) return;
    if (fromEmail.indexOf('engwx.com') !== -1) {
      issues.push({
        tenant_id: r.tenant_id,
        tenant_name: (r.tenant && r.tenant.name) || '(unknown)',
        tier: (r.tenant && (r.tenant.entity_tier || r.tenant.tenant_type)) || '—',
        from_email: fromEmail,
      });
    }
  });
  return issues;
}

async function checkMissingConfigs(supabase) {
  var tenants = await supabase.from('tenants').select('id, name, entity_tier, tenant_type, status').neq('id', SP_TENANT_ID);
  var configs = await supabase.from('channel_configs').select('tenant_id');
  var hasConfig = {};
  (configs.data || []).forEach(function(c) { hasConfig[c.tenant_id] = true; });
  return (tenants.data || [])
    .filter(function(t) { return t.status !== 'cancelled' && t.status !== 'deleted'; })
    .filter(function(t) { return !hasConfig[t.id]; })
    .map(function(t) {
      return {
        tenant_id: t.id,
        tenant_name: t.name,
        tier: t.entity_tier || t.tenant_type || '—',
        status: t.status || 'active',
      };
    });
}

async function checkDuplicates(supabase) {
  var rows = await supabase.from('channel_configs').select('tenant_id, channel, id, created_at');
  var grouped = {};
  (rows.data || []).forEach(function(r) {
    var key = r.tenant_id + '|' + r.channel;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  });
  var dupes = [];
  Object.keys(grouped).forEach(function(key) {
    if (grouped[key].length > 1) {
      var parts = key.split('|');
      dupes.push({
        tenant_id: parts[0],
        channel: parts[1],
        row_count: grouped[key].length,
        ids: grouped[key].map(function(r) { return r.id; }),
      });
    }
  });
  if (dupes.length === 0) return [];
  // Decorate with tenant name
  var tenantIds = dupes.map(function(d) { return d.tenant_id; });
  var tn = await supabase.from('tenants').select('id, name').in('id', tenantIds);
  var nameMap = {};
  (tn.data || []).forEach(function(t) { nameMap[t.id] = t.name; });
  return dupes.map(function(d) { return Object.assign({}, d, { tenant_name: nameMap[d.tenant_id] || '(unknown)' }); });
}

function buildHtml(branding, missing, dupes) {
  var rows = function(items, headers, fn) {
    var head = '<tr style="background:#f3f4f6;">' + headers.map(function(h) { return '<th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;">' + h + '</th>'; }).join('') + '</tr>';
    var body = items.map(function(it) { return '<tr>' + fn(it).map(function(c) { return '<td style="padding:8px 12px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">' + c + '</td>'; }).join('') + '</tr>'; }).join('');
    return '<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:18px;">' + head + body + '</table>';
  };
  var sections = [];
  if (branding.length) {
    sections.push('<h2 style="font-size:15px;color:#dc2626;margin:0 0 8px;">⚠️ Branding bleed (' + branding.length + ')</h2><p style="color:#475569;font-size:12px;margin:0 0 10px;">These non-master tenants are still sending email from an @engwx.com address.</p>' +
      rows(branding, ['Tenant', 'Tier', 'from_email'], function(r) { return [r.tenant_name, r.tier, r.from_email]; }));
  }
  if (missing.length) {
    sections.push('<h2 style="font-size:15px;color:#d97706;margin:0 0 8px;">📭 Missing channel_configs (' + missing.length + ')</h2><p style="color:#475569;font-size:12px;margin:0 0 10px;">These tenants have no channel_configs rows. Likely they never finished onboarding. Click <strong>Send reminder</strong> next to any tenant to email them a setup nudge — no portal login required.</p>' +
      rows(missing, ['Tenant', 'Tier', 'Status', 'Action'], function(r) {
        var url = PORTAL_BASE + '/api/send-onboarding-reminder?tenant_id=' + r.tenant_id + '&token=' + _reminder.tokenFor(r.tenant_id);
        var btn = '<a href="' + url + '" style="display:inline-block;background:linear-gradient(135deg,#00C9FF,#E040FB);color:#000;padding:6px 14px;border-radius:6px;text-decoration:none;font-weight:700;font-size:11px;">📧 Send reminder</a>';
        return [r.tenant_name, r.tier, r.status, btn];
      }));
  }
  if (dupes.length) {
    sections.push('<h2 style="font-size:15px;color:#dc2626;margin:0 0 8px;">🔁 Duplicate (tenant_id, channel) rows (' + dupes.length + ')</h2><p style="color:#475569;font-size:12px;margin:0 0 10px;">Multiple rows for the same tenant + channel — symptom of the cross-tenant bleed bug. Merge or delete the older copies.</p>' +
      rows(dupes, ['Tenant', 'Channel', 'Rows', 'Row IDs'], function(r) { return [r.tenant_name, r.channel, String(r.row_count), '<code style="font-size:11px;">' + r.ids.join('<br>') + '</code>']; }));
  }
  return '<div style="font-family:Arial,sans-serif;max-width:780px;margin:0 auto;padding:24px;background:#f9fafb;">' +
    '<div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">' +
    '<h1 style="font-size:20px;color:#111827;margin:0 0 4px;">🩺 Daily config health check</h1>' +
    '<p style="color:#475569;font-size:13px;margin:0 0 18px;">' + new Date().toISOString().substring(0, 10) + ' · ' + (branding.length + missing.length + dupes.length) + ' issue(s) found</p>' +
    sections.join('') +
    '<p style="color:#94a3b8;font-size:11px;margin:18px 0 0;">Open SP Admin → Customer Success / Tenant Management to review. Cron: api/cron-health-check.js</p>' +
    '</div></div>';
}

module.exports = async function handler(req, res) {
  var authHeader = req.headers['authorization'];
  var cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) return res.status(401).json({ error: 'Unauthorized' });

  var supabase = getSupabase();
  try {
    var [branding, missing, dupes] = await Promise.all([
      checkBrandingBleed(supabase),
      checkMissingConfigs(supabase),
      checkDuplicates(supabase),
    ]);
    var totalIssues = branding.length + missing.length + dupes.length;
    console.log('[HealthCheck] branding=', branding.length, 'missing=', missing.length, 'dupes=', dupes.length);

    if (totalIssues === 0) {
      return res.status(200).json({ success: true, issues: 0, emailed: false });
    }

    if (process.env.SENDGRID_API_KEY) {
      try {
        var sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        await sgMail.send({
          to: (process.env.PLATFORM_ADMIN_EMAIL || 'rob@engwx.com'),
          from: { email: 'notifications@engwx.com', name: 'EngageWorx Health Check' },
          subject: '🩺 Config health: ' + totalIssues + ' issue' + (totalIssues === 1 ? '' : 's') + ' detected',
          html: buildHtml(branding, missing, dupes),
        });
      } catch (e) { console.warn('[HealthCheck] email error:', e.message); }
    }

    return res.status(200).json({ success: true, issues: totalIssues, branding: branding.length, missing: missing.length, dupes: dupes.length, emailed: true });
  } catch (err) {
    console.error('[HealthCheck] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
