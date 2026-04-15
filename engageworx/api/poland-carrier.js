// api/poland-carrier.js — Polish carrier integration (SMS + voice)
// Actions:
//   GET/POST ?action=sms-inbound   — carrier POSTs incoming SMS
//   POST     ?action=sms-outbound  — platform sends outbound SMS via carrier API
//   POST     ?action=voice-inbound — carrier POSTs (or Twilio relays) inbound call → returns TwiML with Polish IVR
//   POST     ?action=test-connection — sanity check carrier credentials
//
// Each tenant's Polish number lives in public.poland_carrier_configs and is looked up by
// the destination phone number on the inbound webhook. No hardcoded tenant ids — always
// derive from the config row matching the inbound "To" number.

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function escapeXml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Normalize any Polish number format to E.164 +48XXXXXXXXX
function normalizePL(raw) {
  if (!raw) return '';
  var s = String(raw).replace(/[\s\-\(\)]/g, '');
  if (s.indexOf('+') === 0) return s;
  if (s.indexOf('48') === 0 && s.length === 11) return '+' + s;
  if (s.length === 9) return '+48' + s;
  return s;
}

// Light language heuristic — Polish diacritics or common Polish stopwords → 'pl', else 'en'.
function detectLanguage(text) {
  if (!text) return 'en';
  var t = String(text).toLowerCase();
  if (/[ąćęłńóśźż]/.test(t)) return 'pl';
  var plStopwords = [' jest ', ' nie ', ' tak ', ' proszę ', ' dzień dobry', ' dziękuj', ' witam', ' zgłoszenie', ' wsparcie', ' pomoc '];
  for (var i = 0; i < plStopwords.length; i++) { if (t.indexOf(plStopwords[i]) !== -1) return 'pl'; }
  return 'en';
}

async function matchTenantByNumber(supabase, toNumber) {
  var normalized = normalizePL(toNumber);
  try {
    var r = await supabase.from('poland_carrier_configs').select('*').eq('phone_number', normalized).eq('enabled', true).maybeSingle();
    if (r.data) return r.data;
    // Also try un-normalised in case the config was saved raw
    r = await supabase.from('poland_carrier_configs').select('*').eq('phone_number', toNumber).eq('enabled', true).maybeSingle();
    return r.data || null;
  } catch (e) { return null; }
}

async function ensureContact(supabase, tenantId, fromNumber) {
  var phone = normalizePL(fromNumber);
  try {
    var r = await supabase.from('contacts').select('id').eq('tenant_id', tenantId).eq('phone', phone).limit(1).maybeSingle();
    if (r.data) return r.data.id;
    var ins = await supabase.from('contacts').insert({
      tenant_id: tenantId, phone: phone, first_name: phone, status: 'active',
      source: 'poland_sms', channel_preference: 'sms',
    }).select('id').single();
    return ins.data ? ins.data.id : null;
  } catch (e) { return null; }
}

async function ensureConversation(supabase, tenantId, contactId, channel) {
  try {
    var r = await supabase.from('conversations').select('id').eq('tenant_id', tenantId).eq('contact_id', contactId).eq('channel', channel).in('status', ['active', 'waiting']).limit(1).maybeSingle();
    if (r.data) return r.data.id;
    var ins = await supabase.from('conversations').insert({
      tenant_id: tenantId, contact_id: contactId, channel: channel, status: 'waiting',
      last_message_at: new Date().toISOString(), unread_count: 1,
      metadata: { country: 'PL' },
    }).select('id').single();
    return ins.data ? ins.data.id : null;
  } catch (e) { return null; }
}

// ── AI reply in detected language ────────────────────────────────────────────
async function aiReplyForSms(tenantId, lang, body) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  var system = lang === 'pl'
    ? 'Jesteś asystentem AI dla polskiej firmy. Odpowiadaj zwięźle po polsku (max 160 znaków). Zachowaj profesjonalny ton. Zakończ informacją STOP aby się wypisać.'
    : 'You are an AI assistant. Reply briefly in English (max 160 chars). End with "Reply STOP to unsubscribe".';
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 200, system: system, messages: [{ role: 'user', content: body }] }),
    });
    var d = await r.json();
    var txt = (d.content || []).find(function(b) { return b.type === 'text'; });
    return txt ? txt.text.trim() : null;
  } catch (e) { return null; }
}

// Send via carrier (per-config carrier_type dispatches to a different transport)
async function sendOutboundSms(cfg, to, body) {
  try {
    // Twilio SIP trunk → Programmable Messaging API.
    // Credential layout in poland_carrier_configs:
    //   api_key    = Twilio Account SID  (ACxxxxxxxx…)
    //   api_secret = Twilio Auth Token
    //   outbound_endpoint = optional override; defaults to standard Twilio Messages endpoint.
    if (cfg.carrier_type === 'twilio_sip') {
      var sid = cfg.api_key;
      var token = cfg.api_secret;
      if (!sid || !token) return { ok: false, error: 'twilio_sip needs api_key (Account SID) and api_secret (Auth Token)' };
      var url = cfg.outbound_endpoint || ('https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json');
      var params = new URLSearchParams();
      params.append('To', to);
      params.append('From', cfg.phone_number);
      params.append('Body', body);
      var twr = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(sid + ':' + token).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      var twData = await twr.json().catch(function() { return null; });
      return { ok: twr.ok, status: twr.status, sid: twData && twData.sid, body: twData };
    }
    if (cfg.carrier_type === 'http_webhook') {
      var payload = { to: to, body: body, from: cfg.phone_number };
      var headers = { 'Content-Type': 'application/json' };
      if (cfg.api_key) headers['Authorization'] = 'Bearer ' + cfg.api_key;
      if (cfg.username && cfg.password) headers['Authorization'] = 'Basic ' + Buffer.from(cfg.username + ':' + cfg.password).toString('base64');
      var r = await fetch(cfg.outbound_endpoint, { method: 'POST', headers: headers, body: JSON.stringify(payload) });
      return { ok: r.ok, status: r.status, body: await r.text().catch(function() { return ''; }) };
    }
    if (cfg.carrier_type === 'direct_smpp' || cfg.carrier_type === 'direct_sip') {
      // SMPP/SIP require persistent connections — proxy out to a worker service URL configured in outbound_endpoint.
      var smPayload = { to: to, body: body, from: cfg.phone_number };
      var r2 = await fetch(cfg.outbound_endpoint || '', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.api_key || '' }, body: JSON.stringify(smPayload) });
      return { ok: r2.ok, status: r2.status, body: await r2.text().catch(function() { return ''; }) };
    }
  } catch (e) { return { ok: false, error: e.message }; }
  return { ok: false, error: 'carrier_type not implemented: ' + cfg.carrier_type };
}

// ── Main handler ─────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  var action = (req.query && req.query.action) || (req.body && req.body.action) || 'sms-inbound';
  var supabase = getSupabase();

  try {
    // ── INBOUND SMS ────────────────────────────────────────────────────────
    if (action === 'sms-inbound') {
      var body = req.body || {};
      // Twilio sends application/x-www-form-urlencoded — Vercel parses it into req.body
      // when Content-Type is correct. Detect Twilio by the presence of MessageSid/AccountSid.
      var isTwilio = !!(body.MessageSid || body.AccountSid || body.SmsMessageSid);

      // Carrier-agnostic field extraction (Twilio + generic webhook)
      var from = body.from || body.From || body.msisdn || body.sender || '';
      var to = body.to || body.To || body.recipient || body.destination || '';
      var text = body.text || body.Body || body.message || body.content || '';

      function twilioReply(xml) {
        res.setHeader('Content-Type', 'text/xml; charset=utf-8');
        return res.status(200).end('<?xml version="1.0" encoding="UTF-8"?><Response>' + (xml || '') + '</Response>');
      }

      var cfg = await matchTenantByNumber(supabase, to);
      if (!cfg) {
        console.warn('[Poland] no tenant matched for to:', to);
        if (isTwilio) return twilioReply('');
        return res.status(200).json({ skipped: 'no_tenant', to: to });
      }
      // If config is twilio_sip but the inbound request isn't from Twilio (or vice versa),
      // log it but continue — useful during testing across both transports.
      if (cfg.carrier_type === 'twilio_sip' && !isTwilio) {
        console.warn('[Poland] cfg expects Twilio but no MessageSid in payload — proceeding anyway');
      }

      var contactId = await ensureContact(supabase, cfg.tenant_id, from);
      var conversationId = contactId ? await ensureConversation(supabase, cfg.tenant_id, contactId, 'sms') : null;
      var lang = detectLanguage(text);

      if (conversationId) {
        await supabase.from('messages').insert({
          tenant_id: cfg.tenant_id, conversation_id: conversationId, contact_id: contactId,
          channel: 'sms', direction: 'inbound', sender_type: 'contact',
          body: text, status: 'delivered',
          metadata: { from: normalizePL(from), to: normalizePL(to), country: 'PL', language: lang },
          created_at: new Date().toISOString(),
        });
        await supabase.from('conversations').update({ last_message_at: new Date().toISOString(), unread_count: 1 }).eq('id', conversationId);
      }

      // AI auto-reply in detected language
      var reply = await aiReplyForSms(cfg.tenant_id, lang, text);
      if (reply) {
        var sent = await sendOutboundSms(cfg, normalizePL(from), reply);
        if (sent.ok && conversationId) {
          await supabase.from('messages').insert({
            tenant_id: cfg.tenant_id, conversation_id: conversationId, contact_id: contactId,
            channel: 'sms', direction: 'outbound', sender_type: 'bot',
            body: reply, status: 'sent',
            metadata: { to: normalizePL(from), language: lang, auto_reply: true },
            created_at: new Date().toISOString(),
          });
        }
      }

      // Twilio expects a TwiML response (empty <Response/> is fine since we send the AI reply
      // out-of-band via the Twilio Messages API in sendOutboundSms).
      if (isTwilio) return twilioReply('');
      return res.status(200).json({ success: true, language: lang, conversation_id: conversationId });
    }

    // ── OUTBOUND SMS (platform → Polish number) ────────────────────────────
    if (action === 'sms-outbound') {
      var ob = req.body || {};
      var tenantId = ob.tenant_id;
      if (!tenantId || !ob.to || !ob.body) return res.status(400).json({ error: 'tenant_id, to, body required' });
      var cfgRes = await supabase.from('poland_carrier_configs').select('*').eq('tenant_id', tenantId).eq('enabled', true).limit(1).maybeSingle();
      if (!cfgRes.data) return res.status(400).json({ error: 'no active Poland carrier config for tenant' });
      var sendRes = await sendOutboundSms(cfgRes.data, normalizePL(ob.to), ob.body);
      return res.status(sendRes.ok ? 200 : 400).json(sendRes);
    }

    // ── INBOUND VOICE (Polish IVR) ─────────────────────────────────────────
    if (action === 'voice-inbound') {
      var vBody = req.body || {};
      var vTo = vBody.To || vBody.to || vBody.destination || '';
      var vCfg = await matchTenantByNumber(supabase, vTo);

      var voice = 'Polly.Ewa-Neural'; // Polish female
      var greeting = 'Witamy. Naciśnij 1 dla wsparcia technicznego. Naciśnij 2 aby sprawdzić status zgłoszenia. Naciśnij 3 aby rozmawiać z konsultantem.';
      var portalBase = process.env.PORTAL_URL || 'https://portal.engwx.com';
      var routeUrl = portalBase + '/api/poland-carrier?action=voice-route';
      if (vCfg) routeUrl += '&tenant=' + vCfg.tenant_id;

      var twiml = '<?xml version="1.0" encoding="UTF-8"?><Response>' +
        '<Gather numDigits="1" timeout="8" action="' + escapeXml(routeUrl).replace(/&/g, '&amp;') + '" method="POST" language="pl-PL">' +
          '<Say voice="' + voice + '" language="pl-PL">' + escapeXml(greeting) + '</Say>' +
        '</Gather>' +
        '<Say voice="' + voice + '" language="pl-PL">Nie otrzymaliśmy odpowiedzi. Do widzenia.</Say>' +
        '<Hangup/>' +
      '</Response>';
      res.setHeader('Content-Type', 'text/xml; charset=utf-8');
      return res.status(200).end(twiml);
    }

    // ── VOICE ROUTE (IVR digit dispatch) ───────────────────────────────────
    if (action === 'voice-route') {
      var d = req.body || {};
      var digit = d.Digits;
      var routeVoice = 'Polly.Ewa-Neural';
      var msg = 'Przepraszamy, opcja jest niedostępna.';
      if (digit === '1') msg = 'Łączymy z zespołem wsparcia technicznego. Proszę czekać.';
      else if (digit === '2') msg = 'Łączymy z zespołem statusu zgłoszeń. Proszę czekać.';
      else if (digit === '3') msg = 'Łączymy z konsultantem. Proszę czekać.';
      var xml = '<?xml version="1.0" encoding="UTF-8"?><Response>' +
        '<Say voice="' + routeVoice + '" language="pl-PL">' + escapeXml(msg) + '</Say>' +
        '<Hangup/>' +
      '</Response>';
      res.setHeader('Content-Type', 'text/xml; charset=utf-8');
      return res.status(200).end(xml);
    }

    // ── TEST CONNECTION ────────────────────────────────────────────────────
    if (action === 'test-connection') {
      var tb = req.body || {};
      if (!tb.tenant_id) return res.status(400).json({ error: 'tenant_id required' });
      var tc = await supabase.from('poland_carrier_configs').select('*').eq('tenant_id', tb.tenant_id).eq('enabled', true).limit(1).maybeSingle();
      if (!tc.data) return res.status(200).json({ ok: false, msg: 'No active Poland config for this tenant' });
      if (!tc.data.outbound_endpoint) return res.status(200).json({ ok: false, msg: 'outbound_endpoint is empty — cannot verify' });
      try {
        var probe = await fetch(tc.data.outbound_endpoint, { method: 'HEAD' });
        return res.status(200).json({ ok: probe.status < 500, msg: 'Endpoint responded with HTTP ' + probe.status });
      } catch (e) {
        return res.status(200).json({ ok: false, msg: 'Probe failed: ' + e.message });
      }
    }

    return res.status(400).json({ error: 'unknown action', action: action });
  } catch (err) {
    console.error('[Poland] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
