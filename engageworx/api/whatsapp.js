// /api/whatsapp.js — WhatsApp Business API
// POST /api/whatsapp?action=send      → Send WhatsApp message (text or template)
// POST /api/whatsapp?action=template   → Send template message with variables
// POST /api/whatsapp?action=webhook    → Inbound messages + status callbacks
// GET  /api/whatsapp?action=status     → Check WhatsApp sender status
var { buildSystemPrompt } = require('./_lib/build-system-prompt');
var { STAGE_KEYS, getPipelineStageId } = require('./_lib/pipelineStages');

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
  );
}

async function pauseSequencesForContact(supabase, phone, email) {
  try {
    var leadIds = [];
    if (phone) { var p = await supabase.from('leads').select('id').eq('phone', phone).limit(10); if (p.data) leadIds = leadIds.concat(p.data.map(function(l) { return l.id; })); }
    if (email) { var e = await supabase.from('leads').select('id').eq('email', email).limit(10); if (e.data) leadIds = leadIds.concat(e.data.map(function(l) { return l.id; })); }
    if (leadIds.length === 0) return;
    var unique = [...new Set(leadIds)];
    var r = await supabase.from('lead_sequences').update({ status: 'paused' }).in('lead_id', unique).eq('status', 'active');
    if (r.count > 0) console.log('[Sequences] Paused', r.count, 'enrollment(s) — WhatsApp reply');
  } catch (err) { console.error('[Sequences] Pause error:', err.message); }
}

async function tryQualifyProspect(supabase, phone, email, replyBody, channel) {
  try {
    var matches = [];
    if (phone) { var p = await supabase.from('leads').select('id, name, phone, email, tenant_id, qualified').eq('phone', phone).eq('qualified', false); if (p.data) matches = matches.concat(p.data); }
    if (email) { var e = await supabase.from('leads').select('id, name, phone, email, tenant_id, qualified').eq('email', email).eq('qualified', false); if (e.data) matches = matches.concat(e.data); }
    if (matches.length === 0) return 0;
    var seen = {}; var unique = matches.filter(function(l) { if (seen[l.id]) return false; seen[l.id] = true; return true; });

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
    for (var l of unique) {
      var waQualStageId = await getPipelineStageId(supabase, l.tenant_id, STAGE_KEYS.LEAD);
      var upd = { qualified: true, pipeline_stage_id: waQualStageId, urgency: 'Hot', prospect_stage: null, last_activity_at: now, last_action_at: new Date().toISOString().split('T')[0] };
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
      try {
        var { notifyTenantAdmins: _notifyWA } = require('./_lib/notify-tenant-admins');
        var qualName = upd.name || l.name || 'Prospect';
        await _notifyWA(supabase, l.tenant_id, 'whatsapp_unknown_sender', { name: qualName, phone: upd.phone || l.phone, channel: channel }, {
          subject: '✅ ' + qualName + ' just qualified from ' + channel,
          html: '<h3>Lead Qualified</h3><p><b>Name:</b> ' + qualName + '</p><p><b>Phone:</b> ' + (upd.phone || l.phone || '—') + '</p><p><b>Email:</b> ' + (l.email || '—') + '</p><p><b>Channel:</b> ' + channel + '</p><p><b>Reply preview:</b> ' + (replyBody || '').substring(0, 300) + '</p>',
        });
      } catch (nErr) {}
    }
    console.log('[Qualify] Qualified', unique.length, 'prospect(s) via', channel);
    return unique.length;
  } catch (err) { console.error('[Qualify] Error:', err.message); return 0; }
}

async function reactivateArchivedLeadsForContact(supabase, phone, email) {
  try {
    var matches = [];
    if (phone) { var p = await supabase.from('leads').select('id, name, tenant_id, notes, reactivated_at').eq('phone', phone).eq('archived', true); if (p.data) matches = matches.concat(p.data); }
    if (email) { var e = await supabase.from('leads').select('id, name, tenant_id, notes, reactivated_at').eq('email', email).eq('archived', true); if (e.data) matches = matches.concat(e.data); }
    if (matches.length === 0) return 0;
    var seen = {}; var unique = matches.filter(function(l) { if (seen[l.id]) return false; seen[l.id] = true; return true; });

    var now = new Date().toISOString();
    var today = new Date().toISOString().split('T')[0];
    var dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    var notifyEligible = [];

    for (var l of unique) {
      var recentlyReactivated = l.reactivated_at && new Date(l.reactivated_at).getTime() > dayAgo;
      if (!recentlyReactivated) notifyEligible.push(l);
      var reactNote = (l.notes || '') + '\n[Auto-reactivated ' + today + ': inbound WhatsApp received]';
      var waReactStageId = await getPipelineStageId(supabase, l.tenant_id, STAGE_KEYS.LEAD);
      await supabase.from('leads').update({ archived: false, pipeline_stage_id: waReactStageId, urgency: 'Hot', reactivated_at: now, last_activity_at: now, last_action_at: today, notes: reactNote }).eq('id', l.id);
      try {
        var seq = await supabase.from('sequences').select('id').eq('tenant_id', l.tenant_id).ilike('name', '%new lead%general outreach%').limit(1);
        if (!seq.data || seq.data.length === 0) seq = await supabase.from('sequences').select('id').eq('tenant_id', l.tenant_id).ilike('name', '%general outreach%').limit(1);
        if (!seq.data || seq.data.length === 0) seq = await supabase.from('sequences').select('id').eq('tenant_id', l.tenant_id).ilike('name', '%new lead%').limit(1);
        if (seq.data && seq.data.length > 0) {
          var sid = seq.data[0].id;
          var fs = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', sid).eq('step_number', 1).single();
          var start = new Date(); if (fs.data && fs.data.delay_days > 0) start.setDate(start.getDate() + fs.data.delay_days);
          var _safeEnrol = require('./_lib/safe-enrol-sequence');
          await _safeEnrol.safeEnrolSequence(supabase, { tenant_id: l.tenant_id, lead_id: l.id, sequence_id: sid, next_step_at: start.toISOString() });
        }
      } catch (seqErr) {}
    }

    if (notifyEligible.length > 0) {
      try {
        var { notifyTenantAdmins: _notifyWA2 } = require('./_lib/notify-tenant-admins');
        var _waTenantId = notifyEligible[0].tenant_id || null;
        await _notifyWA2(supabase, _waTenantId, 'whatsapp_optin', { leads: notifyEligible.map(function(x) { return x.name; }) }, {
          subject: '🔄 Lead Reactivated: ' + notifyEligible.map(function(x) { return x.name; }).join(', '),
          html: '<h3>Archived Lead Reactivated (WhatsApp inbound)</h3>' +
            notifyEligible.map(function(x) { return '<p><b>' + x.name + '</b></p>'; }).join('') +
            '<p>Lead unarchived and enrolled in outreach sequence.</p>',
        });
      } catch (nErr) {}
    } else {
      console.log('[Reactivate] Skipped notification — all', unique.length, 'lead(s) reactivated within the last 24h');
    }

    console.log('[Reactivate] Reactivated', unique.length, 'archived lead(s) via WhatsApp reply');
    return unique.length;
  } catch (err) { console.error('[Reactivate] Error:', err.message); return 0; }
}

async function notifyInboundSendGrid(contactName, channel, preview, inboundTenantId) {
  try {
    var { notifyTenantAdmins: _notifyWA3 } = require('./_lib/notify-tenant-admins');
    await _notifyWA3(supabase, inboundTenantId || null, 'whatsapp_inbound', { contact: contactName, channel: channel }, {
      subject: 'New ' + channel + ' from ' + (contactName || 'Unknown'),
      html: '<h3>Inbound ' + channel + ' Message</h3><p><b>Contact:</b> ' + (contactName || 'Unknown') + '</p><p><b>Channel:</b> ' + channel + '</p><p><b>Preview:</b> ' + (preview || '').substring(0, 300) + '</p><p><a href="https://portal.engwx.com">Open Live Inbox →</a></p>',
    });
  } catch (err) { console.error('[Notify] notifyTenantAdmins error:', err.message); }
}

async function sendWhatsApp(to, body, from, mediaUrl) {
  var accountSid = process.env.TWILIO_ACCOUNT_SID;
  var authToken = process.env.TWILIO_AUTH_TOKEN;
  var toWA = to.startsWith('whatsapp:') ? to : 'whatsapp:' + to;
  var fromWA = from
    ? (from.startsWith('whatsapp:') ? from : 'whatsapp:' + from)
    : 'whatsapp:' + (process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER);

  var auth = Buffer.from(accountSid + ':' + authToken).toString('base64');
  var params = new URLSearchParams();
  params.append('To', toWA);
  params.append('From', fromWA);
  params.append('Body', body);
  if (mediaUrl) params.append('MediaUrl', mediaUrl);
  params.append('StatusCallback', 'https://portal.engwx.com/api/whatsapp?action=webhook');

  var response = await fetch(
    'https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  return { data: await response.json(), ok: response.ok, status: response.status };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var action = req.query.action || 'send';

  // ─── SEND WHATSAPP MESSAGE ────────────────────────────────────
  if (action === 'send' && req.method === 'POST') {
    var to = req.body.to;
    var body = req.body.body;
    var from = req.body.from;
    var mediaUrl = req.body.media_url;
    var tenantId = req.body.tenant_id;
    var inConversationId = req.body.conversation_id || null;
    var inContactId = req.body.contact_id || null;

    if (!to || !body) return res.status(400).json({ error: 'Missing required fields: to, body' });

    // Usage check
    if (tenantId) {
      try {
        var supabaseUsage = getSupabase();
        var usageResult = await supabaseUsage.rpc('increment_usage', {
          p_tenant_id: tenantId,
          p_channel: 'whatsapp',
          p_count: 1,
        });
        if (usageResult.data && !usageResult.data.allowed) {
          return res.status(429).json({
            error: 'Message limit reached. Purchase a top-up or upgrade your plan.',
            usage: usageResult.data.usage,
            limit: usageResult.data.limit,
            remaining: 0,
            status: 'blocked',
          });
        }
      } catch (usageErr) {
        console.log('[Usage] WhatsApp check failed, allowing (fail-open):', usageErr.message);
      }
    }

    // ── Detect gateway: Meta Cloud API or Twilio ──────────────────
    var supabase = getSupabase();
    var metaPhoneNumberId = null;
    var metaAccessToken = null;
    var gateway = 'twilio'; // default

    if (tenantId) {
      try {
        var cfgResult = await supabase.from('channel_configs')
          .select('config_encrypted, whatsapp_phone_number_id')
          .eq('tenant_id', tenantId)
          .eq('channel', 'whatsapp')
          .eq('enabled', true)
          .maybeSingle();
        if (cfgResult.data) {
          var cfg = cfgResult.data.config_encrypted || {};
          // Use top-level column (indexed) for phone_number_id, fall back to JSONB
          var pnId = cfgResult.data.whatsapp_phone_number_id || cfg.phone_number_id;
          if (pnId && cfg.access_token) {
            metaPhoneNumberId = pnId;
            metaAccessToken = cfg.access_token;
            gateway = 'meta';
          }
        }
      } catch (_) {}
    }

    // Strict: if no WhatsApp config found for this tenant, reject
    if (tenantId && gateway === 'twilio' && !from) {
      // No Meta credentials and no explicit From number — check phone_numbers
      try {
        var pnWa = await supabase.from('phone_numbers').select('number')
          .eq('tenant_id', tenantId).eq('status', 'active').limit(1).maybeSingle();
        if (pnWa.data) from = pnWa.data.number;
      } catch (_) {}
    }

    var maskedTo = (to || '').replace(/.*(\d{4})$/, '****$1');
    console.log('[WhatsApp] Routing via ' + gateway, {
      tenant_id: tenantId,
      to: maskedTo,
      body_length: (body || '').length,
      phone_number_id: gateway === 'meta' ? metaPhoneNumberId : null,
    });

    try {
      // ── Dispatch via selected gateway ─────────────────────────────
      var dispatchResult; // { ok, status, provider_id, provider, response_status }

      if (gateway === 'meta') {
        // Meta Cloud API: to must be digits only, no + prefix
        var metaTo = to.replace(/[^\d]/g, '');
        var metaRes = await fetch('https://graph.facebook.com/v18.0/' + metaPhoneNumberId + '/messages', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + metaAccessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: metaTo,
            type: 'text',
            text: { body: body },
          }),
        });
        var metaData = await metaRes.json();
        console.log('[WhatsApp] Meta API response:', JSON.stringify(metaData));
        if (!metaRes.ok || metaData.error) {
          return res.status(metaRes.status || 500).json({
            error: metaData.error ? metaData.error.message : 'Meta API error',
            code: metaData.error ? metaData.error.code : null,
          });
        }
        var wamid = metaData.messages && metaData.messages[0] ? metaData.messages[0].id : null;
        dispatchResult = { ok: true, provider_id: wamid, provider: 'meta', response_status: 'sent', phone_number_id: metaPhoneNumberId };
      } else {
        // Twilio gateway
        var accountSid = process.env.TWILIO_ACCOUNT_SID;
        var authToken = process.env.TWILIO_AUTH_TOKEN;
        if (!accountSid || !authToken) return res.status(500).json({ error: 'Twilio credentials not configured' });

        var twilioResult = await sendWhatsApp(to, body, from, mediaUrl);
        if (!twilioResult.ok) {
          return res.status(twilioResult.status).json({
            error: twilioResult.data.message || 'WhatsApp send failed',
            code: twilioResult.data.code,
            moreInfo: twilioResult.data.more_info,
          });
        }
        dispatchResult = { ok: true, provider_id: twilioResult.data.sid, provider: 'twilio', response_status: twilioResult.data.status || 'queued' };
      }

      // ── Store message in Supabase ─────────────────────────────────
      var insertedMessage = null;
      if (tenantId) {
        try {
          var contactId = inContactId;
          var conversationId = inConversationId;

          // If conversation_id provided, verify it belongs to this tenant
          if (conversationId) {
            var convCheck = await supabase.from('conversations').select('id, contact_id').eq('id', conversationId).eq('tenant_id', tenantId).maybeSingle();
            if (!convCheck.data) {
              console.error('[WhatsApp] conversation_id', conversationId, 'not found for tenant', tenantId);
              conversationId = null;
            } else if (!contactId) {
              contactId = convCheck.data.contact_id;
            }
          }

          // Fallback: look up contact + conversation if not provided
          if (!conversationId) {
            var cleanTo = to.replace('whatsapp:', '').replace(/[^\d+]/g, '');

            if (!contactId) {
              var contactResult = await supabase.from('contacts').select('id')
                .eq('tenant_id', tenantId)
                .or('whatsapp_number.eq.' + cleanTo + ',phone.eq.' + cleanTo)
                .limit(1).maybeSingle();
              contactId = contactResult.data ? contactResult.data.id : null;
            }

            if (!contactId) {
              var newContact = await supabase.from('contacts').insert({
                tenant_id: tenantId, phone: cleanTo, whatsapp_number: cleanTo,
                first_name: 'WhatsApp', last_name: cleanTo.slice(-4), source: 'whatsapp',
              }).select('id').single();
              if (newContact.data) contactId = newContact.data.id;
            }

            if (contactId) {
              var convResult = await supabase.from('conversations').select('id').eq('contact_id', contactId).eq('tenant_id', tenantId).eq('channel', 'whatsapp').in('status', ['active', 'waiting', 'snoozed']).order('last_message_at', { ascending: false }).limit(1).maybeSingle();
              conversationId = convResult.data ? convResult.data.id : null;
            }

            if (!conversationId && contactId) {
              var newConv = await supabase.from('conversations').insert({
                tenant_id: tenantId, contact_id: contactId, channel: 'whatsapp',
                status: 'active', last_message_at: new Date().toISOString(),
              }).select('id').single();
              if (newConv.data) conversationId = newConv.data.id;
            }
          }

          if (conversationId) {
            await supabase.from('conversations').update({
              last_message_at: new Date().toISOString(), status: 'active',
            }).eq('id', conversationId);
          }

          // Insert ONE canonical message row
          if (conversationId) {
            var msgRow = {
              tenant_id: tenantId,
              conversation_id: conversationId,
              contact_id: contactId,
              channel: 'whatsapp',
              direction: 'outbound',
              sender_type: 'agent',
              body: body,
              status: dispatchResult.response_status,
              provider: dispatchResult.provider,
            };
            // Both providers write to provider_message_id
            msgRow.provider_message_id = dispatchResult.provider_id;
            if (dispatchResult.provider === 'meta') {
              msgRow.metadata = { phone_number_id: dispatchResult.phone_number_id };
            }
            var msgInsert = await supabase.from('messages').insert(msgRow)
              .select('id, status, provider_message_id, created_at').single();
            if (msgInsert.error) {
              console.error('[WhatsApp] Message insert error:', msgInsert.error.message);
            }
            if (msgInsert.data) insertedMessage = msgInsert.data;
          }
        } catch (dbErr) {
          console.error('[WhatsApp] DB error:', dbErr.message);
        }
      }

      return res.status(200).json({
        success: true,
        gateway: gateway,
        provider_id: dispatchResult.provider_id,
        status: dispatchResult.response_status,
        channel: 'whatsapp',
        message: insertedMessage,
      });
    } catch (err) {
      console.error('[WhatsApp] Send error:', err.message);
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }

  // ─── SEND TEMPLATE MESSAGE ────────────────────────────────────
  if (action === 'template' && req.method === 'POST') {
    var to = req.body.to;
    var templateName = req.body.template;
    var templateVars = req.body.template_vars || {};
    var tenantId = req.body.tenant_id;

    if (!to || !templateName) return res.status(400).json({ error: 'Missing required fields: to, template' });

    var templates = {
      'appointment_reminder': { body: 'Hi {{1}}, this is a reminder of your appointment with {{2}} on {{3}} at {{4}}. Reply YES to confirm or RESCHEDULE to change. Reply STOP to opt out.', category: 'utility' },
      'order_confirmation': { body: 'Hi {{1}}, your order #{{2}} has been confirmed. Estimated delivery: {{3}}. Track your order or reply with any questions.', category: 'utility' },
      'shipping_update': { body: 'Hi {{1}}, your order #{{2}} has shipped! Tracking: {{3}}. Expected delivery: {{4}}.', category: 'utility' },
      'welcome': { body: 'Welcome to {{1}}! We are excited to have you. Reply HELP for assistance or STOP to opt out.', category: 'utility' },
      'promotion': { body: '{{1}} — {{2}}. {{3}}. Reply STOP to opt out.', category: 'marketing' },
    };

    var template = templates[templateName];
    if (!template) {
      return res.status(400).json({ error: 'Unknown template: ' + templateName, available: Object.keys(templates) });
    }

    var body = template.body;
    Object.keys(templateVars).forEach(function(key) {
      body = body.replace('{{' + key + '}}', templateVars[key]);
    });

    // Usage check
    if (tenantId) {
      try {
        var supabaseUsage = getSupabase();
        var usageResult = await supabaseUsage.rpc('increment_usage', { p_tenant_id: tenantId, p_channel: 'whatsapp', p_count: 1 });
        if (usageResult.data && !usageResult.data.allowed) {
          return res.status(429).json({ error: 'Message limit reached.', status: 'blocked' });
        }
      } catch (ue) { /* fail open */ }
    }

    try {
      var result = await sendWhatsApp(to, body);
      if (!result.ok) return res.status(result.status).json({ error: result.data.message || 'Template send failed', code: result.data.code });

      return res.status(200).json({
        success: true,
        messageSid: result.data.sid,
        status: result.data.status,
        template: templateName,
        category: template.category,
        body: body,
        channel: 'whatsapp',
      });
    } catch (err) {
      console.error('[WhatsApp] Template error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ─── WEBHOOK: Inbound + Status ────────────────────────────────
  if (action === 'webhook' && req.method === 'POST') {
    var wb = req.body || {};
    var messageSid = wb.MessageSid || wb.SmsSid;
    var messageStatus = wb.MessageStatus || wb.SmsStatus;
    var fromNumber = wb.From || '';
    var toNumber = wb.To || '';
    var messageBody = wb.Body || '';
    var isInbound = fromNumber.startsWith('whatsapp:') && messageBody;
    var isStatusCallback = messageStatus && !messageBody;

    console.log('[WhatsApp] Webhook:', isInbound ? 'Inbound from ' + fromNumber : 'Status: ' + messageStatus);

    if (isInbound) {
      try {
        var supabase = getSupabase();
        var cleanFrom = fromNumber.replace('whatsapp:', '');
        var cleanTo = toNumber.replace('whatsapp:', '');

        // Resolve tenant via phone_numbers (authoritative source)
        var tenantId = null;
        var normalizedTo = cleanTo.replace(/[\s\-\(\)\.]/g, '');
        if (normalizedTo.charAt(0) === '+') {
          var phoneResult = await supabase
            .from('phone_numbers')
            .select('tenant_id')
            .eq('number', normalizedTo)
            .eq('status', 'active')
            .maybeSingle();
          if (phoneResult.data) {
            tenantId = phoneResult.data.tenant_id;
            console.log('[whatsapp] Resolved tenant', tenantId, 'for', normalizedTo);
          }
        } else {
          console.warn('[whatsapp] Non-E.164 To number:', cleanTo);
        }

        // No match — log and acknowledge webhook without processing
        if (!tenantId) {
          console.error('[whatsapp] No tenant for inbound', {
            to: normalizedTo, from: cleanFrom, timestamp: new Date().toISOString()
          });
          return res.status(200).json({ status: 'ok' });
        }

        // Find or create contact
          var contactResult = await supabase.from('contacts').select('id, first_name').eq('phone', cleanFrom).eq('tenant_id', tenantId).maybeSingle();
          var contactId = contactResult.data ? contactResult.data.id : null;

          if (!contactId) {
            var nc = await supabase.from('contacts').insert({
              tenant_id: tenantId,
              phone: cleanFrom,
              first_name: 'WhatsApp',
              last_name: cleanFrom.slice(-4),
              source: 'whatsapp',
            }).select('id').single();
            if (nc.data) contactId = nc.data.id;
          }

          // Find or create conversation
          var conversationId = null;
          if (contactId) {
            var cv = await supabase.from('conversations').select('id').eq('contact_id', contactId).eq('tenant_id', tenantId).eq('channel', 'whatsapp').in('status', ['active', 'waiting', 'snoozed']).order('last_message_at', { ascending: false }).limit(1).maybeSingle();
            if (cv.data) {
              conversationId = cv.data.id;
              await supabase.from('conversations').update({
                last_message_at: new Date().toISOString(),
                status: 'active',
                unread_count: 1,
              }).eq('id', conversationId);
            } else {
              var ncv = await supabase.from('conversations').insert({
                tenant_id: tenantId,
                contact_id: contactId,
                channel: 'whatsapp',
                status: 'active',
                last_message_at: new Date().toISOString(),
                unread_count: 1,
              }).select('id').single();
              if (ncv.data) conversationId = ncv.data.id;
            }
          }

          // Store inbound message — sender_type: 'contact'
          if (conversationId) {
            var { error: inboundErr } = await supabase.from('messages').insert({
              tenant_id: tenantId,
              conversation_id: conversationId,
              contact_id: contactId,
              channel: 'whatsapp',
              direction: 'inbound',
              sender_type: 'contact',
              body: messageBody,
              status: 'delivered',
              provider_message_id: messageSid,
            });
            if (inboundErr) console.error('[WhatsApp] Inbound message save error:', inboundErr.message);
            else console.log('[WhatsApp] Inbound message saved');
          }

          // AI auto-reply (within 24hr customer service window)
          var aiConfig = null;
          try {
            var cfgResult = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', tenantId).eq('channel', 'whatsapp').maybeSingle();
            if (cfgResult.data) aiConfig = cfgResult.data.config_encrypted;
          } catch (ce) {}

          // Also try email channel config for ai_business_info if whatsapp config missing it
          var businessInfo = (aiConfig && aiConfig.ai_business_info) || '';
          if (!businessInfo) {
            try {
              var emailCfg = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', tenantId).eq('channel', 'email').maybeSingle();
              if (emailCfg.data && emailCfg.data.config_encrypted && emailCfg.data.config_encrypted.ai_business_info) {
                businessInfo = emailCfg.data.config_encrypted.ai_business_info;
              }
            } catch (e) {}
          }

          if (!aiConfig || aiConfig.ai_enabled !== false) {
            var replyAllowed = true;
            try {
              var uc = await supabase.rpc('increment_usage', { p_tenant_id: tenantId, p_channel: 'whatsapp', p_count: 1 });
              if (uc.data && !uc.data.allowed) replyAllowed = false;
            } catch (ue) {}

            if (replyAllowed) {
              try {
                var agentName = (aiConfig && aiConfig.ai_agent_name) || 'Assistant';
                var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
                var waCbConfig = null;
                try { var waCb = await supabase.from('chatbot_configs').select('temperature').eq('tenant_id', tenantId).maybeSingle(); waCbConfig = waCb.data; } catch (_) {}

                var claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': ANTHROPIC_KEY,
                    'anthropic-version': '2023-06-01',
                  },
                  body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 300,
                    temperature: (waCbConfig && waCbConfig.temperature !== null) ? waCbConfig.temperature : 0.7,
                    system: await buildSystemPrompt({ tenantId: tenantId, channel: 'whatsapp', supabase: supabase }),
                    messages: [{ role: 'user', content: messageBody }],
                  }),
                });

                if (claudeRes.ok) {
                  var claudeData = await claudeRes.json();
                  var aiReply = claudeData.content[0].text;
                  console.log('[WhatsApp] Sending AI reply to:', cleanFrom, 'from:', cleanTo);

                  var replyResult = await sendWhatsApp(cleanFrom, aiReply, cleanTo);
                  console.log('[WhatsApp] Reply result:', replyResult.ok ? 'OK' : 'FAILED', replyResult.data.sid || replyResult.data.message);

                  // Save AI reply — sender_type: 'bot'
                  if (conversationId && replyResult.ok) {
                    var { error: outboundErr } = await supabase.from('messages').insert({
                      tenant_id: tenantId,
                      conversation_id: conversationId,
                      contact_id: contactId,
                      channel: 'whatsapp',
                      direction: 'outbound',
                      sender_type: 'bot',
                      body: aiReply,
                      status: 'sent',
                      provider_message_id: replyResult.data.sid,
                    });
                    if (outboundErr) console.error('[WhatsApp] AI reply save error:', outboundErr.message);
                    else console.log('[WhatsApp] AI reply saved to Live Inbox');

                    // Usage meter: increment outbound WhatsApp counter
                    try {
                      var _wuu = require('./_usage-meter');
                      _wuu.incrementTenantCounter(supabase, tenantId, 'whatsapp_used', 1);
                    } catch (mErr) {}

                    // Update conversation status
                    await supabase.from('conversations').update({
                      last_message_at: new Date().toISOString(),
                      status: 'waiting',
                      unread_count: 0,
                    }).eq('id', conversationId);
                  }
                } else {
                  console.error('[WhatsApp] Claude API error:', await claudeRes.text());
                }
              } catch (aiErr) {
                console.error('[WhatsApp] AI reply error:', aiErr.message);
              }
            }
          }

          // Halt sequences on reply
          var contactEmail = null;
          try { var ce = await supabase.from('contacts').select('email').eq('id', contactId).single(); contactEmail = ce.data?.email; } catch(e) {}
          pauseSequencesForContact(supabase, cleanFrom, contactEmail).catch(function() {});

          // Reactivate archived leads on reply
          reactivateArchivedLeadsForContact(supabase, cleanFrom, contactEmail).catch(function() {});

          // Qualify unqualified prospects on reply
          tryQualifyProspect(supabase, cleanFrom, contactEmail, messageBody, 'WhatsApp').catch(function() {});

          // Omnichannel digest: run Claude analysis and log to email_actions
          try {
            var oi = require('./_omnichannel-insight');
            oi.logInboundInsight({
              supabase: supabase, channel: 'whatsapp',
              senderEmail: contactEmail, senderPhone: cleanFrom,
              senderName: null, subject: null, body: messageBody,
            }).catch(function() {});
          } catch (oiErr) { console.warn('[WhatsApp] digest log error:', oiErr.message); }

          // Notify admin via SendGrid
          var contactName = cleanFrom;
          try { var cn = await supabase.from('contacts').select('first_name, last_name').eq('id', contactId).single(); if (cn.data) contactName = [cn.data.first_name, cn.data.last_name].filter(Boolean).join(' ') || cleanFrom; } catch(e) {}
          notifyInboundSendGrid(contactName, 'WhatsApp', messageBody, tenantId).catch(function() {});

      } catch (whErr) {
        console.error('[WhatsApp] Webhook error:', whErr.message);
      }

      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).end('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    // Status callback
    if (isStatusCallback && messageSid) {
      try {
        var supabase = getSupabase();
        var statusUpdate = {
          status: messageStatus,
          updated_at: new Date().toISOString(),
          provider_status_updated_at: new Date().toISOString(),
        };
        // Capture error details from Twilio payload
        var errorCode = wb.ErrorCode || null;
        var errorMessage = wb.ErrorMessage || null;
        if (errorCode) statusUpdate.error_code = errorCode;
        if (errorMessage) statusUpdate.error_message = errorMessage;

        await supabase.from('messages').update(statusUpdate).eq('provider_message_id', messageSid);

        // Warn-level log when errors present
        if (errorCode) {
          var maskedTo = (toNumber || '').replace(/.*(\d{4})$/, '****$1');
          console.warn('[WhatsApp] Status error:', {
            message_sid: messageSid,
            to: maskedTo,
            status: messageStatus,
            error_code: errorCode,
            error_message: errorMessage,
          });
        }
      } catch (sErr) {
        console.error('[WhatsApp] Status update error:', sErr.message);
      }
    }

    return res.status(200).json({ received: true });
  }

  // ─── STATUS ───────────────────────────────────────────────────
  if (action === 'status') {
    return res.status(200).json({
      whatsapp: true,
      sandbox: true,
      production: false,
      note: 'Production WhatsApp pending Meta business verification.',
    });
  }

  return res.status(400).json({ error: 'Invalid action. Use: send, template, webhook, status' });
};
