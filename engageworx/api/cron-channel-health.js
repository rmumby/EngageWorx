// api/cron-channel-health.js — Daily health check for all enabled channel configs
// Runs at 08:00 UTC via vercel.json cron. Validates configs, detects duplicates,
// logs to channel_health_log, emails summary to SP admin.

var { createClient } = require('@supabase/supabase-js');
var { validateChannelConfig } = require('./_lib/validate-channel-config');

module.exports = async function handler(req, res) {
  var supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('[ChannelHealth] Starting daily health check');

  try {
    var cfgRes = await supabase.from('channel_configs').select('id, tenant_id, channel, config_encrypted, enabled, status').eq('enabled', true);
    var configs = cfgRes.data || [];
    console.log('[ChannelHealth] Scanning', configs.length, 'enabled channel configs');

    var issues = [];
    var tenantsSeen = new Set();

    // Load tenant names for the report
    var tenantIds = [...new Set(configs.map(function(c) { return c.tenant_id; }))];
    var tenantMap = {};
    if (tenantIds.length > 0) {
      var tRes = await supabase.from('tenants').select('id, name, brand_name').in('id', tenantIds);
      if (tRes.data) tRes.data.forEach(function(t) { tenantMap[t.id] = t.brand_name || t.name || t.id; });
    }

    // Check for duplicate phone numbers across tenants
    var phoneMap = {};
    configs.forEach(function(cfg) {
      var c = cfg.config_encrypted || {};
      if (c.phone_number && (cfg.channel === 'voice' || cfg.channel === 'sms')) {
        var key = cfg.channel + ':' + c.phone_number;
        if (!phoneMap[key]) phoneMap[key] = [];
        phoneMap[key].push(cfg.tenant_id);
      }
    });
    Object.keys(phoneMap).forEach(function(key) {
      if (phoneMap[key].length > 1) {
        var parts = key.split(':');
        phoneMap[key].forEach(function(tid) {
          issues.push({ tenant_id: tid, channel: parts[0], severity: 'error', issue: 'Duplicate phone number ' + parts[1] + ' shared with ' + (phoneMap[key].length - 1) + ' other tenant(s)' });
        });
      }
    });

    // Validate each config
    configs.forEach(function(cfg) {
      tenantsSeen.add(cfg.tenant_id);
      var c = cfg.config_encrypted || {};
      var result = validateChannelConfig(cfg.channel, c);

      result.errors.forEach(function(e) {
        issues.push({ tenant_id: cfg.tenant_id, channel: cfg.channel, severity: 'error', issue: e.message, config_snapshot: c });
      });
      result.warnings.forEach(function(w) {
        issues.push({ tenant_id: cfg.tenant_id, channel: cfg.channel, severity: 'warn', issue: w.message, config_snapshot: c });
      });
    });

    // Log to channel_health_log
    var runAt = new Date().toISOString();
    if (issues.length > 0) {
      var logRows = issues.map(function(iss) {
        return { run_at: runAt, tenant_id: iss.tenant_id, channel: iss.channel, severity: iss.severity, issue: iss.issue, config_snapshot: iss.config_snapshot || null };
      });
      await supabase.from('channel_health_log').insert(logRows).catch(function(e) { console.warn('[ChannelHealth] Log insert error:', e.message); });
    }
    // Also log an OK row per healthy tenant
    var healthyTenants = [...tenantsSeen].filter(function(tid) { return !issues.some(function(i) { return i.tenant_id === tid && i.severity === 'error'; }); });
    if (healthyTenants.length > 0) {
      var okRows = healthyTenants.map(function(tid) { return { run_at: runAt, tenant_id: tid, channel: 'all', severity: 'ok', issue: 'All channels healthy' }; });
      await supabase.from('channel_health_log').insert(okRows).catch(function() {});
    }

    // Compose summary email
    var errorCount = issues.filter(function(i) { return i.severity === 'error'; }).length;
    var warnCount = issues.filter(function(i) { return i.severity === 'warn'; }).length;
    var totalIssues = errorCount + warnCount;
    var subject = totalIssues > 0
      ? '[EngageWorx Health] ' + totalIssues + ' issue' + (totalIssues > 1 ? 's' : '') + ' found across ' + tenantsSeen.size + ' tenant' + (tenantsSeen.size > 1 ? 's' : '')
      : '[EngageWorx Health] ✅ All channels healthy — ' + tenantsSeen.size + ' tenants scanned';

    var rows = issues.length > 0
      ? issues.map(function(i) {
          var color = i.severity === 'error' ? '#dc2626' : '#eab308';
          var icon = i.severity === 'error' ? '❌' : '⚠️';
          return '<tr><td style="padding:6px 10px;border-bottom:1px solid #1e293b;">' + (tenantMap[i.tenant_id] || i.tenant_id) + '</td><td style="padding:6px 10px;border-bottom:1px solid #1e293b;">' + i.channel + '</td><td style="padding:6px 10px;border-bottom:1px solid #1e293b;color:' + color + ';">' + icon + ' ' + i.issue + '</td><td style="padding:6px 10px;border-bottom:1px solid #1e293b;">' + i.severity + '</td></tr>';
        }).join('')
      : '<tr><td colspan="4" style="padding:16px;text-align:center;color:#22c55e;">✅ All ' + tenantsSeen.size + ' tenants healthy — no issues found.</td></tr>';

    var html = '<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:24px;">' +
      '<h2 style="color:#e8f4fd;margin:0 0 16px;">Channel Health Report</h2>' +
      '<p style="color:#94a3b8;font-size:13px;">' + new Date().toUTCString() + ' — ' + configs.length + ' configs scanned across ' + tenantsSeen.size + ' tenants</p>' +
      (errorCount > 0 ? '<p style="color:#dc2626;font-weight:700;">' + errorCount + ' error(s), ' + warnCount + ' warning(s)</p>' : '') +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;color:#cbd5e1;background:#0f172a;border-radius:8px;overflow:hidden;">' +
      '<tr style="background:#1e293b;"><th style="padding:8px 10px;text-align:left;">Tenant</th><th style="padding:8px 10px;text-align:left;">Channel</th><th style="padding:8px 10px;text-align:left;">Issue</th><th style="padding:8px 10px;text-align:left;">Severity</th></tr>' +
      rows + '</table></div>';

    if (process.env.SENDGRID_API_KEY) {
      try {
        var sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        await sgMail.send({
          to: process.env.PLATFORM_ADMIN_EMAIL || 'rob@engwx.com',
          from: { email: 'notifications@engwx.com', name: 'EngageWorx Health Check' },
          subject: subject,
          html: html,
        });
        console.log('[ChannelHealth] Summary email sent');
      } catch (e) { console.error('[ChannelHealth] Email send error:', e.message); }
    }

    console.log('[ChannelHealth] Complete:', { tenants: tenantsSeen.size, configs: configs.length, errors: errorCount, warnings: warnCount });
    return res.status(200).json({ success: true, tenants: tenantsSeen.size, configs: configs.length, errors: errorCount, warnings: warnCount, issues: issues });
  } catch (e) {
    console.error('[ChannelHealth] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
