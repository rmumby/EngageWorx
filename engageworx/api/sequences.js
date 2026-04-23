// api/sequences.js — Sequence engine
// POST /api/sequences?action=enrol     → Enrol a lead in a sequence
// POST /api/sequences?action=process   → Process due steps (called by cron)
// POST /api/sequences?action=pause     → Pause a lead's sequence
// POST /api/sequences?action=cancel    → Cancel a lead's sequence
// GET  /api/sequences?action=list      → List sequences for a tenant
// GET  /api/sequences?action=status    → Get lead's sequence status
// GET  /api/sequences?action=roster    → Get all enrolments for a sequence
// POST /api/sequences?action=bulk-enrol → Enrol multiple leads at once

var { createClient } = require('@supabase/supabase-js');
var sgMail = require('@sendgrid/mail');
var { generateThreadId, makeReplyToAddress } = require('./_lib/reply-thread');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function personaliseMessage(template, lead, tenantName) {
  try {
    var AnthropicSdk = require('@anthropic-ai/sdk');
    var anthropic = new (AnthropicSdk.default || AnthropicSdk)({ apiKey: process.env.REACT_APP_ANTHROPIC_API_KEY });
    var res = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: 'You are personalising an outreach message. Replace [FirstName] with the lead first name, [Company] with their company, [Platform] with ' + (tenantName || 'EngageWorx') + '. Keep the message natural and genuine. Return only the personalised message text, no explanation.',
      messages: [{ role: 'user', content: 'Template: ' + template + '\n\nLead name: ' + (lead.name || '') + '\nLead company: ' + (lead.company || '') + '\nLead type: ' + (lead.type || '') }]
    });
    return res.content[0].text.trim();
  } catch (e) {
    return template
      .replace(/\[FirstName\]/g, (lead.name || '').split(' ')[0] || 'there')
      .replace(/\[Company\]/g, lead.company || 'your company')
      .replace(/\[Platform\]/g, tenantName || 'EngageWorx');
  }
}

async function sendStep(supabase, step, lead, tenant) {
  var body = step.ai_personalise
    ? await personaliseMessage(step.body_template, lead, tenant.name)
    : step.body_template;

  if (step.channel === 'email') {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    var emailConfig = { from: (process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com'), fromName: 'Rob at EngageWorx' };
    var aiOmniBcc = null;
    try {
      var ccRes = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', tenant.id).eq('channel', 'email').single();
      if (ccRes.data && ccRes.data.config_encrypted) {
        if (ccRes.data.config_encrypted.from_email) emailConfig.from = ccRes.data.config_encrypted.from_email;
        if (ccRes.data.config_encrypted.from_name) emailConfig.fromName = ccRes.data.config_encrypted.from_name;
        var bccVal = ccRes.data.config_encrypted.ai_omni_bcc;
        if (bccVal && bccVal.indexOf('@') > 0 && bccVal !== lead.email) aiOmniBcc = bccVal;
      }
    } catch(e) {}

    var _sig = require('./_email-signature');
    var isFirstStep = !step.step_number || step.step_number <= 1;
    var closingKind = isFirstStep ? 'first' : 'followup';
    var sigInfo = await _sig.getSignature(supabase, { tenantId: tenant.id, fromEmail: emailConfig.from, isFirstTouch: isFirstStep, closingKind: closingKind });

    var bodyHtml =
      '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 16px;">' +
      '<div style="font-size:15px;color:#1e293b;line-height:1.75;">' + body.replace(/\n\n/g, '</div><div style="font-size:15px;color:#1e293b;line-height:1.75;margin-top:14px;">').replace(/\n/g, '<br>') + '</div>';
    var bodyClose = '</div>';

    var seqThreadId = generateThreadId();
    var seqReplyTo = makeReplyToAddress(seqThreadId);
    var seqPayload = {
      to: lead.email,
      from: { email: emailConfig.from, name: sigInfo.fromName || emailConfig.fromName },
      replyTo: { email: seqReplyTo, name: sigInfo.fromName || emailConfig.fromName },
      subject: step.subject || 'Following up from EngageWorx',
      text: _sig.composeTextBody(body, sigInfo.closingLine, sigInfo.fromName),
      html: _sig.composeHtmlBody(bodyHtml + bodyClose, sigInfo.closingLine, sigInfo.signatureHtml),
    };
    if (aiOmniBcc) seqPayload.bcc = { email: aiOmniBcc };
    await sgMail.send(seqPayload);
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
      var smsErr = await smsResp.json();
      console.error('[Sequences] SMS failed:', smsErr.message);
      return false;
    }
  }

  return false;
}

async function processDueSteps(supabase) {
  var now = new Date().toISOString();
  var processed = 0;
  var errors = 0;

  var enrolmentsRes = await supabase
    .from('lead_sequences')
    .select('*, leads(*), sequences(*)')
    .eq('status', 'active')
    .lte('next_step_at', now);

  var enrolments = enrolmentsRes.data;

  if (!enrolments || enrolments.length === 0) {
    console.log('[Sequences] No due steps — running self-heal check only');
    // Fall through to the self-heal block at the bottom rather than early-returning
    enrolments = [];
  }

  console.log('[Sequences] Processing', enrolments.length, 'due enrolments');

  for (var enrolment of enrolments) {
    try {
      var lead = enrolment.leads;
      var sequence = enrolment.sequences;
      if (!lead || !sequence) continue;

      var nextStepNumber = enrolment.current_step + 1;
      var stepRes = await supabase
        .from('sequence_steps')
        .select('*')
        .eq('sequence_id', sequence.id)
        .eq('step_number', nextStepNumber)
        .single();
      var step = stepRes.data;

      if (!step) {
        await supabase.from('lead_sequences').update({ status: 'completed', completed_at: now }).eq('id', enrolment.id);
        console.log('[Sequences] Sequence completed for lead:', lead.id);
        continue;
      }

      // Weekend gate: skip if sequence.send_on_weekends is false and today is Sat or Sun.
      // Reschedule to Monday 8am in the sequence's tenant timezone (or America/New_York default).
      if (!sequence.send_on_weekends) {
        var nowDate = new Date();
        var dayOfWeek = nowDate.getUTCDay(); // 0=Sun, 6=Sat
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          var daysToMon = dayOfWeek === 0 ? 1 : 2;
          var monday = new Date(nowDate);
          monday.setUTCDate(monday.getUTCDate() + daysToMon);
          monday.setUTCHours(13, 0, 0, 0); // 8am ET = 13:00 UTC (approximate; exact depends on DST)
          await supabase.from('lead_sequences').update({ next_step_at: monday.toISOString() }).eq('id', enrolment.id);
          console.log('[Sequences] Weekend skip for lead:', lead.id, '→ rescheduled to', monday.toISOString());
          continue;
        }
      }

      var tenantRes = await supabase.from('tenants').select('id, name').eq('id', sequence.tenant_id).single();
      var tenant = tenantRes.data;

      var sent = await sendStep(supabase, step, lead, tenant || { id: sequence.tenant_id, name: 'EngageWorx' });

      if (sent) {
        var nextStepRes = await supabase
          .from('sequence_steps')
          .select('delay_days')
          .eq('sequence_id', sequence.id)
          .eq('step_number', nextStepNumber + 1)
          .single();
        var nextStep = nextStepRes.data;

        var nextStepAt = null;
        if (nextStep) {
          var d = new Date();
          d.setDate(d.getDate() + (nextStep.delay_days || 1));
          // If the computed next date falls on a weekend and send_on_weekends is false,
          // push forward to Monday 8am ET (13:00 UTC).
          if (!sequence.send_on_weekends) {
            var nDay = d.getUTCDay();
            if (nDay === 0) d.setUTCDate(d.getUTCDate() + 1); // Sun → Mon
            else if (nDay === 6) d.setUTCDate(d.getUTCDate() + 2); // Sat → Mon
            if (nDay === 0 || nDay === 6) d.setUTCHours(13, 0, 0, 0);
          }
          nextStepAt = d.toISOString();
        }

        await supabase.from('lead_sequences').update({
          current_step: nextStepNumber,
          next_step_at: nextStepAt,
          status: nextStepAt ? 'active' : 'completed',
          completed_at: nextStepAt ? null : now,
        }).eq('id', enrolment.id);

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

  // Self-healing: detect stuck leads that have been past-due for 4+ hours and
  // weren't processed in this run (e.g. they errored silently on a prior run and
  // never got their next_step_at bumped). Reset them to fire on the next cron tick.
  var stuckFixed = 0;
  try {
    var fourHoursAgo = new Date(Date.now() - 4 * 3600000).toISOString();
    var stuckRes = await supabase.from('lead_sequences')
      .select('id, lead_id, next_step_at')
      .eq('status', 'active')
      .lt('next_step_at', fourHoursAgo);
    var stuckRows = stuckRes.data || [];
    if (stuckRows.length > 0) {
      var resetTo = new Date().toISOString();
      for (var sr of stuckRows) {
        try {
          await supabase.from('lead_sequences').update({ next_step_at: resetTo }).eq('id', sr.id);
          stuckFixed++;
          console.warn('[Sequences] Self-heal: reset stuck lead_sequence', sr.id, 'lead:', sr.lead_id, 'was due:', sr.next_step_at, '→ now');
        } catch (e) { console.warn('[Sequences] Self-heal update failed:', sr.id, e.message); }
      }
      console.warn('[Sequences] Self-healed', stuckFixed, 'stuck lead(s) (due 4+ hours ago)');
    }
  } catch (e) { console.warn('[Sequences] Self-heal query error:', e.message); }

  return { processed: processed, errors: errors, stuck_leads_fixed: stuckFixed };
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
    var tenantId = req.query.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
    var listRes = await supabase
      .from('sequences')
      .select('*, sequence_steps(*)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    if (listRes.error) return res.status(500).json({ error: listRes.error.message });
    return res.status(200).json({ sequences: listRes.data || [] });
  }

  // ── STATUS — get lead's active sequences ────────────────────────────────────
  if (action === 'status' && req.method === 'GET') {
    var leadId = req.query.lead_id;
    if (!leadId) return res.status(400).json({ error: 'lead_id required' });
    var statusRes = await supabase
      .from('lead_sequences')
      .select('*, sequences(name, type)')
      .eq('lead_id', leadId)
      .order('enrolled_at', { ascending: false });
    if (statusRes.error) return res.status(500).json({ error: statusRes.error.message });
    return res.status(200).json({ enrolments: statusRes.data || [] });
  }

  // ── ROSTER — get all enrolments for a sequence ──────────────────────────────
  if (action === 'roster' && req.method === 'GET') {
    var seqId = req.query.sequence_id;
    if (!seqId) return res.status(400).json({ error: 'sequence_id required' });
    var rosterRes = await supabase
      .from('lead_sequences')
      .select('*, sequences(name, id)')
      .eq('sequence_id', seqId)
      .order('enrolled_at', { ascending: false });
    if (rosterRes.error) return res.status(500).json({ error: rosterRes.error.message });
    var rosterData = rosterRes.data || [];
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

  // ── ENROL lead in sequence ──────────────────────────────────────────────────
  if (action === 'enrol') {
    var enrolBody = body;
    var lead_id = enrolBody.lead_id;
    var sequence_id = enrolBody.sequence_id;
    var tenant_id = enrolBody.tenant_id;
    if (!lead_id || !sequence_id) return res.status(400).json({ error: 'lead_id and sequence_id required' });
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });

    var firstStepRes = await supabase
      .from('sequence_steps')
      .select('delay_days')
      .eq('sequence_id', sequence_id)
      .eq('step_number', 1)
      .single();
    var firstStep = firstStepRes.data;

    var startDate = new Date();
    if (firstStep && firstStep.delay_days > 0) {
      startDate.setDate(startDate.getDate() + firstStep.delay_days);
    }

    var enrolRes = await supabase.from('lead_sequences').upsert({
      tenant_id: tenant_id,
      lead_id: lead_id,
      sequence_id: sequence_id,
      current_step: 0,
      status: 'active',
      enrolled_at: new Date().toISOString(),
      next_step_at: startDate.toISOString(),
    }, { onConflict: 'lead_id,sequence_id' }).select().single();

    if (enrolRes.error) return res.status(500).json({ error: enrolRes.error.message });
    console.log('[Sequences] Lead enrolled:', lead_id, 'in sequence:', sequence_id);
    return res.status(200).json({ success: true, enrolment: enrolRes.data });
  }

  // ── BULK ENROL multiple leads ─────────────────────────────────────────────
  if (action === 'bulk-enrol') {
    var bulkBody = req.body;
    var bulkSeqId = bulkBody.sequence_id;
    var leadList = bulkBody.leads;
    var bulkTenantId = bulkBody.tenant_id;
    if (!bulkSeqId || !leadList || !leadList.length) return res.status(400).json({ error: 'Missing sequence_id or leads' });
    if (!bulkTenantId) return res.status(400).json({ error: 'tenant_id required' });
    var results = { enrolled: 0, skipped: 0, errors: [] };
    for (var bulkLead of leadList) {
      try {
        var bulkLeadId = bulkLead.id;
        if (!bulkLeadId) {
          var newLeadRes = await supabase.from('leads').insert({
            name: ((bulkLead.first_name || '') + ' ' + (bulkLead.last_name || '')).trim() || bulkLead.email || 'Unknown',
            company: bulkLead.company || '',
            email: bulkLead.email || null,
            phone: bulkLead.phone || null,
            type: 'Unknown',
            urgency: 'Warm',
            stage: 'inquiry',
            source: bulkLead.source || 'CSV Import',
            notes: bulkLead.notes || '',
            last_action_at: new Date().toISOString().split('T')[0],
            last_activity_at: new Date().toISOString(),
          }).select('id').single();
          if (newLeadRes.error) { results.errors.push(bulkLead.email + ': ' + newLeadRes.error.message); continue; }
          bulkLeadId = newLeadRes.data.id;
        }
        var bulkFirstStepRes = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', bulkSeqId).eq('step_number', 1).single();
        var bulkFirstStep = bulkFirstStepRes.data;
        var bulkStartDate = new Date();
        if (bulkFirstStep && bulkFirstStep.delay_days > 0) bulkStartDate.setDate(bulkStartDate.getDate() + bulkFirstStep.delay_days);
        var bulkEnrolRes = await supabase.from('lead_sequences').upsert({
          tenant_id: bulkTenantId,
          lead_id: bulkLeadId,
          sequence_id: bulkSeqId,
          current_step: 0,
          status: 'active',
          enrolled_at: new Date().toISOString(),
          next_step_at: bulkStartDate.toISOString(),
        }, { onConflict: 'lead_id,sequence_id' });
        if (bulkEnrolRes.error) { results.errors.push(bulkLeadId + ': ' + bulkEnrolRes.error.message); continue; }
        results.enrolled++;
      } catch(e) { results.errors.push((bulkLead.email || 'unknown') + ': ' + e.message); }
    }
    return res.status(200).json({ success: true, enrolled: results.enrolled, skipped: results.skipped, errors: results.errors });
  }

  // ── PAUSE sequence ──────────────────────────────────────────────────────────
  if (action === 'pause') {
    var pauseEnrolmentId = body.enrolment_id;
    if (!pauseEnrolmentId) return res.status(400).json({ error: 'enrolment_id required' });
    var pauseRes = await supabase.from('lead_sequences').update({ status: 'paused' }).eq('id', pauseEnrolmentId);
    if (pauseRes.error) return res.status(500).json({ error: pauseRes.error.message });
    return res.status(200).json({ success: true });
  }

  // ── CANCEL sequence ─────────────────────────────────────────────────────────
  if (action === 'cancel') {
    var cancelEnrolmentId = body.enrolment_id;
    if (!cancelEnrolmentId) return res.status(400).json({ error: 'enrolment_id required' });
    var cancelRes = await supabase.from('lead_sequences').update({ status: 'cancelled' }).eq('id', cancelEnrolmentId);
    if (cancelRes.error) return res.status(500).json({ error: cancelRes.error.message });
    return res.status(200).json({ success: true });
  }

  // ── PROCESS due steps (called by cron) ─────────────────────────────────────
  if (action === 'process') {
    var result = await processDueSteps(supabase);
    return res.status(200).json({ success: true, processed: result.processed, errors: result.errors, stuck_leads_fixed: result.stuck_leads_fixed || 0 });
  }

  // ── CREATE sequence with steps ──────────────────────────────────────────────
  if (action === 'create') {
    var createName = body.name;
    var createType = body.type;
    var createLeadType = body.lead_type;
    var createSteps = body.steps;
    var createTenantId = body.tenant_id;
    if (!createName || !createSteps || !createSteps.length) return res.status(400).json({ error: 'name and steps required' });
    if (!createTenantId) return res.status(400).json({ error: 'tenant_id required' });

    var seqRes = await supabase.from('sequences').insert({
      tenant_id: createTenantId,
      name: createName,
      type: createType || 'outreach',
      lead_type: createLeadType || 'all',
      status: 'active',
    }).select().single();

    if (seqRes.error) return res.status(500).json({ error: seqRes.error.message });

    var stepInserts = createSteps.map(function(s, i) {
      return {
        sequence_id: seqRes.data.id,
        step_number: i + 1,
        delay_days: s.delay_days || 0,
        channel: s.channel || 'email',
        subject: s.subject || null,
        body_template: s.body_template,
        ai_personalise: s.ai_personalise !== false,
      };
    });

    var stepsRes = await supabase.from('sequence_steps').insert(stepInserts);
    if (stepsRes.error) return res.status(500).json({ error: stepsRes.error.message });

    return res.status(200).json({ success: true, sequence: seqRes.data });
  }

  return res.status(400).json({ error: 'Invalid action' });
};
