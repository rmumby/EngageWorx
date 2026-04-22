// /api/twilio-voice.js — EngageWorx Voice System with configurable AI assistant
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
);

// ─── Default voice per locale ─────────────────────────────────────────────────
// US-based Polly voices (Joanna/Matthew) don't pronounce UK English well and can
// fail outright on UK-accent locales. Pick a region-appropriate default based on
// the called number's country code.
function defaultVoiceFor(toNumber) {
  var n = String(toNumber || '').replace(/[\s\-\(\)]/g, '');
  if (n.indexOf('+44') === 0) return 'Polly.Amy-Neural';   // UK English
  if (n.indexOf('+61') === 0) return 'Polly.Olivia-Neural'; // Australian English
  if (n.indexOf('+353') === 0) return 'Polly.Amy-Neural';  // Ireland → closest neural UK voice
  return 'Polly.Joanna';                                   // US English (default)
}

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
    var m = voice.match(/Polly\.[\w-]+/);
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
  var SP_ID = process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387';
  var result = await supabase.from('channel_configs').select('*, tenant:tenant_id(id, name)').eq('channel', 'voice').eq('enabled', true);
  if (result.error || !result.data || result.data.length === 0) return null;
  var normalizedTo = toNumber.replace(/[\s\-\(\)]/g, '');
  var toDigits = normalizedTo.replace(/[^0-9]/g, '');

  function buildFullNumber(cfg) {
    var countryCode = (cfg.phone_country || '').match(/\+\d+/);
    countryCode = countryCode ? countryCode[0] : '+1';
    var localNum = (cfg.phone_number || '').replace(/[\s\-\(\)]/g, '').replace(/^0+/, '');
    return { full: countryCode + localNum, local: localNum };
  }

  // Pass 1: exact match
  var exactMatch = result.data.find(function(c) {
    var nums = buildFullNumber(c.config_encrypted || {});
    return nums.full === normalizedTo || nums.full.replace(/[^0-9+]/g, '') === normalizedTo;
  });
  if (exactMatch) { console.log('[getVoiceConfig] exact match tenant=' + exactMatch.tenant_id); return exactMatch; }

  // Pass 2: SP tenant match (prioritize SP over random fuzzy matches)
  var spMatch = result.data.find(function(c) { return c.tenant_id === SP_ID; });
  if (spMatch) {
    var spNums = buildFullNumber(spMatch.config_encrypted || {});
    var spDigits = spNums.full.replace(/[^0-9]/g, '');
    if (toDigits.endsWith(spDigits.slice(-10)) || spDigits.endsWith(toDigits.slice(-10))) {
      console.log('[getVoiceConfig] SP tenant match'); return spMatch;
    }
  }

  // Pass 3: fuzzy match (last resort)
  var fuzzy = result.data.find(function(c) {
    var nums = buildFullNumber(c.config_encrypted || {});
    var cfgDigits = nums.full.replace(/[^0-9]/g, '');
    return toDigits.endsWith(cfgDigits.slice(-10)) || cfgDigits.endsWith(toDigits.slice(-10));
  });
  if (fuzzy) { console.log('[getVoiceConfig] fuzzy match tenant=' + fuzzy.tenant_id); return fuzzy; }

  console.log('[getVoiceConfig] no match for ' + toNumber);
  return null;
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

async function getAgentName(tenantId) {
  if (!tenantId) return 'Aria';
  try {
    var r = await supabase.from('chatbot_configs').select('bot_name').eq('tenant_id', tenantId).limit(1).maybeSingle();
    var name = r.data && r.data.bot_name ? String(r.data.bot_name).trim() : '';
    return name || 'Aria';
  } catch (e) { return 'Aria'; }
}

// ─── Call AI ──────────────────────────────────────────────────────────────────
async function callAI(userMessage, conversationHistory, chatbotConfig) {
  try {
    var basePrompt = (chatbotConfig && chatbotConfig.system_prompt)
      ? chatbotConfig.system_prompt
      : ('You are ' + ((chatbotConfig && chatbotConfig.bot_name) || 'Aria') + ', a warm and professional AI assistant for EngageWorx — an AI-powered communications platform. You help callers learn about the platform, answer questions about features and pricing, and book demos. Keep responses concise — this is a phone call, so 1-3 sentences maximum. Speak naturally as if in conversation. If someone wants to book a demo or learn more, offer to text them a Calendly booking link. Pricing: SMB plans from $99-499/month. CSP/reseller plans from $499/month. Key features: AI SMS, WhatsApp, Voice, Email, Pipeline CRM, Live Inbox, Sequences, and integrations with Calendly, Typeform, HubSpot and more.');

    var noGreetingRule = '\n\nCRITICAL RULE: The greeting has already been spoken to the caller via TTS before this conversation started. Do NOT greet them again. Do NOT say "hi", "hello", "how can I help you", "how may I assist you", or any similar opening phrase. Respond directly to what the caller said. If the caller greets you with "hi" or "hello", acknowledge briefly and move to substance — for example "Hey — what can I help you with today?" but never repeat the full greeting.';

    var systemPrompt = basePrompt + noGreetingRule;

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
        model: 'claude-haiku-4-5',
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
  var body = req.body || {};
  console.log('🔵 Voice webhook:', { method: req.method, url: req.url, action: req.query.action, to: body.To, from: body.From, callSid: body.CallSid });
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  if (req.method !== 'POST') return res.status(200).end(twiml(say('Method not allowed.') + '<Hangup/>'));

  var action = req.query.action || 'inbound';
  console.log('📞 Voice:', action, 'To:', body.To, 'From:', body.From, 'Speech:', (body.SpeechResult || '').substring(0, 60));

  try {

    // ═══════════════════════════════════════════════════════════════
    // INBOUND — Entry point for all calls
    // ═══════════════════════════════════════════════════════════════
    if (action === 'inbound') {
      var SP_TID = process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387';
      var toNum = body.To || '';
      var voiceConfig = null;
      var config = {};
      var tenantId = null;

      // Force SP tenant for the EngageWorx main number — skip DB lookup entirely
      if (toNum.indexOf('7869827800') > -1) {
        tenantId = SP_TID;
        console.log('[Voice] FORCED SP tenant for EngageWorx number ' + toNum);
        try {
          var spCfg = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', SP_TID).eq('channel', 'voice').eq('enabled', true).maybeSingle();
          if (spCfg.data) config = spCfg.data.config_encrypted || {};
        } catch(e) {}
      } else {
        try {
          voiceConfig = await getVoiceConfig(toNum);
          config = voiceConfig ? (voiceConfig.config_encrypted || {}) : {};
          tenantId = voiceConfig ? (voiceConfig.tenant_id || (voiceConfig.tenant ? voiceConfig.tenant.id : null)) : null;
        } catch(e) { console.warn('Config lookup error:', e.message); }

        if (!tenantId) {
          tenantId = SP_TID;
          try {
            var spCfg2 = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', SP_TID).eq('channel', 'voice').eq('enabled', true).maybeSingle();
            if (spCfg2.data) config = spCfg2.data.config_encrypted || {};
          } catch(e) {}
        }
      }
      console.log('[Voice] resolved tenant=' + tenantId + ' auto_answer=' + (config.auto_answer || 'NOT SET') + ' greeting=' + ((config.during_hours_greeting || config.greeting || '').substring(0, 40) || 'default'));

      var voice = defaultVoiceFor(body.To);
      if (config.tts_voice) { var vm = String(config.tts_voice).match(/Polly\.[\w-]+/); if (vm) voice = vm[0]; }

      var recordingNotice = (String(config.recording_enabled || '').toLowerCase() === 'enabled' && String(config.show_recording_notice || '').toLowerCase() === 'true') ? 'This call may be recorded. ' : '';

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

      // Build URLs. In TwiML, `&` must be `&amp;` — a raw `&` makes Twilio's parser
      // reject the response, which shows up to the caller as a silent disconnect
      // after 1-2 rings. Use absolute URLs for extra safety.
      var portalBase = process.env.PORTAL_URL || 'https://portal.engwx.com';
      var aiUrl = portalBase + '/api/twilio-voice?action=ai-reply&tenant=' + tenantId +
        '&callSid=' + encodeURIComponent(body.CallSid || '') +
        '&from=' + encodeURIComponent(body.From || '') +
        '&to=' + encodeURIComponent(body.To || '');
      var aiUrlXml = aiUrl.replace(/&/g, '&amp;');

      // ── Per-tenant voice behavior flags ──
      var autoAnswer = String(config.auto_answer || '').toLowerCase() === 'enabled';
      var blockAfterHours = String(config.block_after_hours || '').toLowerCase() === 'enabled';
      var ringTimeout = parseInt(config.ring_timeout_seconds, 10);
      if (!ringTimeout || isNaN(ringTimeout) || ringTimeout < 1) ringTimeout = 20;
      var withinHours = isBusinessHours(config);
      console.log('[Voice] tenant=' + tenantId + ' autoAnswer=' + autoAnswer + ' raw=' + config.auto_answer + ' blockAfterHours=' + blockAfterHours + ' withinHours=' + withinHours + ' hasIVR=' + (departments.length > 0 ? departments.map(function(d){return d.name;}).join(',') : 'none') + ' greeting=' + (config.during_hours_greeting || config.greeting || 'default').substring(0, 40));

      var voicemailUrl = portalBase + '/api/twilio-voice?action=voicemail&tenant=' + tenantId;
      var voicemailUrlXml = voicemailUrl.replace(/&/g, '&amp;');

      var sendTwiml = function(xmlBody, label) {
        var response = twiml(xmlBody);
        console.log('[Voice TwiML:' + label + ']', 'to=', body.To, 'from=', body.From, '→', response);
        return res.status(200).end(response);
      };

      // Resolve greeting text — single source of truth from channel_configs only
      var greetingDuring = config.during_hours_greeting || config.greeting || '';
      var greetingAfter = config.after_hours_greeting || '';

      // After-hours → straight to voicemail if blocking is enabled
      if (blockAfterHours && !withinHours) {
        var afterHoursVoice = defaultVoiceFor(body.To);
        var afterHoursText = greetingAfter || 'Thank you for calling. We are currently closed. Please leave a message after the tone.';
        return sendTwiml(
          say(afterHoursText, afterHoursVoice) +
          '<Redirect>' + voicemailUrlXml + '</Redirect>',
          'after-hours-voicemail'
        );
      }

      // Auto-answer disabled → simulate ring then roll to voicemail (no human line to dial in AI-only mode)
      if (!autoAnswer && !hasIVR) {
        // Pause is measured in seconds; cap at 60 so Twilio does not complain.
        var pauseLen = Math.min(Math.max(ringTimeout, 1), 60);
        return sendTwiml(
          '<Pause length="' + pauseLen + '"/>' +
          '<Redirect>' + voicemailUrlXml + '</Redirect>',
          'ring-then-voicemail'
        );
      }

      if (hasIVR && withinHours) {
        // ── IVR mode for tenants with department routing ──
        var menuOptions = departments.filter(function(d) { return d.name; }).map(function(d) {
          return 'Press ' + d.digit + ' ' + (d.description || 'for ' + d.name);
        }).join('. ');
        var ivrBase = greetingDuring || 'Thank you for calling.';
        var ivrPrompt = recordingNotice + ivrBase + ' ' + menuOptions + '. Or stay on the line to speak with us.';

        var routeUrl = portalBase + '/api/twilio-voice?action=route&tenant=' + tenantId;
        return sendTwiml(
          '<Gather numDigits="1" timeout="6" action="' + routeUrl.replace(/&/g, '&amp;') + '" method="POST">' +
          say(ivrPrompt, voice) +
          '</Gather>' +
          // No digit → AI
          gather(aiUrlXml, voice, 'How can I help you today?', 'demo, pricing, help, book, schedule'),
          'ivr'
        );
      }

      // ── AI mode — speak greeting verbatim, then listen for caller ──
      var greeting;
      if (withinHours && greetingDuring) {
        greeting = greetingDuring;
      } else if (!withinHours && greetingAfter) {
        greeting = greetingAfter;
      } else if (greetingDuring) {
        greeting = greetingDuring;
      } else {
        var agentName = await getAgentName(tenantId);
        var businessName = 'EngageWorx';
        try { var tnR = await supabase.from('tenants').select('name, brand_name').eq('id', tenantId).maybeSingle(); if (tnR.data) businessName = tnR.data.brand_name || tnR.data.name || businessName; } catch(e) {}
        greeting = 'Hi, you\'ve reached ' + businessName + '. I\'m ' + agentName + '. How can I help you?';
      }

      // Say greeting verbatim, then silently listen for caller's first utterance
      return sendTwiml(
        say(recordingNotice + greeting, voice) +
        '<Gather input="speech" action="' + aiUrlXml + '" method="POST" speechTimeout="3" timeout="8" language="en-US" hints="demo, pricing, features, book, schedule, Calendly, hello, help">' +
        '</Gather>' +
        '<Redirect>' + aiUrlXml + '</Redirect>',
        'ai-answer'
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // AI-REPLY — Speech received, call AI, respond
    // ═══════════════════════════════════════════════════════════════
    if (action === 'ai-reply') {
      var replyTenantId = req.query.tenant || (process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387');
      var replyCallSid = req.query.callSid || body.CallSid || '';
      var replyFrom = req.query.from || body.From || '';
      var replyTo = req.query.to || body.To || '';
      var speechResult = body.SpeechResult || '';

      // Get TTS voice for this tenant
      var rVc = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', replyTenantId).eq('channel', 'voice').single();
      var rConfig = (rVc.data && rVc.data.config_encrypted) ? rVc.data.config_encrypted : {};
      var rVoice = defaultVoiceFor(replyTo);
      if (rConfig.tts_voice) { var rvm = String(rConfig.tts_voice).match(/Polly\.[\w-]+/); if (rvm) rVoice = rvm[0]; }

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
      var routeVoice = defaultVoiceFor(body.To);
      if (routeConfig.tts_voice) { var rvm2 = String(routeConfig.tts_voice).match(/Polly\.[\w-]+/); if (rvm2) routeVoice = rvm2[0]; }
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
      var dialVoice = defaultVoiceFor(body.To);
      if (dialConfig.tts_voice) { var dvm = String(dialConfig.tts_voice).match(/Polly\.[\w-]+/); if (dvm) dialVoice = dvm[0]; }
      return res.status(200).end(twiml(
        gather(aiUrl3, dialVoice, 'Sorry, that line is unavailable. I\'m ' + (await getAgentName(dialTenantId)) + ', our AI assistant. How can I help you?', 'demo, pricing, help')
      ));
    }

    // ═══════════════════════════════════════════════════════════════
    // VOICEMAIL — Play greeting and record message
    // ═══════════════════════════════════════════════════════════════
    if (action === 'voicemail') {
      var vmInTenantId = req.query.tenant || (process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387');
      var vmInCfg = {};
      try {
        var vmInVc = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', vmInTenantId).eq('channel', 'voice').single();
        vmInCfg = (vmInVc.data && vmInVc.data.config_encrypted) ? vmInVc.data.config_encrypted : {};
      } catch(e) { console.warn('[Voicemail] config lookup:', e.message); }
      var vmInVoice = defaultVoiceFor(body.To);
      if (vmInCfg.tts_voice) { var vmInVm = String(vmInCfg.tts_voice).match(/Polly\.[\w-]+/); if (vmInVm) vmInVoice = vmInVm[0]; }
      // Always have a greeting — fall back hard if the tenant has not configured one
      var vmGreeting = (vmInCfg.voicemail_greeting && String(vmInCfg.voicemail_greeting).trim()) ||
        "You've reached our voicemail. Please leave your name, number, and a short message after the tone, and we'll get back to you shortly.";
      try { await supabase.from('calls').update({ disposition: 'voicemail' }).eq('call_sid', body.CallSid); } catch(e) {}
      var vmPortalBase = process.env.PORTAL_URL || 'https://portal.engwx.com';
      var vmRecordAction = vmPortalBase + '/api/twilio-voice?action=voicemail-complete&tenant=' + vmInTenantId;
      var vmTranscribeCb = vmPortalBase + '/api/twilio-voice?action=transcription&tenant=' + vmInTenantId;
      var vmResponse = twiml(
        say(vmGreeting, vmInVoice) +
        '<Record action="' + vmRecordAction.replace(/&/g, '&amp;') + '"' +
        ' method="POST" maxLength="120" playBeep="true" trim="trim-silence" finishOnKey="#"' +
        ' transcribe="true" transcribeCallback="' + vmTranscribeCb.replace(/&/g, '&amp;') + '"/>' +
        say('We did not receive a recording. Goodbye.', vmInVoice) +
        '<Hangup/>'
      );
      console.log('[Voice TwiML:voicemail]', 'tenant=', vmInTenantId, 'to=', body.To, '→', vmResponse);
      return res.status(200).end(vmResponse);
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
        var vmRecipients = [];
        var sendVmEmail = true;
        if (vmTenantId) {
          var vmVc = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', vmTenantId).eq('channel', 'voice').single();
          var vmCfg = (vmVc.data && vmVc.data.config_encrypted) ? vmVc.data.config_encrypted : {};
          if (vmCfg.send_transcript_email === 'Disabled') sendVmEmail = false;
          if (vmCfg.voicemail_email) {
            String(vmCfg.voicemail_email).split(/[,;]/).map(function(s) { return s.trim(); }).filter(Boolean).forEach(function(e) { if (vmRecipients.indexOf(e) === -1) vmRecipients.push(e); });
          }
          if (String(vmCfg.voicemail_notify_digest || '').toLowerCase() === 'enabled') {
            try {
              var vmT = await supabase.from('tenants').select('digest_email').eq('id', vmTenantId).maybeSingle();
              var digestEmail = vmT.data && vmT.data.digest_email ? String(vmT.data.digest_email).trim() : '';
              if (digestEmail && vmRecipients.indexOf(digestEmail) === -1) vmRecipients.push(digestEmail);
            } catch(e) {}
          }
        }
        if (vmRecipients.length === 0) vmRecipients.push((process.env.PLATFORM_ADMIN_EMAIL || 'rob@engwx.com'));
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
            body: JSON.stringify({ from: 'EngageWorx <hello@engwx.com>', to: vmRecipients, subject: 'New voice message from ' + callerNum, html: vmHtml }),
          });
        }
      } catch(emailErr) { console.error('Voicemail email error:', emailErr.message); }

      return res.status(200).end(twiml(
        say('Thank you for your message. Someone will get back to you shortly. Goodbye.', defaultVoiceFor(body.To)) +
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

        // Omnichannel digest: Claude analysis of transcript → email_actions
        try {
          var callRow = await supabase.from('calls').select('from_number, duration_seconds, recording_url').eq('call_sid', txCallSid).maybeSingle();
          var callerNum = (callRow.data && callRow.data.from_number) || '';
          var durationSec = (callRow.data && callRow.data.duration_seconds) || null;
          var recordingUrl = (callRow.data && callRow.data.recording_url) || null;
          var oi = require('./_omnichannel-insight');
          oi.logInboundInsight({
            supabase: supabase, channel: 'voice',
            senderEmail: null, senderPhone: callerNum,
            senderName: null,
            subject: 'Voicemail from ' + (callerNum || 'Unknown'),
            body: txText,
            extra: { duration: durationSec, recording_url: recordingUrl, call_sid: txCallSid },
          }).catch(function() {});
        } catch (oiErr) { console.warn('[Voice] digest log error:', oiErr.message); }

        try {
          var txRecipients = [];
          var sendTxEmail = true;
          if (txTenantId) {
            var txVc = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', txTenantId).eq('channel', 'voice').single();
            var txCfg = (txVc.data && txVc.data.config_encrypted) ? txVc.data.config_encrypted : {};
            if (txCfg.send_transcript_email === 'Disabled') sendTxEmail = false;
            if (txCfg.voicemail_email) {
              String(txCfg.voicemail_email).split(/[,;]/).map(function(s) { return s.trim(); }).filter(Boolean).forEach(function(e) { if (txRecipients.indexOf(e) === -1) txRecipients.push(e); });
            }
            if (String(txCfg.voicemail_notify_digest || '').toLowerCase() === 'enabled') {
              try {
                var txT = await supabase.from('tenants').select('digest_email').eq('id', txTenantId).maybeSingle();
                var txDigest = txT.data && txT.data.digest_email ? String(txT.data.digest_email).trim() : '';
                if (txDigest && txRecipients.indexOf(txDigest) === -1) txRecipients.push(txDigest);
              } catch(e) {}
            }
          }
          if (txRecipients.length === 0) txRecipients.push((process.env.PLATFORM_ADMIN_EMAIL || 'rob@engwx.com'));
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
              body: JSON.stringify({ from: 'EngageWorx <hello@engwx.com>', to: txRecipients, subject: 'Voice call transcript from ' + txCallerNum, html: txHtml }),
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

      // Usage meter: accumulate voice minutes on call completion
      if (callStatus === 'completed' && body.CallDuration) {
        try {
          var callRow = await supabase.from('calls').select('tenant_id').eq('call_sid', statusCallSid).maybeSingle();
          var vTid = callRow.data && callRow.data.tenant_id;
          if (vTid) {
            var minutes = Math.ceil(parseInt(body.CallDuration) / 60);
            var _vum = require('./_usage-meter');
            _vum.incrementTenantCounter(supabase, vTid, 'voice_minutes_used', minutes);
          }
        } catch (mErr) { console.warn('[Voice] usage meter error:', mErr.message); }
      }
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
