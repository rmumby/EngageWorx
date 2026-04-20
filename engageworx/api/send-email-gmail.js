// api/send-email-gmail.js
// Send email via Gmail SMTP (nodemailer). Emails appear in Gmail Sent folder.
// POST { to, subject, body, from, html }
// from: 'rob@engwx.com' or 'hello@engwx.com' (Gmail alias)
// body: plain text, html: optional HTML version

var nodemailer = require('nodemailer');

function createTransport(user, pass) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: user, pass: pass },
  });
}

module.exports = async function handler(req, res) {
  var gmailUser = process.env.GMAIL_SMTP_USER;
  var gmailPass = process.env.GMAIL_SMTP_PASS;
  var gmailKeys = Object.keys(process.env).filter(function(k) { return k.includes('GMAIL'); });
  console.log('[Gmail] process.env keys with GMAIL:', gmailKeys);
  console.log('[Gmail] GMAIL_SMTP_USER value:', gmailUser ? gmailUser.substring(0, 8) + '...' : 'UNDEFINED');
  console.log('[Gmail] GMAIL_SMTP_PASS value:', gmailPass ? 'SET (len=' + gmailPass.length + ')' : 'UNDEFINED');

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var b = req.body || {};
  var to = b.to;
  var subject = b.subject || '(no subject)';
  var body = b.body || '';
  var html = b.html || null;
  var from = b.from || gmailUser || 'rob@engwx.com';

  if (!to) return res.status(400).json({ error: 'to is required' });
  if (!gmailUser || !gmailPass) {
    return res.status(500).json({ error: 'not configured', keys_found: gmailKeys, user_set: !!gmailUser, pass_set: !!gmailPass });
  }

  try {
    var transport = createTransport(gmailUser, gmailPass);
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
