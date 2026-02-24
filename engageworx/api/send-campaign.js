// /api/send-campaign.js
// Sends SMS campaign messages via Twilio to a list of contacts

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { 
    campaignId, 
    tenantId, 
    messages, // array of { to, body }
    fromNumber // Twilio phone number to send from
  } = req.body;

  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: "No messages to send" });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = fromNumber || process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    return res.status(500).json({ error: "Twilio credentials not configured" });
  }

  const results = { sent: 0, failed: 0, errors: [] };

  for (const msg of messages) {
    try {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

      const response = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: msg.to,
          From: from,
          Body: msg.body,
        }),
      });

      if (response.ok) {
        results.sent++;
      } else {
        const error = await response.json();
        results.failed++;
        results.errors.push({ to: msg.to, error: error.message || "Send failed" });
      }
    } catch (err) {
      results.failed++;
      results.errors.push({ to: msg.to, error: err.message });
    }

    // Rate limit: small delay between sends to avoid Twilio throttling
    if (messages.length > 1) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  return res.status(200).json({
    success: true,
    campaignId,
    results,
  });
}
