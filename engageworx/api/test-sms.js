// /api/test-sms.js — Quick test: sends an SMS to verify Twilio is working
// Usage: POST /api/test-sms with { "to": "+1XXXXXXXXXX" }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Missing "to" phone number' });

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return res.status(500).json({
      error: 'Missing env vars',
      has_sid: !!accountSid,
      has_token: !!authToken,
      has_number: !!fromNumber,
    });
  }

  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const params = new URLSearchParams();
    params.append('To', to);
    params.append('From', fromNumber);
    params.append('Body', '🚀 EngageWorx SMS test successful! Your Twilio integration is live.');

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message,
        code: data.code,
        moreInfo: data.more_info,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Test SMS sent!',
      sid: data.sid,
      to: data.to,
      from: data.from,
      status: data.status,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
