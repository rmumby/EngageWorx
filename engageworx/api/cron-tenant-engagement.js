// api/cron-tenant-engagement.js
// Daily 14:00 UTC: scan active/trial tenants for two engagement risks:
//   (1) no_setup   — no channel_configs rows at all (never finished onboarding)
//   (2) inactive   — has channel_configs but 0 messages in the last 30 days
// For each finding, ask Claude for a personalised re-engagement suggestion and
// drop it into email_actions as a 'review' action so it surfaces in Rob's AI
// Omnichannel Digest under the new "🩺 Tenant Health" filter.

var { createClient } = require('@supabase/supabase-js');

var SP_TENANT_ID = 'c1bc59a8-5235-4921-9755-02514b574387';

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function resolveRecipient(supabase, tenantId) {
  try {
    var t = await supabase.from('tenants').select('digest_email').eq('id', tenantId).maybeSingle();
    if (t.data && t.data.digest_email) return String(t.data.digest_email).trim();
  } catch (e) {}
  try {
    for (var role of ['admin', 'owner']) {
      var m = await supabase.from('tenant_members').select('user_id').eq('tenant_id', tenantId).eq('role', role).eq('status', 'active').limit(1).maybeSingle();
      if (m.data && m.data.user_id) {
        var p = await supabase.from('user_profiles').select('email').eq('id', m.data.user_id).maybeSingle();
        if (p.data && p.data.email) return p.data.email;
      }
    }
  } catch (e) {}
  return null;
}

async function askClaude(tenant, classification, daysSinceCreated) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  var system = 'You are a customer-success copywriter for EngageWorx, an AI multi-channel comms platform. Write a SHORT (3-4 sentence) re-engagement email a CSM would personally send. Warm, specific, no marketing fluff. End with a single concrete next step. Sign off "— Rob".';
  var prompt = 'Tenant: ' + (tenant.name || 'Unknown') +
    '\nPlan: ' + (tenant.plan || 'Trial') +
    '\nTier: ' + (tenant.entity_tier || tenant.tenant_type || 'direct') +
    '\nDays since signup: ' + daysSinceCreated +
    '\nIssue: ' + (classification === 'no_setup'
      ? 'Has not configured any channels (no channel_configs rows). Likely never opened the setup wizard.'
      : 'Has channels configured but zero messages sent in the last 30 days. Going dormant.') +
    '\n\nWrite the email body only — no subject line, no greeting line ("Hi X,") because we add those separately.';
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, system: system, messages: [{ role: 'user', content: prompt }] }),
    });
    var d = await r.json();
    var txt = (d.content || []).find(function(b) { return b.type === 'text'; });
    return txt ? txt.text.trim() : null;
  } catch (e) { console.warn('[TenantHealth] Claude error:', e.message); return null; }
}

module.exports = async function handler(req, res) {
  var authHeader = req.headers['authorization'];
  var cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) return res.status(401).json({ error: 'Unauthorized' });

  var supabase = getSupabase();
  var thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  try {
    // 1. Active or trial tenants (excluding master SP)
    var tRes = await supabase.from('tenants').select('id, name, plan, status, entity_tier, tenant_type, created_at').neq('id', SP_TENANT_ID).in('status', ['active', 'trial']);
    var tenants = tRes.data || [];

    // 2. Existing channel_configs by tenant
    var ccRes = await supabase.from('channel_configs').select('tenant_id');
    var hasConfig = {};
    (ccRes.data || []).forEach(function(c) { if (c.tenant_id) hasConfig[c.tenant_id] = true; });

    // 3. Recent messages by tenant (last 30 days, outbound)
    var msgRes = await supabase.from('messages').select('tenant_id').gte('created_at', thirtyDaysAgo);
    var hasRecent = {};
    (msgRes.data || []).forEach(function(m) { if (m.tenant_id) hasRecent[m.tenant_id] = (hasRecent[m.tenant_id] || 0) + 1; });

    // 4. Skip tenants we already alerted on this week to avoid spam
    var weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    var existingAlerts = await supabase.from('email_actions').select('tenant_id, action_payload').eq('source', 'tenant_health').gte('created_at', weekAgo);
    var alertedThisWeek = {};
    (existingAlerts.data || []).forEach(function(a) { if (a.tenant_id) alertedThisWeek[a.tenant_id] = true; });

    var noSetup = [];
    var inactive = [];
    var skipped = 0;
    tenants.forEach(function(t) {
      if (alertedThisWeek[t.id]) { skipped++; return; }
      if (!hasConfig[t.id]) noSetup.push(t);
      else if (!hasRecent[t.id]) inactive.push(t);
    });

    var inserted = 0;
    var errors = [];

    async function logFinding(tenant, classification) {
      var daysSince = Math.floor((Date.now() - new Date(tenant.created_at || Date.now()).getTime()) / 86400000);
      var draft = await askClaude(tenant, classification, daysSince);
      var recipient = await resolveRecipient(supabase, tenant.id);
      var summary = classification === 'no_setup'
        ? tenant.name + ' (' + (tenant.plan || 'Trial') + ', ' + daysSince + 'd old) has not configured any channels.'
        : tenant.name + ' (' + (tenant.plan || 'Trial') + ', ' + daysSince + 'd old) has channels configured but 0 messages in 30 days.';
      var subject = classification === 'no_setup'
        ? '🛠 Setup not started — ' + tenant.name
        : '😴 Inactive ' + (hasRecent[tenant.id] ? '' : '(0 msgs/30d) — ') + tenant.name;
      try {
        await supabase.from('email_actions').insert({
          contact_id: null,
          lead_id: null,
          tenant_id: SP_TENANT_ID,
          email_from: recipient || '(no recipient — fix digest_email)',
          email_subject: subject,
          email_body_summary: summary,
          claude_action: 'review',
          claude_reasoning: 'Tenant engagement risk: ' + classification.replace('_', ' '),
          claude_reply_draft: draft || ('Hi ' + (tenant.name ? tenant.name.split(' ')[0] : 'there') + ',\n\nWe noticed your EngageWorx account has not been fully set up yet. Want a quick 10-minute call to walk through the basics together? Reply with a time that works for you.\n\n— Rob'),
          action_payload: {
            channel: 'email',
            source_tenant_id: tenant.id,
            source_tenant_name: tenant.name,
            classification: classification,
            days_since_signup: daysSince,
            recipient_email: recipient,
            plan: tenant.plan,
            tier: tenant.entity_tier || tenant.tenant_type,
          },
          status: 'pending',
          source: 'tenant_health',
        });
        inserted++;
      } catch (e) { errors.push({ tenant: tenant.name, error: e.message }); }
    }

    for (var t1 of noSetup) await logFinding(t1, 'no_setup');
    for (var t2 of inactive) await logFinding(t2, 'inactive');

    console.log('[TenantHealth] no_setup:', noSetup.length, 'inactive:', inactive.length, 'skipped (already alerted):', skipped, 'inserted:', inserted);
    return res.status(200).json({ success: true, no_setup: noSetup.length, inactive: inactive.length, skipped_recent: skipped, inserted: inserted, errors: errors });
  } catch (err) {
    console.error('[TenantHealth] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
