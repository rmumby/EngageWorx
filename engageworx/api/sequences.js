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
var { STAGE_KEYS, getPipelineStageId } = require('./_lib/pipelineStages');
var { BLOCKED_BODY_PATTERNS, looksLikeEmail, GENERIC_LOCAL_PARTS } = require('./_lib/email-safety-gates');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// looksLikeEmail, GENERIC_LOCAL_PARTS, BLOCKED_BODY_PATTERNS
// imported from _lib/email-safety-gates.js

function resolveContactFields(lead) {
  var name = (lead.name || '').trim();
  var email = (lead.email || '').trim();
  var emailLocal = email ? email.split('@')[0].toLowerCase() : '';

  // Treat email-as-name or email-local-part-as-name as no name at all
  if (looksLikeEmail(name) || (name && email && name.toLowerCase() === email.toLowerCase())) {
    name = '';
  }
  if (name && emailLocal && name.toLowerCase() === emailLocal) {
    name = '';
  }

  var firstName = name ? name.split(' ')[0] : '';
  var lastName = name ? name.split(' ').slice(1).join(' ') : '';

  // Fallback chain for firstName: name → first_name field → 'there'
  // Do NOT extract from email local-part — it is never a reliable name.
  if (!firstName && lead.first_name) {
    var fn = lead.first_name.trim();
    var fnLower = fn.toLowerCase();
    firstName = (looksLikeEmail(fn) || fnLower === emailLocal) ? '' : fn;
  }

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
      '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0;padding:32px 16px;">' +
      '<div style="font-size:15px;color:#1e293b;line-height:1.75;">' + body.replace(/\n\n/g, '</div><div style="font-size:15px;color:#1e293b;line-height:1.75;margin-top:14px;">').replace(/\n/g, '<br>') + '</div>';

    var seqThreadId = generateThreadId();
    var seqReplyTo = makeReplyToAddress(seqThreadId, tenant.email_tracking_domain);

    await sendTenantEmail(supabase, {
      tenant_id: tenant.id,
      to: lead.email,
      from: emailConfig.from || undefined,
      from_name: sigInfo.fromName || emailConfig.fromName || undefined,
      subject: subject,
      text: _sig.composeTextBody(body, sigInfo.closingLine, sigInfo.fromName),
      html: _sig.composeHtmlBody(bodyHtml, sigInfo.closingLine, sigInfo.signatureHtml) + '</div>',
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
    if (!lead.phone && !lead.mobile) {
      console.log('[Sequences] No phone for lead:', lead.id, '— skipping SMS step');
      return { skipped: true, reason: 'no_phone_for_sms', advance: true };
    }

    // Resolve sender number from phone_numbers (authoritative source)
    var pnResult = await supabase
      .from('phone_numbers')
      .select('number')
      .eq('tenant_id', tenant.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (!pnResult.data || !pnResult.data.number) {
      console.error('[Sequences] No active phone_numbers row for tenant', tenant.id, '(' + (tenant.name || '') + ') — cannot send SMS');
      return { skipped: true, reason: 'no_sender_number', advance: false };
    }
    var smsFrom = pnResult.data.number;

    // Verify SMS channel is enabled
    var ccResult = await supabase
      .from('channel_configs')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('channel', 'sms')
      .eq('enabled', true)
      .maybeSingle();

    if (!ccResult.data) {
      console.error('[Sequences] No enabled SMS channel_config for tenant', tenant.id, '(' + (tenant.name || '') + ')');
      return { skipped: true, reason: 'sms_channel_not_configured', advance: false };
    }

    // Check phone_supplier for routing
    var supplierResult = await supabase
      .from('tenants')
      .select('phone_supplier')
      .eq('id', tenant.id)
      .maybeSingle();
    var supplier = (supplierResult.data && supplierResult.data.phone_supplier) || 'twilio';

    if (supplier !== 'twilio') {
      console.error('[Sequences] Unsupported phone_supplier:', supplier, 'for tenant', tenant.id, '— only twilio is implemented');
      return { skipped: true, reason: 'unsupported_supplier: ' + supplier, advance: false };
    }

    var accountSid = process.env.TWILIO_ACCOUNT_SID;
    var authToken = process.env.TWILIO_AUTH_TOKEN;
    var auth = Buffer.from(accountSid + ':' + authToken).toString('base64');
    var params = new URLSearchParams();
    params.append('To', lead.phone || lead.mobile);
    params.append('From', smsFrom);
    params.append('Body', body);

    var smsResp = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json', {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (smsResp.ok) {
      console.log('[Sequences] SMS sent to:', lead.phone || lead.mobile, 'from:', smsFrom, 'step:', step.step_number);
      return true;
    } else {
      var smsErr = await smsResp.json();
      console.error('[Sequences] SMS failed:', smsErr.message);
      return { skipped: true, reason: 'sms_send_failed: ' + (smsErr.message || 'unknown'), advance: false };
    }
  }

  return { skipped: true, reason: 'unknown_channel: ' + step.channel, advance: false };
}

// ── Platform-level error detection + alerting ────────────────────────────
var PLATFORM_ERROR_PATTERNS = [
  'SMTP credentials', 'Invalid API key', 'Authentication failed', 'ECONNREFUSED',
  'RESEND_API_KEY not configured', 'ANTHROPIC_API_KEY not configured',
  'Resend error', 'SMTP credentials incomplete', 'connect ETIMEDOUT',
  'getaddrinfo ENOTFOUND', 'certificate has expired', 'self signed certificate',
  'ESOCKET', 'EAUTH', 'Invalid login', 'rate limit', 'quota exceeded',
];

function isPlatformError(errorMessage) {
  var lower = (errorMessage || '').toLowerCase();
  for (var i = 0; i < PLATFORM_ERROR_PATTERNS.length; i++) {
    if (lower.indexOf(PLATFORM_ERROR_PATTERNS[i].toLowerCase()) !== -1) return PLATFORM_ERROR_PATTERNS[i];
  }
  return null;
}

// Throttle: keyed by tenant_id:pattern, 4-hour window.
// Uses a DB table check so throttle persists across cron invocations.
async function shouldAlertPlatform(supabase, tenantId, pattern) {
  try {
    var fourHoursAgo = new Date(Date.now() - 4 * 3600000).toISOString();
    var { data } = await supabase.from('debug_logs')
      .select('id')
      .eq('endpoint', 'sequence_platform_alert')
      .eq('action', tenantId + ':' + pattern)
      .gte('created_at', fourHoursAgo)
      .limit(1)
      .maybeSingle();
    return !data;
  } catch (e) { return true; } // fail open — send the alert
}

async function recordAlertSent(supabase, tenantId, pattern) {
  try {
    await supabase.from('debug_logs').insert({
      endpoint: 'sequence_platform_alert',
      action: tenantId + ':' + pattern,
      payload: { tenant_id: tenantId, pattern: pattern },
      created_at: new Date().toISOString(),
    });
  } catch (e) {}
}

async function sendPlatformAlert(tenantId, sequenceId, errorMsg, pattern, affectedCount) {
  var adminEmail = process.env.PLATFORM_ADMIN_EMAIL;
  var resendKey = process.env.RESEND_API_KEY;
  var fromEmail = process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com';
  if (!adminEmail || !resendKey) {
    console.error('[Sequences] PLATFORM ALERT (no email configured):', { tenant_id: tenantId, pattern: pattern, error: errorMsg, affected: affectedCount });
    return;
  }
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'EngageWorx Alerts <' + fromEmail + '>',
        to: [adminEmail],
        subject: '[ALERT] Sequence cron failing: ' + pattern,
        html: '<div style="font-family:Arial,sans-serif;max-width:600px;padding:20px;">' +
          '<h2 style="color:#dc2626;margin:0 0 12px;">Sequence Infrastructure Error</h2>' +
          '<p style="color:#334155;font-size:14px;line-height:1.6;">' +
          '<strong>Pattern:</strong> ' + pattern + '<br>' +
          '<strong>Tenant:</strong> ' + tenantId + '<br>' +
          '<strong>Sequence:</strong> ' + (sequenceId || 'multiple') + '<br>' +
          '<strong>Affected enrollments:</strong> ' + affectedCount + '<br>' +
          '<strong>Error:</strong> ' + (errorMsg || '').substring(0, 500).replace(/</g, '&lt;') + '<br>' +
          '<strong>Time:</strong> ' + new Date().toISOString() + '</p>' +
          '<p style="color:#94a3b8;font-size:12px;margin-top:16px;">This alert is throttled to once per 4 hours per tenant+pattern combination.</p>' +
          '</div>',
      }),
    });
    console.log('[Sequences] Platform alert sent:', { tenant_id: tenantId, pattern: pattern, to: adminEmail });
  } catch (alertErr) {
    console.error('[Sequences] Platform alert send failed:', alertErr.message);
  }
}

async function processDueSteps(supabase) {
  var now = new Date().toISOString();
  var processed = 0;
  var errors = 0;
  var platformErrors = {}; // { 'tenantId:pattern': { tenantId, sequenceId, error, count } }

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
      // NOTE: do NOT derive lead.name from email local-part.
      // resolveContactFields() handles missing names with the "there" fallback.
      // Earlier backfill block (removed) corrupted lead.name with email local-parts.

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
        var isMetaLanguageBlock = refusedReason.indexOf('ai_meta_language_blocked') !== -1;
        var refusedStatus = isMetaLanguageBlock ? 'paused' : 'error';
        await supabase.from('lead_sequences').update({ status: refusedStatus, error_message: refusedReason, last_error: refusedReason, last_error_at: new Date().toISOString(), processing_started_at: null }).eq('id', enrolment.id);
        console.log('[Sequences] Enrollment', enrolment.id, refusedStatus + ':', refusedReason);
        errors++;
        continue;
      }

      if (sent && sent.skipped) {
        console.log('[Sequences] Step skipped for enrolment', enrolment.id, ':', sent.reason);
        if (sent.advance) {
          // Graceful skip: advance past this step (e.g., SMS step but lead has no phone)
          var skipNextStepRes = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', sequence.id).eq('step_number', nextStepNumber + 1).maybeSingle();
          var skipNextStep = skipNextStepRes.data;
          var skipNextAt = null;
          if (skipNextStep) {
            var skipDate = new Date();
            skipDate.setDate(skipDate.getDate() + (skipNextStep.delay_days || 1));
            skipNextAt = skipDate.toISOString();
          }
          await supabase.from('lead_sequences').update({
            current_step: nextStepNumber,
            next_step_at: skipNextAt,
            status: skipNextAt ? 'active' : 'completed',
            completed_at: skipNextAt ? null : now,
            processing_started_at: null,
            last_error: 'step_skipped: ' + sent.reason,
            last_error_at: new Date().toISOString(),
          }).eq('id', enrolment.id);
          processed++;
        } else {
          // Non-recoverable skip: pause for human review
          await supabase.from('lead_sequences').update({
            status: 'paused',
            last_error: sent.reason,
            last_error_at: new Date().toISOString(),
            processing_started_at: null,
          }).eq('id', enrolment.id);
          errors++;
        }
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

      // Detect platform-level infrastructure errors (vs per-contact errors)
      var platformPattern = isPlatformError(sendError.message);
      if (platformPattern) {
        var pKey = (sequence ? sequence.tenant_id : 'unknown') + ':' + platformPattern;
        if (!platformErrors[pKey]) platformErrors[pKey] = { tenantId: sequence ? sequence.tenant_id : null, sequenceId: sequence ? sequence.id : null, error: sendError.message, pattern: platformPattern, count: 0 };
        platformErrors[pKey].count++;
      }

      errors++;
      continue;
    }
  }

  // Fire platform alerts for infrastructure-level errors (throttled)
  var alertKeys = Object.keys(platformErrors);
  for (var ak = 0; ak < alertKeys.length; ak++) {
    var pe = platformErrors[alertKeys[ak]];
    try {
      var shouldAlert = await shouldAlertPlatform(supabase, pe.tenantId, pe.pattern);
      if (shouldAlert) {
        await sendPlatformAlert(pe.tenantId, pe.sequenceId, pe.error, pe.pattern, pe.count);
        await recordAlertSent(supabase, pe.tenantId, pe.pattern);
      } else {
        console.log('[Sequences] Platform alert throttled:', { tenant_id: pe.tenantId, pattern: pe.pattern, affected: pe.count });
      }
    } catch (alertErr) { console.warn('[Sequences] Alert dispatch error:', alertErr.message); }
  }

  return { processed: processed, errors: errors, platform_alerts: alertKeys.length };
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
          var bulkStageId = await getPipelineStageId(supabase, bulkTenantId, STAGE_KEYS.LEAD);
          var newLeadRes = await supabase.from('leads').insert({
            name: ((bulkLead.first_name || '') + ' ' + (bulkLead.last_name || '')).trim() || null,
            company: bulkLead.company || '',
            email: bulkLeadEmail || null,
            phone: bulkLead.phone || null,
            type: 'Unknown',
            urgency: 'Warm',
            pipeline_stage_id: bulkStageId,
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

// Export processDueSteps for direct use by cron-sequences.js (avoids HTTP round-trip)
module.exports.processDueSteps = processDueSteps;
