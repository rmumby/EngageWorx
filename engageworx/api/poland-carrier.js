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

// Normalize any Polish number format to E.164 +48XXXXXXXXX. Defensively strips
// SIP URI prefixes ('sip:', 'tel:') and any leading characters before the first
// '+' or digit — Twilio SIP trunks sometimes deliver the called party as
// 'sip:+48732080851@example.com' or '<tel:+48732…>'.
function normalizePL(raw) {
  if (!raw) return '';
  var s = String(raw).trim();
  s = s.replace(/^<+|>+$/g, '');                 // strip angle brackets
  s = s.replace(/^(sip:|tel:)/i, '');            // strip URI scheme
  s = s.split('@')[0];                            // strip SIP host part
  s = s.replace(/[\s\-\(\)]/g, '');
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

// smscloud.io requires a specific shape: JSON array body, X-Access-Token header,
// number as an array, no + prefix on phone numbers.
function isSmsCloud(endpoint) { return /smscloud\.io/i.test(endpoint || ''); }
function plDigits(n) { return String(n || '').replace(/[^0-9]/g, ''); }

async function sendViaSmsCloudGet(cfg, to, body) {
  // smscloud GET API. Manual encodeURIComponent on every param — URLSearchParams
  // uses x-www-form-urlencoded which encodes ' ' as '+', and a literal '+' in the
  // token would then be decoded server-side as a space. encodeURIComponent
  // encodes '+' as %2B (safe) and ' ' as %20 (also safe).
  var senderID = (cfg.carrier_name || 'EngageWorx').substring(0, 11);
  var token   = encodeURIComponent(cfg.api_key || '');
  var phone   = encodeURIComponent(plDigits(to));
  var text    = encodeURIComponent(body || '');
  var sender  = encodeURIComponent(senderID);
  var url = 'http://api.smscloud.io/send?token=' + token + '&phone=' + phone + '&text=' + text + '&senderID=' + sender;
  var r = await fetch(url, { method: 'GET' });
  var raw = await r.text();
  var parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) {}
  return { ok: r.ok, status: r.status, body: parsed || raw, raw: raw, transport: 'smscloud_get' };
}

function smsCloudUnavailable(restResult) {
  if (!restResult) return false;
  var s = (typeof restResult.body === 'string' ? restResult.body : JSON.stringify(restResult.body || '')).toLowerCase();
  if (s.indexOf('rest api is not available') !== -1) return true;
  if (s.indexOf('rest api not available') !== -1) return true;
  if (s.indexOf('rest is not available') !== -1) return true;
  // Also fall back when REST returns a 4xx with no useful payload — keeps testing unblocked.
  if (restResult.status === 400 && (!restResult.body || s === '' || s === '{}')) return true;
  return false;
}

async function sendViaSmsCloudRest(cfg, to, body) {
  // Kept for the day smscloud enables REST on this account. Set cfg.api_secret
  // to the literal string "use_rest" (or any truthy value) to prefer it.
  var senderID = (cfg.carrier_name || 'EngageWorx').substring(0, 11);
  var payload = [{
    number: [plDigits(to)],
    senderID: senderID,
    text: body,
    type: 'sms',
    delivery: false,
  }];
  var r = await fetch(cfg.outbound_endpoint, {
    method: 'POST',
    headers: {
      'X-Access-Token': cfg.api_key || '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  var raw = await r.text();
  var parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) {}
  return { ok: r.ok, status: r.status, body: parsed || raw, raw: raw, transport: 'smscloud_rest' };
}

// Default smscloud transport: GET API. REST is a tested-but-disabled alternative.
async function sendViaSmsCloud(cfg, to, body) {
  // Power-user toggle: if api_secret contains 'use_rest', try REST first and fall
  // back to GET on the documented "REST API is not available" error.
  if (cfg.api_secret && /use[_\s-]?rest/i.test(cfg.api_secret)) {
    var restResult = await sendViaSmsCloudRest(cfg, to, body);
    if (restResult.ok || !smsCloudUnavailable(restResult)) return restResult;
    console.warn('[Poland/smscloud] REST API unavailable (HTTP ' + restResult.status + '), falling back to GET API');
    var fallback = await sendViaSmsCloudGet(cfg, to, body);
    fallback.fallback_reason = 'rest_api_unavailable';
    fallback.rest_attempt = { status: restResult.status, body: restResult.body };
    return fallback;
  }
  // Default path
  return await sendViaSmsCloudGet(cfg, to, body);
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
      // Auto-detect smscloud.io and use their required JSON-array shape + X-Access-Token header
      if (isSmsCloud(cfg.outbound_endpoint)) {
        return await sendViaSmsCloud(cfg, to, body);
      }
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

  // Top-of-handler log so every Twilio webhook hit is visible in Vercel function logs.
  // Twilio sends form-encoded; req.body keys are PascalCase (From, To, CallSid, etc.).
  try {
    var probeBody = req.body || {};
    var keys = Object.keys(probeBody).slice(0, 10);
    console.log('[Poland] HIT', req.method, 'action=' + action,
      'From=' + (probeBody.From || probeBody.from || ''),
      'To=' + (probeBody.To || probeBody.to || ''),
      'CallSid=' + (probeBody.CallSid || ''),
      'body_keys=' + JSON.stringify(keys));
  } catch (e) {}

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
      var vFrom = vBody.From || vBody.from || vBody.caller || '';
      var vCallSid = vBody.CallSid || vBody.callSid || ('poland-' + Date.now());
      var vCfg = await matchTenantByNumber(supabase, vTo);
      console.log('[Poland/voice] To=' + vTo, 'normalized=' + normalizePL(vTo), 'From=' + vFrom, 'CallSid=' + vCallSid, 'tenant_match=' + (vCfg ? vCfg.tenant_id : 'NONE'));

      // Persist the call so Live Inbox shows it. Skip silently if no tenant matched
      // (we still return TwiML so Twilio doesn't disconnect the caller mid-ring).
      if (vCfg) {
        try {
          var fromNorm = normalizePL(vFrom);
          var contactId = await ensureContact(supabase, vCfg.tenant_id, fromNorm);
          var conversationId = contactId ? await ensureConversation(supabase, vCfg.tenant_id, contactId, 'voice') : null;
          if (conversationId) {
            await supabase.from('messages').insert({
              tenant_id: vCfg.tenant_id, conversation_id: conversationId, contact_id: contactId,
              channel: 'voice', direction: 'inbound', sender_type: 'contact',
              body: '📞 Inbound call from ' + fromNorm + ' (Polish IVR played)',
              status: 'delivered',
              metadata: { from: fromNorm, to: normalizePL(vTo), country: 'PL', call_sid: vCallSid, ivr: 'pl_default' },
              created_at: new Date().toISOString(),
            });
            await supabase.from('conversations').update({ last_message_at: new Date().toISOString(), unread_count: 1 }).eq('id', conversationId);
          }
          // Also record in calls table if it exists (CDR-style); failure is non-fatal.
          try {
            await supabase.from('calls').insert({
              tenant_id: vCfg.tenant_id, call_sid: vCallSid, from_number: fromNorm, to_number: normalizePL(vTo),
              direction: 'inbound', status: 'ringing', started_at: new Date().toISOString(),
            });
          } catch (callsErr) { console.warn('[Poland/voice] calls insert skipped:', callsErr.message); }
          console.log('[Poland/voice] persisted contact=' + contactId, 'conversation=' + conversationId);
        } catch (persistErr) {
          console.error('[Poland/voice] persist failed:', persistErr.message, persistErr.stack);
        }
      } else {
        console.warn('[Poland/voice] no tenant match for To=' + vTo + ' (normalized ' + normalizePL(vTo) + ') — call will get generic IVR but nothing logged. Check poland_carrier_configs.phone_number for an exact match.');
      }

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
      console.log('[Poland/voice] TwiML returned, length=' + twiml.length);
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
      var cfg = tc.data;

      try {
        // smscloud.io: send a real-format probe so we can see auth/format response
        if (cfg.carrier_type === 'http_webhook' && isSmsCloud(cfg.outbound_endpoint)) {
          if (!cfg.api_key) return res.status(200).json({ ok: false, msg: 'smscloud.io requires api_key (used as token query param)' });
          var to = plDigits(cfg.phone_number) || '48000000000';
          var probe = await sendViaSmsCloud(cfg, to, 'EngageWorx connection test — please ignore.');
          var transport = probe.transport || 'smscloud_get';
          var msg = probe.ok
            ? '✓ smscloud.io accepted the request via ' + transport + ' (HTTP ' + probe.status + ')'
            : '✗ smscloud.io rejected the request via ' + transport + ' (HTTP ' + probe.status + ')';
          var summary = transport === 'smscloud_rest'
            ? { method: 'POST', url: cfg.outbound_endpoint, header: 'X-Access-Token', body_shape: '[{ number: [...], senderID, text, type, delivery }]' }
            : { method: 'GET', url: 'http://api.smscloud.io/send', query_params: ['token (encodeURIComponent)', 'phone (digits only, no +)', 'text (encodeURIComponent — preserves +, diacritics, line breaks)', 'senderID (encodeURIComponent)'], note: 'Default transport. Set api_secret = "use_rest" to prefer REST API once your account has it enabled.' };
          return res.status(200).json({
            ok: probe.ok,
            msg: msg,
            http_status: probe.status,
            transport: transport,
            response_body: probe.body,
            rest_attempt: probe.rest_attempt || null,
            request_summary: summary,
          });
        }
        // Twilio SIP: hit the Messages endpoint with HEAD-equivalent auth check via account fetch
        if (cfg.carrier_type === 'twilio_sip') {
          if (!cfg.api_key || !cfg.api_secret) return res.status(200).json({ ok: false, msg: 'Twilio needs api_key (Account SID) and api_secret (Auth Token)' });
          var twProbe = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + cfg.api_key + '.json', {
            headers: { 'Authorization': 'Basic ' + Buffer.from(cfg.api_key + ':' + cfg.api_secret).toString('base64') },
          });
          var twJson = await twProbe.json().catch(function() { return null; });
          return res.status(200).json({
            ok: twProbe.ok,
            msg: twProbe.ok ? '✓ Twilio credentials valid · account: ' + (twJson && twJson.friendly_name) : '✗ Twilio rejected credentials (HTTP ' + twProbe.status + ')',
            http_status: twProbe.status,
            response_body: twJson,
          });
        }
        // Generic http_webhook fallback: actual probe POST
        if (cfg.carrier_type === 'http_webhook') {
          if (!cfg.outbound_endpoint) return res.status(200).json({ ok: false, msg: 'outbound_endpoint is empty — cannot verify' });
          var headers = { 'Content-Type': 'application/json' };
          if (cfg.api_key) headers['Authorization'] = 'Bearer ' + cfg.api_key;
          if (cfg.username && cfg.password) headers['Authorization'] = 'Basic ' + Buffer.from(cfg.username + ':' + cfg.password).toString('base64');
          var gprobe = await fetch(cfg.outbound_endpoint, {
            method: 'POST', headers: headers,
            body: JSON.stringify({ to: cfg.phone_number, from: cfg.phone_number, body: 'EngageWorx connection test', test: true }),
          });
          var gtxt = await gprobe.text().catch(function() { return ''; });
          var gparsed = null; try { gparsed = JSON.parse(gtxt); } catch (e) {}
          return res.status(200).json({
            ok: gprobe.ok,
            msg: 'Endpoint responded with HTTP ' + gprobe.status,
            http_status: gprobe.status,
            response_body: gparsed || gtxt,
          });
        }
        // SMPP/SIP — no synchronous test possible without a worker
        return res.status(200).json({ ok: false, msg: 'No synchronous test for ' + cfg.carrier_type + ' — verify by sending a real message via your worker' });
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
