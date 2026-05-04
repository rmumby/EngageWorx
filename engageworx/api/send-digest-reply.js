// api/send-digest-reply.js — Sends a reply routed through tenant's email config
// Wraps content in signature, routes via sendTenantEmail.

var { createClient } = require('@supabase/supabase-js');
var { sendTenantEmail } = require('./_lib/send-tenant-email');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var body = req.body || {};
  var to = (body.to || '').trim();
  var subject = (body.subject || '').trim();
  var content = body.body || '';
  var tenantId = body.tenant_id || null;
  var conversationId = body.conversation_id || null;
  if (!to || !subject || !content) return res.status(400).json({ error: 'to, subject, body required' });

  var supabase = createClient(process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Load signature
  var _sig = require('./_email-signature');
  var sigInfo = await _sig.getSignature(supabase, { tenantId: tenantId, fromEmail: null, isFirstTouch: false, closingKind: 'reply' });

  // Build HTML body with signature
  var bodyHtml = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.6;white-space:pre-wrap;">' + content.replace(/</g, '&lt;') + '</div>';
  var htmlFull = _sig.composeHtmlBody(bodyHtml, sigInfo.closingLine, sigInfo.signatureHtml);
  var textFull = _sig.composeTextBody(content, sigInfo.closingLine, sigInfo.fromName);

  // Load BCC address
  var bcc = null;
  if (tenantId) {
    try {
      var bccCfg = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', tenantId).eq('channel', 'email').maybeSingle();
      var bccVal = bccCfg.data && bccCfg.data.config_encrypted && bccCfg.data.config_encrypted.ai_omni_bcc;
      if (bccVal && bccVal.indexOf('@') > 0 && bccVal !== to) bcc = bccVal;
    } catch (_) {}
  }

  try {
    if (!tenantId) {
      // No tenant context — use platform Resend directly (admin/system sends)
      var { sendEmail } = require('./_lib/send-email');
      var result = await sendEmail({ to: to, subject: subject, html: htmlFull, text: textFull });
      if (!result.success) return res.status(500).json({ error: result.error });
      return res.status(200).json({ success: true, method: 'platform_resend' });
    }

    var sendResult = await sendTenantEmail(supabase, {
      tenant_id: tenantId,
      to: to,
      subject: subject,
      html: htmlFull,
      text: textFull,
      conversation_id: conversationId,
      bcc: bcc,
    });

    return res.status(200).json({
      success: true,
      method: sendResult.method,
      message_id: sendResult.message_id,
      violation: sendResult.violation || false,
    });
  } catch (err) {
    console.error('[send-digest-reply] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
