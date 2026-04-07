// /api/twilio-voice.js — EngageWorx Voice System with AI (Eva)
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
);

// ─── XML helpers ──────────────────────────────────────────────────────────────
function twiml(body) {
  return '<?xml version="1.0" encoding="UTF-8"?><Response>' + body + '</Response>';
}

function escapeXml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function say(text, voice) {
  var cleanVoice = 'Polly.Joanna';
  if (voice && typeof voice === 'string') {
    var m = voice.match(/Polly\.\w+/);
    if (m) cleanVoice = m[0];
  }
  return '<Say voice="' + cleanVoice + '">' + escapeXml(text) + '</Say>';
}

function gather(action, voice, prompt, hints) {
  var hintsAttr = hints ? ' hints="' + escapeXml(hints) + '"' : '';
  return (
    '<Gather input="speech" action="' + escapeXml(action) + '" method="POST" speechTimeout="2" timeout="5" language="en-US"' + hintsAttr + '>' +
    say(prompt, voice) +
    '</Gather>' +
    say('I did not catch that. Please try again.', voice) +
    '<Redirect>' + escapeXml(action) + '</Redirect>'
  );
}

// ─── Business hours check ─────────────────────────────────────────────────────
function isBusinessHours(config) {
  var tz = config.timezone || 'America/New_York';
  var now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  var day = now.getDay();
  var currentMinutes = now.getHours() * 60 + now.getMinutes();
  var today = now.toISOString().split('T')[0];
  var overrides = config.hours_overrides || [];
  var todayOverride = overrides.find(function(o) { return o.date === today; });
  if (todayOverride) {
    if (todayOverride.closed) return false;
    return currentMinutes >= (parseInt(todayOverride.open) || 0) * 60 && currentMinutes < (parseInt(todayOverride.close) || 0) * 60;
  }
  var startMinutes = Math.round((parseFloat(config.business_hours_start) || 9) * 60);
  var endMinutes = Math.round((parseFloat(config.business_hours_end) || 17) * 60);
  var workDays = config.work_days || [1, 2, 3, 4, 5];
  if (!workDays.includes(day)) return false;
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

// ─── Get voice config for this number ────────────────────────────────────────
async function getVoiceConfig(toNumber) {
  var result = await supabase.from('channel_configs').select('*, tenant:tenant_id(id, name)').eq('channel', 'voice').eq('enabled', true);
  if (result.error || !result.data || result.data.length === 0) return null;
  var match = result.data.find(function(c) {
    var cfg = c.config_encrypted || {};
    var countryCode = (cfg.phone_country || '').match(/\+\d+/);
    countryCode = countryCode ? countryCode[0] : '+1';
    var localNum = (cfg.phone_number || '').replace(/[\s\-\(\)]/g, '').replace(/^0+/, '');
    if (!localNum) return false;
    var fullConfigNumber = countryCode + localNum;
    var normalizedTo = toNumber.replace(/[\s\-\(\)]/g, '');
    return fullConfigNumber === normalizedTo || normalizedTo.endsWith(localNum.slice(-9)) || normalizedTo.endsWith(fullConfigNumber.slice(-10));
  });
  return match || null;
}

// ─── Get AI chatbot config for tenant ────────────────────────────────────────
async function getChatbotConfig(tenantId) {
  try {
    var result = await supabase.from('chatbot_configs').select('*').eq('tenant_id', tenantId).in('channel', ['voice', 'sms', 'all']).limit(1);
    if (result.data && result.data.length > 0) return result.data[0];
    var fallback = await supabase.from('chatbot_configs').select('*').eq('tenant_id', tenantId).limit(1);
    return (fallback.data && fallback.data.length > 0) ? fallback.data[0] : null;
  } catch(e) { return null; }
}

// ─── Call AI (Eva) ────────────────────────────────────────────────────────────
async function callAI(userMessage, conversationHistory, chatbotConfig) {
  try {
    var systemPrompt = (chatbotConfig && chatbotConfig.system_prompt)
      ? chatbotConfig.system_prompt
      : 'You are Eva, a warm and professional AI assistant for EngageWorx — an AI-powered communications platform. You help callers learn about the platform, answer questions about features and pricing, and book demos. Keep responses concise — this is a phone call, so 1-3 sentences maximum. Speak naturally as if in conversation. If someone wants to book a demo or learn more, offer to text them a Calendly booking link. Pricing: SMB plans from $99-499/month. CSP/reseller plans from $499/month. Key features: AI SMS, WhatsApp, Voice, Email, Pipeline CRM, Live Inbox, Sequences, and integrations with Calendly, Typeform, HubSpot and more.';

    var knowledgeBase = (chatbotConfig && chatbotConfig.knowledge_base) ? chatbotConfig.knowledge_base : '';
    if (knowledgeBase) systemPrompt += '\n\nKnowledge base:\n' + knowledgeBase;

    var messages = (conversationHistory || []).slice(-10); // last 5 exchanges
    messages.push({ role: 'user', content: userMessage });

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: systemPrompt,
        messages: messages,
      }),
    });

    var data = await response.json();
    var aiText = (data.content && data.content[0] && data.content[0].text) ? data.content[0].text.trim() : null;

    // Detect if AI is offering Calendly
    var wantsCalendly = !!(aiText && (
      aiText.toLowerCase().includes('text you') ||
      aiText.toLowerCase().includes('send you a link') ||
      aiText.toLowerCase().includes('send you the link') ||
      aiText.toLowerCase().includes('calendly') ||
      aiText.toLowerCase().includes('booking link')
    ));

    return { text: aiText, wantsCalendly: wantsCalendly };
  } catch(e) {
    console.error('AI call error:', e.message);
    return { text: null, wantsCalendly: false };
  }
}

// ─── Send Calendly SMS ────────────────────────────────────────────────────────
async function sendCalendlyLink(toNumber, fromNumber, chatbotConfig) {
  try {
    var knowledgeBase = (chatbotConfig && chatbotConfig.knowledge_base) || '';
    var match = knowledgeBase.match(/https:\/\/calendly\.com\/[^\s"')]+/);
    var calendlyLink = match ? match[0] : null;
    if (!calendlyLink) { console.warn('No Calendly link found in knowledge base'); return; }

    var TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
    var TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    if (!TWILIO_SID || !TWILIO_TOKEN) return;

    var smsBody = 'Hi! Here is your EngageWorx demo booking link: ' + calendlyLink + ' — Looking forward to connecting!';
    var encoded = new URLSearchParams({ To: toNumber, From: fromNumber, Body: smsBody });

    await fetch('https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_SID + '/Messages.json', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(TWILIO_SID + ':' + TWILIO_TOKEN).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: encoded.toString(),
    });
    console.log('📱 Calendly SMS sent to', toNumber);
  } catch(e) {
    console.error('Calendly SMS error:', e.message);
  }
}

// ─── Conversation history (stored in calls table metadata) ────────────────────
async function getConversationHistory(callSid) {
  try {
    var result = await supabase.from('calls').select('metadata').eq('call_sid', callSid).single();
    return (result.data && result.data.metadata && result.data.metadata.ai_history) ? result.data.metadata.ai_history : [];
  } catch(e) { return []; }
}

async function saveConversationHistory(callSid, history) {
  try {
    var result = await supabase.from('calls').select('metadata').eq('call_sid', callSid).single();
    var existing = (result.data && result.data.metadata) ? result.data.metadata : {};
    existing.ai_history = history;
    await supabase.from('calls').update({ metadata: existing }).eq('call_sid', callSid);
  } catch(e) { console.warn('Save history error:', e.message); }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  if (req.method !== 'POST') return res.status(200).end(twiml(say('Method not allowed.') + '<Hangup/>'));

  var action = req.query.action || 'inbound';
  var body = req.body || {};
  console.log('📞 Voice:', action, 'To:', body.To, 'From:', body.From, 'Speech:', (body.SpeechResult || '').substring(0, 60));

  try {

    // ═══════════════════════════════════════════════════════════════
    // INBOUND — Entry point for all calls
    // ═══════════════════════════════════════════════════════════════
    if (action === 'inbound') {
      var voiceConfig = null;
      var config = {};
      var tenantId = null;

      try {
        voiceConfig = await getVoiceConfig(body.To || '');
        config = voiceConfig ? (voiceConfig.config_encrypted || {}) : {};
        tenantId = voiceConfig ? (voiceConfig.tenant_id || (voiceConfig.tenant ? voiceConfig.tenant.id : null)) : null;
      } catch(e) { console.warn('Config lookup error:', e.message); }

      // Default to SP tenant
      if (!tenantId) tenantId = 'c1bc59a8-5235-4921-9755-02514b574387';

      var voice = 'Polly.Joanna';
      if (config.tts_voice) { var vm = String(config.tts_voice).match(/Polly\.\w+/); if (vm) voice = vm[0]; }

      var recordingNotice = (config.recording_enabled !== 'Disabled') ? 'This call may be recorded. ' : '';

      // Log the call
      try {
        await supabase.from('calls').insert({
          tenant_id: tenantId, call_sid: body.CallSid, from_number: body.From,
          to_number: body.To, direction: 'inbound', status: 'ringing', started_at: new Date().toISOString(),
        });
      } catch(e) { console.warn('Call log error:', e.message); }

      // Check if this tenant uses IVR (departments with real phone numbers configured)
      var departments = config.departments || [];
      var hasIVR = departments.some(function(d) { return d.number && d.number.trim(); });

      var aiUrl = '/api/twilio-voice?action=ai-reply&tenant=' + tenantId +
        '&callSid=' + encodeURIComponent(body.CallSid || '') +
        '&from=' + encodeURIComponent(body.From || '') +
        '&to=' + encodeURIComponent(body.To || '');

      if (hasIVR && isBusinessHours(config)) {
        // ── IVR mode for tenants with department routing ──
        var menuOptions = departments.filter(function(d) { return d.name; }).map(function(d) {
          return 'Press ' + d.digit + ' ' + (d.description || 'for ' + d.name);
        }).join('. ');
        var ivrPrompt = recordingNotice + (config.greeting || 'Thank you for calling.') + ' ' + menuOptions + '. Or hold for our AI assistant.';

        return res.status(200).end(twiml(
          '<Gather numDigits="1" timeout="6" action="/api/twilio-voice?action=route&amp;tenant=' + tenantId + '" method="POST">' +
          say(ivrPrompt, voice) +
          '</Gather>' +
          // No digit → AI
          gather(aiUrl, voice, 'How can I help you today?', 'demo, pricing, help, book, schedule')
        ));
      }

      // ── AI mode — EngageWorx default, or any tenant without IVR ──
      var greeting = config.greeting ||
        'Hi there! Thanks for calling EngageWorx. I\'m Eva, your AI assistant. How can I help you today?';

      return res.status(200).end(twiml(
        gather(aiUrl, voice, recordingNotice + greeting, 'demo, pricing, features, book, schedule, Calendly, hello, help')
      ));
    }

    // ═══════════════════════════════════════════════════════════════
    // AI-REPLY — Speech received, call AI, respond
    // ═══════════════════════════════════════════════════════════════
    if (action === 'ai-reply') {
      var replyTenantId = req.query.tenant || 'c1bc59a8-5235-4921-9755-02514b574387';
      var replyCallSid = req.query.callSid || body.CallSid || '';
      var replyFrom = req.query.from || body.From || '';
      var replyTo = req.query.to || body.To || '';
      var speechResult = body.SpeechResult || '';

      // Get TTS voice for this tenant
      var rVc = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', replyTenantId).eq('channel', 'voice').single();
      var rConfig = (rVc.data && rVc.data.config_encrypted) ? rVc.data.config_encrypted : {};
      var rVoice = 'Polly.Joanna';
      if (rConfig.tts_voice) { var rvm = String(rConfig.tts_voice).match(/Polly\.\w+/); if (rvm) rVoice = rvm[0]; }

      var nextUrl = '/api/twilio-voice?action=ai-reply&tenant=' + replyTenantId +
        '&callSid=' + encodeURIComponent(replyCallSid) +
        '&from=' + encodeURIComponent(replyFrom) +
        '&to=' + encodeURIComponent(replyTo);

      // No speech captured
      if (!speechResult) {
        return res.status(200).end(twiml(
          gather(nextUrl, rVoice, 'Sorry, I didn\'t catch that. Could you repeat that?', 'demo, pricing, features, book, help')
        ));
      }

      console.log('🎤 Speech from', replyFrom, ':', speechResult);

      // Detect goodbye
      var endPhrases = ['bye', 'goodbye', 'that\'s all', 'no thank you', 'no thanks', 'hang up'];
      var isEnding = endPhrases.some(function(p) { return speechResult.toLowerCase().includes(p); });
      if (isEnding) {
        return res.status(200).end(twiml(
          say('It was great speaking with you! Have a wonderful day. Goodbye!', rVoice) +
          '<Hangup/>'
        ));
      }

      // Load history, get chatbot config, call AI
      var history = await getConversationHistory(replyCallSid);
      var chatbotCfg = await getChatbotConfig(replyTenantId);
      var aiResult = await callAI(speechResult, history, chatbotCfg);
      var aiText = aiResult.text || 'I\'m sorry, I had a little trouble with that. Could you rephrase your question?';

      // Save updated history
      history.push({ role: 'user', content: speechResult });
      history.push({ role: 'assistant', content: aiText });
      if (history.length > 20) history = history.slice(-20);
      await saveConversationHistory(replyCallSid, history);

      // Send Calendly SMS if AI offered it
      if (aiResult.wantsCalendly && replyFrom && replyTo) {
        await sendCalendlyLink(replyFrom, replyTo, chatbotCfg);
        // Don't append text — AI already said it
      }

      // Respond and listen again
      return res.status(200).end(twiml(
        gather(nextUrl, rVoice, aiText, 'yes, no, demo, pricing, features, book, schedule, bye, goodbye, help')
      ));
    }

    // ═══════════════════════════════════════════════════════════════
    // ROUTE — IVR digit pressed
    // ═══════════════════════════════════════════════════════════════
    if (action === 'route') {
      var digits = body.Digits;
      var callSid = body.CallSid;
      var routeTenantId = req.query.tenant;
      var routeConfig = {};
      if (routeTenantId) {
        var vc = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', routeTenantId).eq('channel', 'voice').single();
        routeConfig = (vc.data && vc.data.config_encrypted) ? vc.data.config_encrypted : {};
      }
      var routeVoice = 'Polly.Joanna';
      if (routeConfig.tts_voice) { var rvm2 = String(routeConfig.tts_voice).match(/Polly\.\w+/); if (rvm2) routeVoice = rvm2[0]; }
      var depts = routeConfig.departments || [];
      var dept = depts.find(function(d) { return d.digit === digits; });

      if (dept && dept.number) {
        var countryCode = dept.country || '+1';
        var localNum = dept.number.replace(/[\s\-\(\)]/g, '').replace(/^0+/, '');
        var fullNumber = localNum.startsWith('+') ? localNum : countryCode + localNum;
        await supabase.from('calls').update({ status: 'in-progress', disposition: 'transferred' }).eq('call_sid', callSid);
        return res.status(200).end(twiml(
          say('Connecting you to ' + dept.name + ' now. Please hold.', routeVoice) +
          '<Dial callerId="' + escapeXml(body.To || '') + '" timeout="30" action="/api/twilio-voice?action=dial-complete&amp;tenant=' + (routeTenantId || '') + '&amp;dept=' + encodeURIComponent(dept.name) + '">' +
          '<Number>' + escapeXml(fullNumber) + '</Number>' +
          '</Dial>'
        ));
      }

      // Invalid digit or no number → fall to AI
      var aiUrl2 = '/api/twilio-voice?action=ai-reply&tenant=' + (routeTenantId || '') +
        '&callSid=' + encodeURIComponent(callSid || '') +
        '&from=' + encodeURIComponent(body.From || '') +
        '&to=' + encodeURIComponent(body.To || '');
      return res.status(200).end(twiml(
        gather(aiUrl2, routeVoice, 'Let me connect you with our AI assistant. How can I help you?', 'demo, pricing, help')
      ));
    }

    // ═══════════════════════════════════════════════════════════════
    // DIAL-COMPLETE — Transfer result
    // ═══════════════════════════════════════════════════════════════
    if (action === 'dial-complete') {
      var dialStatus = body.DialCallStatus;
      var dialCallSid = body.CallSid;
      var dialTenantId = req.query.tenant;
      var dialConfig = {};
      if (dialTenantId) {
        var dvc = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', dialTenantId).eq('channel', 'voice').single();
        dialConfig = (dvc.data && dvc.data.config_encrypted) ? dvc.data.config_encrypted : {};
      }

      if (dialStatus === 'completed' || dialStatus === 'answered') {
        return res.status(200).end(twiml('<Hangup/>'));
      }

      await supabase.from('calls').update({ disposition: 'voicemail' }).eq('call_sid', dialCallSid);

      // Transfer failed → fall to AI
      var aiUrl3 = '/api/twilio-voice?action=ai-reply&tenant=' + (dialTenantId || '') +
        '&callSid=' + encodeURIComponent(dialCallSid || '') +
        '&from=' + encodeURIComponent(body.From || '') +
        '&to=' + encodeURIComponent(body.To || '');
      var dialVoice = 'Polly.Joanna';
      if (dialConfig.tts_voice) { var dvm = String(dialConfig.tts_voice).match(/Polly\.\w+/); if (dvm) dialVoice = dvm[0]; }
      return res.status(200).end(twiml(
        gather(aiUrl3, dialVoice, 'Sorry, that line is unavailable. I\'m Eva, our AI assistant. How can I help you?', 'demo, pricing, help')
      ));
    }

    // ═══════════════════════════════════════════════════════════════
    // VOICEMAIL-COMPLETE — Recording finished
    // ═══════════════════════════════════════════════════════════════
    if (action === 'voicemail-complete') {
      var vmCallSid = body.CallSid;
      var vmRecordingUrl = body.RecordingUrl;
      var vmRecordingDuration = body.RecordingDuration;
      var vmTenantId = req.query.tenant;

      try {
        await supabase.from('calls').update({
          recording_url: vmRecordingUrl ? (vmRecordingUrl + '.mp3') : null,
          disposition: 'voicemail', status: 'completed',
        }).eq('call_sid', vmCallSid);
      } catch(e) { console.warn('Call update error:', e.message); }

      try {
        var vmEmail = 'rob@engwx.com';
        var sendVmEmail = true;
        if (vmTenantId) {
          var vmVc = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', vmTenantId).eq('channel', 'voice').single();
          if (vmVc.data && vmVc.data.config_encrypted) {
            if (vmVc.data.config_encrypted.voicemail_email) vmEmail = vmVc.data.config_encrypted.voicemail_email;
            if (vmVc.data.config_encrypted.send_transcript_email === 'Disabled') sendVmEmail = false;
          }
        }
        var RESEND_KEY = process.env.RESEND_API_KEY;
        if (RESEND_KEY && sendVmEmail) {
          var callerNum = body.From || 'Unknown';
          var vmDate = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
          var vmDur = vmRecordingDuration ? (Math.floor(vmRecordingDuration / 60) + 'm ' + (vmRecordingDuration % 60) + 's') : 'Unknown';
          var vmHtml = '<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f9fafb"><div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb"><h1 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px">New Voice Message</h1><p style="color:#6b7280;font-size:14px;margin:0 0 24px">EngageWorx Voice System</p><div style="background:#f3f4f6;border-radius:8px;padding:20px;margin-bottom:24px"><p style="margin:6px 0;color:#6b7280;font-size:14px"><strong>Caller:</strong> ' + callerNum + '</p><p style="margin:6px 0;color:#6b7280;font-size:14px"><strong>Date:</strong> ' + vmDate + '</p><p style="margin:6px 0;color:#6b7280;font-size:14px"><strong>Duration:</strong> ' + vmDur + '</p></div>';
          if (vmRecordingUrl) vmHtml += '<div style="margin-bottom:24px"><a href="' + vmRecordingUrl + '.mp3" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">Listen to Recording</a></div>';
          vmHtml += '<div style="border-top:1px solid #e5e7eb;padding-top:16px"><p style="color:#9ca3af;font-size:12px;margin:0">EngageWorx Voice | <a href="https://portal.engwx.com" style="color:#2563eb;text-decoration:none">Log in to portal</a></p></div></div></div>';
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: 'EngageWorx <hello@engwx.com>', to: [vmEmail], subject: 'New voice message from ' + callerNum, html: vmHtml }),
          });
        }
      } catch(emailErr) { console.error('Voicemail email error:', emailErr.message); }

      return res.status(200).end(twiml(
        say('Thank you for your message. Someone will get back to you shortly. Goodbye.', 'Polly.Joanna') +
        '<Hangup/>'
      ));
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSCRIPTION — Twilio sends transcript async
    // ═══════════════════════════════════════════════════════════════
    if (action === 'transcription') {
      var txCallSid = body.CallSid;
      var txText = body.TranscriptionText;
      var txTenantId = req.query.tenant;

      if (txText) {
        try { await supabase.from('calls').update({ transcript: txText }).eq('call_sid', txCallSid); } catch(e) {}
        try {
          var txEmail = 'rob@engwx.com';
          var sendTxEmail = true;
          if (txTenantId) {
            var txVc = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', txTenantId).eq('channel', 'voice').single();
            if (txVc.data && txVc.data.config_encrypted) {
              if (txVc.data.config_encrypted.voicemail_email) txEmail = txVc.data.config_encrypted.voicemail_email;
              if (txVc.data.config_encrypted.send_transcript_email === 'Disabled') sendTxEmail = false;
            }
          }
          var txCallerNum = 'Unknown';
          try {
            var txCall = await supabase.from('calls').select('from_number').eq('call_sid', txCallSid).single();
            if (txCall.data) txCallerNum = txCall.data.from_number || txCallerNum;
          } catch(e) {}

          var TX_KEY = process.env.RESEND_API_KEY;
          if (TX_KEY && sendTxEmail) {
            var txDate = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
            var txHtml = '<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f9fafb"><div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb"><h1 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px">Voice Call Transcript</h1><p style="color:#6b7280;font-size:14px;margin:0 0 24px">EngageWorx Voice System</p><div style="background:#f3f4f6;border-radius:8px;padding:20px;margin-bottom:24px"><p style="margin:6px 0;color:#6b7280;font-size:14px"><strong>Caller:</strong> ' + txCallerNum + '</p><p style="margin:6px 0;color:#6b7280;font-size:14px"><strong>Date:</strong> ' + txDate + '</p></div><div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin-bottom:24px"><p style="color:#92400e;font-size:14px;line-height:1.6;margin:0">' + escapeXml(txText) + '</p></div><div style="border-top:1px solid #e5e7eb;padding-top:16px"><p style="color:#9ca3af;font-size:12px;margin:0">EngageWorx Voice | <a href="https://portal.engwx.com" style="color:#2563eb;text-decoration:none">Log in to portal</a></p></div></div></div>';
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': 'Bearer ' + TX_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({ from: 'EngageWorx <hello@engwx.com>', to: [txEmail], subject: 'Voice call transcript from ' + txCallerNum, html: txHtml }),
            });
          }
        } catch(emailErr) { console.error('Transcript email error:', emailErr.message); }
      }
      return res.status(200).end('<?xml version="1.0" encoding="UTF-8"?><Response/>');
    }

    // ═══════════════════════════════════════════════════════════════
    // STATUS — Call status callback
    // ═══════════════════════════════════════════════════════════════
    if (action === 'status') {
      var statusCallSid = body.CallSid;
      var callStatus = body.CallStatus;
      var updates = { status: callStatus };
      if (body.CallDuration) updates.duration_seconds = parseInt(body.CallDuration);
      if (['completed', 'failed', 'no-answer', 'busy'].includes(callStatus)) {
        updates.ended_at = new Date().toISOString();
        if (callStatus === 'no-answer' || callStatus === 'busy') updates.disposition = 'abandoned';
      }
      try { await supabase.from('calls').update(updates).eq('call_sid', statusCallSid); } catch(e) {}
      return res.status(200).end('<?xml version="1.0" encoding="UTF-8"?><Response/>');
    }

    return res.status(200).end(twiml(say('Thank you for calling EngageWorx. Goodbye.') + '<Hangup/>'));

  } catch(err) {
    console.error('Voice webhook error:', err.message, err.stack);
    return res.status(200).end(twiml(
      say('We are experiencing technical difficulties. Please try again later. Goodbye.') + '<Hangup/>'
    ));
  }
};
