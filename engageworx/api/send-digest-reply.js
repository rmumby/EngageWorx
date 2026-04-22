// api/send-digest-reply.js — Sends a reply via SendGrid or Gmail SMTP
// Routes based on tenant email_send_method preference (default: sendgrid)

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var body = req.body || {};
  var to = (body.to || '').trim();
  var subject = (body.subject || '').trim();
  var content = body.body || '';
  var fromOverride = body.from || null;
  var tenantId = body.tenant_id || null;
  if (!to || !subject || !content) return res.status(400).json({ error: 'to, subject, body required' });

  var { createClient } = require('@supabase/supabase-js');
  var supabase = createClient(process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Check tenant email send method preference
  var sendMethod = 'sendgrid';
  if (tenantId) {
    try {
      var tR = await supabase.from('tenants').select('email_send_method').eq('id', tenantId).maybeSingle();
      if (tR.data && tR.data.email_send_method) sendMethod = tR.data.email_send_method;
    } catch (e) {}
  }
  // Fallback: if no tenant, check env var
  if (!tenantId && process.env.DEFAULT_EMAIL_METHOD) sendMethod = process.env.DEFAULT_EMAIL_METHOD;

  var fromEmail = fromOverride || process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com';

  // Load AI Omni BCC address
  var aiOmniBcc = null;
  if (tenantId) {
    try {
      var bccCfg = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', tenantId).eq('channel', 'email').maybeSingle();
      var bccVal = bccCfg.data && bccCfg.data.config_encrypted && bccCfg.data.config_encrypted.ai_omni_bcc;
      if (bccVal && bccVal.indexOf('@') > 0 && bccVal !== to && bccVal !== fromEmail) aiOmniBcc = bccVal;
    } catch (e) {}
  }

  // Load signature
  var _sig = require('./_email-signature');
  var sigInfo = await _sig.getSignature(supabase, { tenantId: tenantId, fromEmail: fromEmail, isFirstTouch: false, closingKind: 'reply' });

  if (sendMethod === 'gmail') {
    // Route through Gmail SMTP
    if (!process.env.GMAIL_SMTP_USER || !process.env.GMAIL_SMTP_PASS) {
      console.warn('[send-digest-reply] Gmail selected but credentials missing, falling back to SendGrid');
      sendMethod = 'sendgrid';
    } else {
      try {
        var nodemailer = require('nodemailer');
        var transport = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: { user: process.env.GMAIL_SMTP_USER, pass: process.env.GMAIL_SMTP_PASS },
        });
        var bodyHtml = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.6;white-space:pre-wrap;">' + content.replace(/</g, '&lt;') + '</div>';
        var htmlFull = _sig.composeHtmlBody(bodyHtml, sigInfo.closingLine, sigInfo.signatureHtml);
        var textFull = _sig.composeTextBody(content, sigInfo.closingLine, sigInfo.fromName);
        var gmailOpts = {
          from: fromEmail,
          to: to,
          subject: subject,
          text: textFull,
          html: htmlFull,
        };
        if (aiOmniBcc) gmailOpts.bcc = aiOmniBcc;
        var info = await transport.sendMail(gmailOpts);
        console.log('[send-digest-reply] Gmail sent to=' + to + ' messageId=' + info.messageId);
        return res.status(200).json({ success: true, method: 'gmail', messageId: info.messageId });
      } catch (err) {
        console.error('[send-digest-reply] Gmail error:', err.message, '— falling back to SendGrid');
        sendMethod = 'sendgrid';
      }
    }
  }

  // SendGrid path
  if (!process.env.SENDGRID_API_KEY) return res.status(500).json({ error: 'SENDGRID_API_KEY missing' });
  try {
    var sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    var bodyHtml2 = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.6;white-space:pre-wrap;">' + content.replace(/</g, '&lt;') + '</div>';
    var sgPayload = {
      to: to,
      from: { email: fromEmail, name: sigInfo.fromName || 'EngageWorx' },
      replyTo: fromEmail,
      subject: subject,
      text: _sig.composeTextBody(content, sigInfo.closingLine, sigInfo.fromName),
      html: _sig.composeHtmlBody(bodyHtml2, sigInfo.closingLine, sigInfo.signatureHtml),
    };
    if (aiOmniBcc) sgPayload.bcc = { email: aiOmniBcc };
    await sgMail.send(sgPayload);
    console.log('[send-digest-reply] SendGrid sent to=' + to);
    return res.status(200).json({ success: true, method: 'sendgrid' });
  } catch (err) {
    console.error('[send-digest-reply] SendGrid error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
