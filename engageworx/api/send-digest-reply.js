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

  // Resolve the tenant's concierge From-address + thread contact server-side.
  // Server-authoritative: never trust a client-supplied "from". Mirrors the
  // auto_send / draft-approve resolution so a manual reply sends from the SAME
  // tenant concierge address as an AI reply — not the platform fallback. Tenant-
  // generic: derives each tenant's own address from its own config.
  var fromAddress = null;
  var fromName = null;
  if (tenantId) {
    try {
      var ccfg = await supabase.from('channel_configs').select('config_encrypted')
        .eq('tenant_id', tenantId).eq('channel', 'email').maybeSingle();
      if (ccfg.data && ccfg.data.config_encrypted) {
        var cfg = ccfg.data.config_encrypted;
        fromAddress = (cfg.inbound_email || cfg.from_email || '').toLowerCase() || null;
      }
    } catch (_) {}
    try {
      var tRow = await supabase.from('tenants')
        .select('name, brand_name, default_sender_email, resend_domain')
        .eq('id', tenantId).maybeSingle();
      if (tRow.data) {
        fromName = tRow.data.brand_name || tRow.data.name || null;
        if (!fromAddress) {
          if (tRow.data.default_sender_email) fromAddress = tRow.data.default_sender_email;
          else if (tRow.data.resend_domain) fromAddress = 'noreply@' + tRow.data.resend_domain;
        }
      }
    } catch (_) {}
    // To = the conversation's actual thread contact (defense-in-depth vs stale client state)
    if (conversationId) {
      try {
        var cRow = await supabase.from('conversations').select('contact_id')
          .eq('id', conversationId).eq('tenant_id', tenantId).maybeSingle();
        if (cRow.data && cRow.data.contact_id) {
          var ctRow = await supabase.from('contacts').select('email').eq('id', cRow.data.contact_id).maybeSingle();
          if (ctRow.data && ctRow.data.email) to = ctRow.data.email.trim().toLowerCase();
        }
      } catch (_) {}
    }
  }

  // Load signature
  var _sig = require('./_email-signature');
  var sigInfo = await _sig.getSignature(supabase, { tenantId: tenantId, fromEmail: fromAddress, isFirstTouch: false, closingKind: 'reply' });

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
      from: fromAddress || undefined,
      from_name: fromName || undefined,
      reply_to: fromAddress || undefined,
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
