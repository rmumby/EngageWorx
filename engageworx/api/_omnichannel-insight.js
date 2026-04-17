// api/_omnichannel-insight.js
// Shared helper: analyze an inbound interaction on any channel (email, WhatsApp, SMS, voice)
// with Claude and log the decision as a row in email_actions so it shows up in the
// AI Omnichannel Digest. Called from api/email-inbound.js, api/whatsapp.js, api/sms.js,
// and api/twilio-voice.js (transcription).

async function matchContactAndTenant(supabase, senderEmail, senderPhone) {
  var match = { contactId: null, leadId: null, tenantId: null, leadStage: null };
  var email = (senderEmail || '').toLowerCase().trim();
  var phone = (senderPhone || '').trim();
  try {
    var cq = supabase.from('contacts').select('id, tenant_id, pipeline_lead_id');
    var cRes = null;
    if (email) cRes = await cq.ilike('email', email).limit(1).maybeSingle();
    if ((!cRes || !cRes.data) && phone) {
      cRes = await supabase.from('contacts').select('id, tenant_id, pipeline_lead_id').eq('phone', phone).limit(1).maybeSingle();
    }
    if (cRes && cRes.data) {
      match.contactId = cRes.data.id;
      match.tenantId = cRes.data.tenant_id;
      match.leadId = cRes.data.pipeline_lead_id;
    }
  } catch (e) {}
  try {
    var lq = supabase.from('leads').select('id, tenant_id, stage');
    var lRes = null;
    if (!match.leadId && email) lRes = await lq.ilike('email', email).limit(1).maybeSingle();
    if ((!lRes || !lRes.data) && !match.leadId && phone) {
      lRes = await supabase.from('leads').select('id, tenant_id, stage').eq('phone', phone).limit(1).maybeSingle();
    }
    if (lRes && lRes.data) {
      match.leadId = match.leadId || lRes.data.id;
      match.tenantId = match.tenantId || lRes.data.tenant_id;
      match.leadStage = lRes.data.stage;
    } else if (match.leadId) {
      var lr = await supabase.from('leads').select('stage').eq('id', match.leadId).maybeSingle();
      if (lr.data) match.leadStage = lr.data.stage;
    }
  } catch (e) {}
  return match;
}

async function recentHistory(supabase, contactId) {
  if (!contactId) return '';
  try {
    var msgs = await supabase.from('messages').select('direction, channel, body, created_at').eq('contact_id', contactId).order('created_at', { ascending: false }).limit(3);
    return (msgs.data || []).reverse().map(function(m) {
      return '[' + (m.direction === 'inbound' ? 'FROM CONTACT' : 'TO CONTACT') + ' · ' + (m.channel || '') + ' · ' + (m.created_at || '').substring(0, 10) + ']\n' + (m.body || '').substring(0, 400);
    }).join('\n\n');
  } catch (e) { return ''; }
}

var _usage = require('./_usage-meter');

async function askClaude(channel, context) {
  var systemPrompt = 'You are EngageWorx sales ops AI. Analyze an inbound ' + channel + ' interaction and decide ONE action.' +
    '\n\nPricing: Starter $99/mo, Growth $249/mo, Pro $499/mo, Enterprise custom.' +
    '\nFeatures: SMS, WhatsApp, Email, Voice, RCS, AI chatbot, CSP white-label, commissions.' +
    '\nReturn STRICT JSON: {"action":"advance_stage"|"enroll_sequence"|"review"|"auto_reply"|"no_action","reasoning":"1-2 sentences","summary":"1-sentence summary","reply_draft":"text if auto_reply else null","new_stage":"stage id if advance_stage else null","sequence_name":"name to enroll else null"}' +
    '\n\nStages: inquiry, demo_shared, sandbox_shared, opportunity, package_selection, go_live, customer, dormant.' +
    '\nUse auto_reply ONLY for simple factual questions answerable from the pricing/features above.' +
    (channel === 'voice' ? '\nFor voice/voicemail: favor review over auto_reply — we cannot auto-reply to a phone call.' : '') +
    (channel === 'sms' || channel === 'whatsapp' ? '\nFor SMS/WhatsApp: keep reply_draft under 160 chars if produced.' : '');

  var decision = { action: 'review', reasoning: 'Claude unavailable', summary: (context.body || '').substring(0, 200), reply_draft: null, new_stage: null, sequence_name: null };
  try {
    var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1000, system: systemPrompt, messages: [{ role: 'user', content: context.prompt }] }),
    });
    var aiData = await aiRes.json();
    var txt = (aiData.content || []).find(function(b) { return b.type === 'text'; });
    var text = txt ? txt.text : '';
    var m = text.match(/\{[\s\S]*\}/);
    if (m) decision = Object.assign(decision, JSON.parse(m[0]));
    // Meter Claude usage
    try {
      var usage = aiData.usage || {};
      _usage.logAiUsage(context.supabase, {
        tenant_id: context.tenantId,
        model: 'claude-haiku-4-5',
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0,
        feature: 'omnichannel_digest',
      });
    } catch (uErr) {}
  } catch (e) { /* fall through to default */ }
  return decision;
}

async function logInboundInsight(params) {
  // params: { supabase, channel: 'email'|'whatsapp'|'sms'|'voice', senderEmail, senderPhone, senderName, subject, body, extra }
  var supabase = params.supabase;
  var channel = params.channel;
  var body = params.body || '';
  var senderId = params.senderEmail || params.senderPhone || '';
  if (!senderId || !supabase) return null;

  try {
    var match = await matchContactAndTenant(supabase, params.senderEmail, params.senderPhone);
    var history = await recentHistory(supabase, match.contactId);

    var prompt = channel.toUpperCase() + ' from: ' + (senderId) + (params.senderName ? ' (' + params.senderName + ')' : '') +
      (params.subject ? '\nSubject: ' + params.subject : '') +
      '\nCurrent pipeline stage: ' + (match.leadStage || 'none') +
      (params.extra && params.extra.duration ? '\nCall duration: ' + params.extra.duration + 's' : '') +
      '\n\nBody:\n' + body.substring(0, 2000) +
      (history ? '\n\n---- Recent interactions ----\n' + history : '') +
      '\n\nReturn JSON only.';

    var decision = await askClaude(channel, { prompt: prompt, body: body, supabase: supabase, tenantId: match.tenantId });

    var source = channel === 'email' ? 'inbound_email' : (channel + '_inbound');

    var ins = await supabase.from('email_actions').insert({
      contact_id: match.contactId,
      lead_id: match.leadId,
      tenant_id: match.tenantId,
      email_from: senderId,
      email_subject: params.subject || ('Inbound ' + channel),
      email_body_summary: decision.summary || body.substring(0, 200),
      claude_action: decision.action || 'review',
      claude_reasoning: decision.reasoning || null,
      claude_reply_draft: decision.reply_draft || null,
      action_payload: Object.assign({
        channel: channel,
        new_stage: decision.new_stage || null,
        sequence_name: decision.sequence_name || null,
      }, params.extra || {}),
      status: 'pending',
      source: source,
    }).select('id').single();

    return { actionId: ins.data ? ins.data.id : null, decision: decision, match: match };
  } catch (err) {
    console.warn('[omnichannel-insight] error:', err.message);
    return null;
  }
}

module.exports = { logInboundInsight: logInboundInsight };
