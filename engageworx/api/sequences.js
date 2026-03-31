// api/sequences.js — Sequence engine
// POST /api/sequences?action=enrol     → Enrol a lead in a sequence
// POST /api/sequences?action=process   → Process due steps (called by cron)
// POST /api/sequences?action=pause     → Pause a lead's sequence
// POST /api/sequences?action=cancel    → Cancel a lead's sequence
// GET  /api/sequences?action=list      → List sequences for a tenant
// GET  /api/sequences?action=status    → Get lead's sequence status
// POST /api/sequences?action=bulk-enrol → Enrol multiple leads at once

var { createClient } = require('@supabase/supabase-js');
var sgMail = require('@sendgrid/mail');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

var EW_SP_TENANT_ID = 'c1bc59a8-5235-4921-9755-02514b574387';
// POST /api/sequences?action=bulk-enrol → Enrol multiple leads at once

// ── AI-personalise a message template ────────────────────────────────────────
async function personaliseMessage(template, lead, tenantName) {
  try {
    var AnthropicSdk = require('@anthropic-ai/sdk');
    var anthropic = new (AnthropicSdk.default || AnthropicSdk)({ apiKey: process.env.REACT_APP_ANTHROPIC_API_KEY });
    var res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: 'You are personalising an outreach message. Replace [FirstName] with the lead first name, [Company] with their company, [Platform] with ' + (tenantName || 'EngageWorx') + '. Keep the message natural and genuine. Return only the personalised message text, no explanation.',
      messages: [{ role: 'user', content: 'Template: ' + template + '\n\nLead name: ' + (lead.name || '') + '\nLead company: ' + (lead.company || '') + '\nLead type: ' + (lead.type || '') }]
    });
    return res.content[0].text.trim();
  } catch (e) {
    // Fallback — simple string replace
    return template
      .replace(/\[FirstName\]/g, (lead.name || '').split(' ')[0] || 'there')
      .replace(/\[Company\]/g, lead.company || 'your company')
      .replace(/\[Platform\]/g, tenantName || 'EngageWorx');
  }
}

// ── Send a sequence step ──────────────────────────────────────────────────────
async function sendStep(supabase, step, lead, tenant) {
  var body = step.ai_personalise
    ? await personaliseMessage(step.body_template, lead, tenant.name)
    : step.body_template;

  if (step.channel === 'email') {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    var emailConfig = { from: 'hello@engwx.com', fromName: 'Rob at EngageWorx' };
    try {
      var ccRes = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', tenant.id).eq('channel', 'email').single();
      if (ccRes.data && ccRes.data.config_encrypted) {
        if (ccRes.data.config_encrypted.from_email) emailConfig.from = ccRes.data.config_encrypted.from_email;
        if (ccRes.data.config_encrypted.from_name) emailConfig.fromName = ccRes.data.config_encrypted.from_name;
      }
    } catch(e) {}

    var html =
      '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 16px;">' +
      '<div style="font-size:15px;color:#1e293b;line-height:1.75;">' + body.replace(/\n\n/g, '</div><div style="font-size:15px;color:#1e293b;line-height:1.75;margin-top:14px;">').replace(/\n/g, '<br>') + '</div>' +
      '<div style="margin-top:28px;padding-top:20px;border-top:1px solid #e2e8f0;text-align:center;">' +
      '<div style="display:inline-block;background:linear-gradient(135deg,#00C9FF,#E040FB);color:#000;font-weight:900;font-size:14px;padding:6px 12px;border-radius:6px;margin-bottom:8px;">EW</div><br>' +
      '<div style="font-weight:700;color:#1e293b;font-size:13px;">Rob Mumby</div>' +
      '<div style="color:#64748b;font-size:12px;">Founder & CEO, EngageWorx</div>' +
      '<div style="margin-top:6px;font-size:12px;"><a href="tel:+17869827800" style="color:#00C9FF;text-decoration:none;">+1 (786) 982-7800</a> | <a href="https://engwx.com" style="color:#00C9FF;text-decoration:none;">engwx.com</a></div>' +
      '<div style="margin-top:12px;font-size:11px;color:#94a3b8;">Reply STOP to unsubscribe from these emails.</div>' +
      '</div></div>';

    await sgMail.send({
      to: lead.email,
      from: { email: emailConfig.from, name: emailConfig.fromName },
      subject: step.subject || 'Following up from EngageWorx',
      text: body + '\n\nRob Mumby\nFounder & CEO, EngageWorx\n+1 (786) 982-7800\nengwx.com',
      html: html,
    });
    console.log('[Sequences] Email sent to:', lead.email, 'step:', step.step_number);
    return true;
  }

  if (step.channel === 'sms') {
    var smsConfig = { from: process.env.TWILIO_PHONE_NUMBER };
    try {
      var smsRes = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', tenant.id).eq('channel', 'sms').single();
      if (smsRes.data && smsRes.data.config_encrypted && smsRes.data.config_encrypted.phone_number) {
        smsConfig.from = smsRes.data.config_encrypted.phone_number;
      }
    } catch(e) {}

    if (!lead.phone && !lead.mobile) {
      console.log('[Sequences] No phone for lead:', lead.id, '— skipping SMS step');
      return false;
    }

    var accountSid = process.env.TWILIO_ACCOUNT_SID;
    var authToken = process.env.TWILIO_AUTH_TOKEN;
    var auth = Buffer.from(accountSid + ':' + authToken).toString('base64');
    var params = new URLSearchParams();
    params.append('To', lead.phone || lead.mobile);
    params.append('From', smsConfig.from);
    params.append('Body', body);

    var smsResp = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json', {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (smsResp.ok) {
      console.log('[Sequences] SMS sent to:', lead.phone || lead.mobile, 'step:', step.step_number);
      return true;
    } else {
      var err = await smsResp.json();
      console.error('[Sequences] SMS failed:', err.message);
      return false;
    }
  }

  return false;
}

// ── Process all due sequence steps ───────────────────────────────────────────
async function processDueSteps(supabase) {
  var now = new Date().toISOString();
  var processed = 0;
  var errors = 0;

  // Get all active enrolments where next_step_at <= now
  var { data: enrolments } = await supabase
    .from('lead_sequences')
    .select('*, leads(*), sequences(*)')
    .eq('status', 'active')
    .lte('next_step_at', now);

  if (!enrolments || enrolments.length === 0) {
    console.log('[Sequences] No due steps');
    return { processed: 0, errors: 0 };
  }

  console.log('[Sequences] Processing', enrolments.length, 'due enrolments');

  for (var enrolment of enrolments) {
    try {
      var lead = enrolment.leads;
      var sequence = enrolment.sequences;

      if (!lead || !sequence) continue;

      // Get next step
      var nextStepNumber = enrolment.current_step + 1;
      var { data: step } = await supabase
        .from('sequence_steps')
        .select('*')
        .eq('sequence_id', sequence.id)
        .eq('step_number', nextStepNumber)
        .single();

      if (!step) {
        // No more steps — mark completed
        await supabase.from('lead_sequences').update({
          status: 'completed',
          completed_at: now,
        }).eq('id', enrolment.id);
        console.log('[Sequences] Sequence completed for lead:', lead.id);
        continue;
      }

      // Get tenant
      var { data: tenant } = await supabase.from('tenants').select('id, name').eq('id', sequence.tenant_id).single();

      // Send the step
      var sent = await sendStep(supabase, step, lead, tenant || { id: sequence.tenant_id, name: 'EngageWorx' });

      if (sent) {
        // Get the step after this one to calculate next_step_at
        var { data: nextStep } = await supabase
          .from('sequence_steps')
          .select('delay_days')
          .eq('sequence_id', sequence.id)
          .eq('step_number', nextStepNumber + 1)
          .single();

        var nextStepAt = null;
        if (nextStep) {
          var d = new Date();
          d.setDate(d.getDate() + (nextStep.delay_days || 1));
          nextStepAt = d.toISOString();
        }

        await supabase.from('lead_sequences').update({
          current_step: nextStepNumber,
          next_step_at: nextStepAt,
          status: nextStepAt ? 'active' : 'completed',
          completed_at: nextStepAt ? null : now,
        }).eq('id', enrolment.id);

        // Log to lead activity
        await supabase.from('leads').update({
          last_activity_at: now,
          last_action_at: new Date().toISOString().split('T')[0],
        }).eq('id', lead.id);

        processed++;
      }
    } catch (e) {
      console.error('[Sequences] Error processing enrolment:', enrolment.id, e.message);
      errors++;
    }
  }

  return { processed, errors };
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var action = req.query.action || 'list';
  var supabase = getSupabase();

  // ── LIST sequences ──────────────────────────────────────────────────────────
  if (action === 'list' && req.method === 'GET') {
    var tenantId = req.query.tenant_id || EW_SP_TENANT_ID;
    var { data, error } = await supabase
      .from('sequences')
      .select('*, sequence_steps(*)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ sequences: data || [] });
  }

  // ── STATUS — get lead's active sequences ────────────────────────────────────
  if (action === 'status' && req.method === 'GET') {
    var leadId = req.query.lead_id;
    if (!leadId) return res.status(400).json({ error: 'lead_id required' });
    var { data, error } = await supabase
      .from('lead_sequences')
      .select('*, sequences(name, type)')
      .eq('lead_id', leadId)
      .order('enrolled_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ enrolments: data || [] });
  }

  // ── ROSTER — get all enrolments for a sequence
  if (action === 'roster' && req.method === 'GET') {
    var seqId = req.query.sequence_id;
    if (!seqId) return res.status(400).json({ error: 'sequence_id required' });
    var rosterResult = await supabase
      .from('lead_sequences')
      .select('*, sequences(name, id)')
      .eq('sequence_id', seqId)
      .order('enrolled_at', { ascending: false });
    if (rosterResult.error) return res.status(500).json({ error: rosterResult.error.message });
    var rosterData = rosterResult.data || [];
    var leadIds = rosterData.map(function(e) { return e.lead_id; }).filter(Boolean);
    var leadsMap = {};
    if (leadIds.length > 0) {
      var leadsRes = await supabase.from('leads').select('id, name, company, email, phone').in('id', leadIds);
      if (leadsRes.data) {
        leadsRes.data.forEach(function(l) { leadsMap[l.id] = l; });
      }
    }
    var enriched = rosterData.map(function(e) {
      return Object.assign({}, e, { leads: leadsMap[e.lead_id] || e.lead_data || {} });
    });
    return res.status(200).json({ enrolments: enriched });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var body = req.body || {};
    var seqId = req.query.sequence_id;
    if (!seqId) return res.status(400).json({ error: 'sequence_id required' });
    var { data, error } = await supabase
      .from('lead_sequences')
      .select('*, sequences(name, id)')
      .eq('sequence_id', seqId)
      .order('enrolled_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    var leadIds = (data || []).map(function(e) { return e.lead_id; }).filter(Boolean);
    var leadsMap = {};
    if (leadIds.length > 0) {
      var leadsRes = await supabase.from('leads').select('id, name, company, email, phone').in('id', leadIds);
      if (leadsRes.data) {
        leadsRes.data.forEach(function(l) { leadsMap[l.id] = l; });
      }
    }
    var enriched = (data || []).map(function(e) {
      return Object.assign({}, e, { leads: leadsMap[e.lead_id] || e.lead_data || {} });
    });
    return res.status(200).json({ enrolments: enriched });
  }

  var body = req.body || {};

  // ── ENROL lead in sequence ──────────────────────────────────────────────────
  if (action === 'enrol') {
    var { lead_id, sequence_id, tenant_id } = body;
    if (!lead_id || !sequence_id) return res.status(400).json({ error: 'lead_id and sequence_id required' });

    // Get first step delay
    var { data: firstStep } = await supabase
      .from('sequence_steps')
      .select('delay_days')
      .eq('sequence_id', sequence_id)
      .eq('step_number', 1)
      .single();

    var startDate = new Date();
    if (firstStep && firstStep.delay_days > 0) {
      startDate.setDate(startDate.getDate() + firstStep.delay_days);
    }

    var { data, error } = await supabase.from('lead_sequences').upsert({
      tenant_id: tenant_id || EW_SP_TENANT_ID,
      lead_id: lead_id,
      sequence_id: sequence_id,
      current_step: 0,
      status: 'active',
      enrolled_at: new Date().toISOString(),
      next_step_at: startDate.toISOString(),
    }, { onConflict: 'lead_id,sequence_id' }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    console.log('[Sequences] Lead enrolled:', lead_id, 'in sequence:', sequence_id);
    return res.status(200).json({ success: true, enrolment: data });
    }

  // ── BULK ENROL multiple leads ─────────────────────────────────────────────
  if (action === 'bulk-enrol') {
    var { sequence_id, leads: leadList, tenant_id } = req.body;
    if (!sequence_id || !leadList || !leadList.length) return res.status(400).json({ error: 'Missing sequence_id or leads' });
    var results = { enrolled: 0, skipped: 0, errors: [] };
    for (var lead of leadList) {
      try {
        // Create lead if no id (new contact from CSV)
        var leadId = lead.id;
        if (!leadId) {
          var { data: newLead, error: leadErr } = await supabase.from('leads').insert({
            name: ((lead.first_name || '') + ' ' + (lead.last_name || '')).trim() || lead.email || 'Unknown',
            company: lead.company || '',
            email: lead.email || null,
            phone: lead.phone || null,
            type: 'Unknown',
            urgency: 'Warm',
            stage: 'inquiry',
            source: lead.source || 'CSV Import',
            notes: lead.notes || '',
            last_action_at: new Date().toISOString().split('T')[0],
            last_activity_at: new Date().toISOString(),
          }).select('id').single();
          if (leadErr) { results.errors.push(lead.email + ': ' + leadErr.message); continue; }
          leadId = newLead.id;
        }
        // Get first step delay
        var { data: firstStep } = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', sequence_id).eq('step_number', 1).single();
        var startDate = new Date();
        if (firstStep && firstStep.delay_days > 0) startDate.setDate(startDate.getDate() + firstStep.delay_days);
        var { error: enrolErr } = await supabase.from('lead_sequences').upsert({
          tenant_id: tenant_id || EW_SP_TENANT_ID,
          lead_id: leadId,
          sequence_id: sequence_id,
          current_step: 0,
          status: 'active',
          enrolled_at: new Date().toISOString(),
          next_step_at: startDate.toISOString(),
        }, { onConflict: 'lead_id,sequence_id' });
        if (enrolErr) { results.errors.push(leadId + ': ' + enrolErr.message); continue; }
        results.enrolled++;
      } catch(e) { results.errors.push((lead.email || 'unknown') + ': ' + e.message); }
    }
    return res.status(200).json({ success: true, ...results });
  }

  // ── PAUSE sequence ──────────────────────────────────────────────────────────
  if (action === 'pause') {
    var { enrolment_id } = body;
    if (!enrolment_id) return res.status(400).json({ error: 'enrolment_id required' });
    var { error } = await supabase.from('lead_sequences').update({ status: 'paused' }).eq('id', enrolment_id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  // ── CANCEL sequence ─────────────────────────────────────────────────────────
  if (action === 'cancel') {
    var { enrolment_id } = body;
    if (!enrolment_id) return res.status(400).json({ error: 'enrolment_id required' });
    var { error } = await supabase.from('lead_sequences').update({ status: 'cancelled' }).eq('id', enrolment_id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  // ── PROCESS due steps (called by cron) ─────────────────────────────────────
  if (action === 'process') {
    var result = await processDueSteps(supabase);
    return res.status(200).json({ success: true, ...result });
  }

  // ── CREATE sequence with steps ──────────────────────────────────────────────
  if (action === 'create') {
    var { name, type, lead_type, steps, tenant_id } = body;
    if (!name || !steps || !steps.length) return res.status(400).json({ error: 'name and steps required' });

    var { data: seq, error: seqErr } = await supabase.from('sequences').insert({
      tenant_id: tenant_id || EW_SP_TENANT_ID,
      name: name,
      type: type || 'outreach',
      lead_type: lead_type || 'all',
      status: 'active',
    }).select().single();

    if (seqErr) return res.status(500).json({ error: seqErr.message });

    var stepInserts = steps.map(function(s, i) {
      return {
        sequence_id: seq.id,
        step_number: i + 1,
        delay_days: s.delay_days || 0,
        channel: s.channel || 'email',
        subject: s.subject || null,
        body_template: s.body_template,
        ai_personalise: s.ai_personalise !== false,
      };
    });

    var { error: stepsErr } = await supabase.from('sequence_steps').insert(stepInserts);
    if (stepsErr) return res.status(500).json({ error: stepsErr.message });

    return res.status(200).json({ success: true, sequence: seq });
  }

  return res.status(400).json({ error: 'Invalid action' });
};
