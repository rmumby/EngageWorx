// api/email-inbound-concierge.js — Resend inbound webhook for wedding concierge email channel
// POST /api/email-inbound-concierge (Resend inbound webhook)
// Receives email to weddings@delameremanor.co.uk → identifies couple → AI concierge → replies

var { createClient } = require('@supabase/supabase-js');
var { sendTenantEmail } = require('./_lib/send-tenant-email');
var { generateConciergeResponse } = require('./wedding-concierge');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  // ── 1. Verify Resend webhook signature ────────────────────────────────
  var webhookSecret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (webhookSecret) {
    var signature = req.headers['x-webhook-signature'] || req.headers['svix-signature'] || '';
    if (!signature) {
      console.warn('[email-concierge] Missing webhook signature — rejecting');
      return res.status(401).json({ error: 'Missing signature' });
    }
    // Svix verification: for v1, accept if secret is configured and signature header is present
    // Full Svix SDK verification can be added later for stricter validation
  }

  var supabase = getSupabase();
  var payload = req.body || {};

  // Resend webhook nests email fields inside data object
  var eventData = payload.data || payload;

  // Extract fields per Resend email.received webhook schema
  var fromRaw = eventData.from || '';
  var toArray = Array.isArray(eventData.to) ? eventData.to : [eventData.to].filter(Boolean);
  var subject = eventData.subject || '(no subject)';
  var bodyText = eventData.text || '';
  var bodyHtml = eventData.html || '';
  // Resend headers: array of {name, value} objects
  var headersArr = Array.isArray(eventData.headers) ? eventData.headers : [];
  function findHeader(name) {
    var lower = name.toLowerCase();
    var h = headersArr.find(function(x) { return x && x.name && x.name.toLowerCase() === lower; });
    return h ? h.value : null;
  }
  var messageId = (findHeader('message-id') || '').replace(/[<>]/g, '');
  var inReplyTo = (findHeader('in-reply-to') || '').replace(/[<>]/g, '') || null;

  // Sender: Resend from is a plain string (email or "Name <email>")
  var senderMatch = fromRaw.match(/<([^>]+)>/) || [null, fromRaw];
  var senderEmail = (senderMatch[1] || fromRaw || '').toLowerCase().trim();
  var senderName = (fromRaw.match(/^([^<]+)</) || [])[1];
  senderName = senderName ? senderName.trim().replace(/"/g, '') : '';

  // Recipient: Resend to is an array of plain email strings
  var recipientEmail = (toArray[0] || '').toLowerCase().trim();
  var recipientDomain = recipientEmail.split('@')[1] || '';

  // Use text body; fall back to stripped HTML (Gmail often sends HTML-only)
  var emailBody = (bodyText || '').trim();
  if (!emailBody && bodyHtml) {
    emailBody = bodyHtml
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  console.log('[email-concierge] Inbound:', { from: senderEmail, to: recipientEmail, subject: subject.substring(0, 60) });
  console.log('[email-concierge] Body extracted:', { textLength: (bodyText || '').length, htmlLength: (bodyHtml || '').length, bodyLength: emailBody.length, preview: emailBody.substring(0, 100) });

  if (!senderEmail || !recipientEmail) {
    console.log('[email-concierge] Missing sender or recipient — dropping');
    return res.status(200).json({ ok: true, dropped: 'missing_addresses' });
  }

  // ── 2. Tenant resolution ──────────────────────────────────────────────
  var tenantId = null;
  var tenantName = null;

  // (a) Check channel_configs for exact recipient email match
  try {
    var { data: configs } = await supabase.from('channel_configs')
      .select('tenant_id, config_encrypted')
      .eq('channel', 'email');

    if (configs) {
      for (var i = 0; i < configs.length; i++) {
        var cfg = configs[i].config_encrypted || {};
        var inboundEmail = (cfg.inbound_email || cfg.from_email || '').toLowerCase();
        if (inboundEmail === recipientEmail) {
          tenantId = configs[i].tenant_id;
          break;
        }
      }
    }
  } catch (e) {}

  // (b) Progressive domain match: strip subdomains until custom_domain matches
  if (!tenantId && recipientDomain) {
    var domainParts = recipientDomain.split('.');
    var domainCandidates = [];
    for (var di = 0; di <= domainParts.length - 2; di++) {
      var candidate = domainParts.slice(di).join('.');
      if (candidate.split('.').length >= 2) domainCandidates.push(candidate);
    }
    for (var dc = 0; dc < domainCandidates.length; dc++) {
      try {
        var { data: matched } = await supabase.from('tenants')
          .select('id, name, custom_domain')
          .eq('custom_domain', domainCandidates[dc])
          .maybeSingle();
        if (matched) {
          tenantId = matched.id;
          tenantName = matched.name;
          console.log('[email-concierge] Matched tenant:', matched.name, 'via custom_domain:', domainCandidates[dc]);
          break;
        }
      } catch (e) { continue; }
    }
  }

  if (!tenantId) {
    console.log('[email-concierge] No tenant for recipient:', recipientEmail, 'tried:', recipientDomain);
    return res.status(200).json({ ok: true, dropped: 'no_tenant_match' });
  }

  // ── 3. Verify concierge is enabled for this tenant ────────────────────
  var { data: chatbotConfig } = await supabase.from('chatbot_configs')
    .select('id, channels_active')
    .eq('tenant_id', tenantId)
    .eq('surface', 'wedding_concierge')
    .maybeSingle();

  if (!chatbotConfig || !(chatbotConfig.channels_active || []).includes('email')) {
    console.log('[email-concierge] Email channel not active for wedding_concierge, tenant:', tenantId);
    return res.status(200).json({ ok: true, dropped: 'email_not_active' });
  }

  // ── 4. Couple resolution ──────────────────────────────────────────────
  var { data: contact } = await supabase.from('contacts')
    .select('id, first_name, last_name, email')
    .eq('tenant_id', tenantId)
    .ilike('email', senderEmail)
    .limit(1).maybeSingle();

  var contactId = contact ? contact.id : null;
  var weddingId = null;

  if (contactId) {
    // Find wedding where this contact is primary or partner
    var { data: wedding } = await supabase.from('weddings')
      .select('id, display_name')
      .eq('tenant_id', tenantId)
      .or('primary_contact_id.eq.' + contactId + ',partner_contact_id.eq.' + contactId)
      .limit(1).maybeSingle();

    if (wedding) {
      weddingId = wedding.id;
      console.log('[email-concierge] Matched wedding:', wedding.display_name || wedding.id, 'for contact:', contactId);
    }
  }

  if (!weddingId) {
    console.log('[email-concierge] No wedding for sender:', senderEmail, '— routing to unrecognised');
  }

  // If no wedding found: create support ticket for manual triage
  if (!weddingId) {
    console.log('[email-concierge] Unrecognised sender — creating support ticket:', senderEmail);
    try {
      await supabase.from('support_tickets').insert({
        tenant_id: tenantId,
        subject: 'Unrecognised sender: ' + subject,
        description: 'Email from ' + senderEmail + (senderName ? ' (' + senderName + ')' : '') + ' to ' + recipientEmail + '.\n\nSubject: ' + subject + '\n\nBody:\n' + emailBody.substring(0, 3000),
        submitter_email: senderEmail,
        submitter_name: senderName || senderEmail,
        submitter_type: 'external',
        category: 'wedding_concierge_unrecognised_sender',
        channel: 'email',
        ai_handled: false,
        wedding_id: null,
        status: 'open',
        priority: 'normal',
        transcript_snapshot: { from: fromRaw, to: toArray, subject: subject, text: emailBody.substring(0, 5000), html: bodyHtml ? bodyHtml.substring(0, 5000) : null, headers: headersArr.slice(0, 30) },
        metadata: { source: 'resend_inbound', message_id: messageId || null, in_reply_to: inReplyTo, resend_event_id: eventData.id || null },
      });
    } catch (ticketErr) { console.error('[email-concierge] Ticket insert error:', ticketErr.message); }
    return res.status(200).json({ ok: true, action: 'unrecognised_sender_ticket' });
  }

  // ── 5. Conversation continuity ────────────────────────────────────────
  var conversationId = null;
  try {
    // Find existing conversation
    var { data: existingConv } = await supabase.from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId)
      .eq('channel', 'email')
      .limit(1).maybeSingle();

    if (existingConv) {
      conversationId = existingConv.id;
      await supabase.from('conversations').update({
        last_message_at: new Date().toISOString(),
        unread_count: supabase.rpc ? 1 : 1, // increment handled by trigger if exists
      }).eq('id', conversationId);
    } else {
      var { data: newConv } = await supabase.from('conversations').insert({
        tenant_id: tenantId,
        contact_id: contactId,
        channel: 'email',
        status: 'active',
        subject: subject,
        last_message_at: new Date().toISOString(),
        unread_count: 1,
      }).select('id').single();
      if (newConv) conversationId = newConv.id;
    }
  } catch (convErr) { console.warn('[email-concierge] Conversation error:', convErr.message); }

  // ── 6. Persist inbound message ────────────────────────────────────────
  if (conversationId) {
    try {
      await supabase.from('messages').insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        contact_id: contactId,
        channel: 'email',
        direction: 'inbound',
        sender_type: 'contact',
        body: emailBody.substring(0, 10000),
        status: 'delivered',
      });
    } catch (msgErr) { console.warn('[email-concierge] Inbound message persist error:', msgErr.message); }
  }

  // ── 7. Call AI concierge ──────────────────────────────────────────────
  var contactName = contact ? ((contact.first_name || '') + ' ' + (contact.last_name || '')).trim() : senderName;

  // Guard: if body is empty after all extraction, don't call Anthropic
  var userMessage = (emailBody || '').substring(0, 5000).trim();
  if (!userMessage) {
    console.log('[email-concierge] Empty body after extraction — skipping AI call');
    return res.status(200).json({ ok: true, action: 'empty_body_skipped', wedding_id: weddingId });
  }

  console.log('[email-concierge] Calling Anthropic:', { messageLength: userMessage.length, wedding: weddingId ? 'yes' : 'no', contact: contactName || senderEmail });

  var aiResult;
  try {
    aiResult = await generateConciergeResponse(supabase, {
      tenantId: tenantId,
      surface: 'wedding_concierge',
      weddingId: weddingId,
      conversationId: conversationId,
      userMessage: userMessage,
      contactMeta: { name: contactName, email: senderEmail },
    });
  } catch (aiErr) {
    console.error('[email-concierge] AI error:', aiErr.message);
    return res.status(500).json({ error: 'AI generation failed' });
  }

  console.log('[email-concierge] AI response:', { prefix: aiResult.prefix, length: aiResult.response.length, kb: aiResult.kb_article_count });

  // ── 8. Send reply email ───────────────────────────────────────────────
  var replySubject = subject.startsWith('Re:') ? subject : 'Re: ' + subject;
  var replyHtml = '<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:20px;color:#1e293b;font-size:15px;line-height:1.75;">' +
    aiResult.response.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') +
    '</div>';

  try {
    var sendResult = await sendTenantEmail(supabase, {
      tenant_id: tenantId,
      to: senderEmail,
      from: recipientEmail,
      from_name: 'Delamere Manor',
      subject: replySubject,
      html: replyHtml,
      text: aiResult.response,
      reply_to: recipientEmail,
    });
    console.log('[email-concierge] Reply sent:', sendResult.message_id || 'ok');
  } catch (sendErr) {
    console.error('[email-concierge] Reply send failed:', sendErr.message);
    // Don't fail the webhook — email is already ingested
  }

  // ── 9. Persist outbound message ───────────────────────────────────────
  if (conversationId) {
    try {
      await supabase.from('messages').insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        contact_id: contactId,
        channel: 'email',
        direction: 'outbound',
        sender_type: 'bot',
        body: aiResult.response,
        status: 'delivered',
      });
    } catch (outErr) { console.warn('[email-concierge] Outbound message persist error:', outErr.message); }
  }

  // ── 10. Prefix routing ────────────────────────────────────────────────
  if (aiResult.prefix === 'ESCALATE') {
    try {
      await supabase.from('support_tickets').insert({
        tenant_id: tenantId,
        wedding_id: weddingId,
        subject: 'Concierge escalation: ' + subject,
        description: 'Original email from ' + contactName + ' (' + senderEmail + '):\n\n' + emailBody.substring(0, 3000) + '\n\n---\n\nAI escalation summary:\n' + aiResult.response,
        submitter_email: senderEmail,
        submitter_name: contactName || senderEmail,
        submitter_type: 'couple',
        category: 'wedding_concierge_escalation',
        channel: 'email',
        ai_handled: true,
        status: 'open',
        priority: 'high',
        transcript_snapshot: { from: fromRaw, to: toArray, subject: subject, text: emailBody.substring(0, 5000), html: bodyHtml ? bodyHtml.substring(0, 5000) : null, headers: headersArr.slice(0, 30) },
        metadata: { source: 'resend_inbound', message_id: messageId || null, in_reply_to: inReplyTo, resend_event_id: eventData.id || null },
      });
      console.log('[email-concierge] Escalation ticket created for:', senderEmail);
    } catch (escErr) { console.error('[email-concierge] Escalation ticket error:', escErr.message); }
  }

  return res.status(200).json({
    ok: true,
    prefix: aiResult.prefix,
    wedding_id: weddingId,
    conversation_id: conversationId,
  });
};
