// api/send-digest-reply.js — Sends a reply from hello@engwx.com via SendGrid
// Used by the AI Email Digest's 'Action It' / 'Edit & Send' flows.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var body = req.body || {};
  var to = (body.to || '').trim();
  var subject = (body.subject || '').trim();
  var content = body.body || '';
  if (!to || !subject || !content) return res.status(400).json({ error: 'to, subject, body required' });
  if (!process.env.SENDGRID_API_KEY) return res.status(500).json({ error: 'SENDGRID_API_KEY missing' });

  try {
    var sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    await sgMail.send({
      to: to,
      from: { email: 'hello@engwx.com', name: 'EngageWorx' },
      replyTo: 'hello@engwx.com',
      subject: subject,
      text: content,
      html: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.6;white-space:pre-wrap;">' + content.replace(/</g, '&lt;') + '</div>',
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[send-digest-reply] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
