// api/_lib/send-email.js — Shared email helper (Resend)
// cache-bust: 2026-04-29T23:45Z
// All outbound email should route through this to ensure consistent
// from address, error handling, and single-provider billing.
//
// Migrated from SendGrid to Resend (2026-04-29).
// SendGrid dependency + SENDGRID_API_KEY env var left in place for
// files that still call sgMail directly — clean up separately.

async function sendEmail(opts) {
  console.log('[sendEmail] CALLED', { to: opts.to, subject: opts.subject });
  var to = opts.to;
  var from = opts.from || process.env.PLATFORM_FROM_EMAIL;
  var fromName = opts.fromName;
  var subject = opts.subject;
  var html = opts.html;
  var text = opts.text;
  var replyTo = opts.replyTo;

  if (!to || !subject || (!html && !text)) return { success: false, error: 'to, subject, and html or text required' };

  var resendKey = process.env.RESEND_API_KEY;
  console.log('[sendEmail] key prefix:', resendKey ? resendKey.substring(0, 7) : 'MISSING');
  var keyDebug = resendKey ? resendKey.substring(0, 7) + '...' + resendKey.substring(resendKey.length - 4) : 'MISSING';
  if (!resendKey) return { success: false, error: 'RESEND_API_KEY not configured', key_debug: keyDebug };

  var fromField = fromName ? fromName + ' <' + from + '>' : from;

  var payload = {
    from: fromField,
    to: Array.isArray(to) ? to : [to],
    subject: subject,
  };
  if (html) payload.html = html;
  if (text) payload.text = text;
  if (replyTo) payload.reply_to = typeof replyTo === 'string' ? replyTo : replyTo;

  try {
    var res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + resendKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      var errBody;
      try { errBody = await res.json(); } catch (_) { errBody = {}; }
      var errMsg = errBody.message || errBody.error || 'HTTP ' + res.status;
      console.error('[sendEmail] Resend error:', errMsg);
      return { success: false, error: errMsg, key_debug: keyDebug };
    }

    var data = await res.json();
    return { success: true, message_id: data.id || null };
  } catch (e) {
    console.error('[sendEmail] Error:', e.message);
    return { success: false, error: e.message, key_debug: keyDebug };
  }
}

module.exports = { sendEmail: sendEmail };
