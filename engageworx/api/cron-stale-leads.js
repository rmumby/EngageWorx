// api/cron-stale-leads.js — Daily stale lead outreach analysis
// Schedule: every hour on the hour. Each tenant fires one hour after their
// digest_send_time (so the stale-lead summary lands shortly after the digest).
// Finds qualified leads with no activity in 7+ days, asks Claude what to do,
// stores the recommendation in email_actions. Supervised mode (default) lets
// the tenant approve via the AI Email Digest. Autonomous mode fires immediately.

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
  return local === ((configured + (offsetHours || 0) + 24) % 24);
}

var SP_TENANT_ID = 'c1bc59a8-5235-4921-9755-02514b574387';
var STALE_DAYS = 7;
var FROZEN_STAGES = ['customer', 'closed_won', 'closed_lost'];

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function resolveRecipient(supabase, tenantId) {
  if (!tenantId) return { email: 'rob@engwx.com', tenantName: null };
  try {
    var t = await supabase.from('tenants').select('digest_email, name').eq('id', tenantId).maybeSingle();
    if (t.data && t.data.digest_email && t.data.digest_email.trim()) return { email: t.data.digest_email.trim(), tenantName: t.data.name };
    for (var role of ['owner', 'admin']) {
      var m = await supabase.from('tenant_members').select('user_id').eq('tenant_id', tenantId).eq('role', role).eq('status', 'active').limit(1).maybeSingle();
      if (m.data && m.data.user_id) {
        var p = await supabase.from('user_profiles').select('email').eq('id', m.data.user_id).maybeSingle();
        if (p.data && p.data.email) return { email: p.data.email, tenantName: (t.data || {}).name };
      }
    }
    return { email: 'rob@engwx.com', tenantName: (t.data || {}).name };
  } catch (e) { return { email: 'rob@engwx.com', tenantName: null }; }
}

async function getMode(supabase) {
  try {
    var r = await supabase.from('sp_settings').select('value').eq('tenant_id', SP_TENANT_ID).eq('key', 'stale_lead_outreach').maybeSingle();
    if (r.data && r.data.value && r.data.value.mode) return r.data.value.mode;
  } catch (e) {}
  return 'supervised';
}

async function analyseLead(lead) {
  var stale = Math.floor((Date.now() - new Date(lead.last_activity_at || lead.created_at).getTime()) / 86400000);
  var system = 'You re-engage stale B2B sales leads for EngageWorx.' +
    '\nReturn STRICT JSON: {"action":"enroll_sequence"|"auto_reply"|"no_action","reasoning":"1-2 sentences","reply_draft":"warm 3-sentence email if auto_reply, else null","sequence_name":"short name for an existing sequence or new idea if enroll_sequence, else null"}.' +
    '\nauto_reply is a personal check-in email from Rob; keep it under 80 words, end with a light CTA.' +
    '\nenroll_sequence for leads that need systematic nurture (4+ touches over weeks).' +
    '\nno_action only for leads that look already lost.';
  var prompt = 'Lead: ' + (lead.name || '?') + ' at ' + (lead.company || '?') +
    '\nStage: ' + (lead.stage || '?') +
    '\nUrgency: ' + (lead.urgency || '?') +
    '\nDays since last activity: ' + stale +
    '\nEmail: ' + (lead.email || 'none') +
    '\nPhone: ' + (lead.phone || 'none') +
    (lead.notes ? '\n\nNotes:\n' + lead.notes.substring(0, 1200) : '') +
    '\n\nReturn JSON.';
  try {
    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, system: system, messages: [{ role: 'user', content: prompt }] }),
    });
    var data = await res.json();
    var txt = (data.content || []).find(function(b) { return b.type === 'text'; })?.text || '';
    var m = txt.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  } catch (e) { console.warn('[StaleLeads] Claude error for', lead.id, e.message); }
  return { action: 'no_action', reasoning: 'Claude unavailable', reply_draft: null, sequence_name: null };
}

async function executeAction(supabase, lead, decision) {
  if (decision.action === 'auto_reply' && decision.reply_draft && lead.email) {
    try {
      if (process.env.SENDGRID_API_KEY) {
        var sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        var _sig = require('./_email-signature');
        var sigInfo = await _sig.getSignature(supabase, { tenantId: lead.tenant_id, fromEmail: 'hello@engwx.com', isFirstTouch: false, closingKind: 'followup' });
        var bodyHtml = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.6;white-space:pre-wrap;">' + decision.reply_draft.replace(/</g, '&lt;') + '</div>';
        await sgMail.send({
          to: lead.email,
          from: { email: 'hello@engwx.com', name: sigInfo.fromName || 'EngageWorx' },
          replyTo: 'hello@engwx.com',
          subject: 'Checking in',
          text: _sig.composeTextBody(decision.reply_draft, sigInfo.closingLine, sigInfo.fromName),
          html: _sig.composeHtmlBody(bodyHtml, sigInfo.closingLine, sigInfo.signatureHtml),
        });
        return true;
      }
    } catch (e) { console.warn('[StaleLeads] Send error:', e.message); }
  }
  if (decision.action === 'enroll_sequence' && decision.sequence_name) {
    try {
      var seq = await supabase.from('sequences').select('id').eq('tenant_id', lead.tenant_id).ilike('name', '%' + decision.sequence_name + '%').limit(1).maybeSingle();
      if (!seq.data) seq = await supabase.from('sequences').select('id').eq('tenant_id', SP_TENANT_ID).ilike('name', '%' + decision.sequence_name + '%').limit(1).maybeSingle();
      if (!seq.data) return false;
      var fs = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', seq.data.id).eq('step_number', 1).single();
      var nextAt = new Date(Date.now() + ((fs.data && fs.data.delay_days) || 0) * 86400000).toISOString();
      await supabase.from('lead_sequences').upsert({
        tenant_id: lead.tenant_id, lead_id: lead.id, sequence_id: seq.data.id,
        current_step: 0, status: 'active', enrolled_at: new Date().toISOString(), next_step_at: nextAt,
      }, { onConflict: 'lead_id,sequence_id' });
      return true;
    } catch (e) { console.warn('[StaleLeads] Enrol error:', e.message); }
  }
  return false;
}

module.exports = async function handler(req, res) {
  var authHeader = req.headers['authorization'];
  var cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) return res.status(401).json({ error: 'Unauthorized' });

  var supabase = getSupabase();
  var mode = await getMode(supabase);
  var cutoff = new Date(Date.now() - STALE_DAYS * 86400000).toISOString();
  var utcHour = new Date().getUTCHours();
  console.log('[Cron] Stale leads started. mode:', mode, 'cutoff:', cutoff, 'UTC hour:', utcHour);

  try {
    // Determine which tenants should fire this hour (configured digest hour + 1)
    var tenantsRes = await supabase.from('tenants').select('id, digest_send_time, digest_timezone');
    var allTenants = tenantsRes.data || [];
    var firingIds = {};
    allTenants.forEach(function(t) { if (shouldFireForTenant(t, 1)) firingIds[t.id] = true; });
    var firingCount = Object.keys(firingIds).length;
    console.log('[Cron] Stale-leads firing tenants this hour:', firingCount, '/', allTenants.length);
    var fireOrphans = utcHour === 13; // default 9am ET fallback for null-tenant leads
    if (firingCount === 0 && !fireOrphans) {
      return res.status(200).json({ success: true, skipped: true, utc_hour: utcHour, reason: 'No tenants scheduled for stale-leads this hour' });
    }

    var leadsQuery = supabase.from('leads')
      .select('id, name, company, email, phone, stage, urgency, notes, tenant_id, last_activity_at, created_at')
      .eq('qualified', true)
      .eq('archived', false)
      .not('stage', 'in', '(' + FROZEN_STAGES.map(function(s) { return '"' + s + '"'; }).join(',') + ')')
      .lt('last_activity_at', cutoff)
      .limit(200);
    var leadsRes = await leadsQuery;
    var allLeads = leadsRes.data || [];
    var leads = allLeads.filter(function(l) {
      if (l.tenant_id) return !!firingIds[l.tenant_id];
      return fireOrphans;
    });
    console.log('[Cron] Stale candidates after tenant filter:', leads.length, '/', allLeads.length);
    var analysed = 0, actioned = 0, pending = 0;
    var createdByTenant = {}; // tenant_id → [{ lead, decision, status }]

    for (var lead of leads) {
      // Skip if we already logged a stale_lead action for this lead in the last 5 days
      try {
        var recent = await supabase.from('email_actions')
          .select('id').eq('lead_id', lead.id).eq('source', 'stale_lead')
          .gte('created_at', new Date(Date.now() - 5 * 86400000).toISOString())
          .limit(1);
        if (recent.data && recent.data.length > 0) continue;
      } catch (e) {}

      var decision = await analyseLead(lead);
      analysed++;
      if (decision.action === 'no_action') continue;

      var daysStale = Math.floor((Date.now() - new Date(lead.last_activity_at || lead.created_at).getTime()) / 86400000);

      var row = {
        contact_id: null, lead_id: lead.id, tenant_id: lead.tenant_id,
        email_from: lead.email || '(no email)',
        email_subject: '[Stale ' + daysStale + 'd] ' + (lead.name || 'Lead') + ' · ' + (lead.stage || ''),
        email_body_summary: (lead.notes || '').substring(0, 300),
        claude_action: decision.action,
        claude_reasoning: decision.reasoning || null,
        claude_reply_draft: decision.reply_draft || null,
        action_payload: { sequence_name: decision.sequence_name, days_stale: daysStale },
        status: 'pending',
        source: 'stale_lead',
      };

      if (mode === 'autonomous') {
        var ok = await executeAction(supabase, lead, decision);
        if (ok) { row.status = 'actioned'; row.actioned_at = new Date().toISOString(); actioned++; }
        else pending++;
      } else {
        pending++;
      }

      await supabase.from('email_actions').insert(row);
      var bucket = lead.tenant_id || '_orphan';
      if (!createdByTenant[bucket]) createdByTenant[bucket] = [];
      createdByTenant[bucket].push({ lead: lead, decision: decision, status: row.status, daysStale: daysStale });
    }

    // Per-tenant summary email
    var digestsSent = 0;
    if (process.env.SENDGRID_API_KEY && Object.keys(createdByTenant).length > 0) {
      var sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);

      for (var tenantKey in createdByTenant) {
        var items = createdByTenant[tenantKey];
        var r = tenantKey === '_orphan' ? { email: 'rob@engwx.com', tenantName: null } : await resolveRecipient(supabase, tenantKey);
        var rowsHtml = items.map(function(x) {
          var actionLabel = x.decision.action === 'auto_reply' ? '✉️ Personal email' : x.decision.action === 'enroll_sequence' ? '📤 Enrol in "' + (x.decision.sequence_name || '?') + '"' : '—';
          var statusLabel = x.status === 'actioned' ? '<span style="color:#059669;font-weight:700;">✓ Sent</span>' : '<span style="color:#d97706;font-weight:700;">⏳ Pending your approval</span>';
          return '<tr>' +
            '<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;"><div style="font-weight:700;color:#1e293b;">' + (x.lead.name || '(no name)') + '</div><div style="color:#64748b;font-size:11px;margin-top:2px;">' + (x.lead.company || '') + ' · ' + (x.lead.stage || '') + ' · ' + x.daysStale + ' days stale</div></td>' +
            '<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;">' + actionLabel + '<br>' + statusLabel + '</td>' +
            '<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b;font-style:italic;">' + (x.decision.reasoning || '') + '</td>' +
          '</tr>';
        }).join('');
        var html = '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:20px;">' +
          '<div style="max-width:780px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;">' +
          '<div style="background:linear-gradient(135deg,#6366f1,#E040FB);color:#fff;padding:20px;border-radius:10px;margin-bottom:20px;">' +
            '<div style="font-size:22px;font-weight:900;">🔄 Stale Lead Outreach' + (r.tenantName ? ' — ' + r.tenantName : '') + '</div>' +
            '<div style="font-size:13px;opacity:0.9;margin-top:4px;">' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + ' · mode: ' + mode + '</div>' +
          '</div>' +
          '<p style="color:#475569;font-size:13px;line-height:1.6;">' + items.length + ' stale lead(s) analysed today. ' +
          (mode === 'autonomous' ? 'Autonomous mode: Claude already actioned these. Summary below.' : 'Supervised mode: open AI Email Digest to approve.') + '</p>' +
          '<table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;"><tr style="background:#f1f5f9;"><th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;">Lead</th><th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;">Action</th><th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;">Reasoning</th></tr>' + rowsHtml + '</table>' +
          '<div style="text-align:center;margin-top:20px;"><a href="https://portal.engwx.com" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#E040FB);color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Review in AI Email Digest →</a></div>' +
          '</div></body></html>';
        try {
          var _sigS = require('./_email-signature');
          var sigSumInfo = await _sigS.getSignature(supabase, { tenantId: tenantKey === '_orphan' ? null : tenantKey, fromEmail: 'notifications@engwx.com', isFirstTouch: false, closingKind: 'reply' });
          await sgMail.send({
            to: r.email,
            from: { email: 'notifications@engwx.com', name: sigSumInfo.fromName || 'EngageWorx' },
            subject: '🔄 Stale Lead Outreach' + (r.tenantName ? ' — ' + r.tenantName : '') + ' · ' + items.length + ' analysed',
            html: html,
          });
          digestsSent++;
          console.log('[Cron] Stale digest sent to', r.email, '(tenant:', tenantKey + ')');
        } catch (sErr) { console.warn('[Cron] Stale digest send error:', sErr.message); }
      }
    }

    console.log('[Cron] Stale leads done.', 'candidates:', leads.length, 'analysed:', analysed, 'actioned:', actioned, 'pending:', pending, 'digests:', digestsSent);
    return res.status(200).json({ success: true, mode: mode, candidates: leads.length, analysed: analysed, actioned: actioned, pending: pending, digests_sent: digestsSent });
  } catch (err) {
    console.error('[Cron] Stale leads error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
