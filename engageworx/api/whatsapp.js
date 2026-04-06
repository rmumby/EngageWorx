// /api/whatsapp.js — WhatsApp Business API
// POST /api/whatsapp?action=send      → Send WhatsApp message (text or template)
// POST /api/whatsapp?action=template   → Send template message with variables
// POST /api/whatsapp?action=webhook    → Inbound messages + status callbacks
// GET  /api/whatsapp?action=status     → Check WhatsApp sender status

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
  );
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

    if (!to || !body) return res.status(400).json({ error: 'Missing required fields: to, body' });

    var accountSid = process.env.TWILIO_ACCOUNT_SID;
    var authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) return res.status(500).json({ error: 'Messaging credentials not configured' });

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

    try {
      var result = await sendWhatsApp(to, body, from, mediaUrl);

      if (!result.ok) {
        return res.status(result.status).json({
          error: result.data.message || 'WhatsApp send failed',
          code: result.data.code,
          moreInfo: result.data.more_info,
        });
      }

      // Store message in Supabase
      if (tenantId) {
        try {
          var supabase = getSupabase();
          var cleanTo = to.replace('whatsapp:', '').replace(/[^\d+]/g, '');

          var contactResult = await supabase.from('contacts').select('id').eq('phone', cleanTo).eq('tenant_id', tenantId).maybeSingle();
          var contactId = contactResult.data ? contactResult.data.id : null;

          if (!contactId) {
            var newContact = await supabase.from('contacts').insert({ tenant_id: tenantId, phone: cleanTo, first_name: 'WhatsApp', last_name: cleanTo.slice(-4), source: 'whatsapp' }).select('id').single();
            if (newContact.data) contactId = newContact.data.id;
          }

          if (contactId) {
            var convResult = await supabase.from('conversations').select('id').eq('contact_id', contactId).eq('tenant_id', tenantId).eq('channel', 'whatsapp').maybeSingle();
            var conversationId = convResult.data ? convResult.data.id : null;

            if (!conversationId) {
              var newConv = await supabase.from('conversations').insert({ tenant_id: tenantId, contact_id: contactId, channel: 'whatsapp', status: 'active', last_message_at: new Date().toISOString() }).select('id').single();
              if (newConv.data) conversationId = newConv.data.id;
            } else {
              await supabase.from('conversations').update({ last_message_at: new Date().toISOString(), status: 'active' }).eq('id', conversationId);
            }

            if (conversationId) {
              await supabase.from('messages').insert({ tenant_id: tenantId, conversation_id: conversationId, contact_id: contactId, channel: 'whatsapp', direction: 'outbound', body: body, status: result.data.status || 'queued', provider_id: result.data.sid });
            }
          }
        } catch (dbErr) {
          console.error('[WhatsApp] DB error:', dbErr.message);
        }
      }

      return res.status(200).json({
        success: true,
        messageSid: result.data.sid,
        status: result.data.status,
        to: result.data.to,
        from: result.data.from,
        channel: 'whatsapp',
        dateCreated: result.data.date_created,
      });
    } catch (err) {
      console.error('[WhatsApp] Send error:', err);
      return res.status(500).json({ error: 'Internal server error' });
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

        // Find tenant by phone number
        var tenantId = null;
        var phoneResult = await supabase.from('phone_numbers').select('tenant_id').eq('number', cleanTo).maybeSingle();
        if (phoneResult.data) tenantId = phoneResult.data.tenant_id;

        // Fallback: check channel_configs
        if (!tenantId) {
          var configResult = await supabase.from('channel_configs').select('tenant_id').eq('channel', 'whatsapp').limit(1).maybeSingle();
          if (configResult.data) tenantId = configResult.data.tenant_id;
        }

        if (!tenantId) {
          tenantId = 'c1bc59a8-5235-4921-9755-02514b574387';
          console.log('[WhatsApp] Using SP tenant fallback');
        }

        if (tenantId) {
          // Find or create contact
          var contactResult = await supabase.from('contacts').select('id, first_name').eq('phone', cleanFrom).eq('tenant_id', tenantId).maybeSingle();
          var contactId = contactResult.data ? contactResult.data.id : null;

          if (!contactId) {
            var nc = await supabase.from('contacts').insert({ tenant_id: tenantId, phone: cleanFrom, first_name: 'WhatsApp', last_name: cleanFrom.slice(-4), source: 'whatsapp' }).select('id').single();
            if (nc.data) contactId = nc.data.id;
          }

          // Find or create conversation
          var conversationId = null;
          if (contactId) {
            var cv = await supabase.from('conversations').select('id').eq('contact_id', contactId).eq('tenant_id', tenantId).eq('channel', 'whatsapp').maybeSingle();
            if (cv.data) {
              conversationId = cv.data.id;
              await supabase.from('conversations').update({ last_message_at: new Date().toISOString(), status: 'active' }).eq('id', conversationId);
            } else {
              var ncv = await supabase.from('conversations').insert({ tenant_id: tenantId, contact_id: contactId, channel: 'whatsapp', status: 'active', last_message_at: new Date().toISOString() }).select('id').single();
              if (ncv.data) conversationId = ncv.data.id;
            }
          }

          // Store inbound message
          if (conversationId) {
            await supabase.from('messages').insert({ tenant_id: tenantId, conversation_id: conversationId, contact_id: contactId, channel: 'whatsapp', direction: 'inbound', body: messageBody, status: 'received', provider_id: messageSid });
          }

          // AI auto-reply (within 24hr customer service window — FREE from Meta)
          var aiConfig = null;
          try {
            var cfgResult = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', tenantId).eq('channel', 'whatsapp').maybeSingle();
            if (cfgResult.data) aiConfig = cfgResult.data.config_encrypted;
          } catch (ce) {}

          if (aiConfig && aiConfig.ai_enabled !== false) {
            var replyAllowed = true;
            try {
              var uc = await supabase.rpc('increment_usage', { p_tenant_id: tenantId, p_channel: 'whatsapp', p_count: 1 });
              if (uc.data && !uc.data.allowed) replyAllowed = false;
            } catch (ue) {}

            if (replyAllowed) {
              try {
                var businessInfo = aiConfig.ai_business_info || '';
                var agentName = aiConfig.ai_agent_name || 'Assistant';

                var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
                var claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
                  body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 300,
                    system: 'You are ' + agentName + ', a friendly AI assistant on WhatsApp. Keep responses SHORT (2-3 sentences max), conversational, mobile-friendly. No markdown or formatting.' + (businessInfo ? '\n\nBusiness info:\n' + businessInfo : ''),
                    messages: [{ role: 'user', content: messageBody }],
                  }),
                });

                if (claudeRes.ok) {
                  var claudeData = await claudeRes.json();
                  var aiReply = claudeData.content[0].text;
                  var replyResult = await sendWhatsApp(cleanFrom, aiReply, cleanTo);

                  if (conversationId && replyResult.ok) {
                    await supabase.from('messages').insert({ tenant_id: tenantId, conversation_id: conversationId, contact_id: contactId, channel: 'whatsapp', direction: 'outbound', body: aiReply, status: 'sent', provider_id: replyResult.data.sid });
                  }
                }
              } catch (aiErr) {
                console.error('[WhatsApp] AI reply error:', aiErr.message);
              }
            }
          }

          // Notify Rob
          try {
            var RESEND_KEY = process.env.RESEND_API_KEY;
            if (RESEND_KEY) {
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  from: 'EngageWorx <hello@engwx.com>',
                  to: ['rob@engwx.com'],
                  subject: 'WhatsApp from ' + cleanFrom,
                  html: '<h3>Inbound WhatsApp</h3><p><b>From:</b> ' + cleanFrom + '</p><p><b>Message:</b> ' + messageBody + '</p>',
                }),
              });
            }
          } catch (ne) {}
        }
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
        await supabase.from('messages').update({ status: messageStatus, updated_at: new Date().toISOString() }).eq('provider_id', messageSid);
      } catch (sErr) {}
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
