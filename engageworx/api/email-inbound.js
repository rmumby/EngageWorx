// /api/email-inbound.js — Unified inbound email handler via SendGrid Inbound Parse
// Handles all inbound email: tenant AI auto-reply, CRM pipeline intelligence,
// portal-user support routing, lead qualification/reactivation, sequence pausing.
var { createClient } = require('@supabase/supabase-js');
var { buildSystemPrompt } = require('./_lib/build-system-prompt');
var { generateThreadId, makeReplyToAddress, extractThreadId, resolveReplyThread } = require('./_lib/reply-thread');
var { checkEscalationTriggers } = require('./_lib/check-escalation-triggers');
var { sendTenantEmail } = require('./_lib/send-tenant-email');
var { STAGE_KEYS, getPipelineStageId } = require('./_lib/pipelineStages');
var { markdownToHtml } = require('./_lib/markdown-to-html');
var { checkInboundBlock } = require('./_lib/blocklist');
var { generateConciergeResponse } = require('./wedding-concierge');
var { getBookingIntegration } = require('./_lib/booking-integration');

var supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

var EW_TENANT_ID = (process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387');

// ── Multipart parser (handles urlencoded, multipart, JSON, raw) ─────────
function parseMultipart(req) {
  return new Promise(function(resolve, reject) {
    var chunks = [];
    req.on('data', function(chunk) { chunks.push(chunk); });
    req.on('end', function() {
      var body = Buffer.concat(chunks).toString();
      var contentType = req.headers['content-type'] || '';

      if (contentType.indexOf('application/x-www-form-urlencoded') !== -1) {
        var params = new URLSearchParams(body);
        var result = {};
        for (var pair of params) { result[pair[0]] = pair[1]; }
        return resolve(result);
      }

      if (contentType.indexOf('multipart/form-data') !== -1) {
        var boundary = contentType.split('boundary=')[1];
        if (!boundary) return resolve({ _raw: body });
        boundary = boundary.split(';')[0].trim();
        var parts = body.split('--' + boundary).filter(function(p) { return p.trim() && p.trim() !== '--'; });
        var result2 = {};
        parts.forEach(function(part) {
          var nameMatch = part.match(/name="([^"]+)"/);
          if (nameMatch) {
            var name = nameMatch[1];
            var valueStart = part.indexOf('\r\n\r\n');
            if (valueStart > -1) {
              var value = part.substring(valueStart + 4).trim();
              if (value.endsWith('--')) value = value.slice(0, -2).trim();
              if (value.endsWith('\r\n')) value = value.slice(0, -2);
              result2[name] = value;
            }
          }
        });
        return resolve(result2);
      }

      try { return resolve(JSON.parse(body)); } catch (e) {}

      try {
        var params2 = new URLSearchParams(body);
        var result3 = {};
        for (var pair2 of params2) { result3[pair2[0]] = pair2[1]; }
        if (Object.keys(result3).length > 0) return resolve(result3);
      } catch (e) {}

      resolve({ _raw: body });
    });
    req.on('error', reject);
  });
}

// ── Signature stripping ─────────────────────────────────────────────────
var GENERIC_SIG_MARKERS = [
  '\n--\n', '--\r\n',
  '________________________________',
  '\nFrom:', '\r\nFrom:',
  '\r\nOn ', '\nOn ',
  '\n> ', '\r\n> ',
  'Sent from my iPhone', 'Sent from my Samsung',
  '[cid:', 'content.exclaimer',
  'Book time with me',
  'CONFIDENTIAL', 'DISCLAIMER',
];

function stripSignature(rawBody, tenantMarkers) {
  var allMarkers = GENERIC_SIG_MARKERS.concat(tenantMarkers || []);
  var emailBody = rawBody;
  for (var i = 0; i < allMarkers.length; i++) {
    var idx = emailBody.indexOf(allMarkers[i]);
    if (idx > 20) { emailBody = emailBody.substring(0, idx).trim(); break; }
  }
  return emailBody.trim() || '(no message content)';
}

async function pauseSequencesForContact(email) {
  try {
    if (!email) return;
    var leads = await supabase.from('leads').select('id').ilike('email', email).limit(10);
    if (!leads.data || leads.data.length === 0) return;
    var ids = leads.data.map(function(l) { return l.id; });
    // Load active enrolments with their sequence's stop_on_reply config
    var enrolments = await supabase.from('lead_sequences').select('id, sequence_id, sequences(stop_on_reply)').in('lead_id', ids).eq('status', 'active');
    if (!enrolments.data || enrolments.data.length === 0) return;
    var stopThis = [];
    var stopAll = false;
    enrolments.data.forEach(function(e) {
      var rule = (e.sequences && e.sequences.stop_on_reply) || 'this_sequence';
      if (rule === 'all_sequences') stopAll = true;
      if (rule !== 'never') stopThis.push(e.id);
    });
    if (stopAll) {
      // Stop ALL active enrolments for this contact
      await supabase.from('lead_sequences').update({ status: 'replied', replied_at: new Date().toISOString() }).in('lead_id', ids).eq('status', 'active');
      console.log('[Sequences] Replied (all):', enrolments.data.length, 'enrolment(s) — email reply from', email);
    } else if (stopThis.length > 0) {
      await supabase.from('lead_sequences').update({ status: 'replied', replied_at: new Date().toISOString() }).in('id', stopThis);
      console.log('[Sequences] Replied:', stopThis.length, 'enrolment(s) — email reply from', email);
    }
  } catch (e) { console.error('[Sequences] Reply-stop error:', e.message); }
}

// ─── AI EMAIL INTELLIGENCE — match + analyze + action ────────────────────
async function resolveTenantForSender(senderEmail) {
  var sender = (senderEmail || '').toLowerCase().trim();
  if (!sender) return null;
  try {
    var c = await supabase.from('contacts').select('tenant_id').ilike('email', sender).limit(1).maybeSingle();
    if (c.data && c.data.tenant_id) return c.data.tenant_id;
  } catch(e) {}
  try {
    var l = await supabase.from('leads').select('tenant_id').ilike('email', sender).limit(1).maybeSingle();
    if (l.data && l.data.tenant_id) return l.data.tenant_id;
  } catch(e) {}
  try {
    var domain = sender.split('@')[1] || '';
    if (domain) {
      var t = await supabase.from('tenants').select('id').or('custom_domain.ilike.%' + domain + '%,website_url.ilike.%' + domain + '%').limit(1).maybeSingle();
      if (t.data) return t.data.id;
    }
  } catch(e) {}
  return null;
}

async function resolveTenantByRecipient(toAddresses) {
  // Load all email channel configs once
  var configs = null;
  try {
    var r = await supabase.from('channel_configs').select('tenant_id, config_encrypted')
      .eq('channel', 'email');
    configs = r.data || [];
  } catch (e) {
    console.warn('[Inbound] resolveTenantByRecipient config load error:', e.message);
    return null;
  }

  for (var i = 0; i < toAddresses.length; i++) {
    var addr = (toAddresses[i] || '').toLowerCase().trim();
    if (!addr) continue;

    // (a0) Match against tenants.inbound_domain — dedicated inbound key (exact or subdomain).
    // Highest priority: this is the authoritative destination→tenant mapping.
    var d0 = addr.split('@')[1] || '';
    if (d0) {
      var p0 = d0.split('.');
      for (var pi0 = 0; pi0 <= p0.length - 2; pi0++) {
        var cand0 = p0.slice(pi0).join('.');
        if (cand0.split('.').length < 2) continue;
        try {
          var idr = await supabase.from('tenants').select('id').ilike('inbound_domain', cand0).limit(1).maybeSingle();
          if (idr.data) {
            console.log('[Inbound] tenant matched by inbound_domain: ' + cand0 + ' tenant=' + idr.data.id);
            return idr.data.id;
          }
        } catch (e) {}
      }
    }

    // (a) Match against inbound_email (highest priority — per-tenant inbound address)
    for (var j = 0; j < configs.length; j++) {
      var cfg = configs[j];
      var inboundEmail = (cfg.config_encrypted && cfg.config_encrypted.inbound_email || '').toLowerCase().trim();
      if (inboundEmail && addr.indexOf(inboundEmail.split('@')[0]) !== -1) {
        console.log('[Inbound] tenant matched by inbound_email: to=' + addr + ' tenant=' + cfg.tenant_id);
        return cfg.tenant_id;
      }
    }

    // (b) Match against from_email
    if (addr.indexOf('engwx.com') > -1) continue; // skip platform addresses for from_email match
    for (var k = 0; k < configs.length; k++) {
      var cfg2 = configs[k];
      var fromEmail = (cfg2.config_encrypted && cfg2.config_encrypted.from_email || '').toLowerCase().trim();
      if (fromEmail && fromEmail === addr) {
        console.log('[Inbound] tenant matched by from_email: to=' + addr + ' tenant=' + cfg2.tenant_id);
        return cfg2.tenant_id;
      }
    }

    // (c) Match by domain against tenants
    var domain = addr.split('@')[1] || '';
    if (domain && domain.indexOf('engwx.com') === -1) {
      try {
        var t = await supabase.from('tenants').select('id').or('custom_domain.ilike.%' + domain + '%,website_url.ilike.%' + domain + '%').limit(1).maybeSingle();
        if (t.data) {
          console.log('[Inbound] tenant matched by recipient domain: ' + domain + ' tenant=' + t.data.id);
          return t.data.id;
        }
      } catch (e) {}
    }
  }
  return null;
}

async function checkSpam(tenantId, senderEmail, subject) {
  if (!tenantId) return { spam: false };
  try {
    var t = await supabase.from('tenants').select('blocked_domains, blocked_keywords').eq('id', tenantId).maybeSingle();
    if (t.data) {
      // Shared matcher: domain/subdomain, '<local>@' pattern, full-address, + keyword-on-subject.
      var blk = checkInboundBlock(senderEmail, subject, { domains: t.data.blocked_domains, keywords: t.data.blocked_keywords });
      if (blk.blocked) return { spam: true, matched: blk.matched };
    }
  } catch (e) { console.warn('[Spam] check error:', e.message); }
  return { spam: false };
}

async function analyzeAndActionEmail(ctx) {
  // ctx: { senderEmail, senderName, subject, body, conversationId }
  try {
    var sender = (ctx.senderEmail || '').toLowerCase().trim();
    if (!sender) return;

    // 1. Match: contact, lead, tenant. Tenant is AUTHORITATIVE from ctx.tenantId (resolved
    // from the destination upstream). Contact/lead lookups are scoped to it so a cross-tenant
    // sender match can never re-route the reply or leak another tenant's history. (When
    // ctx.tenantId is absent — legacy callers — fall back to the prior sender resolution.)
    var match = { contactId: null, leadId: null, tenantId: ctx.tenantId || null, leadStage: null };
    try {
      var cq = supabase.from('contacts').select('id, tenant_id, pipeline_lead_id').ilike('email', sender);
      if (ctx.tenantId) cq = cq.eq('tenant_id', ctx.tenantId);
      var c = await cq.limit(1).maybeSingle();
      if (c.data) { match.contactId = c.data.id; if (!match.tenantId) match.tenantId = c.data.tenant_id; match.leadId = c.data.pipeline_lead_id; }
    } catch(e) {}
    try {
      if (!match.leadId) {
        var lq = supabase.from('leads').select('id, tenant_id, pipeline_stage_id').ilike('email', sender);
        if (ctx.tenantId) lq = lq.eq('tenant_id', ctx.tenantId);
        var l = await lq.limit(1).maybeSingle();
        if (l.data) {
          match.leadId = l.data.id; if (!match.tenantId) match.tenantId = l.data.tenant_id;
          if (l.data.pipeline_stage_id) {
            var _lps = await supabase.from('pipeline_stages').select('stage_key').eq('id', l.data.pipeline_stage_id).maybeSingle();
            match.leadStage = (_lps.data && _lps.data.stage_key) || null;
          }
        }
      } else {
        var lr = await supabase.from('leads').select('pipeline_stage_id').eq('id', match.leadId).maybeSingle();
        if (lr.data) {
          if (lr.data.pipeline_stage_id) {
            var _lps2 = await supabase.from('pipeline_stages').select('stage_key').eq('id', lr.data.pipeline_stage_id).maybeSingle();
            match.leadStage = (_lps2.data && _lps2.data.stage_key) || null;
          }
        }
      }
    } catch(e) {}
    try {
      if (!match.tenantId) {
        var domain = sender.split('@')[1] || '';
        if (domain) {
          var t = await supabase.from('tenants').select('id').or('custom_domain.ilike.%' + domain + '%,website_url.ilike.%' + domain + '%').limit(1).maybeSingle();
          if (t.data) match.tenantId = t.data.id;
        }
      }
    } catch(e) {}

    // Booking-integration config (Path A self-booking link / Path B API), read at runtime
    // from the channel='booking' config_encrypted for the resolved tenant (value loaded
    // out-of-band). Surfaced for downstream booking handoff / failure escalation; a no-op
    // when unconfigured. Keyed on the resolved tenant — no tenant data hardcoded.
    var bookingIntegration = null;
    try {
      bookingIntegration = await getBookingIntegration(supabase, match.tenantId);
      if (bookingIntegration) {
        console.log('[Inbound] booking_integration loaded for tenant ' + match.tenantId +
          ': active_path=' + (bookingIntegration.active_path || 'unset'));
      }
    } catch (e) { console.warn('[Inbound] booking_integration read error: ' + e.message); }

    // 2. Last 3 interactions for this contact
    var history = [];
    if (match.contactId) {
      try {
        var msgs = await supabase.from('messages').select('direction, channel, body, created_at').eq('contact_id', match.contactId).order('created_at', { ascending: false }).limit(3);
        history = (msgs.data || []).reverse().map(function(m) {
          return '[' + (m.direction === 'inbound' ? 'FROM CONTACT' : 'TO CONTACT') + ' · ' + m.channel + ' · ' + (m.created_at || '').substring(0, 10) + ']\n' + (m.body || '').substring(0, 400);
        }).join('\n\n');
      } catch(e) {}
    }

    // 3. Resolve tenant AI context — every CSP/agent/direct tenant gets their own
    //    persona, knowledge base, and outbound email identity. The master SP only
    //    applies when the matched tenant is the SP itself OR no tenant matched.
    var SP_TENANT_ID = (process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387');
    var aiCtx = {
      agentName: 'Aria',
      businessName: 'EngageWorx',
      knowledgeBase: '',
      systemPromptOverride: '',
      fromEmail: (process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com'),
      fromName: 'EngageWorx',
      replyTo: (process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com'),
      isMasterSP: !match.tenantId || match.tenantId === SP_TENANT_ID,
    };
    if (match.tenantId) {
      try {
        var tRow = await supabase.from('tenants').select('name, brand_name').eq('id', match.tenantId).maybeSingle();
        if (tRow.data) aiCtx.businessName = (tRow.data.brand_name || tRow.data.name || aiCtx.businessName).trim();
      } catch (e) {}
      try {
        var cb = await supabase.from('chatbot_configs').select('bot_name, system_prompt, knowledge_base').eq('tenant_id', match.tenantId).maybeSingle();
        if (cb.data) {
          if (cb.data.bot_name && cb.data.bot_name.trim()) aiCtx.agentName = cb.data.bot_name.trim();
          if (cb.data.knowledge_base && cb.data.knowledge_base.trim()) aiCtx.knowledgeBase = cb.data.knowledge_base.trim();
          if (cb.data.system_prompt && cb.data.system_prompt.trim()) aiCtx.systemPromptOverride = cb.data.system_prompt.trim();
        }
      } catch (e) {}
      try {
        var ec = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', match.tenantId).eq('channel', 'email').maybeSingle();
        var cfg = ec.data && ec.data.config_encrypted ? ec.data.config_encrypted : {};
        if (cfg.from_email && String(cfg.from_email).trim()) { aiCtx.fromEmail = String(cfg.from_email).trim(); aiCtx.replyTo = aiCtx.fromEmail; }
        if (cfg.from_name && String(cfg.from_name).trim()) aiCtx.fromName = String(cfg.from_name).trim();
        if (cfg.reply_to && String(cfg.reply_to).trim()) aiCtx.replyTo = String(cfg.reply_to).trim();
        if (cfg.ai_omni_bcc && String(cfg.ai_omni_bcc).indexOf('@') > 0) aiCtx.aiOmniBcc = String(cfg.ai_omni_bcc).trim();
      } catch (e) {}
    }

    // 3a. Build layered system prompt
    var systemPrompt = await buildSystemPrompt({
      tenantId: match.tenantId,
      channel: 'email',
      supabase: supabase,
    });
    systemPrompt += '\n\nReturn STRICT JSON: {"action": "advance_stage"|"enroll_sequence"|"review"|"auto_reply"|"no_action", "reasoning": "1-2 sentences", "summary": "body in 1 sentence", "reply_draft": "text if auto_reply else null", "new_stage": "stage id if advance_stage else null", "sequence_name": "name to enroll else null"}' +
      '\n\nStages: inquiry, demo_shared, sandbox_shared, opportunity, package_selection, go_live, customer, dormant.' +
      '\nUse auto_reply ONLY for simple factual questions answerable from the business knowledge above. Everything else → review with a suggested reply_draft.';

    var prompt = 'Email from: ' + sender + (ctx.senderName ? ' (' + ctx.senderName + ')' : '') +
      '\nSubject: ' + (ctx.subject || '') +
      '\nCurrent pipeline stage: ' + (match.leadStage || 'none') +
      '\n\nBody:\n' + (ctx.body || '').substring(0, 2000) +
      (history ? '\n\n---- Recent interactions ----\n' + history : '') +
      '\n\nReturn JSON only.';

    var emailCbTemp = null;
    // ai_reply_mode gates whether the per-tenant responder may auto-send (used in the auto_reply
    // block below). FAIL-CLOSED: if the config row can't be resolved (no row, or a multi-row
    // maybeSingle error), default to HOLDING the reply (draft_review) rather than auto-sending —
    // the safe direction for a review platform. A resolved row keeps its explicit mode; a resolved
    // row with ai_reply_mode unset still defaults to auto_send (behavior-neutral for live tenants).
    var replyMode = 'draft_review';
    try { var emailCb = await supabase.from('chatbot_configs').select('temperature, ai_reply_mode').eq('tenant_id', match.tenantId).maybeSingle(); if (emailCb.data) { emailCbTemp = emailCb.data.temperature; replyMode = emailCb.data.ai_reply_mode || 'auto_send'; } } catch (_) {}

    var decision = { action: 'review', reasoning: 'Claude unavailable', summary: (ctx.body || '').substring(0, 200), reply_draft: null, new_stage: null, sequence_name: null };
    try {
      var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1000, temperature: emailCbTemp !== null ? emailCbTemp : 0.7, system: systemPrompt, messages: [{ role: 'user', content: prompt }] }),
      });
      var aiData = await aiRes.json();
      var txt = (aiData.content || []).find(function(b) { return b.type === 'text'; })?.text || '';
      var m = txt.match(/\{[\s\S]*\}/);
      if (m) decision = Object.assign(decision, JSON.parse(m[0]));
    } catch (aiErr) { console.warn('[EmailAI] Claude error:', aiErr.message); }

    // 3b. If the matched tenant has a Calendly link set, append a booking CTA
    //     to any Claude-drafted reply (auto_reply or review).
    if (decision.reply_draft && match.tenantId) {
      try {
        var tInfo = await supabase.from('tenants').select('calendly_url').eq('id', match.tenantId).maybeSingle();
        var cu = tInfo.data && tInfo.data.calendly_url ? tInfo.data.calendly_url.trim() : '';
        if (cu && decision.reply_draft.indexOf(cu) === -1) {
          decision.reply_draft = decision.reply_draft.trimEnd() + '\n\nYou can book a time with me here: ' + cu;
        }
      } catch (cErr) {}
    }

    // 4. Store in email_actions
    var ins = await supabase.from('email_actions').insert({
      contact_id: match.contactId, lead_id: match.leadId, tenant_id: match.tenantId,
      email_from: sender, email_subject: ctx.subject || null,
      email_body_summary: decision.summary || (ctx.body || '').substring(0, 200),
      claude_action: decision.action || 'review',
      claude_reasoning: decision.reasoning || null,
      claude_reply_draft: decision.reply_draft || null,
      action_payload: { channel: 'email', new_stage: decision.new_stage, sequence_name: decision.sequence_name },
      status: 'pending',
      source: 'inbound_email',
    }).select('id').single();
    var actionId = ins.data ? ins.data.id : null;

    // 5. Auto-execute if Claude chose auto_reply (email/WhatsApp only, not SMS)
    // Single-sender principle: if reactivation enrolled the lead in a sequence, skip auto_reply.
    // The sequence engine handles all outreach for this lead.
    if (decision.action === 'auto_reply' && _reactivatedCount > 0) {
      console.log('[email-inbound] Skipping auto_reply for', sender, '— reactivation enrolled in sequence (single-sender principle)');
    } else if (decision.action === 'auto_reply' && decision.reply_draft && match.tenantId) {
      try {
        var replySubj = (ctx.subject || '').startsWith('Re:') ? ctx.subject : 'Re: ' + (ctx.subject || 'your message');
        var _sig = require('./_email-signature');
        var sigInfo = await _sig.getSignature(supabase, { tenantId: match.tenantId, fromEmail: aiCtx.fromEmail, isFirstTouch: false, closingKind: 'reply' });
        var bodyHtml = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.6;">' + markdownToHtml(decision.reply_draft) + '</div>';
        var eiThreadId = generateThreadId();
        var eiReplyTo = makeReplyToAddress(eiThreadId);

        // Resolve (or create) the conversation up front — needed by BOTH the held draft
        // (draft_review) and the outbound message (auto_send).
        var outConvId = ctx.conversationId || null;
        if (!outConvId && match.contactId && match.tenantId) {
          try {
            var convLookup = await supabase.from('conversations').select('id').eq('contact_id', match.contactId).eq('tenant_id', match.tenantId).eq('channel', 'email').in('status', ['active', 'waiting', 'snoozed']).order('last_message_at', { ascending: false }).limit(1).maybeSingle();
            if (convLookup.data) outConvId = convLookup.data.id;
          } catch (e) {}
        }
        if (!outConvId && match.contactId && match.tenantId) {
          try {
            var newConv = await supabase.from('conversations').insert({ tenant_id: match.tenantId, contact_id: match.contactId, channel: 'email', status: 'waiting', subject: replySubj, last_message_at: new Date().toISOString(), unread_count: 0 }).select('id').single();
            if (newConv.data) outConvId = newConv.data.id;
          } catch (e) {}
        }

        // ── SEND GATE on ai_reply_mode (the Haiku classification above is untouched) ──
        if (replyMode === 'draft_review') {
          // Review mode: DO NOT send to the contact. Hold the AI reply as a pending draft on the
          // conversation so it surfaces in Live Inbox → Drafts for human Approve & Send. Store the
          // body-only HTML; the brand wrap + signature are applied at approve time
          // (draft-approve → wrapAndDispatch), matching the concierge draft_review path.
          if (outConvId) {
            try {
              await supabase.rpc('save_ai_draft', { p_tenant_id: match.tenantId, p_conversation_id: outConvId, p_body: decision.reply_draft, p_html: bodyHtml, p_channel: 'email' });
              if (actionId) await supabase.from('email_actions').update({ status: 'drafted' }).eq('id', actionId);
              console.log('✅ [email-inbound] Per-tenant DRAFT held (draft_review) conv=' + outConvId + ' tenant=' + match.tenantId + ' — NO auto-send; in Live Inbox → Drafts for review');
            } catch (dErr) { console.error('[email-inbound] save_ai_draft error:', dErr.message); }
          } else {
            console.error('[email-inbound] draft_review: could not resolve conversation — draft NOT held. tenant=' + match.tenantId + ' contact=' + match.contactId);
          }
        } else if (replyMode === 'off') {
          // AI auto-replies disabled: neither send nor draft. The email_actions 'pending' row stands as the record.
          console.log('[email-inbound] ai_reply_mode=off — no auto-send, no draft. tenant=' + match.tenantId);
        } else {
          // auto_send (default): reply to the contact now (unchanged behavior).
          await sendTenantEmail(supabase, {
            tenant_id: match.tenantId,
            to: sender,
            subject: replySubj,
            text: _sig.composeTextBody(decision.reply_draft, sigInfo.closingLine, sigInfo.fromName || aiCtx.fromName),
            html: _sig.composeHtmlBody(bodyHtml, sigInfo.closingLine, sigInfo.signatureHtml),
            reply_to: eiReplyTo,
            bcc: (aiCtx.aiOmniBcc && aiCtx.aiOmniBcc !== sender) ? aiCtx.aiOmniBcc : undefined,
          });

          if (actionId) await supabase.from('email_actions').update({ status: 'actioned', actioned_at: new Date().toISOString() }).eq('id', actionId);

          // Save outbound message to Live Inbox
          if (outConvId) {
            try {
              await supabase.from('messages').insert({
                tenant_id: match.tenantId, conversation_id: outConvId, contact_id: match.contactId,
                channel: 'email', direction: 'outbound', sender_type: 'bot',
                body: decision.reply_draft, status: 'sent',
                metadata: { reply_thread_id: eiThreadId, reply_to_address: eiReplyTo, source: 'auto_reply', from: aiCtx.fromEmail, to: sender, subject: replySubj },
                created_at: new Date().toISOString(),
              });
              await supabase.from('conversations').update({ last_message_at: new Date().toISOString(), status: 'waiting' }).eq('id', outConvId);
            } catch (saveErr) { console.error('[email-inbound] Outbound message save error:', saveErr.message); }
          }
          try {
            var _eum = require('./_usage-meter');
            _eum.incrementTenantCounter(supabase, match.tenantId, 'email_used', 1);
          } catch (mErr) {}
        }
      } catch (seErr) { console.warn('[EmailAI] Auto-reply handling error:', seErr.message); }
    }

    // 6. Auto-execute stage advance if lead exists
    if (decision.action === 'advance_stage' && match.leadId && decision.new_stage) {
      try {
        var advanceStageMap = { 'inquiry': STAGE_KEYS.LEAD, 'lead': STAGE_KEYS.LEAD, 'qualified': STAGE_KEYS.QUALIFIED, 'opportunity': STAGE_KEYS.QUALIFIED, 'demo_shared': STAGE_KEYS.DEMO_SHARED, 'demo_scheduled': STAGE_KEYS.DEMO_SCHEDULED, 'sandbox_shared': STAGE_KEYS.SANDBOX_SHARED, 'pricing_sent': STAGE_KEYS.PRICING_SENT, 'negotiating': STAGE_KEYS.NEGOTIATING, 'customer': STAGE_KEYS.WON, 'closed_won': STAGE_KEYS.WON, 'dormant': STAGE_KEYS.LOST, 'closed_lost': STAGE_KEYS.LOST };
        var advanceKey = advanceStageMap[decision.new_stage] || null;
        var advanceUpdate = { last_activity_at: new Date().toISOString() };
        if (advanceKey && match.tenantId) {
          try { advanceUpdate.pipeline_stage_id = await getPipelineStageId(supabase, match.tenantId, advanceKey); } catch (e) { console.warn('[EmailAI] pipeline_stage_id resolve failed:', e.message); }
        }
        await supabase.from('leads').update(advanceUpdate).eq('id', match.leadId);
        if (actionId) await supabase.from('email_actions').update({ status: 'actioned', actioned_at: new Date().toISOString() }).eq('id', actionId);
      } catch (stErr) { console.warn('[EmailAI] Stage advance error:', stErr.message); }
    }

    // 7. Auto-enroll sequence if Claude named one
    if (decision.action === 'enroll_sequence' && match.leadId && decision.sequence_name && match.tenantId) {
      try {
        // Skip if lead already has an active sequence
        var existingActive = await supabase.from('lead_sequences').select('id, sequences(name)').eq('lead_id', match.leadId).eq('status', 'active').maybeSingle();
        if (existingActive.data) {
          console.log('[EmailAI] Skipping enrol — lead already in active sequence:', (existingActive.data.sequences && existingActive.data.sequences.name) || existingActive.data.id);
        } else {
          var seq = await supabase.from('sequences').select('id').eq('tenant_id', match.tenantId).ilike('name', '%' + decision.sequence_name + '%').limit(1).maybeSingle();
          if (!seq.data) seq = await supabase.from('sequences').select('id').eq('tenant_id', (process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387')).ilike('name', '%' + decision.sequence_name + '%').limit(1).maybeSingle();
          if (seq.data) {
            var fs = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', seq.data.id).eq('step_number', 1).single();
            var nextAt = new Date(Date.now() + ((fs.data && fs.data.delay_days) || 0) * 86400000).toISOString();
            var _safeEnrol1 = require('./_lib/safe-enrol-sequence');
            await _safeEnrol1.safeEnrolSequence(supabase, { tenant_id: match.tenantId, lead_id: match.leadId, sequence_id: seq.data.id, next_step_at: nextAt });
            if (actionId) await supabase.from('email_actions').update({ status: 'actioned', actioned_at: new Date().toISOString() }).eq('id', actionId);
          }
        }
      } catch (seqErr) { console.warn('[EmailAI] Sequence enrol error:', seqErr.message); }
    }

    // 8. Create action_item for review decisions (Action Board ingestion)
    if (decision.action === 'review' && match.tenantId) {
      try {
        var spSettings = await supabase.from('sp_settings').select('action_board_enabled').eq('tenant_id', match.tenantId).maybeSingle();
        if (spSettings.data && spSettings.data.action_board_enabled) {
          // Find first admin user for this tenant
          var adminMember = await supabase.from('tenant_members').select('user_id')
            .eq('tenant_id', match.tenantId).eq('role', 'admin').eq('status', 'active').limit(1).maybeSingle();
          var adminUserId = adminMember.data ? adminMember.data.user_id : null;
          if (adminUserId) {
            var replySubjForItem = (ctx.subject || '').startsWith('Re:') ? ctx.subject : 'Re: ' + (ctx.subject || 'your message');
            await supabase.from('action_items').insert({
              tenant_id: match.tenantId,
              user_id: adminUserId,
              source: 'inbound_email',
              tier: 'engagement',
              title: 'Reply to ' + (ctx.senderName || sender) + ': ' + (ctx.subject || '(no subject)'),
              draft_subject: replySubjForItem,
              draft_body_html: decision.reply_draft ? '<p>' + decision.reply_draft.replace(/\n/g, '</p><p>') + '</p>' : null,
              draft_recipients: [{ email: sender, name: ctx.senderName || sender }],
              contact_id: match.contactId || null,
              lead_id: match.leadId || null,
              conversation_id: ctx.conversationId || null,
              status: 'pending',
            });
            console.log('[EmailAI] Action item created for review:', sender);
          }
        }
      } catch (aiErr) { console.warn('[EmailAI] Action item creation error:', aiErr.message); }
    }

    console.log('[EmailAI] Processed', sender, 'action:', decision.action, 'matched contact/lead/tenant:', !!match.contactId, !!match.leadId, !!match.tenantId);
  } catch (err) { console.error('[EmailAI] analyzeAndActionEmail error:', err.message); }
}

async function tryQualifyProspect(email, replyBody, channel) {
  try {
    if (!email) return 0;
    var r = await supabase.from('leads').select('id, name, phone, email, tenant_id, qualified').eq('email', email).eq('qualified', false);
    var matches = r.data || [];
    if (matches.length === 0) return 0;

    var extracted = { name: null, phone: null };
    try {
      var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5', max_tokens: 200,
          system: 'Extract sender info from prospect replies. Return STRICT JSON only: {"name": "full name" or null, "phone": "phone" or null}. No other text.',
          messages: [{ role: 'user', content: 'Reply message: ' + (replyBody || '') + '\n\nExtract the sender\'s name (if mentioned) and phone number (if mentioned). Return JSON.' }],
        }),
      });
      var aiData = await aiRes.json();
      var text = (aiData.content || []).find(function(b) { return b.type === 'text'; })?.text || '';
      var m = text.match(/\{[\s\S]*\}/); if (m) extracted = JSON.parse(m[0]);
    } catch (aiErr) {}

    var now = new Date().toISOString();
    for (var l of matches) {
      var emailQualStageId = await getPipelineStageId(supabase, l.tenant_id, STAGE_KEYS.LEAD);
      var upd = { qualified: true, pipeline_stage_id: emailQualStageId, urgency: 'Hot', prospect_stage: null, last_activity_at: now, last_action_at: new Date().toISOString().split('T')[0] };
      if (extracted.name && (!l.name || l.name === 'Unknown')) upd.name = extracted.name;
      if (extracted.phone && !l.phone) upd.phone = extracted.phone;
      await supabase.from('leads').update(upd).eq('id', l.id);
      try {
        var seqs = await supabase.from('sequences').select('id').or('tenant_id.eq.' + l.tenant_id + ',tenant_id.eq.' + (process.env.REACT_APP_SP_TENANT_ID || process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387') + '').ilike('name', '%contact qualification%');
        if (seqs.data && seqs.data.length > 0) {
          var sids = seqs.data.map(function(s) { return s.id; });
          await supabase.from('lead_sequences').update({ status: 'cancelled' }).eq('lead_id', l.id).in('sequence_id', sids).eq('status', 'active');
        }
      } catch (sErr) {}
      // TODO: migrate to send-notification.js when internal email path is rebuilt
      console.warn('[Qualify] ADMIN NOTIFY (not sent): Lead qualified:', (upd.name || l.name || 'Prospect'), 'via', channel);
    }
    console.log('[Qualify] Qualified', matches.length, 'prospect(s) via', channel);
    return matches.length;
  } catch (err) { console.error('[Qualify] Error:', err.message); return 0; }
}

async function reactivateArchivedLeadsForContact(email) {
  try {
    if (!email) return 0;
    var r = await supabase.from('leads').select('id, name, tenant_id, notes, reactivated_at').eq('email', email).eq('archived', true);
    var matches = r.data || [];
    if (matches.length === 0) return 0;

    var now = new Date().toISOString();
    var today = new Date().toISOString().split('T')[0];
    var dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    var notifyEligible = [];

    for (var l of matches) {
      var recentlyReactivated = l.reactivated_at && new Date(l.reactivated_at).getTime() > dayAgo;
      if (!recentlyReactivated) notifyEligible.push(l);
      var reactNote = (l.notes || '') + '\n[Auto-reactivated ' + today + ': inbound email received]';
      var emailReactStageId = await getPipelineStageId(supabase, l.tenant_id, STAGE_KEYS.LEAD);
      await supabase.from('leads').update({ archived: false, pipeline_stage_id: emailReactStageId, urgency: 'Hot', reactivated_at: now, last_activity_at: now, last_action_at: today, notes: reactNote }).eq('id', l.id);
      try {
        var seq = await supabase.from('sequences').select('id').eq('tenant_id', l.tenant_id).ilike('name', '%new lead%general outreach%').limit(1);
        if (!seq.data || seq.data.length === 0) seq = await supabase.from('sequences').select('id').eq('tenant_id', l.tenant_id).ilike('name', '%general outreach%').limit(1);
        if (!seq.data || seq.data.length === 0) seq = await supabase.from('sequences').select('id').eq('tenant_id', l.tenant_id).ilike('name', '%new lead%').limit(1);
        if (seq.data && seq.data.length > 0) {
          var sid = seq.data[0].id;
          var fs = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', sid).eq('step_number', 1).single();
          var start = new Date(); if (fs.data && fs.data.delay_days > 0) start.setDate(start.getDate() + fs.data.delay_days);
          var _safeEnrol2 = require('./_lib/safe-enrol-sequence');
          await _safeEnrol2.safeEnrolSequence(supabase, { tenant_id: l.tenant_id, lead_id: l.id, sequence_id: sid, next_step_at: start.toISOString() });
        }
      } catch (seqErr) {}
    }

    if (notifyEligible.length > 0) {
      // TODO: migrate to send-notification.js when internal email path is rebuilt
      console.warn('[Reactivate] ADMIN NOTIFY (not sent): Lead reactivated:', notifyEligible.map(function(x) { return x.name; }).join(', '));
    } else {
      console.log('[Reactivate] Skipped notification — all', matches.length, 'lead(s) reactivated within the last 24h');
    }

    console.log('[Reactivate] Reactivated', matches.length, 'archived lead(s) via email reply from', email);
    return matches.length;
  } catch (err) { console.error('[Reactivate] Error:', err.message); return 0; }
}

async function notifyInboundSendGrid(contactName, channel, preview) {
  // TODO: migrate to send-notification.js when internal email path is rebuilt
  console.warn('[Notify] ADMIN NOTIFY (not sent): New', channel, 'from', (contactName || 'Unknown'), '—', (preview || '').substring(0, 80));
}

var EW_EMAIL_SYSTEM_PROMPT = 'You are the AI assistant for EngageWorx, an AI-powered omnichannel customer communications platform. You handle inbound sales and support enquiries sent to hello@engwx.com.\n\nABOUT ENGAGEWORX:\n- Platform: SMS, WhatsApp, Email, Voice, and RCS — all in one portal at portal.engwx.com\n- Pricing: Starter $99/mo, Growth $249/mo, Pro $499/mo. Enterprise: custom.\n- No platform fee — a key differentiator vs competitors like GoHighLevel\n- Built-in AI chatbot powered by Claude (Anthropic)\n- Multi-tenant white-label architecture — businesses use it directly OR resell it (CSP model)\n- Live at portal.engwx.com\n\nYOUR ROLE:\n- Reply professionally and helpfully to inbound enquiries\n- Answer questions about pricing, features, channels, and setup\n- Encourage prospects to sign up at portal.engwx.com or book a demo at calendly.com/rob-engwx/30min\n- For partnership or reseller enquiries, highlight the white-label CSP model\n- Keep replies concise — 3-5 sentences or short paragraphs, never a wall of text\n- Never mention Twilio, SendGrid, Supabase, Vercel, or any infrastructure provider\n- Sign off as: EngageWorx Team\n\nTONE: Warm, confident, direct. Short sentences. No buzzwords.';

async function getAIReply(message) {
  var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) throw new Error('No Anthropic API key');
  var response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      system: EW_EMAIL_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: message }],
    }),
  });
  if (!response.ok) {
    var err = await response.json();
    throw new Error('Claude error: ' + JSON.stringify(err));
  }
  var data = await response.json();
  return data.content && data.content[0] && data.content[0].text
    ? data.content[0].text.trim()
    : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    console.log('🔵 [email-inbound.js] HANDLER HIT:', new Date().toISOString());

    var body = await parseMultipart(req);
    console.log('[Inbound] Parsed fields:', Object.keys(body).join(', '));

    var from        = body.from || '';
    var toHeader    = body.to || '';
    var ccHeader    = body.cc || '';
    var subject     = body.subject || '(no subject)';
    var text        = body.text || '';
    var html        = body.html || '';
    var senderName  = (from.match(/^([^<]+)</) || [])[1];
    senderName = senderName ? senderName.trim() : '';
    var senderEmail = (from.match(/<([^>]+)>/) || [])[1] || from.trim();

    // Parse all addresses from a header line (to or cc). Returns [{name, email}].
    function parseAddrList(header) {
      if (!header) return [];
      var parts = String(header).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      return parts.map(function(raw) {
        var n = (raw.match(/^([^<]+)</) || [])[1];
        var e = (raw.match(/<([^>]+)>/) || [])[1] || raw;
        return { name: (n || '').trim(), email: (e || '').trim().toLowerCase() };
      }).filter(function(a) { return a.email && a.email.indexOf('@') !== -1; });
    }
    var toParticipants = parseAddrList(toHeader);
    var ccParticipants = parseAddrList(ccHeader);

    // ── INGESTION FILTER — runs BEFORE any DB writes ──────────────────────
    var fromLower = (senderEmail || '').toLowerCase().trim();
    // (a) Domain blocklist
    if (/@([a-z0-9-]+\.)*linkedin\.com$/i.test(fromLower) ||
        /@([a-z0-9-]+\.)*facebook(mail)?\.com$/i.test(fromLower) ||
        /@([a-z0-9-]+\.)*fb\.com$/i.test(fromLower) ||
        /@mailer-daemon\./i.test(fromLower) ||
        /@postmaster\./i.test(fromLower)) {
      console.log('🚫 Blocked domain: ' + fromLower);
      return res.status(200).json({ skipped: true, reason: 'blocked_domain' });
    }
    // (b) Local-part blocklist
    if (/^(no-?reply|noreply|do-?not-?reply|automated|notifications?|bounce|mailer-daemon|postmaster|invitations|inmail-hit-reply|updates|alerts|digest|newsletter|mailing|list-manager)@/i.test(fromLower)) {
      console.log('🚫 Blocked local-part: ' + fromLower);
      return res.status(200).json({ skipped: true, reason: 'blocked_local_part' });
    }
    // (c) Header-based blocklist
    var rawHdrs = (body.headers || '').toLowerCase();
    if (/list-unsubscribe/i.test(rawHdrs) || /precedence:\s*(bulk|list)/i.test(rawHdrs) ||
        /auto-submitted:\s*(auto-generated|auto-replied)/i.test(rawHdrs) || /x-auto-response-suppress/i.test(rawHdrs)) {
      console.log('🚫 Blocked bulk/automated headers from: ' + fromLower);
      return res.status(200).json({ skipped: true, reason: 'bulk_headers' });
    }
    // Skip mail from ourselves
    if (fromLower.indexOf('engwx.com') !== -1) {
      console.log('🚫 Skipping internal email from: ' + fromLower);
      return res.status(200).json({ skipped: true, reason: 'internal' });
    }

    var rawEmailBody = text || html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/https?:\/\/\S+/g, '').replace(/\[cid:[^\]]+\]/g, '').replace(/\s+/g, ' ').trim();
    // Signature stripping applied after tenant resolution (tenant may have custom markers)
    var emailBody = rawEmailBody;
    if (emailBody.length > 5000) emailBody = emailBody.substring(0, 5000);

    console.log('[Inbound] from:', senderEmail, 'to:', toHeader, 'subject:', subject);
    console.log('[Inbound] toParticipants:', toParticipants.map(function(p) { return p.email; }));

    // ── Resolve tenant: try recipient first (To: header), then sender ──────
    // ── ISOLATION FAIL-SAFE: resolve tenant from the DESTINATION only ──────────
    // Priority: (1) our own reply-thread token in the To address (authoritative,
    // destination-based), (2) recipient mapping (inbound_domain / inbound_email /
    // from_email / custom_domain). NEVER fall back to the sender's tenant or a default
    // tenant — an unknown destination must not be answered by a tenant the SENDER
    // happens to exist in. (Breach: delamere-addressed mail handled by EngageWorx.)
    var toEmails = toParticipants.map(function(p) { return p.email; });
    var replyThreadTenantId = null, replyThreadConvId = null;
    try {
      for (var ti = 0; ti < toEmails.length; ti++) {
        var tok = extractThreadId(toEmails[ti]);
        if (tok) {
          var rt = await resolveReplyThread(supabase, tok);
          if (rt && rt.tenant_id) { replyThreadTenantId = rt.tenant_id; replyThreadConvId = rt.conversation_id || null; break; }
        }
      }
    } catch (e) { console.warn('[Inbound] reply-thread resolve error:', e.message); }

    var recipientTenantId = replyThreadTenantId || await resolveTenantByRecipient(toEmails);
    // Resolved by sender ONLY for violation logging (which tenant it WOULD have leaked to).
    // Never used for routing.
    var senderTenantId = await resolveTenantForSender(senderEmail);
    console.log('[Inbound] tenant resolution: byReplyToken=' + (replyThreadTenantId || 'none') + ' byRecipient=' + (recipientTenantId || 'none') + ' bySender(attempted-only)=' + (senderTenantId || 'none'));

    if (!recipientTenantId) {
      console.warn('🚫 [Inbound] Destination unresolved — quarantining (NO sender/default fallback). to=' + toEmails.join(', '));
      try {
        await supabase.from('email_routing_violations').insert({
          tenant_id: senderTenantId || EW_TENANT_ID, // NOT NULL: record the tenant it would have leaked to
          violation_type: 'inbound_destination_unresolved',
          to_address: toEmails.join(', '),
          used_fallback: senderTenantId ? ('would_route_sender_tenant:' + senderTenantId) : 'none',
        });
      } catch (logErr) { console.warn('[Inbound] violation log error:', logErr.message); }
      return res.status(200).json({ skipped: true, reason: 'inbound_destination_unresolved' });
    }

    // (d) Per-tenant blocklist check — shared matcher (api/_lib/blocklist): domain/subdomain,
    // '<local>@' pattern (e.g. noreply@), and full-address shapes, plus keyword-on-subject.
    // Rejects before any contact/conversation is created.
    var blockCheckTenantId = recipientTenantId; // destination-only (isolation fail-safe)
    if (blockCheckTenantId) {
      try {
        var tbRes = await supabase.from('tenants').select('blocked_domains, blocked_keywords').eq('id', blockCheckTenantId).maybeSingle();
        if (tbRes.data) {
          var blk = checkInboundBlock(senderEmail, subject, { domains: tbRes.data.blocked_domains, keywords: tbRes.data.blocked_keywords });
          if (blk.blocked) {
            console.log('🚫 Blocked by tenant blocklist: ' + fromLower + ' (' + blk.matched + ')');
            return res.status(200).json({ skipped: true, reason: 'tenant_blocklist', matched: blk.matched });
          }
        }
      } catch (e) { console.log('Tenant blocklist check error:', e.message); }
    }

    // ── Per-tenant spam filter ────────────────────────────────────────────────
    var spamTenantId = recipientTenantId; // destination-only (isolation fail-safe)
    var spamCheck = await checkSpam(spamTenantId, senderEmail, subject);
    if (spamCheck.spam) {
      console.log('🚫 Spam detected:', spamCheck.matched, 'from:', senderEmail);
      try {
        var tid = spamTenantId;
        var nameParts2 = (senderName || '').split(' ');
        var firstName2 = nameParts2[0] || senderEmail.split('@')[0];
        var lastName2 = nameParts2.slice(1).join(' ') || '';
        var contactId2 = null;
        var ec = await supabase.from('contacts').select('id').eq('email', senderEmail).eq('tenant_id', tid).limit(1);
        if (ec.data && ec.data.length > 0) contactId2 = ec.data[0].id;
        else {
          var nc = await supabase.from('contacts').insert({ tenant_id: tid, first_name: firstName2, last_name: lastName2, email: senderEmail, status: 'spam' }).select().single();
          contactId2 = nc.data ? nc.data.id : null;
        }
        var convId2 = null;
        if (contactId2) {
          var nconv = await supabase.from('conversations').insert({
            tenant_id: tid, contact_id: contactId2, channel: 'email', status: 'spam',
            subject: subject, last_message_at: new Date().toISOString(), unread_count: 0,
          }).select().single();
          convId2 = nconv.data ? nconv.data.id : null;
          if (convId2) {
            await supabase.from('messages').insert({
              tenant_id: tid, conversation_id: convId2, contact_id: contactId2, channel: 'email',
              direction: 'inbound', sender_type: 'contact', body: emailBody, status: 'spam',
            });
          }
        }
      } catch (spamErr) { console.warn('[Spam] log error:', spamErr.message); }
      return res.status(200).json({ spam: true, matched: spamCheck.matched });
    }

    // ── Load tenant email config + apply signature stripping ─────────────────
    var resolvedTenantId = recipientTenantId; // destination-only — guaranteed non-null (unresolved already rejected above)
    var emailChannelConfig = {};
    try {
      var ecRes = await supabase.from('channel_configs').select('config_encrypted')
        .eq('tenant_id', resolvedTenantId).eq('channel', 'email').maybeSingle();
      if (ecRes.data && ecRes.data.config_encrypted) emailChannelConfig = ecRes.data.config_encrypted;
    } catch (e) {}
    var tenantSigMarkers = emailChannelConfig.signature_strip_markers || [];
    emailBody = stripSignature(emailBody, tenantSigMarkers);
    if (emailBody.length > 2000) emailBody = emailBody.substring(0, 2000) + '...';

    // ── Write to inbound_email_messages (new schema) ─────────────────────────
    var iemInsert = await supabase.from('inbound_email_messages').insert({
      tenant_id: resolvedTenantId,
      from_address: senderEmail,
      to_address: toParticipants.map(function(p) { return p.email; }).join(', '),
      subject: subject,
      body_text: (text || '').substring(0, 10000) || null,
      body_html: (html || '').substring(0, 50000) || null,
      headers: body.headers ? { raw: body.headers } : null,
      processed: false,
    }).select('id').single();
    if (iemInsert.error) console.error('[Inbound] inbound_email_messages insert error:', iemInsert.error.message, iemInsert.error.details);
    var inboundEmailMsgId = iemInsert.data ? iemInsert.data.id : null;

    // ── Persona-by-tenant responder dispatch ─────────────────────────────────
    // Persona is a function of the RESOLVED tenant, never the pipeline/provider. A wedding
    // tenant gets Emma even when its mail lands on this (SendGrid) pipeline. The hardcoded
    // EW sales prompt + EngageWorx signature is applied ONLY to EngageWorx; every other
    // tenant is answered by ITS OWN configured persona (via analyzeAndActionEmail below),
    // never EW's prompt. Concierge gate = SAME signal as email-inbound-concierge.js.
    var replySubject = subject.startsWith('Re:') ? subject : 'Re: ' + subject;
    var personaSurface = null;
    var personaReplyMode = 'auto_send';
    try {
      var GATE_SURFACES = ['wedding_concierge', 'helpdesk'];
      for (var gsi = 0; gsi < GATE_SURFACES.length; gsi++) {
        var gcfg = await supabase.from('chatbot_configs').select('id, channels_active, ai_reply_mode')
          .eq('tenant_id', resolvedTenantId).eq('surface', GATE_SURFACES[gsi]).maybeSingle();
        if (gcfg.data && (gcfg.data.channels_active || []).includes('email')) {
          personaSurface = GATE_SURFACES[gsi];
          personaReplyMode = gcfg.data.ai_reply_mode || 'auto_send';
          break;
        }
      }
    } catch (e) { console.warn('[email-inbound] persona gate error:', e.message); }

    if (personaSurface === 'wedding_concierge') {
      // Wedding concierge (Emma) — same responder as the Resend handler. Respect the tenant's
      // ai_reply_mode (read from the matched config above): draft_review → hold for human
      // approval (no auto-send); auto modes → send AS THE TENANT.
      try {
        var cr = await generateConciergeResponse(supabase, {
          tenantId: resolvedTenantId, surface: 'wedding_concierge', weddingId: null,
          conversationId: conversationId || null, userMessage: emailBody,
          contactMeta: { name: senderName, email: senderEmail },
        });
        var emmaReply = cr && cr.response ? cr.response : null;
        if (emmaReply && personaReplyMode === 'draft_review') {
          // DRAFT MODE — persist as a pending draft for Live Inbox review (mirrors the Resend
          // concierge draft_review flow). Contact + conversation must exist first, so resolve
          // them here (the handler's own creation runs later) — all scoped to resolvedTenantId.
          var draftContactId = null, draftConvId = null;
          try {
            var { data: dcId } = await supabase.rpc('find_or_create_contact', {
              p_tenant_id: resolvedTenantId, p_email: senderEmail, p_first_name: senderName || null, p_source: 'inbound_email',
            });
            draftContactId = dcId || null;
            if (draftContactId) {
              var dEc = await supabase.from('conversations').select('id')
                .eq('tenant_id', resolvedTenantId).eq('contact_id', draftContactId).eq('channel', 'email').limit(1).maybeSingle();
              if (dEc.data) {
                draftConvId = dEc.data.id;
                await supabase.from('conversations').update({ last_message_at: new Date().toISOString(), unread_count: 1, status: 'active' }).eq('id', draftConvId);
              } else {
                var dNc = await supabase.from('conversations').insert({
                  tenant_id: resolvedTenantId, contact_id: draftContactId, channel: 'email', status: 'active',
                  subject: subject, last_message_at: new Date().toISOString(), unread_count: 1,
                }).select('id').single();
                if (dNc.data) draftConvId = dNc.data.id;
              }
            }
            if (draftConvId) {
              // Persist the couple's inbound so it's visible alongside the draft.
              await supabase.from('messages').insert({
                tenant_id: resolvedTenantId, conversation_id: draftConvId, contact_id: draftContactId,
                channel: 'email', direction: 'inbound', sender_type: 'contact',
                body: (emailBody || '').substring(0, 10000), subject: subject, status: 'delivered',
                metadata: { source: 'sendgrid_inbound', from: senderEmail, to: toParticipants.map(function(p) { return p.email; }).join(', ') },
              });
              // Same RPC + semantics as the Resend draft_review path: body-only HTML; wrap +
              // signature applied at Approve & Send (draft-approve → wrapAndDispatch).
              await supabase.rpc('save_ai_draft', {
                p_tenant_id: resolvedTenantId, p_conversation_id: draftConvId,
                p_body: emmaReply, p_html: markdownToHtml(emmaReply), p_channel: 'email',
              });
              console.log('✅ [email-inbound] Wedding concierge DRAFT saved (draft_review) conv=' + draftConvId + ' tenant=' + resolvedTenantId + ' — NO auto-send');
            } else {
              console.error('[email-inbound] concierge draft: could not resolve conversation — draft not saved. tenant=' + resolvedTenantId);
            }
          } catch (dErr) { console.error('[email-inbound] concierge draft persist error:', dErr.message); }
          // Self-contained, like the Resend concierge handler: stop here (no auto-send, no
          // sales-pipeline processing for a wedding couple).
          return res.status(200).json({ ok: true, action: 'concierge_draft_saved', conversation_id: draftConvId });
        }
        if (emmaReply) {
          // AUTO mode — send AS THE TENANT (Emma from the tenant's address + signature).
          var _sigE = require('./_email-signature');
          var sigE = await _sigE.getSignature(supabase, { tenantId: resolvedTenantId, fromEmail: null, isFirstTouch: false, closingKind: 'reply' });
          var emmaHtml = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.6;">' + markdownToHtml(emmaReply) + '</div>';
          await sendTenantEmail(supabase, {
            tenant_id: resolvedTenantId, to: senderEmail, subject: replySubject,
            text: _sigE.composeTextBody(emmaReply, sigE.closingLine, sigE.fromName),
            html: _sigE.composeHtmlBody(emmaHtml, sigE.closingLine, sigE.signatureHtml),
            conversation_id: conversationId || undefined,
          });
          console.log('✅ [email-inbound] Wedding concierge (Emma) reply sent AS tenant', resolvedTenantId, 'to', senderEmail);
        }
      } catch (cErr) { console.error('[email-inbound] concierge dispatch error:', cErr.message); }
    } else if (resolvedTenantId === EW_TENANT_ID) {
      // EngageWorx sales AI — hardcoded EW persona + signature (EngageWorx ONLY).
      var aiReply = null;
      try {
        aiReply = await getAIReply(
          'Inbound email from: ' + (senderName || senderEmail) + '\nSubject: ' + subject + '\n\nMessage:\n' + emailBody
        );
        console.log('✅ AI reply generated, length:', aiReply ? aiReply.length : 0);
      } catch (aiErr) {
        console.error('AI reply error:', aiErr.message);
        aiReply = 'Thank you for reaching out to EngageWorx! Our team will get back to you shortly. In the meantime, feel free to explore the platform at portal.engwx.com or book a demo at calendly.com/rob-engwx/30min.';
      }
      var htmlReply = aiReply.split('\n\n').map(function(p) {
        return '<p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6;">' +
          p.replace(/\n/g, '<br>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') + '</p>';
      }).join('') +
      '<br><table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,sans-serif;font-size:13px;color:#555;">' +
      '<tr><td style="padding-right:16px;vertical-align:top;">' +
      '<div style="background:linear-gradient(135deg,#00C9FF,#E040FB);color:white;font-weight:bold;font-size:15px;padding:8px 12px;border-radius:6px;">EW</div>' +
      '</td><td style="vertical-align:top;">' +
      '<div style="font-weight:bold;color:#222;font-size:14px;">EngageWorx Team</div>' +
      '<div style="color:#777;font-size:12px;margin-top:2px;">SMS · WhatsApp · Email · Voice · RCS</div>' +
      '<div style="margin-top:4px;">' +
      '📞 <a href="tel:+17869827800" style="color:#00C9FF;text-decoration:none;">+1 (786) 982-7800</a> &nbsp;|&nbsp;' +
      '🌐 <a href="https://engwx.com" style="color:#00C9FF;text-decoration:none;">engwx.com</a> &nbsp;|&nbsp;' +
      '📅 <a href="https://calendly.com/rob-engwx/30min" style="color:#00C9FF;text-decoration:none;">Book a demo</a>' +
      '</div></td></tr></table>';
      try {
        await sendTenantEmail(supabase, {
          tenant_id: EW_TENANT_ID,
          to: senderEmail,
          subject: replySubject,
          text: aiReply + '\n\n--\nEngageWorx Team\nengwx.com',
          html: htmlReply,
          conversation_id: conversationId || undefined,
        });
        console.log('✅ AI reply sent to:', senderEmail);
      } catch (sendErr) {
        console.error('[email-inbound] AI reply send error:', sendErr.message);
      }
    } else {
      // Any OTHER tenant — never send EW's sales reply. The per-tenant responder
      // (analyzeAndActionEmail, below) answers with THIS tenant's configured persona.
      console.log('[email-inbound] Tenant', resolvedTenantId, '(no concierge surface, not EngageWorx) — deferring to per-tenant responder; no EW reply sent.');
    }

    // ── Portal-user guard ─────────────────────────────────────────────────────
    // If the sender is an existing portal user (CSP/agent/team member/tenant owner),
    // don't spin up a pipeline contact + conversation. Log and bail.
    try {
      var portalMatch = null;
      var lowerSender = (senderEmail || '').toLowerCase().trim();
      var INTERNAL_ADDRS = [(process.env.PLATFORM_ADMIN_EMAIL || 'rob@engwx.com'), (process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com'), 'notifications@engwx.com', 'support@engwx.com'];
      if (lowerSender && INTERNAL_ADDRS.indexOf(lowerSender) !== -1) {
        portalMatch = { source: 'internal', email: lowerSender };
      }
      var memberTenantId = null;
      var memberProfileId = null;
      if (lowerSender && !portalMatch) {
        var up = await supabase.from('user_profiles').select('id, email, tenant_id').ilike('email', lowerSender).maybeSingle();
        if (up.data && up.data.id) {
          portalMatch = { source: 'user_profiles', email: up.data.email };
          memberProfileId = up.data.id;
          memberTenantId = up.data.tenant_id;
          // If user_profiles.tenant_id is missing, find the primary tenant_members row
          if (!memberTenantId) {
            try {
              var mm = await supabase.from('tenant_members').select('tenant_id').eq('user_id', up.data.id).eq('status', 'active').limit(1).maybeSingle();
              if (mm.data) memberTenantId = mm.data.tenant_id;
            } catch (e) {}
          }
        }
        if (!portalMatch) {
          var td = await supabase.from('tenants').select('id, name').ilike('digest_email', lowerSender).limit(1).maybeSingle();
          if (td.data) { portalMatch = { source: 'digest_email', tenant: td.data.name }; memberTenantId = td.data.id; }
        }
      }
      if (portalMatch) {
        // Portal users writing to hello@/rob@engwx.com are asking for support, not generating leads.
        // Turn the email into a support_tickets row, then trigger auto-triage.
        if (memberTenantId) {
          try {
            var ticketIns = await supabase.from('support_tickets').insert({
              tenant_id: memberTenantId,
              subject: subject || '(no subject)',
              description: emailBody,
              submitter_email: senderEmail,
              submitter_name: senderName || senderEmail,
              category: 'general',
              priority: 'normal',
              status: 'triaging',
              source_channel: 'email',
            }).select('id').single();
            var newTicketId = ticketIns.data && ticketIns.data.id;
            console.log('🎫 Support ticket created from portal-user email:', newTicketId, 'tenant:', memberTenantId);
            if (newTicketId) {
              // Fire-and-forget triage
              var portalBase = process.env.PORTAL_URL || 'https://portal.engwx.com';
              fetch(portalBase + '/api/support-triage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticket_id: newTicketId, tenant_id: memberTenantId }),
              }).catch(function() {});
            }
            return res.status(200).json({ routed: 'support_ticket', ticket_id: newTicketId, tenant: memberTenantId });
          } catch (tErr) { console.warn('[Inbound] Support ticket create error:', tErr.message); }
        }
        console.log('🛡️ Skipping inbound — portal user with no resolvable tenant:', senderEmail, portalMatch);
        return res.status(200).json({ skipped: 'portal_user', sender: senderEmail, match: portalMatch });
      }
    } catch (pgErr) { console.warn('[Inbound] Portal-user check error:', pgErr.message); }

    // ── Live Inbox ────────────────────────────────────────────────────────────
    try {
      console.log('🔵 Inbox block started');

      // 1. Find or create contact
      var contactId = null;
      var nameParts = (senderName || '').split(' ');
      var firstName = nameParts[0] || senderEmail.split('@')[0];
      var lastName = nameParts.slice(1).join(' ') || '';

      var _companies = require('./_companies');
      var senderCompanyId = await _companies.ensureCompanyForContact(supabase, EW_TENANT_ID, senderEmail);

      var existingContactsResult = await supabase.from('contacts').select('id, company_id').eq('email', senderEmail).eq('tenant_id', EW_TENANT_ID).limit(1);
      if (existingContactsResult.data && existingContactsResult.data.length > 0) {
        contactId = existingContactsResult.data[0].id;
        if (senderCompanyId && !existingContactsResult.data[0].company_id) {
          try { await supabase.from('contacts').update({ company_id: senderCompanyId }).eq('id', contactId); } catch (e) {}
        }
      } else {
        var newContactResult = await supabase.from('contacts').insert({
          tenant_id: EW_TENANT_ID,
          first_name: firstName,
          last_name: lastName,
          email: senderEmail,
          status: 'active',
          company_id: senderCompanyId || null,
        }).select().single();
        contactId = newContactResult.data ? newContactResult.data.id : null;
      }
      console.log('📋 Contact id:', contactId, 'Company id:', senderCompanyId);

      // CC / To participant contact creation — link everyone to the same conversation.
      // Skip the sender, our own inbound address, and any portal users.
      var allParticipants = toParticipants.concat(ccParticipants).filter(function(p, idx, arr) {
        if (!p.email || p.email === senderEmail.toLowerCase()) return false;
        if (p.email.indexOf('@engwx.com') !== -1) return false;
        // De-dupe
        return arr.findIndex(function(x) { return x.email === p.email; }) === idx;
      });
      var participantContactIds = [];
      for (var pi = 0; pi < allParticipants.length; pi++) {
        var p = allParticipants[pi];
        try {
          var isPortalUser = false;
          try {
            var up = await supabase.from('user_profiles').select('id').ilike('email', p.email).maybeSingle();
            if (up.data && up.data.id) isPortalUser = true;
          } catch (e) {}
          if (isPortalUser) continue;
          var pName = p.name || p.email.split('@')[0];
          var pFirst = pName.split(' ')[0] || '';
          var pLast = pName.split(' ').slice(1).join(' ') || '';
          var pCompanyId = await _companies.ensureCompanyForContact(supabase, EW_TENANT_ID, p.email);
          var existingP = await supabase.from('contacts').select('id').eq('email', p.email).eq('tenant_id', EW_TENANT_ID).limit(1).maybeSingle();
          var pid = existingP.data ? existingP.data.id : null;
          if (!pid) {
            var ins = await supabase.from('contacts').insert({
              tenant_id: EW_TENANT_ID, first_name: pFirst, last_name: pLast,
              email: p.email, status: 'active', company_id: pCompanyId || null, source: 'email_cc',
            }).select('id').single();
            pid = ins.data ? ins.data.id : null;
          }
          if (pid) participantContactIds.push(pid);
        } catch (e) { console.warn('[Inbound] participant create error:', e.message); }
      }
      console.log('👥 CC/To participants linked:', participantContactIds.length);

      // 2. Find or create conversation
      var conversationId = null;
      if (contactId) {
        var existingConvsResult = await supabase.from('conversations').select('id').eq('contact_id', contactId).eq('tenant_id', EW_TENANT_ID).eq('channel', 'email').in('status', ['active', 'waiting']).limit(1);
        if (existingConvsResult.data && existingConvsResult.data.length > 0) {
          conversationId = existingConvsResult.data[0].id;
        } else {
          var newConvResult = await supabase.from('conversations').insert({
            tenant_id: EW_TENANT_ID,
            contact_id: contactId,
            channel: 'email',
            status: 'waiting',
            subject: subject,
            last_message_at: new Date().toISOString(),
            unread_count: 1,
          }).select().single();
          conversationId = newConvResult.data ? newConvResult.data.id : null;
        }
      }
      console.log('💬 Conversation id:', conversationId);

      // 3. Save messages
      if (conversationId) {
        var now = new Date().toISOString();

        // Inbound message
        var inboundInsert = await supabase.from('messages').insert({
          conversation_id: conversationId,
          tenant_id: EW_TENANT_ID,
          direction: 'inbound',
          channel: 'email',
          body: emailBody,
          status: 'delivered',
          sender_type: 'contact',
          metadata: { from: senderEmail, to: toParticipants.map(function(p) { return p.email; }), cc: ccParticipants.map(function(p) { return p.email; }), subject: subject, sender_name: senderName, participant_contact_ids: participantContactIds },
          created_at: now,
        });
        if (inboundInsert.error) console.error('Inbound message insert error:', inboundInsert.error.message);

        // AI outbound reply
        var spThreadId = spSendResult && spSendResult.threadId ? spSendResult.threadId : null;
        var spReplyToAddr = spSendResult && spSendResult.replyToAddress ? spSendResult.replyToAddress : null;
        var outboundInsert = await supabase.from('messages').insert({
          conversation_id: conversationId,
          tenant_id: EW_TENANT_ID,
          direction: 'outbound',
          channel: 'email',
          body: aiReply,
          status: 'sent',
          sender_type: 'bot',
          metadata: { reply_thread_id: spThreadId, reply_to_address: spReplyToAddr, source: 'auto_reply', from: (process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com'), to: senderEmail, subject: replySubject, ai_generated: true },
          created_at: new Date(Date.now() + 1000).toISOString(),
        });
        if (outboundInsert.error) console.error('Outbound message insert error:', outboundInsert.error.message);

        // Update conversation
        await supabase.from('conversations').update({
          last_message_at: new Date().toISOString(),
          last_message_preview: emailBody.substring(0, 100),
          status: 'waiting',
          unread_count: 1,
        }).eq('id', conversationId);

        console.log('✅ Live Inbox updated — conversation:', conversationId);
      }
    } catch (inboxErr) {
      console.error('🔴 Live Inbox error:', inboxErr.message, inboxErr.stack);
    }

    // ── Check escalation triggers ──────────────────────────────────────────────
    checkEscalationTriggers({
      supabase: supabase, tenantId: EW_TENANT_ID, inboundBody: emailBody,
      contactId: contactId, conversationId: conversationId,
      contactInfo: senderEmail,
    }).catch(function(e) { console.warn('[email-inbound] Escalation trigger check error:', e.message); });

    // ── Halt sequences on reply ───────────────────────────────────────────────
    pauseSequencesForContact(senderEmail).catch(function() {});

    // ── Reactivate archived leads on reply ────────────────────────────────────
    var _reactivatedCount = 0;
    try { _reactivatedCount = await reactivateArchivedLeadsForContact(senderEmail); } catch (e) {}

    // ── Qualify unqualified prospects on reply ────────────────────────────────
    tryQualifyProspect(senderEmail, emailBody, 'Email').catch(function() {});

    // ── AI Email Intelligence — Claude analysis + action ──────────────────────
    // Skip for wedding-concierge tenants: Emma already replied above, and the sales-pipeline
    // actions (stage advance / sequence enrol / auto_reply) don't apply to a concierge tenant.
    if (personaSurface !== 'wedding_concierge') {
      analyzeAndActionEmail({ tenantId: resolvedTenantId, senderEmail: senderEmail, senderName: senderName, subject: subject, body: emailBody, conversationId: conversationId }).catch(function() {});
    }

    // ── Notify admin via SendGrid ────────────────────────────────────────────
    notifyInboundSendGrid(senderName || senderEmail, 'Email', emailBody).catch(function() {});

    // ── Pipeline lead ─────────────────────────────────────────────────────────
    try {
      var existingLeadResult = await supabase.from('leads').select('id').eq('email', senderEmail).limit(1);
      if (!existingLeadResult.data || existingLeadResult.data.length === 0) {
        var company = senderEmail.split('@')[1] ? senderEmail.split('@')[1].split('.')[0] : '';
        company = company.charAt(0).toUpperCase() + company.slice(1);
        var emailStageId = await getPipelineStageId(supabase, EW_TENANT_ID, STAGE_KEYS.LEAD);
        await supabase.from('leads').insert({
          name: senderName || null,
          email: senderEmail,
          company: company,
          source: 'inbound_email',
          pipeline_stage_id: emailStageId,
          urgency: 'Warm',
          notes: 'Auto-created from inbound email. Subject: ' + subject,
          last_action_at: new Date().toISOString().split('T')[0],
          last_activity_at: new Date().toISOString(),
          tenant_id: EW_TENANT_ID,
        });
        console.log('Lead auto-created for:', senderEmail);
      } else {
        console.log('Lead already exists for:', senderEmail);
      }
    } catch (leadErr) {
      console.error('Lead auto-create failed:', leadErr.message);
    }

    // ── Mark inbound_email_messages as processed ───────────────────────────
    if (inboundEmailMsgId) {
      try {
        await supabase.from('inbound_email_messages').update({
          processed: true,
          processed_at: new Date().toISOString(),
          conversation_id: conversationId || null,
          contact_id: contactId || null,
        }).eq('id', inboundEmailMsgId);
      } catch (e) { console.warn('[Inbound] inbound_email_messages update error:', e.message); }
    }

    return res.status(200).json({ success: true, replied_to: senderEmail });

  } catch (err) {
    console.error('email-inbound error:', err.message, err.stack);
    return res.status(200).json({ error: err.message });
  }
};

// Disable Vercel's default body parser — SendGrid sends multipart/form-data.
// MUST be set AFTER `module.exports = handler` above: assigning the handler to
// module.exports replaces the exports object, so an earlier `module.exports.config`
// would be silently dropped (raw-body parsing would break). Attaching config as a
// property of the exported handler keeps both the handler and the config.
module.exports.config = { api: { bodyParser: false } };
