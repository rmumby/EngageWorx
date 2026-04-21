// api/voice.js — Twilio inbound voice webhook handler
// Loads tenant voice config from channel_configs, returns TwiML.

var { createClient } = require('@supabase/supabase-js');

var SP_TENANT_ID = process.env.SP_TENANT_ID || process.env.REACT_APP_SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387';

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  var body = req.body || {};
  var from = body.From || body.from || '';
  var to = body.To || body.to || '';
  var callSid = body.CallSid || body.callSid || '';
  var speechResult = body.SpeechResult || '';

  console.log('[voice] from=' + from + ' to=' + to + ' callSid=' + callSid + (speechResult ? ' speech="' + speechResult.slice(0, 80) + '"' : ''));

  var supabase = getSupabase();

  // Load voice config for the tenant
  var voice = 'Polly.Joanna-Neural';
  var language = 'en-US';
  var greeting = 'Thank you for calling. How can I help you today?';
  var vmGreeting = 'No one is available right now. Please leave a message after the tone.';
  var agentName = 'Aria';
  var businessName = 'EngageWorx';

  try {
    // Try matching tenant by the To number
    var tenantId = SP_TENANT_ID;
    var cfgR = await supabase.from('channel_configs').select('tenant_id, config_encrypted')
      .eq('channel', 'voice').eq('enabled', true);
    if (cfgR.data) {
      for (var i = 0; i < cfgR.data.length; i++) {
        var cfg = cfgR.data[i];
        var ce = cfg.config_encrypted || {};
        if (ce.phone_number && to && to.indexOf(ce.phone_number.replace(/[^0-9+]/g, '')) > -1) {
          tenantId = cfg.tenant_id;
          break;
        }
      }
    }

    // Load the matched tenant's voice config
    var vcR = await supabase.from('channel_configs').select('config_encrypted')
      .eq('tenant_id', tenantId).eq('channel', 'voice').maybeSingle();
    if (vcR.data && vcR.data.config_encrypted) {
      var c = vcR.data.config_encrypted;
      if (c.tts_voice) voice = c.tts_voice;
      if (c.tts_language) language = c.tts_language;
      if (c.during_hours_greeting) greeting = c.during_hours_greeting;
      if (c.voicemail_greeting) vmGreeting = c.voicemail_greeting;
    }

    // Load bot name and business name
    try {
      var cbR = await supabase.from('chatbot_configs').select('bot_name').eq('tenant_id', tenantId).maybeSingle();
      if (cbR.data && cbR.data.bot_name) agentName = cbR.data.bot_name;
    } catch (e) {}
    try {
      var tnR = await supabase.from('tenants').select('name, brand_name').eq('id', tenantId).maybeSingle();
      if (tnR.data) businessName = tnR.data.brand_name || tnR.data.name || businessName;
    } catch (e) {}
  } catch (e) {
    console.warn('[voice] config load error:', e.message);
  }

  // If caller spoke (Gather result) → generate AI response
  if (speechResult) {
    var aiReply = '';
    try {
      if (process.env.ANTHROPIC_API_KEY) {
        var system = 'You are ' + agentName + ', a helpful AI phone assistant for ' + businessName + '. ' +
          'Keep responses under 3 sentences. Be warm and professional. ' +
          'If you cannot help, offer to take a message or transfer to a human.';
        var r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 150, system: system, messages: [{ role: 'user', content: speechResult }] }),
        });
        var d = await r.json();
        var txt = (d.content || []).find(function(b) { return b.type === 'text'; });
        if (txt) aiReply = txt.text.trim();
      }
    } catch (e) { console.warn('[voice] AI error:', e.message); }

    if (!aiReply) aiReply = 'I appreciate your call. Let me connect you with someone who can help.';

    // Respond with AI answer, then gather again for follow-up
    var twiml = '<?xml version="1.0" encoding="UTF-8"?><Response>' +
      '<Say voice="' + esc(voice) + '" language="' + esc(language) + '">' + esc(aiReply) + '</Say>' +
      '<Pause length="1"/>' +
      '<Gather input="speech" speechTimeout="3" timeout="5" action="/api/voice" method="POST">' +
        '<Say voice="' + esc(voice) + '" language="' + esc(language) + '">Is there anything else I can help with?</Say>' +
      '</Gather>' +
      '<Say voice="' + esc(voice) + '" language="' + esc(language) + '">' + esc(vmGreeting) + '</Say>' +
      '<Record maxLength="120" transcribe="true" playBeep="true" />' +
    '</Response>';
    return res.status(200).end(twiml);
  }

  // Initial greeting with speech gather
  var twiml = '<?xml version="1.0" encoding="UTF-8"?><Response>' +
    '<Gather input="speech" speechTimeout="3" timeout="8" action="/api/voice" method="POST">' +
      '<Say voice="' + esc(voice) + '" language="' + esc(language) + '">' + esc(greeting) + '</Say>' +
    '</Gather>' +
    '<Say voice="' + esc(voice) + '" language="' + esc(language) + '">' + esc(vmGreeting) + '</Say>' +
    '<Record maxLength="120" transcribe="true" playBeep="true" />' +
  '</Response>';

  return res.status(200).end(twiml);
};
