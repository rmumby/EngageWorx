// /opt/poland-bridge/server.js
// Bridges FreeSWITCH mod_xml_curl to the EngageWorx Twilio-compatible voice webhook.
//
// Flow:
//   1. Inbound SIP call lands on FreeSWITCH from Polish carrier (64.79.144.100).
//   2. Dialplan answers, transfers into the 'poland-bridge' context.
//   3. mod_xml_curl POSTs to http://127.0.0.1:8080/fs-dialplan with FreeSWITCH variables.
//   4. This bridge POSTs to https://portal.engwx.com/api/poland-carrier?action=voice-inbound
//      with Twilio-style fields (From, To, CallSid).
//   5. The portal returns TwiML.
//   6. We translate the TwiML <Say>/<Gather>/<Hangup> into FreeSWITCH dialplan XML.
//   7. <Say> with a Polly voice is rendered via AWS Polly REST API to MP3, cached on disk,
//      and served by FreeSWITCH via 'playback' on a local file path.
//   8. <Gather> uses FreeSWITCH 'read' to capture DTMF, then re-fetches dialplan from
//      action=voice-route with the digit.

var express = require('express');
var crypto  = require('crypto');
var fs      = require('fs');
var path    = require('path');
var fetch   = require('node-fetch');

var PORT        = parseInt(process.env.PORT || '8080', 10);
var PORTAL_URL  = process.env.PORTAL_URL || 'https://portal.engwx.com';
var POLLY_VOICE = process.env.POLLY_VOICE || 'Ewa';
var POLLY_CACHE = process.env.POLLY_CACHE || '/var/cache/poland-bridge';
fs.mkdirSync(POLLY_CACHE, { recursive: true });

// Optional Polly client. Skipped if AWS creds aren't set.
var polly = null;
try {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    var { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
    polly = new PollyClient({ region: process.env.AWS_REGION || 'eu-central-1' });
    console.log('[bridge] Polly enabled, voice=' + POLLY_VOICE);
  } else {
    console.log('[bridge] Polly disabled — AWS creds missing. Falling back to mod_flite (English-only).');
  }
} catch (e) { console.warn('[bridge] Polly init failed:', e.message); }

var app = express();
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

// ── Helpers ─────────────────────────────────────────────────────────────────
function escapeXml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function pollySynthesize(text) {
  if (!polly) return null;
  var hash = crypto.createHash('sha1').update(POLLY_VOICE + ':' + text).digest('hex');
  var file = path.join(POLLY_CACHE, hash + '.mp3');
  if (fs.existsSync(file)) return file;
  try {
    var cmd = new (require('@aws-sdk/client-polly').SynthesizeSpeechCommand)({
      Text: text, OutputFormat: 'mp3', VoiceId: POLLY_VOICE, Engine: 'neural', LanguageCode: 'pl-PL',
    });
    var out = await polly.send(cmd);
    var chunks = [];
    for await (var ch of out.AudioStream) chunks.push(ch);
    fs.writeFileSync(file, Buffer.concat(chunks));
    fs.chmodSync(file, 0o644);
    return file;
  } catch (e) { console.warn('[bridge] Polly synth error:', e.message); return null; }
}

// Naive TwiML parser — only the subset we generate from api/poland-carrier.js.
// Extracts in order: <Say>, <Gather><Say>...action=URL</Gather>, <Hangup/>, <Redirect>URL</Redirect>.
function parseTwiml(xml) {
  var actions = [];
  var rest = String(xml || '');
  // <Gather ...> ... </Gather>
  var gatherRe = /<Gather([^>]*)>([\s\S]*?)<\/Gather>/g;
  // <Say ...>text</Say>
  var sayRe = /<Say(?:\s+[^>]*)?>([\s\S]*?)<\/Say>/g;
  // Walk in document order
  var pos = 0;
  while (pos < rest.length) {
    var nextGather = rest.indexOf('<Gather', pos);
    var nextSay    = rest.indexOf('<Say',    pos);
    var nextHangup = rest.indexOf('<Hangup', pos);
    var nextRedir  = rest.indexOf('<Redirect', pos);
    var candidates = [nextGather, nextSay, nextHangup, nextRedir].filter(function(n) { return n >= 0; });
    if (candidates.length === 0) break;
    var nxt = Math.min.apply(null, candidates);
    if (nxt === nextGather) {
      var endTag = rest.indexOf('</Gather>', nxt);
      var block = rest.substring(nxt, endTag + 9);
      var attrs = (block.match(/^<Gather([^>]*)>/) || [])[1] || '';
      var actionMatch = attrs.match(/action="([^"]+)"/);
      var numDigits = (attrs.match(/numDigits="(\d+)"/) || [, '1'])[1];
      var timeout = (attrs.match(/timeout="(\d+)"/) || [, '8'])[1];
      var prompts = [];
      var sm; var smRe = /<Say(?:\s+[^>]*)?>([\s\S]*?)<\/Say>/g;
      while ((sm = smRe.exec(block)) !== null) prompts.push(decodeXml(sm[1]));
      actions.push({ type: 'gather', prompts: prompts, action: actionMatch ? actionMatch[1] : null, numDigits: parseInt(numDigits, 10), timeout: parseInt(timeout, 10) });
      pos = endTag + 9;
    } else if (nxt === nextSay) {
      var endSay = rest.indexOf('</Say>', nxt);
      var sayBlock = rest.substring(nxt, endSay + 6);
      var saym = sayBlock.match(/<Say(?:\s+[^>]*)?>([\s\S]*?)<\/Say>/);
      actions.push({ type: 'say', text: decodeXml(saym ? saym[1] : '') });
      pos = endSay + 6;
    } else if (nxt === nextHangup) {
      actions.push({ type: 'hangup' });
      var endHangup = rest.indexOf('>', nxt);
      pos = endHangup + 1;
    } else if (nxt === nextRedir) {
      var endRed = rest.indexOf('</Redirect>', nxt);
      var rblock = rest.substring(nxt, endRed >= 0 ? endRed + 11 : nxt + 9);
      var urlMatch = rblock.match(/<Redirect[^>]*>([\s\S]*?)<\/Redirect>/);
      actions.push({ type: 'redirect', url: urlMatch ? decodeXml(urlMatch[1]).trim() : null });
      pos = (endRed >= 0 ? endRed + 11 : nxt + 9);
    }
  }
  return actions;
}

function decodeXml(s) {
  return String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

// Build FreeSWITCH dialplan XML for an array of actions.
async function buildFsDialplan(actions, contextName, destNumber) {
  var apps = [];
  for (var i = 0; i < actions.length; i++) {
    var a = actions[i];
    if (a.type === 'say') {
      var file = await pollySynthesize(a.text);
      if (file) apps.push('<action application="playback" data="' + escapeXml(file) + '"/>');
      else      apps.push('<action application="speak" data="flite|kal|' + escapeXml(a.text) + '"/>');
    } else if (a.type === 'gather') {
      // Pre-render each prompt
      for (var p = 0; p < a.prompts.length; p++) {
        var pf = await pollySynthesize(a.prompts[p]);
        if (pf) apps.push('<action application="playback" data="' + escapeXml(pf) + '"/>');
        else    apps.push('<action application="speak" data="flite|kal|' + escapeXml(a.prompts[p]) + '"/>');
      }
      // Read DTMF, then transfer back into bridge with digit appended to the destination.
      // Format: 'route_<digit>' so we can pull it out on the next mod_xml_curl call.
      var min = 1; var max = a.numDigits || 1; var tries = 1; var timeoutMs = (a.timeout || 8) * 1000;
      apps.push('<action application="set" data="poland_gather_action=' + escapeXml(a.action || '') + '"/>');
      apps.push('<action application="read" data="' + min + ' ' + max + ' silence ' + 'poland_digit ' + timeoutMs + ' #"/>');
      apps.push('<action application="transfer" data="route_${poland_digit} XML poland-bridge"/>');
    } else if (a.type === 'redirect') {
      // Treat <Redirect>URL</Redirect> as another fetch — encode the URL in the destination.
      apps.push('<action application="set" data="poland_redirect_url=' + escapeXml(a.url || '') + '"/>');
      apps.push('<action application="transfer" data="redirect XML poland-bridge"/>');
    } else if (a.type === 'hangup') {
      apps.push('<action application="hangup"/>');
    }
  }
  if (apps.length === 0) apps.push('<action application="hangup"/>');

  var ext = '<extension name="poland-bridge-step">' +
              '<condition field="destination_number" expression="^.*$">' +
                apps.join('') +
              '</condition>' +
            '</extension>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>' +
    '<document type="freeswitch/xml">' +
      '<section name="dialplan">' +
        '<context name="' + escapeXml(contextName) + '">' + ext + '</context>' +
      '</section>' +
    '</document>';
}

function emptyResult() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="no"?><document type="freeswitch/xml"><section name="result"><result status="not found"/></section></document>';
}

// ── Main mod_xml_curl endpoint ─────────────────────────────────────────────
// FreeSWITCH POSTs form-encoded vars: section, tag_name, key_name, key_value,
// Caller-Destination-Number, Caller-Caller-ID-Number, Caller-Caller-ID-Name,
// Channel-Caller-ID-Number, etc.
app.post('/fs-dialplan', async function(req, res) {
  try {
    var body = req.body || {};
    var section = body.section || 'dialplan';
    if (section !== 'dialplan') { res.type('text/xml').send(emptyResult()); return; }

    var dest = body['Caller-Destination-Number'] || body.destination_number || '';
    var from = body['Caller-Caller-ID-Number'] || body.caller_id_number || '';
    var to   = body.variable_sip_to_user || body['Caller-Destination-Number'] || '';
    var callSid = body['Channel-Unique-ID'] || body.uuid || ('fs-' + Date.now());

    console.log('[bridge] /fs-dialplan section=' + section, 'dest=' + dest, 'from=' + from, 'to=' + to, 'callSid=' + callSid);

    // Initial bridge call from the inbound dialplan
    if (dest === 'bridge' || dest === '' || /^\+?\d+$/.test(dest)) {
      var portalRes = await fetch(PORTAL_URL + '/api/poland-carrier?action=voice-inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: from, To: '+48' + (to || '').replace(/^\+?48/, '').replace(/^0/, ''), CallSid: callSid }).toString(),
      });
      var twiml = await portalRes.text();
      console.log('[bridge] portal returned ' + portalRes.status + ', ' + twiml.length + ' bytes');
      var actions = parseTwiml(twiml);
      var xml = await buildFsDialplan(actions, 'poland-bridge', dest);
      res.type('text/xml').send(xml);
      return;
    }

    // DTMF route — destination starts with 'route_'
    if (dest.indexOf('route_') === 0) {
      var digit = dest.substring(6);
      var rrPort = await fetch(PORTAL_URL + '/api/poland-carrier?action=voice-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ Digits: digit, CallSid: callSid, From: from }).toString(),
      });
      var routeXml = await rrPort.text();
      console.log('[bridge] route digit=' + digit + ', portal=' + rrPort.status);
      var rActions = parseTwiml(routeXml);
      var rDial = await buildFsDialplan(rActions, 'poland-bridge', dest);
      res.type('text/xml').send(rDial);
      return;
    }

    // Redirect chain
    if (dest === 'redirect') {
      var rurl = body.variable_poland_redirect_url || '';
      if (!rurl) { res.type('text/xml').send(emptyResult()); return; }
      var redirRes = await fetch(rurl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ CallSid: callSid, From: from }).toString() });
      var redirXml = await redirRes.text();
      var redirActions = parseTwiml(redirXml);
      var redirDial = await buildFsDialplan(redirActions, 'poland-bridge', dest);
      res.type('text/xml').send(redirDial);
      return;
    }

    res.type('text/xml').send(emptyResult());
  } catch (err) {
    console.error('[bridge] /fs-dialplan error:', err.message, err.stack);
    res.type('text/xml').send(emptyResult());
  }
});

app.get('/health', function(req, res) { res.json({ ok: true, polly_enabled: !!polly, port: PORT, portal: PORTAL_URL }); });

app.listen(PORT, '127.0.0.1', function() {
  console.log('[bridge] poland-bridge listening on 127.0.0.1:' + PORT + ', portal=' + PORTAL_URL);
});
