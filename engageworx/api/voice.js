// api/voice.js — Twilio voice webhook handler
// Accepts GET and POST from Twilio when an inbound call arrives.
// Returns TwiML with a greeting and optional gather/redirect.

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  var body = req.body || {};
  var from = body.From || body.from || '';
  var to = body.To || body.to || '';
  var callSid = body.CallSid || body.callSid || '';

  console.log('[voice] inbound call from=' + from + ' to=' + to + ' callSid=' + callSid);

  // Default greeting TwiML
  var twiml = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response>' +
      '<Say voice="Polly.Amy-Neural" language="en-US">' +
        'Thank you for calling EngageWorx. Please hold while we connect you with a team member.' +
      '</Say>' +
      '<Pause length="2"/>' +
      '<Say voice="Polly.Amy-Neural" language="en-US">' +
        'We are unable to take your call right now. Please leave a message after the tone, or email hello at eng w x dot com.' +
      '</Say>' +
      '<Record maxLength="120" transcribe="true" playBeep="true" />' +
    '</Response>';

  return res.status(200).end(twiml);
};
