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
  s = s.replace(/^00/, '+');                      // international dial prefix 0048… → +48…
  if (s.indexOf('+') === 0) return s;
  if (s.indexOf('48') === 0 && s.length >= 11) return '+' + s;
  if (s.length === 9) return '+48' + s;
  // Non-Polish international numbers without + (e.g. 447585610028 → +447585610028)
  if (/^\d{10,15}$/.test(s)) return '+' + s;
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
  var withoutPlus = normalized.indexOf('+') === 0 ? normalized.slice(1) : normalized;
  console.log('[matchTenant] raw=' + toNumber + ' normalized=' + normalized + ' withoutPlus=' + withoutPlus);
  try {
    // Try 1: normalized (+48732080851)
    var r = await supabase.from('poland_carrier_configs').select('*').eq('phone_number', normalized).eq('enabled', true).maybeSingle();
    console.log('[matchTenant] try1 phone_number=' + normalized + ' found=' + !!r.data + (r.error ? ' err=' + r.error.message : ''));
    if (r.data) return r.data;
    // Try 2: without + (48732080851)
    r = await supabase.from('poland_carrier_configs').select('*').eq('phone_number', withoutPlus).eq('enabled', true).maybeSingle();
    console.log('[matchTenant] try2 phone_number=' + withoutPlus + ' found=' + !!r.data + (r.error ? ' err=' + r.error.message : ''));
    if (r.data) return r.data;
    // Try 3: raw input
    if (toNumber !== normalized && toNumber !== withoutPlus) {
      r = await supabase.from('poland_carrier_configs').select('*').eq('phone_number', toNumber).eq('enabled', true).maybeSingle();
      console.log('[matchTenant] try3 phone_number=' + toNumber + ' found=' + !!r.data + (r.error ? ' err=' + r.error.message : ''));
      return r.data || null;
    }
    // Try 4: any row for this number ignoring enabled flag
    r = await supabase.from('poland_carrier_configs').select('*').eq('phone_number', normalized).maybeSingle();
    console.log('[matchTenant] try4 (ignore enabled) phone_number=' + normalized + ' found=' + !!r.data + (r.data ? ' enabled=' + r.data.enabled + ' tenant=' + r.data.tenant_id : ''));
    if (r.data && !r.data.enabled) console.warn('[matchTenant] CONFIG EXISTS but enabled=false!');
    return null;
  } catch (e) { console.error('[matchTenant] error:', e.message); return null; }
}

async function ensureContact(supabase, tenantId, fromNumber) {
  var phone = normalizePL(fromNumber);
  try {
    var r = await supabase.from('contacts').select('id').eq('tenant_id', tenantId).eq('phone', phone).limit(1).maybeSingle();
    if (r.data) { console.error('[ensureContact] found existing:', r.data.id); return r.data.id; }
    if (r.error) console.error('[ensureContact] select error:', r.error.message);
    var payload = { tenant_id: tenantId, phone: phone, first_name: phone, status: 'active', source: 'poland_sms', channel_preference: 'sms' };
    console.error('[ensureContact] inserting:', JSON.stringify(payload));
    var ins = await supabase.from('contacts').insert(payload).select('id').single();
    if (ins.error) console.error('[ensureContact] INSERT ERROR:', ins.error.message, ins.error.details, ins.error.hint);
    console.error('[ensureContact] insert result:', ins.data ? ins.data.id : 'null');
    return ins.data ? ins.data.id : null;
  } catch (e) { console.error('[ensureContact] EXCEPTION:', e.message); return null; }
}

async function ensureConversation(supabase, tenantId, contactId, channel) {
  try {
    var r = await supabase.from('conversations').select('id').eq('tenant_id', tenantId).eq('contact_id', contactId).eq('channel', channel).in('status', ['active', 'waiting']).limit(1).maybeSingle();
    if (r.data) { console.error('[ensureConv] found existing:', r.data.id); return r.data.id; }
    if (r.error) console.error('[ensureConv] select error:', r.error.message);
    var payload = {
      tenant_id: tenantId, contact_id: contactId, channel: channel, status: 'active',
      last_message_at: new Date().toISOString(), unread_count: 1,
    };
    console.error('[ensureConv] inserting:', JSON.stringify(payload));
    var ins = await supabase.from('conversations').insert(payload).select('id').single();
    if (ins.error) console.error('[ensureConv] INSERT ERROR:', ins.error.message, ins.error.details, ins.error.hint);
    console.error('[ensureConv] insert result:', ins.data ? ins.data.id : 'null');
    return ins.data ? ins.data.id : null;
  } catch (e) { console.error('[ensureConv] EXCEPTION:', e.message); return null; }
}

// ── AI reply in detected language ────────────────────────────────────────────
async function aiReplyForSms(supabase, tenantId, lang, body) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  // Load tenant chatbot config for personalized replies
  var botName = 'Aria';
  var businessName = 'EngageWorx';
  var knowledgeBase = '';
  try {
    var cb = await supabase.from('chatbot_configs').select('bot_name, system_prompt, knowledge_base').eq('tenant_id', tenantId).maybeSingle();
    if (cb.data) {
      botName = cb.data.bot_name || botName;
      knowledgeBase = cb.data.knowledge_base || '';
    }
    var tn = await supabase.from('tenants').select('name, brand_name').eq('id', tenantId).maybeSingle();
    if (tn.data) businessName = tn.data.brand_name || tn.data.name || businessName;
  } catch (e) {}
  var system = lang === 'pl'
    ? 'Jesteś ' + botName + ', asystentem AI firmy ' + businessName + '. Odpowiadaj zwięźle po polsku (max 160 znaków). Zachowaj profesjonalny ton.'
    : 'You are ' + botName + ', AI assistant for ' + businessName + '. Reply briefly in English (max 160 chars). Be helpful and professional.';
  if (knowledgeBase) system += '\n\nBusiness context:\n' + knowledgeBase.substring(0, 500);
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 200, system: system, messages: [{ role: 'user', content: body }] }),
    });
    var d = await r.json();
    var txt = (d.content || []).find(function(b) { return b.type === 'text'; });
    return txt ? txt.text.trim() : null;
  } catch (e) { console.error('[aiReplyForSms] error:', e.message); return null; }
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
    if (cfg.carrier_type === 'direct_smpp') {
      // SMPP requires a persistent TCP connection — Vercel can't do that.
      // Route through the VPS-hosted SMPP bridge (infra/poland-sip-bridge/smpp/server.js)
      // which exposes POST /send on a local HTTP port. outbound_endpoint stores the bridge URL.
      var smppUrl = cfg.outbound_endpoint;
      if (!smppUrl) return { ok: false, error: 'direct_smpp needs outbound_endpoint pointing at the SMPP bridge (e.g. http://vps-ip:8090/send)' };
      var senderID = (cfg.carrier_name || 'EngageWorx').substring(0, 11);
      var smppPayload = { to: plDigits(to), body: body, from: plDigits(cfg.phone_number), senderID: senderID };
      var r2 = await fetch(smppUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(smppPayload),
      });
      var smppRaw = await r2.text();
      var smppParsed = null;
      try { smppParsed = JSON.parse(smppRaw); } catch (e) {}
      return { ok: r2.ok, status: r2.status, body: smppParsed || smppRaw, transport: 'smpp_bridge' };
    }
    if (cfg.carrier_type === 'direct_sip') {
      var sipPayload = { to: to, body: body, from: cfg.phone_number };
      var r3 = await fetch(cfg.outbound_endpoint || '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sipPayload) });
      return { ok: r3.ok, status: r3.status, body: await r3.text().catch(function() { return ''; }) };
    }
  } catch (e) { return { ok: false, error: e.message }; }
  return { ok: false, error: 'carrier_type not implemented: ' + cfg.carrier_type };
}

async function sendViaTwilioFallback(to, body, fromNumber) {
  var sid = process.env.TWILIO_ACCOUNT_SID;
  var token = process.env.TWILIO_AUTH_TOKEN;
  var twilioFrom = fromNumber || process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !twilioFrom) return { ok: false, error: 'Twilio fallback not configured' };
  try {
    var url = 'https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json';
    var params = new URLSearchParams();
    params.append('To', to);
    params.append('From', twilioFrom);
    params.append('Body', body);
    var r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + Buffer.from(sid + ':' + token).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    var d = await r.json().catch(function() { return null; });
    console.error('[TwilioFallback] to=' + to + ' status=' + r.status + ' sid=' + (d && d.sid));
    return { ok: r.ok, status: r.status, sid: d && d.sid, transport: 'twilio_fallback' };
  } catch (e) { console.error('[TwilioFallback] error:', e.message); return { ok: false, error: e.message }; }
}

// ── Main handler ─────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  console.error('[POLAND-CARRIER] HIT', new Date().toISOString(), req.method, req.query && req.query.action);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  var action = (req.query && req.query.action) || (req.body && req.body.action) || 'sms-inbound';
  console.error('[POLAND] action=' + action);
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
      console.error('[POLAND-SMS] body received:', JSON.stringify(body).substring(0, 200));
      console.error('[POLAND-SMS] to field:', body.to || body.To || 'NOT FOUND');
      // Twilio sends application/x-www-form-urlencoded — Vercel parses it into req.body
      // when Content-Type is correct. Detect Twilio by the presence of MessageSid/AccountSid.
      var isTwilio = !!(body.MessageSid || body.AccountSid || body.SmsMessageSid);

      // Carrier-agnostic field extraction (Twilio + SMPP bridge + generic webhook)
      var from = body.from || body.From || body.msisdn || body.sender || '';
      var to = body.to || body.To || body.recipient || body.destination || '';
      var text = body.text || body.Body || body.message || body.content || '';
      var source = body.source || (isTwilio ? 'twilio' : 'unknown');
      console.log('[Poland/sms-inbound] from=' + from + ' to=' + to + ' text="' + (text || '').slice(0, 50) + '" source=' + source + ' isTwilio=' + isTwilio);

      function twilioReply(xml) {
        res.setHeader('Content-Type', 'text/xml; charset=utf-8');
        return res.status(200).end('<?xml version="1.0" encoding="UTF-8"?><Response>' + (xml || '') + '</Response>');
      }

      var cfg = await matchTenantByNumber(supabase, to);
      console.log('[Poland/sms-inbound] tenant match:', cfg ? cfg.tenant_id : 'NONE', 'normalized to:', normalizePL(to));
      if (!cfg) {
        try {
          await supabase.from('debug_logs').insert({
            endpoint: 'poland-carrier', action: 'sms-inbound-no-match',
            payload: { from: from, to: to, to_normalized: normalizePL(to), source: source },
            result: { matched: false },
            created_at: new Date().toISOString(),
          });
        } catch (logErr) {}
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

      // DB debug log — survives even if console.log is filtered
      try {
        await supabase.from('debug_logs').insert({
          endpoint: 'poland-carrier',
          action: 'sms-inbound',
          payload: { from: from, to: to, text: (text || '').substring(0, 200), source: source, isTwilio: isTwilio, from_normalized: normalizePL(from), to_normalized: normalizePL(to) },
          result: { tenant_id: cfg.tenant_id, contact_id: contactId, conversation_id: conversationId, language: lang },
          created_at: new Date().toISOString(),
        });
      } catch (logErr) { /* ignore if table doesn't exist yet */ }

      if (conversationId) {
        var msgPayload = {
          tenant_id: cfg.tenant_id, conversation_id: conversationId, contact_id: contactId,
          channel: 'sms', direction: 'inbound', sender_type: 'contact',
          body: text, status: 'delivered',
          metadata: { from: normalizePL(from), to: normalizePL(to), country: 'PL', language: lang },
          created_at: new Date().toISOString(),
        };
        console.error('[Poland/sms] inserting message:', JSON.stringify(msgPayload).substring(0, 200));
        var msgRes = await supabase.from('messages').insert(msgPayload);
        if (msgRes.error) console.error('[Poland/sms] message INSERT ERROR:', msgRes.error.message, msgRes.error.details);
        var convUpd = await supabase.from('conversations').update({ last_message_at: new Date().toISOString(), unread_count: 1 }).eq('id', conversationId);
        if (convUpd.error) console.error('[Poland/sms] conversation update ERROR:', convUpd.error.message);
      } else {
        console.error('[Poland/sms] NO conversation — contact=' + contactId + ' skipping message insert');
      }

      // AI auto-reply in detected language
      console.error('[Poland/sms] AI reply: generating for tenant=' + cfg.tenant_id + ' lang=' + lang + ' convId=' + conversationId);
      var reply = null;
      try {
        reply = await aiReplyForSms(supabase, cfg.tenant_id, lang, text);
      } catch (aiErr) { console.error('[Poland/sms] AI reply EXCEPTION:', aiErr.message); }
      console.error('[Poland/sms] AI reply result:', reply ? 'generated (' + reply.length + ' chars)' : 'null/empty');
      if (reply) {
        var replyTo = normalizePL(from);
        var isPolishDest = replyTo.indexOf('+48') === 0;
        var twilioFrom = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || '+17869827800';
        console.error('[Poland/sms] sending AI reply to', replyTo, 'isPolish=' + isPolishDest, 'twilioFrom=' + twilioFrom);
        var sent = null;
        try {
          if (isPolishDest) {
            sent = await sendOutboundSms(cfg, replyTo, reply);
            if (!sent || !sent.ok) {
              console.error('[Poland/sms] carrier failed, Twilio fallback with from=' + twilioFrom);
              sent = await sendViaTwilioFallback(replyTo, reply, twilioFrom);
            }
          } else {
            sent = await sendViaTwilioFallback(replyTo, reply, twilioFrom);
          }
        } catch (sendErr) { console.error('[Poland/sms] send EXCEPTION:', sendErr.message); }
        console.error('[Poland/sms] send result:', sent ? JSON.stringify(sent).substring(0, 100) : 'null');
        if (sent && sent.ok && conversationId) {
          var botMsgRes = await supabase.from('messages').insert({
            tenant_id: cfg.tenant_id, conversation_id: conversationId, contact_id: contactId,
            channel: 'sms', direction: 'outbound', sender_type: 'bot',
            body: reply, status: 'sent',
            metadata: { to: normalizePL(from), language: lang, auto_reply: true },
            created_at: new Date().toISOString(),
          });
          if (botMsgRes.error) console.error('[Poland/sms] bot message INSERT ERROR:', botMsgRes.error.message);
        }
      }

      // Log final result to debug_logs
      try {
        await supabase.from('debug_logs').insert({
          endpoint: 'poland-carrier', action: 'sms-inbound-complete',
          payload: { from: from, to: to, text: (text || '').substring(0, 100) },
          result: { tenant_id: cfg.tenant_id, contact_id: contactId, conversation_id: conversationId, ai_reply: reply ? reply.substring(0, 100) : null, ai_reply_sent: !!(reply && sent && sent.ok), send_transport: sent && sent.transport, send_error: sent && !sent.ok ? (sent.error || JSON.stringify(sent.body || '').substring(0, 100)) : null },
          created_at: new Date().toISOString(),
        });
      } catch (logErr) {}

      if (isTwilio) return twilioReply('');
      return res.status(200).json({ success: true, language: lang, conversation_id: conversationId, ai_replied: !!reply });
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
        // SMPP: probe the VPS bridge's /health endpoint
        if (cfg.carrier_type === 'direct_smpp') {
          if (!cfg.outbound_endpoint) return res.status(200).json({ ok: false, msg: 'direct_smpp needs outbound_endpoint pointing at the VPS SMPP bridge (e.g. http://vps-ip:8090/send)' });
          var bridgeHealthUrl = cfg.outbound_endpoint.replace(/\/send$/, '/health');
          try {
            var hprobe = await fetch(bridgeHealthUrl);
            var hdata = await hprobe.json().catch(function() { return null; });
            return res.status(200).json({
              ok: !!(hdata && hdata.bound),
              msg: hdata && hdata.bound ? '✓ SMPP bridge connected and bound to ' + (hdata.host || 'carrier') : '✗ SMPP bridge not bound — check credentials and carrier connectivity',
              transport: 'smpp_bridge',
              bridge_health: hdata,
            });
          } catch (e) {
            return res.status(200).json({ ok: false, msg: 'SMPP bridge unreachable at ' + bridgeHealthUrl + ': ' + e.message });
          }
        }
        // SIP — no synchronous test
        return res.status(200).json({ ok: false, msg: 'No synchronous test for ' + cfg.carrier_type + ' — verify by sending a real message' });
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
