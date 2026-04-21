module.exports = function handler(req, res) {
  console.error('[voice-test] HIT', req.method, new Date().toISOString());
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">Voice test working. This is the EngageWorx voice system.</Say></Response>');
};
