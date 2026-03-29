var { getNotifyEmails } = require('./_notify');
var sgMail = require('@sendgrid/mail');

var EW_SP_TENANT_ID = 'c1bc59a8-5235-4921-9755-02514b574387';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    var { subject, text } = req.body;
    if (!subject || !text) return res.status(400).json({ error: 'Missing subject or text' });
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    var emails = await getNotifyEmails(EW_SP_TENANT_ID, 'notify_on_new_signup');
    console.log('[NotifyAdmin] Sending to:', emails);
    if (emails.length > 0) {
      await sgMail.send({
        to: emails,
        from: { email: 'hello@engwx.com', name: 'EngageWorx' },
        subject: subject,
        text: text,
      });
      console.log('[NotifyAdmin] Sent successfully to:', emails);
    } else {
      console.log('[NotifyAdmin] No recipients found');
    }
    return res.status(200).json({ ok: true, sent: emails.length });
  } catch (err) {
    console.error('[NotifyAdmin] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
