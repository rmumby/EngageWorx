// api/_lib/wrap-and-dispatch.js — Shared email wrap + dispatch + persist
// Used by: email-inbound-concierge (auto_send), draft-approve (Approve & Send).
// Takes body-only HTML, wraps with branded header + signature, dispatches via sendTenantEmail,
// persists outbound message. Guarantees byte-identical output regardless of send path.

var { sendTenantEmail } = require('./send-tenant-email');
var { getSignature } = require('../_email-signature');

async function wrapAndDispatch(supabase, opts) {
  var tenantId = opts.tenantId;
  var tenantName = opts.tenantName;
  var conversationId = opts.conversationId;
  var contactId = opts.contactId;
  var senderEmail = opts.senderEmail;
  var recipientEmail = opts.recipientEmail;
  var tenantSenderEmail = opts.tenantSenderEmail;
  var replySubject = opts.replySubject;
  var cleanBody = opts.cleanBody;
  var bodyContent = opts.bodyContent;

  // Wrap in flush-left body div
  var bodyHtml = '<div style="font-family:Georgia,serif;max-width:600px;margin:0;color:#1e293b;font-size:15px;line-height:1.75;">' + bodyContent + '</div>';

  // Resolve signature
  var sigInfo = { fromName: tenantName || 'Team', signatureHtml: '', closingLine: '' };
  try {
    sigInfo = await getSignature(supabase, { tenantId: tenantId, fromEmail: tenantSenderEmail || recipientEmail, isFirstTouch: false, closingKind: 'none' });
  } catch (sigErr) { console.warn('[wrapAndDispatch] Signature resolve error:', sigErr.message); }

  // Brand header
  var brandColor = '#1e293b';
  try {
    var { data: brandData } = await supabase.from('tenants').select('brand_primary').eq('id', tenantId).maybeSingle();
    if (brandData && brandData.brand_primary) brandColor = brandData.brand_primary;
  } catch (e) {}
  var headerHtml = '<div style="border-bottom:3px solid ' + brandColor + ';padding:0 0 10px;margin:0 0 16px;">' +
    '<span style="font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:' + brandColor + ';">' + (tenantName || '') + '</span></div>';

  // Compose: header + body + signature
  var signatureBlock = sigInfo.signatureHtml ? '<div style="margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0;">' + sigInfo.signatureHtml + '</div>' : '';
  var replyHtml = headerHtml + bodyHtml + signatureBlock;

  // Dispatch
  var sendOk = false;
  var sentAt = new Date().toISOString();
  var providerName = null;
  var providerMessageId = null;
  try {
    var sendResult = await sendTenantEmail(supabase, {
      tenant_id: tenantId, to: senderEmail,
      from: tenantSenderEmail || recipientEmail,
      from_name: sigInfo.fromName || tenantName || 'Team',
      subject: replySubject, html: replyHtml, text: cleanBody,
      reply_to: recipientEmail,
    });
    if (sendResult.blocked) {
      console.error('[wrapAndDispatch] Reply BLOCKED:', sendResult.block_reason);
    } else {
      sendOk = true;
      providerName = sendResult.method || null;
      providerMessageId = sendResult.message_id || null;
      console.log('[wrapAndDispatch] Reply sent:', providerMessageId || providerName || 'ok');
    }
  } catch (sendErr) {
    console.error('[wrapAndDispatch] Reply send failed:', sendErr.message);
    throw sendErr;
  }

  // Persist outbound message
  if (conversationId) {
    try {
      // sender_type defaults to 'bot' (auto_send). Human-driven callers (e.g.
      // draft-approve's Approve & Send) pass senderType:'agent' so the persisted
      // message is attributed to the logged-in human, not the AI. senderMeta
      // retains provenance (e.g. approving user id, origin path).
      await supabase.from('messages').insert({
        tenant_id: tenantId, conversation_id: conversationId, contact_id: contactId,
        channel: 'email', direction: 'outbound',
        sender_type: opts.senderType || 'bot',
        body: cleanBody, status: sendOk ? 'delivered' : 'failed',
        sent_at: sendOk ? sentAt : null,
        // Capture the provider response id so delivery/troubleshooting can correlate
        // the sent message with the provider's record (was previously null).
        provider: providerName,
        provider_message_id: providerMessageId,
        // Write created_at explicitly (UTC ISO) — matches manual sends. Omitting it
        // lets the DB default now() store a session-tz-naive value, which renders ~2h
        // off in the client vs manual messages. (P2: AI timestamp tz mismatch.)
        created_at: sentAt,
        // Persist the actual sent body HTML so the sent log == what was delivered.
        metadata: Object.assign({}, opts.senderMeta || {}, { html: bodyContent }),
      });
    } catch (outErr) {
      console.error('[wrapAndDispatch] Outbound message persist error:', outErr.message);
    }
  }

  return { sent: sendOk, sentAt: sentAt };
}

module.exports = { wrapAndDispatch: wrapAndDispatch };
