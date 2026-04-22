// /api/voice.js — Proxy to twilio-voice.js
// Twilio webhooks POST to /api/voice; the actual handler lives in twilio-voice.js.
const handler = require('./twilio-voice');
module.exports = handler;
if (handler.config) module.exports.config = handler.config;
