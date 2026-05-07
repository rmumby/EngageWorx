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
var { generateThreadId, makeReplyToAddress } = require('./_lib/reply-thread');
var { sendTenantEmail } = require('./_lib/send-tenant-email');

// Blocked patterns — AI meta-language, scratchpad reasoning, or unfilled tokens
// that must NEVER reach a recipient. Case-insensitive match against rendered body.
var BLOCKED_BODY_PATTERNS = [
  "i don't have", "i do not have", "could you please provide",
  "could you provide", "the data provided", "to personalize this message",
  "information is missing", "information needed", "the lead's first name",
  "the lead's company", "once you provide", "once i have these details",
  "the email shows", "the email suggests", "i'd need", "i would need",
  "{first_name}", "{company_name}", "[firstname]", "[company]",
  "[calendly_link]", "[your name]",
];

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Clean an email local-part into a usable first name: strip digits/punctuation, title-case
var GENERIC_LOCAL_PARTS = ['info','sales','team','support','admin','hello','contact','noreply','hi','mail','billing','accounts','office','enquiries','help','service'];

function cleanEmailToName(email) {
  if (!email) return 'there';
  var local = email.split('@')[0] || '';
  // Replace dots, underscores, hyphens, digits with spaces
  var cleaned = local.replace(/[._\-0-9]+/g, ' ').trim();
  if (!cleaned) return 'there';
  var firstWord = cleaned.split(' ')[0].toLowerCase();
  // Block generic prefixes and short/numeric local-parts
  if (GENERIC_LOCAL_PARTS.indexOf(firstWord) !== -1) return 'there';
  if (firstWord.replace(/[^a-z]/gi, '').length < 2) return 'there';
  // Title-case first word
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
}

function looksLikeEmail(str) {
  return str && str.indexOf('@') !== -1 && str.indexOf('.') !== -1;
}

function resolveContactFields(lead) {
  var name = (lead.name || '').trim();
  var email = (lead.email || '').trim();

  // Treat email-as-name as no name at all
  if (looksLikeEmail(name) || (name && email && name.toLowerCase() === email.toLowerCase())) {
    name = '';
  }

  var firstName = name ? name.split(' ')[0] : '';
  var lastName = name ? name.split(' ').slice(1).join(' ') : '';

  // Fallback chain for firstName: name → first_name field → email-derived → 'there'
  if (!firstName && lead.first_name) {
    var fn = lead.first_name.trim();
    firstName = looksLikeEmail(fn) ? '' : fn;
  }
  if (!firstName) firstName = cleanEmailToName(email);

  // Fallback for lastName
  if (!lastName && lead.last_name) lastName = (lead.last_name || '').trim();

  var fullName = (firstName + ' ' + lastName).trim() || firstName;

  // Company: treat email-like values as missing
  var company = lead.company || lead.company_name || '';
  if (looksLikeEmail(company)) company = '';

  return {
    firstName: firstName || 'there',
    lastName: lastName || '',
    fullName: fullName || 'there',
    company: company || 'your team',
    email: email,
  };
}

function mergePlaceholders(text, lead, tenantName) {
  if (!text) return text;
  var f = resolveContactFields(lead);
  var platform = tenantName || 'EngageWorx';

  var map = {
    'firstname': f.firstName, 'first_name': f.firstName, 'first name': f.firstName,
    'lastname': f.lastName, 'last_name': f.lastName, 'last name': f.lastName,
    'fullname': f.fullName, 'full_name': f.fullName, 'full name': f.fullName, 'name': f.fullName,
    'company': f.company, 'company_name': f.company,
    'email': f.email,
    'platform': platform,
  };

  var result = text;
  // Replace {placeholder}, [Placeholder], and {{placeholder}} patterns
  result = result.replace(/\{([^{}]+)\}|{{([^}]+)}}|\[([^\]]+)\]/gi, function(match, single, double, bracket) {
    var key = (single || double || bracket || '').trim().toLowerCase();
    if (map[key] !== undefined) return map[key];
    return match; // leave unrecognized for validation to catch
  });

  return result;
}

function validateNoPlaceholders(text) {
  var remaining = [];
  // Match {single}, {{double}}, and [bracket] tokens
  var re = /\{([A-Za-z_\s]+)\}|{{([A-Za-z_\s]+)}}|\[([A-Za-z_\s]+)\]/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    remaining.push(m[0]);
  }
  return remaining;
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
    return mergePlaceholders(template, lead, tenantName);
  }
}

async function sendStep(supabase, step, lead, tenant) {
  // Guard: refuse to send email to a lead with no email address
  if (step.channel === 'email' && (!lead.email || !lead.email.trim())) {
    console.error('[Sequences] Send skipped — lead has no email:', { lead_id: lead.id, tenant_id: tenant.id, sequence_id: step.sequence_id, step: step.step_number });
    return { refused: true, missing: ['no_email_address'] };
  }

  // Layer 1: only use AI personalisation if lead has real name/company data
  var leadName = (lead.name || '').trim();
  var leadCompany = (lead.company || lead.company_name || '').trim();
  var nameIsEmail = leadName && (leadName.indexOf('@') !== -1 && leadName.indexOf('.') !== -1);
  var nameMatchesEmail = leadName && lead.email && leadName.toLowerCase() === lead.email.toLowerCase();
  var hasRealName = leadName && !nameIsEmail && !nameMatchesEmail;
  var hasRealCompany = leadCompany && leadCompany.indexOf('@') === -1;
  var hasPersonalisableData = hasRealName || hasRealCompany;
  var body = (step.ai_personalise && hasPersonalisableData)
    ? await personaliseMessage(step.body_template, lead, tenant.name)
    : mergePlaceholders(step.body_template, lead, tenant.name);

  var subject = mergePlaceholders(step.subject || 'Following up from ' + (tenant.name || 'EngageWorx'), lead, tenant.name);

  // Track merge info
  var fallbacksUsed = [];
  if (body.indexOf((lead.email || '').split('@')[0]) !== -1 && !(lead.name || '').trim()) fallbacksUsed.push('FirstName→email_prefix');
  if (body.indexOf('your team') !== -1 && !(lead.company || lead.company_name)) fallbacksUsed.push('Company→your_team');

  // Safety: run mergePlaceholders on AI-personalised output too (AI may leave tokens)
  if (step.ai_personalise) {
    body = mergePlaceholders(body, lead, tenant.name);
  }

  // Validate — refuse to send if unmerged placeholders remain
  var bodyRemaining = validateNoPlaceholders(body);
  var subjRemaining = validateNoPlaceholders(subject);
  var allRemaining = bodyRemaining.concat(subjRemaining);
  if (allRemaining.length > 0) {
    console.error('[Sequences] Send refused — unfilled placeholder:', { tenant_id: tenant.id, sequence_id: step.sequence_id, step_number: step.step_number, lead_id: lead.id, lead_email: lead.email, missing: allRemaining, body_preview: body.substring(0, 100) });
    return { refused: true, missing: allRemaining };
  }

  // Layer 2: block AI meta-language, scratchpad reasoning, or unfilled tokens
  var bodyLower = (body + ' ' + subject).toLowerCase();
  for (var pi = 0; pi < BLOCKED_BODY_PATTERNS.length; pi++) {
    if (bodyLower.indexOf(BLOCKED_BODY_PATTERNS[pi].toLowerCase()) !== -1) {
      console.error('[Sequences] BLOCKED — AI meta-language detected:', { tenant_id: tenant.id, sequence_id: step.sequence_id, step_number: step.step_number, lead_id: lead.id, matched_pattern: BLOCKED_BODY_PATTERNS[pi], body_preview: body.substring(0, 120) });
      return { refused: true, missing: ['ai_meta_language_blocked: ' + BLOCKED_BODY_PATTERNS[pi]] };
    }
  }

  console.log('📧 Sequence render:', { lead_id: lead.id, step: step.step_number, fallbacks_used: fallbacksUsed });

  if (step.channel === 'email') {
    var emailConfig = { from: null, fromName: null };
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
    var seqReplyTo = makeReplyToAddress(seqThreadId, tenant.email_tracking_domain);

    await sendTenantEmail(supabase, {
      tenant_id: tenant.id,
      to: lead.email,
      from: emailConfig.from || undefined,
      from_name: sigInfo.fromName || emailConfig.fromName || undefined,
      subject: subject,
      text: _sig.composeTextBody(body, sigInfo.closingLine, sigInfo.fromName),
      html: _sig.composeHtmlBody(bodyHtml + bodyClose, sigInfo.closingLine, sigInfo.signatureHtml),
      reply_to: seqReplyTo,
      bcc: aiOmniBcc || undefined,
    });

    // Store outbound message for reply threading
    try {
      var seqConvId = null;
      var convLookup = await supabase.from('conversations').select('id')
        .eq('contact_id', lead.contact_id || lead.id).eq('tenant_id', tenant.id).eq('channel', 'email')
        .in('status', ['active', 'waiting', 'snoozed'])
        .order('last_message_at', { ascending: false }).limit(1).maybeSingle();
      if (convLookup.data) seqConvId = convLookup.data.id;
      if (seqConvId) {
        await supabase.from('messages').insert({
          tenant_id: tenant.id,
          conversation_id: seqConvId,
          contact_id: lead.contact_id || null,
          channel: 'email',
          direction: 'outbound',
          sender_type: 'bot',
          body: body,
          status: 'sent',
          metadata: { reply_thread_id: seqThreadId, reply_to_address: seqReplyTo, source: 'sequence', sequence_id: step.sequence_id, step_number: step.step_number },
        });
      }
    } catch (msgErr) {
      console.warn('[Sequences] Message row insert error:', msgErr.message);
    }

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

  var fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
  var enrolmentsRes = await supabase
    .from('lead_sequences')
    .select('*, leads(*), sequences(*)')
    .eq('status', 'active')
    .lte('next_step_at', now)
    .or('processing_started_at.is.null,processing_started_at.lt.' + fiveMinAgo);

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
      // Skip paused or deleted sequences
      if (sequence.paused_at || sequence.deleted_at) {
        console.log('[Sequences] Skipping', sequence.name, '— paused_at:', sequence.paused_at, 'deleted_at:', sequence.deleted_at);
        continue;
      }

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

      var tenantRes = await supabase.from('tenants').select('id, name, email_tracking_domain').eq('id', sequence.tenant_id).single();
      var tenant = tenantRes.data;

      // Backfill lead name if missing — derive from email
      if (!(lead.name || '').trim() && lead.email) {
        var derived = cleanEmailToName(lead.email);
        if (derived && derived !== 'there') {
          lead.name = derived;
          try {
            await supabase.from('leads').update({ name: derived }).eq('id', lead.id).eq('tenant_id', sequence.tenant_id);
            console.log('[Sequences] Backfilled lead name:', lead.id, '→', derived);
          } catch (e) {}
        }
      }

      // GUARD 1: Max touches in time window (2 emails per 7 days)
      var MAX_EMAILS_PER_WINDOW = 2;
      var WINDOW_DAYS = 7;
      if (step.channel === 'email' && lead.email) {
        try {
          var windowStart = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
          var recentSends = await supabase.from('sent_emails').select('id', { count: 'exact', head: true }).eq('to_email', lead.email.toLowerCase()).gte('sent_at', windowStart);
          var recentCount = recentSends.count || 0;
          if (recentCount >= MAX_EMAILS_PER_WINDOW) {
            console.log('[Sequences] ⏸ Max touches exceeded for', lead.email, '(' + recentCount + '/' + MAX_EMAILS_PER_WINDOW + ' in ' + WINDOW_DAYS + 'd) — pausing enrollment');
            await supabase.from('lead_sequences').update({ status: 'paused' }).eq('id', enrolment.id);
            try {
              await supabase.from('lead_sequence_events').insert({ tenant_id: sequence.tenant_id, lead_id: lead.id, sequence_id: sequence.id, event_type: 'paused', reason: 'Max ' + MAX_EMAILS_PER_WINDOW + ' emails per ' + WINDOW_DAYS + ' days exceeded (' + recentCount + ' recent sends)' });
            } catch (logErr) {}
            // TODO: migrate to send-notification.js when internal email path is rebuilt
            console.warn('[Sequences] ADMIN NOTIFY (not sent): Rate limit paused:', lead.email, '— sequence:', sequence.name, 'step:', nextStepNumber);
            continue;
          }
        } catch (guardErr) { console.warn('[Sequences] Guard check error:', guardErr.message); }
      }

      // Acquire in-flight lock — prevents re-processing if Vercel kills the function mid-send
      await supabase.from('lead_sequences').update({ processing_started_at: new Date().toISOString() }).eq('id', enrolment.id);

      var sent = await sendStep(supabase, step, lead, tenant || { id: sequence.tenant_id, name: 'EngageWorx' });

      if (sent && sent.refused) {
        var refusedReason = sent.missing.join(', ');
        await supabase.from('lead_sequences').update({ status: 'error', error_message: refusedReason, last_error: refusedReason, last_error_at: new Date().toISOString(), processing_started_at: null }).eq('id', enrolment.id);
        errors++;
        continue;
      }

      if (sent) {
        // Track send in sent_emails
        try {
          await supabase.from('sent_emails').insert({ tenant_id: sequence.tenant_id, lead_id: lead.id, to_email: (lead.email || '').toLowerCase(), subject: step.subject || '', source: 'sequence', sequence_id: sequence.id });
        } catch (trackErr) { console.warn('[Sequences] sent_emails track error:', trackErr.message); }
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
          processing_started_at: null,
        }).eq('id', enrolment.id);

        await supabase.from('leads').update({
          last_activity_at: now,
          last_action_at: new Date().toISOString().split('T')[0],
        }).eq('id', lead.id);

        processed++;
      }
    } catch (sendError) {
      console.error('[Sequences] Step send failed for enrolment ' + enrolment.id + ':', sendError.message);

      await supabase.from('lead_sequences').update({
        status: 'error',
        last_error: (sendError.message || 'Unknown error').substring(0, 500),
        last_error_at: new Date().toISOString(),
        send_attempts: (enrolment.send_attempts || 0) + 1,
        processing_started_at: null,
      }).eq('id', enrolment.id);

      // TODO: migrate to proper admin notification helper when send-notification.js is built
      console.error('[Sequences] ADMIN ALERT: enrolment', enrolment.id, 'lead', enrolment.lead_id, 'errored:', sendError.message);

      errors++;
      continue;
    }
  }

  return { processed: processed, errors: errors };
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
      .is('deleted_at', null)
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

    // Block enrolment of leads with no email (email sequences can't send)
    var leadCheck = await supabase.from('leads').select('email').eq('id', lead_id).maybeSingle();
    if (!leadCheck.data || !leadCheck.data.email || !leadCheck.data.email.trim()) {
      console.warn('[Sequences] Enrol blocked — lead has no email:', lead_id);
      return res.status(400).json({ error: 'Lead has no email address — cannot enrol in sequence' });
    }

    // Block enrolment into paused or deleted sequences
    var seqCheck = await supabase.from('sequences').select('paused_at, deleted_at').eq('id', sequence_id).maybeSingle();
    if (seqCheck.data && seqCheck.data.deleted_at) return res.status(400).json({ error: 'Sequence has been deleted' });
    if (seqCheck.data && seqCheck.data.paused_at) return res.status(400).json({ error: 'Sequence is paused — resume before enrolling' });

    // Block if lead already has an active sequence enrollment
    var activeCheck = await supabase.from('lead_sequences').select('id, sequences(name)').eq('lead_id', lead_id).eq('status', 'active').maybeSingle();
    if (activeCheck.data) {
      var activeName = (activeCheck.data.sequences && activeCheck.data.sequences.name) || 'another sequence';
      return res.status(400).json({ error: 'Lead is already enrolled in "' + activeName + '". Cancel or complete that enrollment first.' });
    }

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

    var { safeEnrolSequence } = require('./_lib/safe-enrol-sequence');
    var enrolRes = await safeEnrolSequence(supabase, { tenant_id: tenant_id, lead_id: lead_id, sequence_id: sequence_id, next_step_at: startDate.toISOString() });

    if (!enrolRes.enrolled) {
      if (enrolRes.reason === 'sticky_status') return res.status(409).json({ error: 'Lead has existing enrollment in state: ' + enrolRes.existing_status + '. Reset it before re-enrolling.' });
      return res.status(500).json({ error: enrolRes.error || enrolRes.reason });
    }
    console.log('[Sequences] Lead enrolled:', lead_id, 'in sequence:', sequence_id);
    return res.status(200).json({ success: true });
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
        // Skip leads with no email — sequences require a deliverable address
        var bulkLeadEmail = bulkLead.email ? bulkLead.email.trim() : '';
        if (!bulkLeadEmail && !bulkLead.id) {
          results.errors.push((bulkLead.first_name || 'Unknown') + ': no email address');
          results.skipped++;
          continue;
        }
        var bulkLeadId = bulkLead.id;
        if (bulkLeadId && !bulkLeadEmail) {
          // Existing lead — verify they have an email
          var existingLeadCheck = await supabase.from('leads').select('email').eq('id', bulkLeadId).maybeSingle();
          if (!existingLeadCheck.data || !existingLeadCheck.data.email || !existingLeadCheck.data.email.trim()) {
            results.errors.push(bulkLeadId + ': no email address');
            results.skipped++;
            continue;
          }
        }
        if (!bulkLeadId) {
          var newLeadRes = await supabase.from('leads').insert({
            name: ((bulkLead.first_name || '') + ' ' + (bulkLead.last_name || '')).trim() || bulkLeadEmail || 'Unknown',
            company: bulkLead.company || '',
            email: bulkLeadEmail || null,
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
        var _safeEnrolBulk = require('./_lib/safe-enrol-sequence');
        var bulkEnrolRes = await _safeEnrolBulk.safeEnrolSequence(supabase, { tenant_id: bulkTenantId, lead_id: bulkLeadId, sequence_id: bulkSeqId, next_step_at: bulkStartDate.toISOString() });
        if (!bulkEnrolRes.enrolled) { results.errors.push(bulkLeadId + ': ' + (bulkEnrolRes.reason || 'enrol failed')); results.skipped++; continue; }
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

  // ── PAUSE sequence ─────────────────────────────────────────────────────────
  if (action === 'pause') {
    var seqId = body.sequence_id;
    var tenantId = body.tenant_id;
    if (!seqId) return res.status(400).json({ error: 'sequence_id required' });
    var upd = await supabase.from('sequences').update({ paused_at: new Date().toISOString() }).eq('id', seqId);
    if (tenantId) upd = await supabase.from('sequences').update({ paused_at: new Date().toISOString() }).eq('id', seqId).eq('tenant_id', tenantId);
    console.log('[Sequences] Paused:', seqId);
    return res.status(200).json({ success: true, paused: true });
  }

  // ── RESUME sequence ───────────────────────────────────────────────────────
  if (action === 'resume') {
    var seqId2 = body.sequence_id;
    var tenantId2 = body.tenant_id;
    if (!seqId2) return res.status(400).json({ error: 'sequence_id required' });
    var upd2 = tenantId2
      ? await supabase.from('sequences').update({ paused_at: null }).eq('id', seqId2).eq('tenant_id', tenantId2)
      : await supabase.from('sequences').update({ paused_at: null }).eq('id', seqId2);
    console.log('[Sequences] Resumed:', seqId2);
    return res.status(200).json({ success: true, resumed: true });
  }

  // ── SOFT DELETE sequence ──────────────────────────────────────────────────
  if (action === 'delete') {
    var seqId3 = body.sequence_id;
    var tenantId3 = body.tenant_id;
    if (!seqId3) return res.status(400).json({ error: 'sequence_id required' });
    await supabase.from('sequences').update({ deleted_at: new Date().toISOString(), status: 'deleted' }).eq('id', seqId3);
    var cancelled = await supabase.from('lead_sequences').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('sequence_id', seqId3).eq('status', 'active');
    console.log('[Sequences] Soft-deleted:', seqId3, 'cancelled enrolments:', cancelled.count || 0);
    return res.status(200).json({ success: true, deleted: true });
  }

  // ── REMOVE contact from sequence ──────────────────────────────────────────
  if (action === 'remove-contact') {
    var lsId = body.lead_sequence_id;
    if (!lsId) return res.status(400).json({ error: 'lead_sequence_id required' });
    await supabase.from('lead_sequences').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', lsId);
    console.log('[Sequences] Removed contact from sequence:', lsId);
    return res.status(200).json({ success: true, removed: true });
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
