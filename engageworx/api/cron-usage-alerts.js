// api/cron-usage-alerts.js
// Hourly: for each tenant, compute % of bundle used on each metric and fire 75/90/100 alerts.
// Alerts de-duped by (tenant_id, metric, threshold_pct, period) via the usage_alerts table.

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Default limits — used ONLY when tenants.message_limit is NULL.
// The per-tenant value (tenants.message_limit) is the source of truth,
// seeded from platform_config.plans at tenant creation time.
var DEFAULT_LIMITS = {
  sms: 1000, whatsapp: 1000, email: 5000, ai: 500, voice: 200, contacts: 2500,
};

// Per-metric multipliers relative to SMS limit (tenants.message_limit).
// SMS limit is the base; other channels scale from it.
// e.g. if message_limit=5000: sms=5000, whatsapp=5000, email=25000, ai=2500, voice=1000
var METRIC_MULTIPLIERS = {
  sms: 1,
  whatsapp: 1,
  email: 5,
  ai: 0.5,
  voice: 0.2,
};

var METRIC_COLS = {
  sms:      'sms_used',
  whatsapp: 'whatsapp_used',
  email:    'email_used',
  ai:       'ai_interactions_used',
  voice:    'voice_minutes_used',
  contacts: 'contacts_count',
};

function currentPeriod() {
  var d = new Date();
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

async function alreadyAlerted(supabase, tenantId, metric, threshold, period) {
  try {
    var r = await supabase.from('usage_alerts').select('id')
      .eq('tenant_id', tenantId).eq('metric', metric).eq('threshold_pct', threshold).eq('period', period).limit(1).maybeSingle();
    return !!(r.data && r.data.id);
  } catch (e) { return false; }
}

async function recordAlert(supabase, tenantId, metric, threshold, period) {
  try { await supabase.from('usage_alerts').insert({ tenant_id: tenantId, metric: metric, threshold_pct: threshold, period: period }); } catch (e) {}
}

async function resolveDigestEmail(supabase, tenantId) {
  try {
    var t = await supabase.from('tenants').select('digest_email').eq('id', tenantId).maybeSingle();
    if (t.data && t.data.digest_email) return String(t.data.digest_email).trim();
  } catch (e) {}
  try {
    for (var role of ['owner', 'admin']) {
      var m = await supabase.from('tenant_members').select('user_id').eq('tenant_id', tenantId).eq('role', role).eq('status', 'active').limit(1).maybeSingle();
      if (m.data && m.data.user_id) {
        var p = await supabase.from('user_profiles').select('email').eq('id', m.data.user_id).maybeSingle();
        if (p.data && p.data.email) return p.data.email;
      }
    }
  } catch (e) {}
  return (process.env.PLATFORM_ADMIN_EMAIL || 'rob@engwx.com');
}

function alertHtml(tenantName, metric, pct, used, limit, threshold) {
  var colors = { 75: '#d97706', 90: '#dc2626', 100: '#991b1b' };
  var titles = { 75: '⚠️ Usage warning', 90: '🚨 Urgent — approaching cap', 100: '🛑 Bundle cap reached' };
  return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9fafb;">' +
    '<div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">' +
    '<h1 style="font-size:20px;color:' + (colors[threshold] || '#111') + ';margin:0 0 8px;">' + (titles[threshold] || 'Usage alert') + '</h1>' +
    '<p style="color:#475569;font-size:14px;margin:0 0 16px;">' + tenantName + ' has used <strong>' + pct + '%</strong> of its ' + metric + ' bundle this month (' + used + ' / ' + limit + ').</p>' +
    (threshold === 100 ? '<p style="color:#475569;font-size:13px;">A soft cap has been applied. Upgrade or buy a top-up to continue sending.</p>' : '') +
    '<div style="margin-top:16px;"><a href="https://portal.engwx.com" style="display:inline-block;background:linear-gradient(135deg,#00C9FF,#E040FB);color:#000;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;">Open portal</a></div>' +
    '</div></div>';
}

module.exports = async function handler(req, res) {
  var authHeader = req.headers['authorization'];
  var cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) return res.status(401).json({ error: 'Unauthorized' });

  var supabase = getSupabase();
  var period = currentPeriod();
  var sgMail = null;
  if (process.env.SENDGRID_API_KEY) {
    sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  }

  try {
    var tRes = await supabase.from('tenants').select('id, name, plan, message_limit, contact_limit, sms_used, whatsapp_used, email_used, ai_interactions_used, voice_minutes_used, contacts_count, soft_capped');
    var tenants = tRes.data || [];
    var alertsFired = 0;
    var skipped = 0;

    for (var t of tenants) {
      // Source of truth: tenants.message_limit (seeded from platform_config.plans at creation)
      var smsLimit = t.message_limit;
      if (!smsLimit && smsLimit !== 0) {
        console.warn('[UsageAlerts] tenant has no message_limit, skipping enforcement:', t.id, t.name, t.plan);
        skipped++;
        continue;
      }

      // Build per-metric limits from SMS base using multipliers
      var limits = {
        sms: smsLimit,
        whatsapp: Math.round(smsLimit * METRIC_MULTIPLIERS.whatsapp),
        email: Math.round(smsLimit * METRIC_MULTIPLIERS.email),
        ai: Math.round(smsLimit * METRIC_MULTIPLIERS.ai),
        voice: Math.round(smsLimit * METRIC_MULTIPLIERS.voice),
        contacts: t.contact_limit || DEFAULT_LIMITS.contacts,
      };

      for (var metric of Object.keys(METRIC_COLS)) {
        var used = Number(t[METRIC_COLS[metric]] || 0);
        var cap = Number(limits[metric] || 1);
        var pct = Math.floor((used / cap) * 100);

        for (var threshold of [75, 90, 100]) {
          if (pct < threshold) continue;
          if (await alreadyAlerted(supabase, t.id, metric, threshold, period)) continue;

          var digestEmail = await resolveDigestEmail(supabase, t.id);
          var to = [digestEmail];
          if (threshold >= 90 && to.indexOf((process.env.PLATFORM_ADMIN_EMAIL || 'rob@engwx.com')) === -1) to.push((process.env.PLATFORM_ADMIN_EMAIL || 'rob@engwx.com'));

          var subjectPrefix = threshold === 75 ? '⚠️ Usage warning' : (threshold === 90 ? '🚨 Urgent: 90% used' : '🛑 Cap reached');
          var subject = subjectPrefix + ' — ' + (t.name || 'Tenant') + ' · ' + metric;
          var html = alertHtml(t.name || 'Tenant', metric, pct, used, cap, threshold);

          if (sgMail) {
            try {
              await sgMail.send({ to: to, from: { email: 'notifications@engwx.com', name: 'EngageWorx' }, subject: subject, html: html });
            } catch (sErr) { console.warn('[UsageAlert] send error:', sErr.message); }
          }
          await recordAlert(supabase, t.id, metric, threshold, period);
          alertsFired++;

          if (threshold === 100 && !t.soft_capped) {
            try { await supabase.from('tenants').update({ soft_capped: true }).eq('id', t.id); } catch (e) {}
          }
        }
      }
    }

    return res.status(200).json({ success: true, tenants: tenants.length, alerts_fired: alertsFired, skipped_no_limit: skipped, period: period });
  } catch (err) {
    console.error('[UsageAlerts] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
