// api/email-inbound-concierge.js — Resend inbound webhook for wedding concierge email channel
// POST /api/email-inbound-concierge (Resend inbound webhook)
// Receives email to weddings@delameremanor.co.uk → identifies couple → AI concierge → replies

var { createClient } = require('@supabase/supabase-js');
var { Resend } = require('resend');
var { sendTenantEmail } = require('./_lib/send-tenant-email');
var { getNotifyEmails } = require('./_notify');
var { generateConciergeResponse } = require('./wedding-concierge');
var { findMatchingRule, executeActions } = require('./_lib/evaluate-escalation');
var { systemMailHeaders, isSystemMail } = require('./_lib/system-mail');
var { markdownToHtml } = require('./_lib/markdown-to-html');
var { getSignature, composeHtmlBody, composeTextBody } = require('./_email-signature');
var { wrapAndDispatch } = require('./_lib/wrap-and-dispatch');
var { checkInboundBlock } = require('./_lib/blocklist');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Conservative quoted-reply stripping — shared helper (see _lib/strip-quoted-reply.js),
// also used by the main email-inbound path so both surfaces strip identically.
var { stripQuotedReply } = require('./_lib/strip-quoted-reply');

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

  // Extract metadata from webhook payload (body NOT included — must fetch via API)
  var fromRaw = eventData.from || '';
  var toArray = Array.isArray(eventData.to) ? eventData.to : [eventData.to].filter(Boolean);
  var subject = eventData.subject || '(no subject)';
  var messageId = (eventData.message_id || '').replace(/[<>]/g, '');

  // Sender: Resend from is a plain string (email or "Name <email>")
  var senderMatch = fromRaw.match(/<([^>]+)>/) || [null, fromRaw];
  var senderEmail = (senderMatch[1] || fromRaw || '').toLowerCase().trim();
  var senderName = (fromRaw.match(/^([^<]+)</) || [])[1];
  senderName = senderName ? senderName.trim().replace(/"/g, '') : '';

  // Recipient: Resend to is an array of plain email strings
  var recipientEmail = (toArray[0] || '').toLowerCase().trim();
  var recipientDomain = recipientEmail.split('@')[1] || '';

  console.log('[email-concierge] Inbound:', { from: senderEmail, to: recipientEmail, subject: subject.substring(0, 60) });

  // Resend webhook only delivers metadata. Fetch full email content via SDK.
  var emailId = eventData.email_id;
  if (!emailId) {
    console.error('[email-concierge] No email_id in webhook payload — cannot fetch body');
    return res.status(200).json({ ok: true, dropped: 'no_email_id' });
  }

  var resend = new Resend(process.env.RESEND_API_KEY);
  var fullEmail;
  try {
    var result = await resend.emails.receiving.get(emailId);
    if (result.error) {
      console.error('[email-concierge] resend.emails.receiving.get error:', result.error);
      return res.status(500).json({ error: 'resend_inbound_fetch_failed' });
    }
    fullEmail = result.data;
    console.log('[email-concierge] Fetched inbound email — keys:', Object.keys(fullEmail || {}));
    console.log('[email-concierge] Body lengths:', { text: (fullEmail.text || '').length, html: (fullEmail.html || '').length });
  } catch (fetchErr) {
    console.error('[email-concierge] resend.emails.receiving.get threw:', fetchErr.message);
    return res.status(500).json({ error: 'resend_inbound_fetch_threw' });
  }

  // Extract body from SDK-fetched email
  var rawText = fullEmail.text || '';
  var rawHtml = fullEmail.html || '';
  var emailBody = rawText.trim() || stripHtml(rawHtml);
  // Bug C: store only the new reply in message.body; full raw body retained in metadata.raw_body.
  var replyBody = stripQuotedReply(emailBody);
  var inReplyTo = null;
  var headersArr = Array.isArray(fullEmail.headers) ? fullEmail.headers : [];
  if (headersArr.length > 0) {
    var irh = headersArr.find(function(x) { return x && x.name && x.name.toLowerCase() === 'in-reply-to'; });
    if (irh) inReplyTo = (irh.value || '').replace(/[<>]/g, '') || null;
  }

  console.log('[email-concierge] Body extracted:', { textLength: rawText.length, htmlLength: rawHtml.length, finalBodyLength: emailBody.length, preview: emailBody.substring(0, 100) });

  if (!senderEmail || !recipientEmail) {
    console.log('[email-concierge] Missing sender or recipient — dropping');
    return res.status(200).json({ ok: true, dropped: 'missing_addresses' });
  }

  // Drop the platform's own system/notification mail (root fix for self-referential escalation
  // loops: our outbound notify can never be re-ingested as customer inbound and re-trigger a rule).
  if (isSystemMail(headersArr)) {
    console.log('[email-concierge] Blocked platform system/notification email from: ' + senderEmail);
    return res.status(200).json({ ok: true, dropped: 'system_notification' });
  }

  // ── 2. Tenant resolution ──────────────────────────────────────────────
  var tenantId = null;
  var tenantName = null;
  var tenantSenderEmail = null;

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

  // (a2) Match tenants.inbound_domain — dedicated inbound key (exact or subdomain),
  // ahead of custom_domain/resend_domain. This is the authoritative destination mapping.
  if (!tenantId && recipientDomain) {
    var idParts = recipientDomain.split('.');
    for (var idi = 0; idi <= idParts.length - 2; idi++) {
      var idCand = idParts.slice(idi).join('.');
      if (idCand.split('.').length < 2) continue;
      try {
        var { data: idMatch } = await supabase.from('tenants')
          .select('id, name, brand_name, custom_domain, default_sender_email, resend_domain')
          .ilike('inbound_domain', idCand).maybeSingle();
        if (idMatch) {
          tenantId = idMatch.id;
          tenantName = idMatch.brand_name || idMatch.name;
          tenantSenderEmail = idMatch.default_sender_email || (idMatch.resend_domain ? 'weddings@' + idMatch.resend_domain : null);
          console.log('[email-concierge] Matched tenant:', idMatch.name, 'via inbound_domain:', idCand);
          break;
        }
      } catch (e) { continue; }
    }
  }

  // (b) Progressive domain match: strip subdomains until custom_domain matches
  if (!tenantId && recipientDomain) {
    var domainParts = recipientDomain.split('.');
    var domainCandidates = [];
    for (var di = 0; di <= domainParts.length - 2; di++) {
      var candidate = domainParts.slice(di).join('.');
      if (candidate.split('.').length >= 2) domainCandidates.push(candidate);
    }
    console.log('[email-concierge] Domain candidates:', domainCandidates);
    for (var dc = 0; dc < domainCandidates.length; dc++) {
      try {
        var { data: matched, error: matchErr } = await supabase.from('tenants')
          .select('id, name, brand_name, custom_domain, default_sender_email, resend_domain')
          .eq('custom_domain', domainCandidates[dc])
          .maybeSingle();
        if (matchErr) {
          console.error('[email-concierge] Domain match query error for', domainCandidates[dc], ':', matchErr.message, matchErr.code);
          continue;
        }
        if (matched) {
          tenantId = matched.id;
          tenantName = matched.brand_name || matched.name;
          tenantSenderEmail = matched.default_sender_email || (matched.resend_domain ? 'weddings@' + matched.resend_domain : null);
          console.log('[email-concierge] Matched tenant:', matched.name, 'via custom_domain:', domainCandidates[dc]);
          break;
        } else {
          console.log('[email-concierge] No match for custom_domain:', domainCandidates[dc]);
        }
      } catch (e) {
        console.error('[email-concierge] Domain match threw for', domainCandidates[dc], ':', e.message);
        continue;
      }
    }
  }

  // (c) Fallback: match resend_domain
  if (!tenantId && recipientDomain) {
    var domainParts2 = recipientDomain.split('.');
    for (var di2 = 0; di2 <= domainParts2.length - 2; di2++) {
      var candidate2 = domainParts2.slice(di2).join('.');
      if (candidate2.split('.').length < 2) continue;
      try {
        var { data: rdMatch, error: rdErr } = await supabase.from('tenants')
          .select('id, name, brand_name, custom_domain, default_sender_email, resend_domain')
          .eq('resend_domain', candidate2)
          .maybeSingle();
        if (rdErr) continue;
        if (rdMatch) {
          tenantId = rdMatch.id;
          tenantName = rdMatch.brand_name || rdMatch.name;
          tenantSenderEmail = rdMatch.default_sender_email || ('weddings@' + rdMatch.resend_domain);
          console.log('[email-concierge] Matched tenant:', rdMatch.name, 'via resend_domain:', candidate2);
          break;
        }
      } catch (e) { continue; }
    }
  }

  if (!tenantId) {
    console.log('[email-concierge] No tenant for recipient:', recipientEmail, 'tried candidates for domain:', recipientDomain);
    // Isolation fail-safe parity with email-inbound.js: log the unresolved destination.
    // No attempted sender tenant here (concierge never sender-resolves) — bucket under the
    // platform/SP tenant so the row satisfies NOT NULL and is auditable.
    try {
      await supabase.from('email_routing_violations').insert({
        tenant_id: (process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387'),
        violation_type: 'inbound_destination_unresolved',
        to_address: recipientEmail,
        used_fallback: 'none',
      });
    } catch (_) {}
    return res.status(200).json({ ok: true, dropped: 'no_tenant_match' });
  }

  // ── 3. Verify concierge is enabled for this tenant ────────────────────
  var CONCIERGE_SURFACES = ['wedding_concierge', 'helpdesk'];
  var chatbotConfig = null;
  var matchedSurface = null;
  for (var si = 0; si < CONCIERGE_SURFACES.length; si++) {
    var { data: cfgCheck } = await supabase.from('chatbot_configs')
      .select('id, channels_active, ai_reply_mode')
      .eq('tenant_id', tenantId)
      .eq('surface', CONCIERGE_SURFACES[si])
      .maybeSingle();
    if (cfgCheck && (cfgCheck.channels_active || []).includes('email')) {
      chatbotConfig = cfgCheck;
      matchedSurface = CONCIERGE_SURFACES[si];
      break;
    }
  }

  if (!chatbotConfig) {
    console.log('[email-concierge] No email-enabled concierge surface for tenant:', tenantId);
    return res.status(200).json({ ok: true, dropped: 'email_not_active' });
  }
  console.log('[email-concierge] Matched surface:', matchedSurface, 'for tenant:', tenantId);

  // ── 3a. Inbound blocklist gate — reject blocked senders BEFORE any contact/conversation
  // create or AI/auto-send. Shared matcher with the general inbound path (api/_lib/blocklist).
  // This is the root-cause fix for the concierge auto-replying to e.g.
  // messages-noreply@linkedin.com despite linkedin.com + no-reply@ being blocked.
  try {
    var { data: blkCfg } = await supabase.from('tenants')
      .select('blocked_domains, blocked_keywords').eq('id', tenantId).maybeSingle();
    if (blkCfg) {
      var blk = checkInboundBlock(senderEmail, subject, { domains: blkCfg.blocked_domains, keywords: blkCfg.blocked_keywords });
      if (blk.blocked) {
        console.log('🚫 [email-concierge] Blocked by tenant blocklist:', blk.matched, 'sender:', senderEmail);
        return res.status(200).json({ ok: true, dropped: 'tenant_blocklist', matched: blk.matched });
      }
    }
  } catch (blkErr) { console.warn('[email-concierge] Blocklist check error (non-fatal):', blkErr.message); }

  // ── 3b. Persist inbound to messages (unconditional — ensures Live Inbox visibility) ──
  var earlyContactId = null;
  var earlyConversationId = null;
  try {
    // Find or create contact so inbound is always linkable — tenant-scoped, race-safe RPC (052).
    var { data: fcContactId } = await supabase.rpc('find_or_create_contact', {
      p_tenant_id: tenantId, p_email: senderEmail,
      p_first_name: senderName || null, p_source: 'inbound_email',
    });
    if (fcContactId) earlyContactId = fcContactId;
    // Find or create conversation
    if (earlyContactId) {
      var { data: earlyConv } = await supabase.from('conversations')
        .select('id').eq('tenant_id', tenantId).eq('contact_id', earlyContactId).eq('channel', 'email')
        .limit(1).maybeSingle();
      if (earlyConv) {
        earlyConversationId = earlyConv.id;
        await supabase.from('conversations').update({ last_message_at: new Date().toISOString(), unread_count: 1, status: 'active' }).eq('id', earlyConversationId);
        console.warn('[status-audit] conv=' + earlyConversationId + ' status=active via=inbound-early-reply');
        try { await supabase.from('debug_logs').insert({ endpoint: 'email-inbound-concierge', action: 'status-audit', payload: { conv_id: earlyConversationId, prev_status: null, new_status: 'active', via: 'inbound-early-reply' } }); } catch (_) {}
      } else {
        var { data: newConv } = await supabase.from('conversations').insert({
          tenant_id: tenantId, contact_id: earlyContactId, channel: 'email',
          status: 'active', subject: subject, last_message_at: new Date().toISOString(), unread_count: 1,
        }).select('id').single();
        if (newConv) earlyConversationId = newConv.id;
      }
    }
    // Insert inbound message
    if (earlyConversationId) {
      await supabase.from('messages').insert({
        tenant_id: tenantId, conversation_id: earlyConversationId, contact_id: earlyContactId,
        channel: 'email', direction: 'inbound', sender_type: 'contact',
        body: replyBody.substring(0, 10000), subject: subject, status: 'delivered',
        metadata: { source: 'resend_inbound', message_id: messageId || null, from: senderEmail, to: recipientEmail, raw_body: emailBody.substring(0, 10000) },
      });
      console.log('[email-concierge] Early inbound message persisted — conv:', earlyConversationId, 'contact:', earlyContactId);
    }
  } catch (earlyErr) {
    console.error('[email-concierge] Early persist error (non-fatal):', earlyErr.message);
  }

  // ── 4. Contact + couple resolution ─────────────────────────────────────
  var { data: contact } = await supabase.from('contacts')
    .select('id, first_name, last_name, email, is_blocked')
    .eq('tenant_id', tenantId)
    .ilike('email', senderEmail)
    .limit(1).maybeSingle();

  // Outbound suppression: a contact marked blocked (Inbox "Block") never gets an AI
  // auto-reply/draft. Inbound is already persisted above for visibility; we just stop here.
  if (contact && contact.is_blocked) {
    console.log('🚫 [email-concierge] Contact is_blocked — skipping AI/auto-send for:', senderEmail);
    return res.status(200).json({ ok: true, action: 'contact_blocked', conversation_id: earlyConversationId || null });
  }

  var contactId = contact ? contact.id : (earlyContactId || null);
  var contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : (senderName || senderEmail.split('@')[0]);
  var weddingId = null;

  // Wedding lookup + unrecognised-sender ticket gate: wedding_concierge ONLY
  if (matchedSurface === 'wedding_concierge') {
    if (contactId) {
      var { data: wedding } = await supabase.from('weddings')
        .select('id, display_name, wedding_date')
        .eq('tenant_id', tenantId)
        .or('primary_contact_id.eq.' + contactId + ',partner_contact_id.eq.' + contactId)
        .limit(1).maybeSingle();

      if (wedding) {
        weddingId = wedding.id;
        console.log('[email-concierge] Matched wedding:', wedding.display_name, 'id:', wedding.id, 'date:', wedding.wedding_date);
      }
    }

    if (!weddingId) {
      // Enquiry surface must never auto-create Help Desk tickets (96202d7d). An unrecognised
      // sender is a new enquiry — fall through to the AI concierge draft + Live Inbox like any
      // other email. generateConciergeResponse handles a null weddingId (no wedding context).
      console.log('[email-concierge] Unrecognised sender (no wedding) — handling as enquiry via AI draft, no ticket:', senderEmail);
    }
  } else {
    // Helpdesk surface: no wedding required, proceed directly to AI
    console.log('[email-concierge] Helpdesk surface — skipping wedding lookup, proceeding to AI for:', senderEmail);
  }

  // ── 5. Conversation continuity ────────────────────────────────────────
  var conversationId = null;
  try {
    if (!contactId) {
      console.error('[email-concierge] contactId is null — cannot create/find conversation. sender:', senderEmail, 'tenant:', tenantId);
    } else {
      // Find existing conversation
      var { data: existingConv, error: convFindErr } = await supabase.from('conversations')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('contact_id', contactId)
        .eq('channel', 'email')
        .limit(1).maybeSingle();

      if (convFindErr) {
        console.error('[email-concierge] Conversation find error:', convFindErr.message, '| code:', convFindErr.code, '| detail:', convFindErr.details, '| tenant:', tenantId, '| contact:', contactId);
      } else if (existingConv) {
        conversationId = existingConv.id;
        var { error: convUpdateErr } = await supabase.from('conversations').update({
          last_message_at: new Date().toISOString(),
          unread_count: 1,
          status: 'active',
        }).eq('id', conversationId);
        console.warn('[status-audit] conv=' + conversationId + ' status=active via=inbound-reply');
        try { await supabase.from('debug_logs').insert({ endpoint: 'email-inbound-concierge', action: 'status-audit', payload: { conv_id: conversationId, prev_status: null, new_status: 'active', via: 'inbound-reply' } }); } catch (_) {}
        if (convUpdateErr) {
          console.error('[email-concierge] Conversation update error:', convUpdateErr.message, '| code:', convUpdateErr.code, '| conv:', conversationId);
        }
        console.log('[email-concierge] Found existing conversation:', conversationId);
      } else {
        var { data: newConv, error: convInsertErr } = await supabase.from('conversations').insert({
          tenant_id: tenantId,
          contact_id: contactId,
          channel: 'email',
          status: 'active',
          subject: subject,
          last_message_at: new Date().toISOString(),
          unread_count: 1,
        }).select('id').single();
        if (convInsertErr) {
          console.error('[email-concierge] Conversation insert error:', convInsertErr.message, '| code:', convInsertErr.code, '| detail:', convInsertErr.details, '| tenant:', tenantId, '| contact:', contactId, '| channel: email');
        } else if (newConv) {
          conversationId = newConv.id;
          console.log('[email-concierge] Created new conversation:', conversationId);
        }
      }
    }
  } catch (convErr) {
    console.error('[email-concierge] Conversation threw:', convErr.message, '| stack:', convErr.stack ? convErr.stack.substring(0, 300) : 'none');
  }

  console.log('[email-concierge] conversationId resolved:', conversationId || 'NULL — messages will NOT be persisted');

  // ── 5b. Check concierge_paused — if paused, persist inbound and exit ──
  if (conversationId) {
    try {
      var { data: convState } = await supabase.from('conversations')
        .select('concierge_paused').eq('id', conversationId).maybeSingle();
      if (convState && convState.concierge_paused) {
        console.log('[email-concierge] Concierge paused for conversation:', conversationId, '— early persist already handled inbound');
        return res.status(200).json({ ok: true, action: 'concierge_paused', conversation_id: conversationId });
      }
    } catch (e) { /* concierge_paused column may not exist yet */ }
  }

  // ── 6. Persist inbound message (skip if early persist already handled) ──
  if (conversationId && !earlyConversationId) {
    try {
      var { error: inboundMsgErr } = await supabase.from('messages').insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        contact_id: contactId,
        channel: 'email',
        direction: 'inbound',
        sender_type: 'contact',
        body: replyBody.substring(0, 10000),
        status: 'delivered',
        metadata: { source: 'resend_inbound', message_id: messageId || null, raw_body: emailBody.substring(0, 10000) },
      });
      if (inboundMsgErr) {
        console.error('[email-concierge] Inbound message insert error:', inboundMsgErr.message, '| code:', inboundMsgErr.code, '| detail:', inboundMsgErr.details, '| conv:', conversationId);
      } else {
        console.log('[email-concierge] Inbound message persisted to conversation:', conversationId);
      }
    } catch (msgErr) {
      console.error('[email-concierge] Inbound message insert threw:', msgErr.message);
    }
  }

  // Belt: From == the tenant's own send/inbound identity → our own mail looping back (catches the
  // case where an intermediary stripped the system header). The concierge loop re-ingests the notify
  // from weddings@<domain> into the same inbox it was sent from, so sender == recipient/sender id.
  var selfLower = (senderEmail || '').toLowerCase();
  if (selfLower && (selfLower === (recipientEmail || '').toLowerCase() || selfLower === (tenantSenderEmail || '').toLowerCase())) {
    console.log('[email-concierge] Blocked mail from tenant\'s own identity (loop guard): ' + senderEmail);
    return res.status(200).json({ ok: true, dropped: 'own_identity' });
  }

  // ── 6b. Evaluate escalation rules before AI call ──────────────────────
  try {
    var { data: escRules } = await supabase.from('escalation_rules')
      .select('*').eq('tenant_id', tenantId).eq('active', true)
      .order('priority', { ascending: true });
    if (escRules && escRules.length > 0) {
      var combinedText = (subject || '') + ' ' + emailBody;
      var matched = findMatchingRule(escRules, combinedText);
      if (matched) {
        console.log('[email-concierge] Escalation rule matched:', matched.rule.rule_name, '| match:', JSON.stringify(matched.match));
        var escResult = await executeActions(supabase, matched, {
          tenantId: tenantId, conversationId: conversationId, contactName: contactName,
          senderEmail: senderEmail, messageBody: emailBody, tenantSenderEmail: tenantSenderEmail, tenantName: tenantName,
        });
        if (escResult.skipAI) {
          var replySubject = subject.startsWith('Re:') ? subject : 'Re: ' + subject;
          var confHtml = '<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:20px;color:#1e293b;font-size:15px;line-height:1.75;">' +
            escResult.confirmationMessage.replace(/\n/g, '<br>') + '</div>';
          try { await sendTenantEmail(supabase, { tenant_id: tenantId, allowBlocked: true, to: senderEmail, from: tenantSenderEmail || recipientEmail, from_name: tenantName || 'Team', subject: replySubject, html: confHtml, text: escResult.confirmationMessage, reply_to: recipientEmail, headers: systemMailHeaders('escalation') }); } catch (se) { console.error('[email-concierge] Escalation confirmation send failed:', se.message); }
          if (conversationId) { await supabase.from('messages').insert({ tenant_id: tenantId, conversation_id: conversationId, contact_id: contactId, channel: 'email', direction: 'outbound', sender_type: 'bot', body: escResult.confirmationMessage, status: 'delivered', created_at: new Date().toISOString() }).then(function() {}).catch(function() {}); }
          return res.status(200).json({ ok: true, action: 'escalation_confirmation', rule: matched.rule.rule_name, conversation_id: conversationId });
        }
        console.log('[email-concierge] Escalation actions executed (notify/pause only), continuing to AI');
      }
    }
  } catch (escErr) { console.warn('[email-concierge] Escalation evaluation error (non-fatal):', escErr.message); }

  // ── 7. Call AI concierge ──────────────────────────────────────────────

  // Guard: if body is empty after all extraction, don't call Anthropic
  // Feed only the new reply to the AI — prior turns come from conversation history
  // (loaded inside generateConciergeResponse), not the quoted chain. replyBody is
  // never empty when emailBody is non-empty, so the empty-body guard below still holds.
  var userMessage = (replyBody || '').substring(0, 5000).trim();
  if (!userMessage) {
    // Enquiry surfaces (wedding_concierge / supplier) must never auto-create tickets (96202d7d):
    // conversation-only (inbound already persisted). The helpdesk surface keeps its empty-body ticket.
    if (matchedSurface === 'helpdesk') {
      try {
        await supabase.from('support_tickets').insert({
          tenant_id: tenantId, wedding_id: weddingId,
          subject: 'Empty email body: ' + subject,
          description: 'Email from ' + senderEmail + ' had no extractable text or HTML content.\n\nSubject: ' + subject,
          submitter_email: senderEmail, submitter_name: contactName || senderEmail,
          submitter_type: 'couple', category: matchedSurface + '_empty_body',
          channel: 'email', ai_handled: false, status: 'open', priority: 'low',
        });
      } catch (e) {}
    } else {
      console.log('[email-concierge] Empty body on enquiry surface — conversation persisted, no AI, no ticket:', conversationId);
    }
    return res.status(200).json({ ok: true, action: 'empty_body_skipped' });
  }

  // Check ai_reply_mode (off → skip AI entirely, inbound is already persisted)
  var aiReplyMode = (chatbotConfig && chatbotConfig.ai_reply_mode) || 'auto_send';
  if (aiReplyMode === 'off') {
    console.log('[email-concierge] ai_reply_mode=off — skipping AI, inbound persisted:', conversationId);
    return res.status(200).json({ ok: true, action: 'ai_off' });
  }

  console.log('[email-concierge] Calling Anthropic — messages count: 1, user msg length:', userMessage.length, 'wedding:', weddingId ? 'yes' : 'no', 'mode:', aiReplyMode);

  var aiResult;
  try {
    aiResult = await generateConciergeResponse(supabase, {
      tenantId: tenantId,
      surface: matchedSurface,
      weddingId: weddingId,
      conversationId: conversationId,
      userMessage: userMessage,
      contactMeta: { name: contactName, email: senderEmail },
    });
  } catch (aiErr) {
    console.error('[email-concierge] AI error:', aiErr.message);
    // P1 2c0c5b02 diagnostic: capture the real failure where we can read it (debug_logs),
    // since handler console output only lands in Vercel logs. Remove once root cause is fixed.
    try {
      await supabase.from('debug_logs').insert({
        endpoint: 'email-inbound-concierge', action: 'ai-error',
        payload: {
          conv_id: conversationId, tenant_id: tenantId, surface: matchedSurface,
          wedding_id: weddingId, mode: aiReplyMode, user_msg_len: userMessage.length,
          error: (aiErr && aiErr.message) || String(aiErr),
          stack: aiErr && aiErr.stack ? aiErr.stack.substring(0, 600) : null,
        },
      });
    } catch (_) {}
    return res.status(500).json({ error: 'AI generation failed' });
  }

  console.log('[email-concierge] AI response:', { prefix: aiResult.prefix, length: aiResult.response.length, kb: aiResult.kb_article_count });

  // ── 7b. Strip routing prefixes from customer-facing body ──────────────
  // wedding-concierge.js strips leading [PREFIX] but the model occasionally
  // inserts it mid-text, wraps it in markdown bold, or adds it after a preamble.
  // Only strip from the AI's own text — skip quoted lines (> prefix) to avoid
  // mangling a customer quoting a previous reply.
  var cleanBody = aiResult.response;

  // Routing prefix pattern: optional markdown bold wrapping, optional whitespace/newlines after
  var PREFIX_RE = /\*{0,2}\[(RESOLVED|PENDING|ESCALATE)\]\*{0,2}[\s\n]*/gi;

  // Leading prefix (with newlines)
  var leadingRe = /^\*{0,2}\[(RESOLVED|PENDING|ESCALATE)\]\*{0,2}[\s\n]*/i;
  var leadingPrefixMatch = cleanBody.match(leadingRe);
  if (leadingPrefixMatch) {
    console.warn('[email-concierge] Leading prefix leaked through wedding-concierge parser — stripping:', leadingPrefixMatch[0].trim());
    cleanBody = cleanBody.substring(leadingPrefixMatch[0].length);
  }

  // Mid-text occurrences: log each, then strip — but only on non-quoted lines
  var lines = cleanBody.split('\n');
  var strippedLines = [];
  for (var li = 0; li < lines.length; li++) {
    var line = lines[li];
    // Skip quoted lines (email reply convention: starts with >)
    if (/^\s*>/.test(line)) {
      strippedLines.push(line);
      continue;
    }
    // Log before stripping — use a separate regex instance for exec to avoid lastIndex state leaking
    var logRe = /\*{0,2}\[(RESOLVED|PENDING|ESCALATE)\]\*{0,2}[\s\n]*/gi;
    var midMatch;
    while ((midMatch = logRe.exec(line)) !== null) {
      console.warn('[email-concierge] Mid-text prefix at line', li, 'offset', midMatch.index, '— stripping:', midMatch[0].trim(), '| context: "...' + line.substring(Math.max(0, midMatch.index - 20), midMatch.index + midMatch[0].length + 20) + '..."');
    }
    PREFIX_RE.lastIndex = 0;
    strippedLines.push(line.replace(PREFIX_RE, ''));
  }
  cleanBody = strippedLines.join('\n').trim();

  // ── 8. Convert markdown → HTML (always, regardless of mode) ─────────
  var replySubject = subject.startsWith('Re:') ? subject : 'Re: ' + subject;
  var bodyContent = markdownToHtml(cleanBody);

  // ── 8b. Branch on ai_reply_mode ───────────────────────────────────────
  if (aiReplyMode === 'draft_review') {
    // Draft mode: store body-only HTML for human review in Live Inbox.
    // Wrap + signature applied at send time (Approve & Send) to guarantee
    // byte-identical formatting with auto_send path.
    try {
      // P1 2c0c5b02 diagnostic: confirm we reach save_ai_draft and with which ids.
      try { await supabase.from('debug_logs').insert({ endpoint: 'email-inbound-concierge', action: 'draft-save-attempt', payload: { conv_id: conversationId, tenant_id: tenantId, body_len: (cleanBody || '').length, mode: aiReplyMode } }); } catch (_) {}
      var { error: saveDraftErr } = await supabase.rpc('save_ai_draft', {
        p_tenant_id: tenantId,
        p_conversation_id: conversationId,
        p_body: cleanBody,
        p_html: bodyContent,
        p_channel: 'email',
      });
      if (saveDraftErr) {
        console.error('[email-concierge] save_ai_draft RPC error:', saveDraftErr.message);
        try { await supabase.from('debug_logs').insert({ endpoint: 'email-inbound-concierge', action: 'draft-save-rpc-error', payload: { conv_id: conversationId, error: saveDraftErr.message } }); } catch (_) {}
      }
      console.log('[email-concierge] Draft saved for review:', conversationId);
    } catch (draftErr) {
      console.error('[email-concierge] Draft save error:', draftErr.message);
      try { await supabase.from('debug_logs').insert({ endpoint: 'email-inbound-concierge', action: 'draft-save-threw', payload: { conv_id: conversationId, error: (draftErr && draftErr.message) || String(draftErr) } }); } catch (_) {}
    }
    // Skip dispatch — draft surfaces in Live Inbox for Approve & Send
  } else {
    // auto_send: wrap + dispatch + persist
    await wrapAndDispatch(supabase, {
      tenantId: tenantId, tenantName: tenantName,
      conversationId: conversationId, contactId: contactId,
      senderEmail: senderEmail, recipientEmail: recipientEmail,
      tenantSenderEmail: tenantSenderEmail,
      replySubject: replySubject,
      cleanBody: cleanBody, bodyContent: bodyContent,
    });
    // Transition to 'waiting' after auto-send
    if (conversationId) {
      try {
        await supabase.from('conversations').update({ status: 'waiting', updated_at: new Date().toISOString() }).eq('id', conversationId);
        console.warn('[status-audit] conv=' + conversationId + ' status=waiting via=auto-send');
        try { await supabase.from('debug_logs').insert({ endpoint: 'email-inbound-concierge', action: 'status-audit', payload: { conv_id: conversationId, prev_status: null, new_status: 'waiting', via: 'auto-send' } }); } catch (_) {}
      } catch (_) {}
    }
  }

  // ── 10. Prefix routing ────────────────────────────────────────────────
  if (aiResult.prefix === 'ESCALATE') {
    try {
      // Helpdesk surface retains its [ESCALATE] handoff ticket. Enquiry surfaces (wedding_concierge /
      // supplier) must never auto-create tickets (96202d7d) — the conversation stays in Live Inbox and
      // we only notify the tenant's escalation recipients below. No needs-attention marker exists.
      if (matchedSurface === 'helpdesk') {
        await supabase.from('support_tickets').insert({
          tenant_id: tenantId,
          wedding_id: weddingId,
          subject: 'Concierge escalation: ' + subject,
          description: 'Original email from ' + contactName + ' (' + senderEmail + '):\n\n' + emailBody.substring(0, 3000) + '\n\n---\n\nAI escalation summary:\n' + aiResult.response,
          submitter_email: senderEmail,
          submitter_name: contactName || senderEmail,
          submitter_type: 'couple',
          category: matchedSurface + '_escalation',
          channel: 'email',
          ai_handled: true,
          status: 'open',
          priority: 'high',
          transcript_snapshot: { from: fromRaw, to: toArray, subject: subject, text: emailBody.substring(0, 5000), html: rawHtml ? rawHtml.substring(0, 5000) : null, headers: headersArr.slice(0, 30) },
          metadata: { source: 'resend_inbound', message_id: messageId || null, in_reply_to: inReplyTo, resend_event_id: eventData.id || null },
        });
        console.log('[email-concierge] Helpdesk ESCALATE ticket created for:', senderEmail);
      } else {
        console.log('[email-concierge] Enquiry-surface ESCALATE — notifying recipients, conversation stays in Live Inbox, no ticket:', senderEmail);
      }

      // Notify tenant members with notify_on_escalation = true
      try {
        var notifyEmails = await getNotifyEmails(tenantId, 'notify_on_escalation');
        if (notifyEmails.length > 0) {
          var portalUrl = 'https://portal.engwx.com';
          var escHtml =
            '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">' +
            '<div style="background:linear-gradient(135deg,#FF6B35,#FF3B30);padding:20px 24px;border-radius:10px 10px 0 0;">' +
            '<h2 style="color:#fff;margin:0;font-size:18px;">Wedding Concierge Escalation</h2>' +
            '<p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px;">A couple\'s email needs your attention</p>' +
            '</div>' +
            '<div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;">' +
            '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
            '<tr><td style="padding:8px 0;color:#64748b;width:120px;">From</td><td style="padding:8px 0;font-weight:700;color:#1e293b;">' + (contactName || senderEmail) + '</td></tr>' +
            '<tr><td style="padding:8px 0;color:#64748b;">Subject</td><td style="padding:8px 0;color:#1e293b;">' + subject + '</td></tr>' +
            '<tr><td style="padding:8px 0;color:#64748b;">Category</td><td style="padding:8px 0;color:#1e293b;">Wedding Concierge Escalation</td></tr>' +
            '<tr><td style="padding:8px 0;color:#64748b;">Priority</td><td style="padding:8px 0;color:#ef4444;font-weight:700;">High</td></tr>' +
            '</table>' +
            '<div style="margin:16px 0;padding:14px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;">' +
            '<div style="font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Couple\'s Message</div>' +
            '<div style="color:#334155;font-size:14px;line-height:1.6;">' + emailBody.substring(0, 1000).replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</div>' +
            '</div>' +
            '<div style="margin:16px 0;padding:14px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;">' +
            '<div style="font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">AI Escalation Response</div>' +
            '<div style="color:#334155;font-size:14px;line-height:1.6;">' + (aiResult.response || '').substring(0, 1000).replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</div>' +
            '</div>' +
            '<a href="' + portalUrl + '" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#FF3B30);color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">View in Portal →</a>' +
            '</div></div>';

          for (var ni = 0; ni < notifyEmails.length; ni++) {
            await sendTenantEmail(supabase, {
              tenant_id: tenantId,
              to: notifyEmails[ni],
              from: recipientEmail,
              from_name: 'Delamere Manor',
              subject: 'Wedding concierge escalation: ' + (contactName || senderEmail) + ' — ' + subject,
              html: escHtml,
              text: 'Escalation from ' + (contactName || senderEmail) + '\nSubject: ' + subject + '\n\nCouple wrote:\n' + emailBody.substring(0, 1000) + '\n\nAI response:\n' + (aiResult.response || '').substring(0, 1000) + '\n\nView in portal: ' + portalUrl,
            });
          }
          console.log('[email-concierge] Escalation notification sent to:', notifyEmails);
        } else {
          console.warn('[email-concierge] No notify_on_escalation recipients for tenant:', tenantId);
        }
      } catch (notifyErr) { console.warn('[email-concierge] Escalation notification failed (non-fatal):', notifyErr.message); }
    } catch (escErr) { console.error('[email-concierge] Escalation ticket error:', escErr.message); }
  }

  return res.status(200).json({
    ok: true,
    prefix: aiResult.prefix,
    wedding_id: weddingId,
    conversation_id: conversationId,
  });
};
