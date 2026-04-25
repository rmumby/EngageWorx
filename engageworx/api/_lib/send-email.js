// api/_lib/send-email.js — Shared SendGrid email helper
// All outbound email should route through this to ensure consistent
// from address, BCC, Reply-To, and error handling.

async function sendEmail(opts) {
  var to = opts.to;
  var from = opts.from || process.env.PLATFORM_FROM_EMAIL;
  var fromName = opts.fromName;
  var subject = opts.subject;
  var html = opts.html;
  var text = opts.text;
  var bcc = opts.bcc;
  var replyTo = opts.replyTo;

  if (!to || !subject || !html) return { success: false, error: 'to, subject, html required' };

  var sgKey = process.env.SENDGRID_API_KEY;
  if (!sgKey) return { success: false, error: 'SENDGRID_API_KEY not configured' };

  try {
    var sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(sgKey);
    var payload = {
      to: to,
      from: fromName ? { email: from, name: fromName } : from,
      subject: subject,
      html: html,
    };
    if (text) payload.text = text;
    if (bcc) payload.bcc = typeof bcc === 'string' ? { email: bcc } : bcc;
    if (replyTo) payload.replyTo = typeof replyTo === 'string' ? replyTo : replyTo;
    var result = await sgMail.send(payload);
    var messageId = result && result[0] && result[0].headers && result[0].headers['x-message-id'];
    return { success: true, message_id: messageId || null };
  } catch (e) {
    var errMsg = e.response ? JSON.stringify(e.response.body || e.response.statusCode) : e.message;
    console.error('[sendEmail] Error:', errMsg);
    return { success: false, error: errMsg };
  }
}

module.exports = { sendEmail: sendEmail };
