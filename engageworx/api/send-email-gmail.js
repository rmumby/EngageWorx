// Force deploy: April 20 2026
// api/send-email-gmail.js
// Send email via Gmail SMTP (nodemailer). Emails appear in Gmail Sent folder.
// POST { to, subject, body, from, html }

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  try {
    console.log('[Gmail] handler entered, method=' + req.method);

    var gmailUser = process.env.GMAIL_SMTP_USER;
    var gmailPass = process.env.GMAIL_SMTP_PASS;
    console.log('[Gmail] env: USER=' + (gmailUser ? gmailUser.substring(0, 8) + '...' : 'UNDEFINED') + ' PASS=' + (gmailPass ? 'SET' : 'UNDEFINED'));

    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    var b = req.body || {};
    var to = b.to;
    var subject = b.subject || '(no subject)';
    var body = b.body || '';
    var html = b.html || null;
    var from = b.from || gmailUser || 'rob@engwx.com';

    if (!to) return res.status(400).json({ error: 'to is required' });
    if (!gmailUser || !gmailPass) {
      return res.status(500).json({ error: 'GMAIL credentials not configured', user_set: !!gmailUser, pass_set: !!gmailPass });
    }

    // Lazy require — only loaded when actually sending
    var nodemailer = require('nodemailer');
    console.log('[Gmail] nodemailer loaded, version=' + (nodemailer.version || 'unknown'));

    var transport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: gmailUser, pass: gmailPass },
    });

    var mailOptions = { from: from, to: to, subject: subject };
    if (html) {
      mailOptions.html = html;
      mailOptions.text = body;
    } else {
      mailOptions.text = body;
      mailOptions.html = body.replace(/\n/g, '<br>');
    }

    var info = await transport.sendMail(mailOptions);
    console.log('[Gmail] sent to=' + to + ' from=' + from + ' messageId=' + info.messageId);
    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (e) {
    console.error('[Gmail] ERROR:', e.message, e.stack);
    return res.status(500).json({ error: e.message });
  }
};
// force rebuild Tue Apr 21 09:07:35 EDT 2026
