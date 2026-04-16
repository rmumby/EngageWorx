// /opt/poland-bridge/server.js  (v2 — Asterisk ARI)
// Connects to Asterisk ARI via WebSocket. When an inbound call enters the
// 'poland-bridge' Stasis app, POSTs to the EngageWorx portal's TwiML endpoint,
// translates the response into ARI playback + DTMF collection, and routes the
// call accordingly.
//
// Env vars (from /etc/poland-bridge.env):
//   PORTAL_URL, ASTERISK_ARI_URL, ASTERISK_ARI_USER, ASTERISK_ARI_PASS,
//   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, POLLY_VOICE, POLLY_CACHE

var ari    = require('ari-client');
var crypto = require('crypto');
var fs     = require('fs');
var path   = require('path');
var fetch  = require('node-fetch');

var PORTAL_URL  = process.env.PORTAL_URL || 'https://portal.engwx.com';
var ARI_URL     = process.env.ASTERISK_ARI_URL || 'http://127.0.0.1:8088';
var ARI_USER    = process.env.ASTERISK_ARI_USER || 'engageworx';
var ARI_PASS    = process.env.ASTERISK_ARI_PASS || 'changeme-ari-secret';
var POLLY_VOICE = process.env.POLLY_VOICE || 'Ewa';
var POLLY_CACHE = process.env.POLLY_CACHE || '/var/cache/poland-bridge';
var SOUNDS_DIR  = '/var/lib/asterisk/sounds/poland';
fs.mkdirSync(POLLY_CACHE, { recursive: true });
fs.mkdirSync(SOUNDS_DIR, { recursive: true });

// ── AWS Polly (optional but strongly recommended for Polish TTS) ───────────
var polly = null;
try {
  if (process.env.AWS_ACCESS_KEY_ID) {
    var { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
    polly = new PollyClient({ region: process.env.AWS_REGION || 'eu-central-1' });
    console.log('[bridge] Polly enabled, voice=' + POLLY_VOICE);
  } else {
    console.log('[bridge] Polly disabled — set AWS_ACCESS_KEY_ID to enable Polish TTS.');
  }
} catch (e) { console.warn('[bridge] Polly init:', e.message); }

async function synthesize(text) {
  // Returns a filename (relative to /var/lib/asterisk/sounds/) that Asterisk can play.
  var hash = crypto.createHash('sha1').update(POLLY_VOICE + ':' + text).digest('hex');
  var wav = path.join(SOUNDS_DIR, hash + '.sln16');
  var mp3 = path.join(POLLY_CACHE, hash + '.mp3');
  if (fs.existsSync(wav)) return 'poland/' + hash;
  if (polly) {
    try {
      var cmd = new (require('@aws-sdk/client-polly').SynthesizeSpeechCommand)({
        Text: text, OutputFormat: 'pcm', SampleRate: '16000',
        VoiceId: POLLY_VOICE, Engine: 'neural', LanguageCode: 'pl-PL',
      });
      var out = await polly.send(cmd);
      var chunks = [];
      for await (var ch of out.AudioStream) chunks.push(ch);
      // Polly PCM is signed 16-bit LE, 16kHz — Asterisk plays this natively as .sln16
      fs.writeFileSync(wav, Buffer.concat(chunks));
      console.log('[bridge] Polly rendered', text.substring(0, 40) + '…', '→', wav);
      return 'poland/' + hash;
    } catch (e) { console.warn('[bridge] Polly error:', e.message); }
  }
  // Fallback: write text to a file and use Asterisk's Festival TTS (English-only, poor Polish)
  var fallbackFile = path.join(SOUNDS_DIR, hash + '.txt');
  fs.writeFileSync(fallbackFile, text);
  return null; // caller handles flite/Festival fallback
}

// ── Naive TwiML parser (same subset as the FreeSWITCH version) ─────────────
function decodeXml(s) { return String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"); }

function parseTwiml(xml) {
  var actions = [];
  var rest = String(xml || '');
  var pos = 0;
  while (pos < rest.length) {
    var ng = rest.indexOf('<Gather', pos);
    var ns = rest.indexOf('<Say', pos);
    var nh = rest.indexOf('<Hangup', pos);
    var cands = [ng, ns, nh].filter(function(n) { return n >= 0; });
    if (cands.length === 0) break;
    var nxt = Math.min.apply(null, cands);

    if (nxt === ng) {
      var eg = rest.indexOf('</Gather>', nxt);
      var block = rest.substring(nxt, eg + 9);
      var attrs = (block.match(/^<Gather([^>]*)>/) || [])[1] || '';
      var actionUrl = (attrs.match(/action="([^"]+)"/) || [])[1];
      var numDigits = parseInt((attrs.match(/numDigits="(\d+)"/) || [])[1] || '1', 10);
      var timeout = parseInt((attrs.match(/timeout="(\d+)"/) || [])[1] || '8', 10);
      var prompts = [];
      var smRe = /<Say(?:\s+[^>]*)?>([\s\S]*?)<\/Say>/g;
      var sm; while ((sm = smRe.exec(block)) !== null) prompts.push(decodeXml(sm[1]));
      actions.push({ type: 'gather', prompts: prompts, action: actionUrl ? decodeXml(actionUrl) : null, numDigits: numDigits, timeout: timeout });
      pos = eg + 9;
    } else if (nxt === ns) {
      var es = rest.indexOf('</Say>', nxt);
      var sayBlock = rest.substring(nxt, es + 6);
      var saym = sayBlock.match(/<Say(?:\s+[^>]*)?>([\s\S]*?)<\/Say>/);
      actions.push({ type: 'say', text: decodeXml(saym ? saym[1] : '') });
      pos = es + 6;
    } else if (nxt === nh) {
      actions.push({ type: 'hangup' });
      pos = rest.indexOf('>', nxt) + 1;
    }
  }
  return actions;
}

// ── Execute a list of TwiML actions on an ARI channel ──────────────────────
async function executeTwiml(client, channel, actions) {
  for (var i = 0; i < actions.length; i++) {
    var a = actions[i];

    if (a.type === 'say') {
      var file = await synthesize(a.text);
      if (file) {
        try { await channel.play({ media: 'sound:' + file }); } catch (e) { console.warn('[bridge] play error:', e.message); }
      } else {
        console.warn('[bridge] No TTS file for:', a.text.substring(0, 40), '— skipping');
      }
    }

    else if (a.type === 'gather') {
      // Play each prompt
      for (var p = 0; p < a.prompts.length; p++) {
        var pf = await synthesize(a.prompts[p]);
        if (pf) {
          try {
            var pb = client.Playback();
            await channel.play({ media: 'sound:' + pf }, pb);
            // Wait for playback to finish (or be interrupted by DTMF)
            await new Promise(function(resolve) {
              var done = false;
              function fin() { if (!done) { done = true; resolve(); } }
              pb.on('PlaybackFinished', fin);
              channel.on('ChannelDtmfReceived', fin);
              setTimeout(fin, 30000);
            });
          } catch (e) { console.warn('[bridge] gather playback error:', e.message); }
        }
      }
      // Collect DTMF
      var digits = '';
      try {
        digits = await new Promise(function(resolve) {
          var buf = '';
          var timer = setTimeout(function() { resolve(buf); }, a.timeout * 1000);
          function onDtmf(evt) {
            buf += evt.digit;
            if (buf.length >= a.numDigits) { clearTimeout(timer); channel.removeListener('ChannelDtmfReceived', onDtmf); resolve(buf); }
          }
          channel.on('ChannelDtmfReceived', onDtmf);
        });
      } catch (e) {}
      console.log('[bridge] gathered digits:', digits);

      // Fetch next TwiML from the portal's route action URL
      if (a.action && digits) {
        try {
          var rr = await fetch(a.action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ Digits: digits, CallSid: channel.id, From: channel.caller ? channel.caller.number : '' }).toString(),
          });
          var routeXml = await rr.text();
          console.log('[bridge] route returned', rr.status, routeXml.length, 'bytes');
          var nextActions = parseTwiml(routeXml);
          await executeTwiml(client, channel, nextActions);
          return; // route chain takes over
        } catch (e) { console.warn('[bridge] route fetch error:', e.message); }
      }
    }

    else if (a.type === 'hangup') {
      try { await channel.hangup(); } catch (e) {}
      return;
    }
  }
  // End of actions — hang up
  try { await channel.hangup(); } catch (e) {}
}

// ── Connect to ARI ─────────────────────────────────────────────────────────
function connect() {
  ari.connect(ARI_URL, ARI_USER, ARI_PASS, function(err, client) {
    if (err) {
      console.error('[bridge] ARI connect failed:', err.message, '— retrying in 5s');
      setTimeout(connect, 5000);
      return;
    }
    console.log('[bridge] Connected to Asterisk ARI at', ARI_URL);

    client.on('StasisStart', async function(event, channel) {
      var from = (event.args && event.args[0]) || (channel.caller && channel.caller.number) || '';
      var to   = (event.args && event.args[1]) || channel.name || '';
      var callSid = channel.id;
      console.log('[bridge] StasisStart from=' + from, 'to=' + to, 'id=' + callSid);

      try {
        // Normalise To to E.164 +48…
        var toNorm = '+48' + to.replace(/^\+?48/, '').replace(/^0/, '');
        var portalRes = await fetch(PORTAL_URL + '/api/poland-carrier?action=voice-inbound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ From: from, To: toNorm, CallSid: callSid }).toString(),
        });
        var twiml = await portalRes.text();
        console.log('[bridge] portal returned', portalRes.status, twiml.length, 'bytes');
        var acts = parseTwiml(twiml);
        await executeTwiml(client, channel, acts);
      } catch (e) {
        console.error('[bridge] call handling error:', e.message);
        try { await channel.hangup(); } catch (hup) {}
      }
    });

    client.on('StasisEnd', function(event, channel) {
      console.log('[bridge] StasisEnd id=' + channel.id);
    });

    client.start('poland-bridge');
  });
}

console.log('[bridge] Starting Asterisk ARI bridge. portal=' + PORTAL_URL + ' ari=' + ARI_URL);
connect();
