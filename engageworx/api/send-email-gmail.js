// api/send-email-gmail.js
// Send email via Gmail SMTP (nodemailer). Emails appear in Gmail Sent folder.
// POST { to, subject, body, from, html }
// from: 'rob@engwx.com' or 'hello@engwx.com' (Gmail alias)
// body: plain text, html: optional HTML version

var nodemailer = require('nodemailer');

var _transport = null;
function getTransport() {
  if (_transport) return _transport;
  _transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_SMTP_USER,
      pass: process.env.GMAIL_SMTP_PASS,
    },
  });
  return _transport;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var b = req.body || {};
  var to = b.to;
  var subject = b.subject || '(no subject)';
  var body = b.body || '';
  var html = b.html || null;
  var from = b.from || process.env.GMAIL_SMTP_USER || 'rob@engwx.com';

  if (!to) return res.status(400).json({ error: 'to is required' });
  if (!process.env.GMAIL_SMTP_USER || !process.env.GMAIL_SMTP_PASS) {
    return res.status(500).json({ error: 'GMAIL_SMTP_USER and GMAIL_SMTP_PASS not configured' });
  }

  try {
    var transport = getTransport();
    var mailOptions = {
      from: from,
      to: to,
      subject: subject,
    };
    if (html) {
      mailOptions.html = html;
      mailOptions.text = body;
    } else {
      mailOptions.text = body;
      mailOptions.html = body.replace(/\n/g, '<br>');
    }

    var info = await transport.sendMail(mailOptions);
    console.log('[send-email-gmail] sent to=' + to + ' from=' + from + ' messageId=' + info.messageId);
    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (e) {
    console.error('[send-email-gmail] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
