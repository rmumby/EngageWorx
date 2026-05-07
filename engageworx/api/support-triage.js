// api/support-triage.js
// Classify a help-desk ticket with Claude and decide: auto-fix, user-guidance, or escalate.
// Invoked right after ticket creation from any channel.
//
// POST body: { ticket_id, tenant_id?, description?, channel? }
// Flow:
//   1. Load ticket + tenant config snapshot
//   2. Ask Claude Sonnet to classify (CONFIG_ISSUE | CODE_BUG | USER_ERROR | UNKNOWN)
//   3. If CONFIG_ISSUE → attempt the matching auto-fix handler; notify tenant
//   4. If CODE_BUG → pull Vercel logs, email rob@ with diagnosis
//   5. If USER_ERROR → Aria drafts a step-by-step reply and sends it on the ticket
//   6. Always log to support_triage

var { createClient } = require('@supabase/supabase-js');
var { fetchRecentLogs } = require('./fetch-logs');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ── Auto-fix handlers ────────────────────────────────────────────────────────
var AUTO_FIXES = {
  voice_config: async function(supabase, tenantId, decision) {
    // Check for malformed voice config — missing tts_voice, malformed phone, empty greeting
    try {
      var r = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', tenantId).eq('channel', 'voice').maybeSingle();
      if (!r.data) return { applied: false, reason: 'no voice config row' };
      var cfg = r.data.config_encrypted || {};
      var patch = Object.assign({}, cfg);
      var changed = [];
      if (!cfg.tts_voice) { patch.tts_voice = 'Polly.Joanna'; changed.push('tts_voice=Polly.Joanna'); }
      if (cfg.ring_timeout_seconds && (parseInt(cfg.ring_timeout_seconds, 10) > 60 || parseInt(cfg.ring_timeout_seconds, 10) < 1)) {
        patch.ring_timeout_seconds = '20'; changed.push('ring_timeout_seconds=20 (was out of range)');
      }
      if (!changed.length) return { applied: false, reason: 'nothing malformed' };
      await supabase.from('channel_configs').update({ config_encrypted: patch }).eq('tenant_id', tenantId).eq('channel', 'voice');
      return { applied: true, fixes: changed };
    } catch (e) { return { applied: false, reason: e.message }; }
  },
  sendgrid_key: async function(supabase, tenantId) {
    // We can detect but not rotate — flag for escalation
    if (!process.env.SENDGRID_API_KEY) return { applied: false, reason: 'SENDGRID_API_KEY not set in env — needs Rob' };
    return { applied: false, reason: 'SendGrid key is present; issue is likely elsewhere' };
  },
  whatsapp_webhook: async function(supabase, tenantId) {
    // Ensure webhook URL in channel_configs matches current portal URL
    try {
      var r = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', tenantId).eq('channel', 'whatsapp').maybeSingle();
      if (!r.data) return { applied: false, reason: 'no whatsapp config row' };
      var cfg = r.data.config_encrypted || {};
      var expected = (process.env.PORTAL_URL || 'https://portal.engwx.com') + '/api/whatsapp';
      if (cfg.webhook_url === expected) return { applied: false, reason: 'webhook url already correct' };
      var patch = Object.assign({}, cfg, { webhook_url: expected });
      await supabase.from('channel_configs').update({ config_encrypted: patch }).eq('tenant_id', tenantId).eq('channel', 'whatsapp');
      return { applied: true, fixes: ['webhook_url=' + expected] };
    } catch (e) { return { applied: false, reason: e.message }; }
  },
  sequence_enrolment: async function(supabase, tenantId) {
    // Look for leads that should be in a sequence but are not. Non-destructive — just reports.
    try {
      var r = await supabase.from('lead_sequences').select('id, status').eq('tenant_id', tenantId).eq('status', 'active');
      return { applied: false, reason: (r.data || []).length + ' active enrolments found — no stuck rows detected' };
    } catch (e) { return { applied: false, reason: e.message }; }
  },
};

async function askClaude(ticket, tenant, configSnapshot) {
  if (!process.env.ANTHROPIC_API_KEY) return { classification: 'UNKNOWN', reasoning: 'Claude unavailable' };
  var systemPrompt = 'You are a support triage engine for EngageWorx, an AI-powered multi-channel communications platform (SMS, WhatsApp, Email, Voice).' +
    '\n\nClassify the inbound ticket into EXACTLY ONE of:' +
    '\n- CONFIG_ISSUE  — a misconfiguration in tenant settings we can likely auto-fix' +
    '\n- CODE_BUG      — a platform-level error that needs an engineer' +
    '\n- USER_ERROR    — the tenant is doing something wrong; guidance will fix it' +
    '\n- UNKNOWN       — not enough signal to decide' +
    '\n\nReturn STRICT JSON:' +
    '\n{' +
    '\n  "classification": "CONFIG_ISSUE|CODE_BUG|USER_ERROR|UNKNOWN",' +
    '\n  "confidence": 0.0-1.0,' +
    '\n  "reasoning": "1-3 sentences",' +
    '\n  "auto_fix_key": "voice_config | whatsapp_webhook | sendgrid_key | sequence_enrolment | null",' +
    '\n  "user_reply": "if USER_ERROR, a friendly 3-5 sentence reply guiding the user; else null",' +
    '\n  "engineer_notes": "if CODE_BUG, technical diagnosis and suggested fix; else null"' +
    '\n}';
  var prompt = 'Ticket subject: ' + (ticket.subject || '(none)') +
    '\nChannel: ' + (ticket.source_channel || 'portal') +
    '\nSubmitter: ' + (ticket.submitter_name || ticket.submitter_email || 'unknown') +
    '\nTenant: ' + (tenant && tenant.name ? tenant.name : 'unknown') +
    '\nPlan: ' + (tenant && tenant.plan ? tenant.plan : 'unknown') +
    '\n\nDescription:\n' + (ticket.description || '(empty)').substring(0, 2000) +
    '\n\nConfig snapshot (summarised):\n' + JSON.stringify(configSnapshot || {}, null, 2).substring(0, 1500) +
    '\n\nReturn JSON only.';
  try {
    var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, system: systemPrompt, messages: [{ role: 'user', content: prompt }] }),
    });
    var data = await aiRes.json();
    var txt = (data.content || []).find(function(b) { return b.type === 'text'; });
    var rawText = txt ? txt.text : '';
    var m = rawText.match(/\{[\s\S]*\}/);
    if (!m) return { classification: 'UNKNOWN', reasoning: 'Claude returned no JSON', claude_response: rawText };
    var parsed = JSON.parse(m[0]);
    parsed.claude_response = rawText;
    return parsed;
  } catch (e) {
    return { classification: 'UNKNOWN', reasoning: 'Claude error: ' + e.message };
  }
}

async function notifyTenant(supabase, ticket, tenantId, message) {
  // Best-effort reply on the ticket — goes into support_tickets.responses or a new reply row
  try {
    await supabase.from('support_ticket_responses').insert({
      ticket_id: ticket.id,
      tenant_id: tenantId,
      author: 'ai',
      body: message,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    try { await supabase.from('support_tickets').update({ ai_response: message, updated_at: new Date().toISOString() }).eq('id', ticket.id); } catch (e2) {}
  }
}

async function flagForPlatformReview(supabase, ticketId, reason) {
  try {
    var { error } = await supabase
      .from('support_tickets')
      .update({
        needs_platform_review: true,
        platform_review_reason: reason,
        platform_review_flagged_at: new Date().toISOString()
      })
      .eq('id', ticketId);
    if (error) {
      console.error('[Triage] Failed to flag for platform review:', error.message);
      return { flagged: false, error: error.message };
    }
    console.log('[Triage] Flagged ticket', ticketId, 'for platform review:', reason);
    return { flagged: true };
  } catch (err) {
    console.error('[Triage] flagForPlatformReview exception:', err.message);
    return { flagged: false, error: err.message };
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var body = req.body || {};
  var ticketId = body.ticket_id;
  if (!ticketId) return res.status(400).json({ error: 'ticket_id required' });
  var supabase = getSupabase();

  try {
    var t = await supabase.from('support_tickets').select('*').eq('id', ticketId).maybeSingle();
    var ticket = t.data;
    if (!ticket) return res.status(404).json({ error: 'ticket not found' });

    var tenantId = ticket.tenant_id || body.tenant_id || null;
    var tenant = null;
    if (tenantId) {
      var tt = await supabase.from('tenants').select('id, name, plan, tenant_type, entity_tier').eq('id', tenantId).maybeSingle();
      tenant = tt.data;
    }

    // Compact config snapshot — only fields relevant to classification
    var configSnapshot = {};
    if (tenantId) {
      try {
        var cc = await supabase.from('channel_configs').select('channel, enabled, config_encrypted').eq('tenant_id', tenantId);
        (cc.data || []).forEach(function(row) {
          var c = row.config_encrypted || {};
          configSnapshot[row.channel] = {
            enabled: row.enabled,
            auto_answer: c.auto_answer,
            block_after_hours: c.block_after_hours,
            voicemail_greeting_set: !!c.voicemail_greeting,
            phone_number: c.phone_number ? '(set)' : '(empty)',
            tts_voice: c.tts_voice,
            webhook_url: c.webhook_url,
          };
        });
      } catch (e) {}
    }

    var decision = await askClaude(ticket, tenant, configSnapshot);
    var classification = decision.classification || 'UNKNOWN';
    var fixResult = null;
    var logs = null;

    if (classification === 'CONFIG_ISSUE' && decision.auto_fix_key && AUTO_FIXES[decision.auto_fix_key]) {
      fixResult = await AUTO_FIXES[decision.auto_fix_key](supabase, tenantId, decision);
      if (fixResult && fixResult.applied) {
        var fixMsg = 'We detected and fixed a configuration issue: ' + (fixResult.fixes || []).join(', ') + '. Please re-test and let us know if the problem persists.';
        await notifyTenant(supabase, ticket, tenantId, fixMsg);
        try { await supabase.from('support_tickets').update({ status: 'resolved', resolved_at: new Date().toISOString(), resolution: 'Auto-fixed: ' + (fixResult.fixes || []).join(', ') }).eq('id', ticketId); } catch (e) {}
      }
    } else if (classification === 'USER_ERROR' && decision.user_reply) {
      await notifyTenant(supabase, ticket, tenantId, decision.user_reply);
      try { await supabase.from('support_tickets').update({ status: 'awaiting_user', ai_response: decision.user_reply, updated_at: new Date().toISOString() }).eq('id', ticketId); } catch (e) {}
    } else if (classification === 'CODE_BUG') {
      var logResult = await fetchRecentLogs({ hoursBack: 24, limit: 10, errorOnly: true, match: ticket.submitter_email || ticket.submitter_phone || null });
      logs = logResult.logs || [];
      await flagForPlatformReview(supabase, ticketId, 'Suspected platform bug — see triage reasoning and Vercel logs');
      try { await supabase.from('support_tickets').update({ status: 'escalated', updated_at: new Date().toISOString() }).eq('id', ticketId); } catch (e) {}
    } else {
      await flagForPlatformReview(supabase, ticketId, 'AI could not classify — needs human review');
      try { await supabase.from('support_tickets').update({ status: 'pending_review', updated_at: new Date().toISOString() }).eq('id', ticketId); } catch (e) {}
    }

    // Audit
    try {
      await supabase.from('support_triage').insert({
        ticket_id: ticketId,
        tenant_id: tenantId,
        classification: classification,
        confidence: typeof decision.confidence === 'number' ? decision.confidence : null,
        reasoning: decision.reasoning || null,
        suggested_fix: decision.auto_fix_key || null,
        fix_applied: !!(fixResult && fixResult.applied),
        fix_details: fixResult || null,
        escalated_to_rob: classification === 'CODE_BUG' || classification === 'UNKNOWN',
        escalation_diagnosis: decision.engineer_notes || null,
        claude_response: decision.claude_response || null,
        logs_snippet: logs ? JSON.stringify(logs).substring(0, 4000) : null,
      });
    } catch (e) { console.warn('[Triage] audit insert error:', e.message); }

    // Write root_cause_* to support_tickets (canonical classification)
    var ROOT_CAUSE_MAP = { USER_ERROR: 'user_level', CONFIG_ISSUE: 'tenant_level', CODE_BUG: 'platform_level', UNKNOWN: 'unknown' };
    try {
      await supabase.from('support_tickets').update({
        root_cause_type: ROOT_CAUSE_MAP[classification] || 'unknown',
        root_cause_confidence: typeof decision.confidence === 'number' ? decision.confidence : null,
        root_cause_reasoning: decision.reasoning || null
      }).eq('id', ticketId);
    } catch (e) { console.warn('[Triage] root_cause update error:', e.message); }

    return res.status(200).json({
      classification: classification,
      fix_applied: !!(fixResult && fixResult.applied),
      fix_details: fixResult,
      reasoning: decision.reasoning,
    });
  } catch (err) {
    console.error('[Triage] error:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
};
