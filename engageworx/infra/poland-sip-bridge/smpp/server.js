// infra/poland-sip-bridge/smpp/server.js
// Persistent SMPP bridge for smscloud.io (or any SMPP carrier).
// Runs on the VPS, NOT on Vercel. Exposes a local HTTP API that the portal
// POSTs to for outbound SMS, and forwards inbound deliver_sm to the portal webhook.
//
// Env vars (from /etc/smpp-bridge.env):
//   SMPP_HOST       — e.g. smpp.smscloud.io
//   SMPP_PORT       — e.g. 2775
//   SMPP_USERNAME   — system_id for bind
//   SMPP_PASSWORD   — password for bind
//   SMPP_SYSTEM_TYPE— optional, defaults to ''
//   PORTAL_URL      — e.g. https://portal.engwx.com
//   HTTP_PORT       — local HTTP API port, default 8090

var smpp    = require('smpp');
var express = require('express');
var fetch   = require('node-fetch');

var SMPP_HOST    = process.env.SMPP_HOST || 'smpp.smscloud.io';
var SMPP_PORT    = parseInt(process.env.SMPP_PORT || '2775', 10);
var SMPP_USER    = process.env.SMPP_USERNAME || '';
var SMPP_PASS    = process.env.SMPP_PASSWORD || '';
var SMPP_SYSTYPE = process.env.SMPP_SYSTEM_TYPE || '';
var PORTAL_URL   = process.env.PORTAL_URL || 'https://portal.engwx.com';
var HTTP_PORT    = parseInt(process.env.HTTP_PORT || '8090', 10);

var session = null;
var bound = false;

// ── SMPP Session Management ────────────────────────────────────────────────
function connect() {
  console.log('[SMPP] Connecting to', SMPP_HOST + ':' + SMPP_PORT, 'as', SMPP_USER);
  session = smpp.connect({ url: 'smpp://' + SMPP_HOST + ':' + SMPP_PORT }, function() {
    session.bind_transceiver({
      system_id: SMPP_USER,
      password: SMPP_PASS,
      system_type: SMPP_SYSTYPE,
      interface_version: 0x34,
    }, function(pdu) {
      if (pdu.command_status === 0) {
        bound = true;
        console.log('[SMPP] Bound as transceiver ✓');
      } else {
        bound = false;
        console.error('[SMPP] Bind failed, status:', pdu.command_status);
        scheduleReconnect();
      }
    });
  });

  session.on('close', function() {
    bound = false;
    console.warn('[SMPP] Connection closed — reconnecting in 5s');
    scheduleReconnect();
  });

  session.on('error', function(err) {
    bound = false;
    console.error('[SMPP] Error:', err.message);
    scheduleReconnect();
  });

  // Inbound SMS (deliver_sm from carrier)
  session.on('deliver_sm', function(pdu) {
    var from = pdu.source_addr || '';
    var to = pdu.destination_addr || '';
    var text = '';
    if (pdu.short_message && pdu.short_message.message) {
      text = pdu.short_message.message;
    } else if (pdu.short_message) {
      text = String(pdu.short_message);
    }
    console.log('[SMPP] deliver_sm from=' + from, 'to=' + to, 'text=' + text.substring(0, 60));

    // Ack the delivery
    session.send(pdu.response());

    // Forward to portal webhook
    fetch(PORTAL_URL + '/api/poland-carrier?action=sms-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: from, to: to, text: text, source: 'smpp' }),
    }).then(function(r) {
      console.log('[SMPP] Portal webhook response:', r.status);
    }).catch(function(e) {
      console.error('[SMPP] Portal webhook error:', e.message);
    });
  });

  // Enquire link keepalive
  session.on('enquire_link', function(pdu) {
    session.send(pdu.response());
  });
}

var reconnectTimer = null;
function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(function() {
    reconnectTimer = null;
    try { if (session) session.close(); } catch (e) {}
    session = null;
    connect();
  }, 5000);
}

// Send keepalive every 30s
setInterval(function() {
  if (session && bound) {
    session.enquire_link({}, function() {});
  }
}, 30000);

// ── HTTP API for outbound SMS ──────────────────────────────────────────────
var app = express();
app.use(express.json());

app.post('/send', function(req, res) {
  if (!session || !bound) {
    return res.status(503).json({ ok: false, error: 'SMPP not connected' });
  }
  var to = String(req.body.to || '').replace(/[^0-9]/g, '');
  var text = req.body.body || req.body.text || '';
  var from = String(req.body.from || '').replace(/[^0-9]/g, '');
  var senderID = req.body.senderID || 'SMS';

  if (!to || !text) {
    return res.status(400).json({ ok: false, error: 'to and body/text required' });
  }

  session.submit_sm({
    source_addr: senderID,
    source_addr_ton: 5,  // alphanumeric
    source_addr_npi: 0,
    destination_addr: to,
    dest_addr_ton: 1,    // international
    dest_addr_npi: 1,
    short_message: text,
    data_coding: 0,
    registered_delivery: 1,
  }, function(pdu) {
    if (pdu.command_status === 0) {
      console.log('[SMPP] submit_sm OK → message_id:', pdu.message_id);
      res.json({ ok: true, message_id: pdu.message_id });
    } else {
      console.error('[SMPP] submit_sm FAILED status:', pdu.command_status);
      res.status(400).json({ ok: false, error: 'SMPP error ' + pdu.command_status, status: pdu.command_status });
    }
  });
});

app.get('/health', function(req, res) {
  res.json({ ok: bound, host: SMPP_HOST, port: SMPP_PORT, user: SMPP_USER, connected: !!session, bound: bound });
});

app.listen(HTTP_PORT, '127.0.0.1', function() {
  console.log('[SMPP] HTTP API on 127.0.0.1:' + HTTP_PORT);
  connect();
});
