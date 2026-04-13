// api/cron-stale-leads.js — Daily stale lead outreach analysis
// Schedule: 13:00 UTC (9am EDT / 8am EST)
// Finds qualified leads with no activity in 7+ days, asks Claude what to do,
// stores the recommendation in email_actions. Supervised mode (default) lets
// Rob approve via the AI Email Digest. Autonomous mode fires immediately.

var { createClient } = require('@supabase/supabase-js');

var SP_TENANT_ID = 'c1bc59a8-5235-4921-9755-02514b574387';
var STALE_DAYS = 7;
var FROZEN_STAGES = ['customer', 'closed_won', 'closed_lost'];

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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
        await sgMail.send({
          to: lead.email,
          from: { email: 'hello@engwx.com', name: 'EngageWorx' },
          replyTo: 'hello@engwx.com',
          subject: 'Checking in',
          text: decision.reply_draft,
          html: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.6;white-space:pre-wrap;">' + decision.reply_draft.replace(/</g, '&lt;') + '</div>',
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
  console.log('[Cron] Stale leads started. mode:', mode, 'cutoff:', cutoff);

  try {
    var leadsRes = await supabase.from('leads')
      .select('id, name, company, email, phone, stage, urgency, notes, tenant_id, last_activity_at, created_at')
      .eq('qualified', true)
      .eq('archived', false)
      .not('stage', 'in', '(' + FROZEN_STAGES.map(function(s) { return '"' + s + '"'; }).join(',') + ')')
      .lt('last_activity_at', cutoff)
      .limit(100);

    var leads = leadsRes.data || [];
    var analysed = 0, actioned = 0, pending = 0;

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
    }

    console.log('[Cron] Stale leads done.', 'candidates:', leads.length, 'analysed:', analysed, 'actioned:', actioned, 'pending:', pending);
    return res.status(200).json({ success: true, mode: mode, candidates: leads.length, analysed: analysed, actioned: actioned, pending: pending });
  } catch (err) {
    console.error('[Cron] Stale leads error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
