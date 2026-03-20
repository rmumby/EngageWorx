// /api/whatsapp.js — WhatsApp messaging via Twilio WhatsApp Business API
// POST /api/whatsapp?action=send     → Send WhatsApp message
// POST /api/whatsapp?action=webhook  → Inbound WhatsApp message webhook
// POST /api/whatsapp?action=status   → Delivery status callback
// GET  /api/whatsapp?action=templates → List message templates

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var action = req.query.action || 'send';

  // ─── SEND WHATSAPP MESSAGE ────────────────────────────────────
  if (action === 'send' && req.method === 'POST') {
    var body = req.body || {};
    var to = body.to;
    var message = body.body || body.message;
    var tenantId = body.tenant_id;
    var templateName = body.template;
    var templateVars = body.template_vars || {};
    var mediaUrl = body.media_url;

    if (!to) return res.status(400).json({ error: 'Missing required field: to' });
    if (!message && !templateName) return res.status(400).json({ error: 'Missing required field: body or template' });

    var accountSid = process.env.TWILIO_ACCOUNT_SID;
    var authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) return res.status(500).json({ error: 'Twilio credentials not configured' });

    var fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER || '+17869827800';

    // Usage check before sending
    if (tenantId) {
      try {
        var { createClient } = require('@supabase/supabase-js');
        var supabase = createClient(
          process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        var usageResult = await supabase.rpc('increment_usage', {
          p_tenant_id: tenantId,
          p_channel: 'whatsapp',
          p_count: 1,
        });
        if (usageResult.data && !usageResult.data.allowed) {
          return res.status(429).json({
            error: 'Message limit reached. Purchase a top-up or upgrade your plan.',
            usage: usageResult.data.usage,
            limit: usageResult.data.limit,
            status: 'blocked',
          });
        }
      } catch (usageErr) {
        console.log('[WhatsApp][Usage] Check failed, allowing (fail-open):', usageErr.message);
      }
    }

    // Format numbers for WhatsApp
    var whatsappTo = to.startsWith('whatsapp:') ? to : 'whatsapp:' + to;
    var whatsappFrom = fromNumber.startsWith('whatsapp:') ? fromNumber : 'whatsapp:' + fromNumber;

    var params = { 'To': whatsappTo, 'From': whatsappFrom };

    if (body.content_sid) {
      params['ContentSid'] = body.content_sid;
      if (body.content_variables) params['ContentVariables'] = JSON.stringify(body.content_variables);
    } else {
      var msgBody = message || '';
      Object.keys(templateVars).forEach(function(key) {
        msgBody = msgBody.replace('{{' + key + '}}', templateVars[key]);
      });
      params['Body'] = msgBody;
    }

    if (mediaUrl) params['MediaUrl'] = mediaUrl;
    params['StatusCallback'] = 'https://portal.engwx.com/api/whatsapp?action=status';

    try {
      var response = await fetch(
        'https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json',
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams(params).toString(),
        }
      );

      var data = await response.json();

      if (!response.ok) {
        console.error('[WhatsApp] Send error:', data.message, data.code);
        return res.status(response.status).json({
          error: data.message || 'WhatsApp send failed',
          code: data.code,
        });
      }

      // Store in messages table
      if (tenantId) {
        try {
          var { createClient: cc2 } = require('@supabase/supabase-js');
          var sb2 = cc2(process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
          await sb2.from('messages').insert({
            tenant_id: tenantId,
            direction: 'outbound',
            channel: 'whatsapp',
            from_address: fromNumber,
            to_address: to,
            body: params['Body'] || templateName,
            status: data.status || 'queued',
            external_id: data.sid,
          });
        } catch (dbErr) { console.error('[WhatsApp] DB error:', dbErr.message); }
      }

      return res.status(200).json({
        success: true,
        messageSid: data.sid,
        status: data.status,
        to: to,
        from: fromNumber,
        channel: 'whatsapp',
      });
    } catch (err) {
      console.error('[WhatsApp] Send error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ─── INBOUND WHATSAPP WEBHOOK ─────────────────────────────────
  if (action === 'webhook' && req.method === 'POST') {
    var wb = req.body || {};
    var from = (wb.From || '').replace('whatsapp:', '');
    var to = (wb.To || '').replace('whatsapp:', '');
    var messageBody = wb.Body || '';
    var messageSid = wb.MessageSid || '';

    console.log('[WhatsApp] Inbound from:', from, 'body:', messageBody.substring(0, 100));

    try {
      var { createClient: cc3 } = require('@supabase/supabase-js');
      var sb3 = cc3(process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

      // Find tenant by phone number
      var tenantRes = await sb3.from('phone_numbers').select('tenant_id').eq('number', to).limit(1).single();
      var tenantId = tenantRes.data ? tenantRes.data.tenant_id : null;

      // Find or create contact
      var contactId = null;
      var contactRes = await sb3.from('contacts').select('id').eq('phone', from).limit(1).single();
      if (contactRes.data) {
        contactId = contactRes.data.id;
      } else if (tenantId) {
        var newContact = await sb3.from('contacts').insert({
          tenant_id: tenantId, phone: from, first_name: 'WhatsApp', last_name: from, source: 'whatsapp',
        }).select().single();
        if (newContact.data) contactId = newContact.data.id;
      }

      // Find or create conversation
      var conversationId = null;
      if (contactId) {
        var convRes = await sb3.from('conversations').select('id').eq('contact_id', contactId).eq('channel', 'whatsapp').eq('status', 'active').limit(1).single();
        if (convRes.data) {
          conversationId = convRes.data.id;
        } else if (tenantId) {
          var newConv = await sb3.from('conversations').insert({
            tenant_id: tenantId, contact_id: contactId, channel: 'whatsapp', status: 'active', subject: 'WhatsApp from ' + from,
          }).select().single();
          if (newConv.data) conversationId = newConv.data.id;
        }
      }

      // Store inbound message
      if (tenantId) {
        await sb3.from('messages').insert({
          tenant_id: tenantId, conversation_id: conversationId, contact_id: contactId,
          direction: 'inbound', channel: 'whatsapp', from_address: from, to_address: to,
          body: messageBody, status: 'received', external_id: messageSid,
        });
      }

      // AI auto-reply
      if (tenantId) {
        try {
          var aiUsageRes = await sb3.rpc('increment_usage', { p_tenant_id: tenantId, p_channel: 'whatsapp', p_count: 1 });
          var aiAllowed = !aiUsageRes.data || aiUsageRes.data.allowed;

          if (aiAllowed) {
            var configRes = await sb3.from('channel_configs').select('config').eq('tenant_id', tenantId).eq('channel', 'whatsapp').limit(1).single();
            var aiInfo = (configRes.data && configRes.data.config) ? configRes.data.config.ai_business_info || '' : '';

            var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
            if (ANTHROPIC_KEY) {
              var claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'x-api-key': ANTHROPIC_KEY, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
                body: JSON.stringify({
                  model: 'claude-sonnet-4-20250514',
                  max_tokens: 300,
                  system: 'You are a helpful business assistant responding via WhatsApp. Keep responses SHORT (2-3 sentences max), conversational, and friendly. Use simple language. No markdown formatting. No emojis unless the customer uses them first.' + (aiInfo ? '\n\nBusiness info: ' + aiInfo : '') + '\n\nNever share login credentials, passwords, or internal system details.',
                  messages: [{ role: 'user', content: messageBody }],
                }),
              });

              if (claudeRes.ok) {
                var claudeData = await claudeRes.json();
                var aiReply = claudeData.content[0].text;

                var accountSid2 = process.env.TWILIO_ACCOUNT_SID;
                var authToken2 = process.env.TWILIO_AUTH_TOKEN;

                await fetch(
                  'https://api.twilio.com/2010-04-01/Accounts/' + accountSid2 + '/Messages.json',
                  {
                    method: 'POST',
                    headers: {
                      'Authorization': 'Basic ' + Buffer.from(accountSid2 + ':' + authToken2).toString('base64'),
                      'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({ 'To': 'whatsapp:' + from, 'From': 'whatsapp:' + to, 'Body': aiReply }).toString(),
                  }
                );

                await sb3.from('messages').insert({
                  tenant_id: tenantId, conversation_id: conversationId, contact_id: contactId,
                  direction: 'outbound', channel: 'whatsapp', from_address: to, to_address: from,
                  body: aiReply, status: 'sent', metadata: { ai_generated: true },
                });
              }
            }
          }
        } catch (aiErr) { console.error('[WhatsApp] AI reply error:', aiErr.message); }
      }
    } catch (err) { console.error('[WhatsApp] Webhook error:', err.message); }

    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).end('<Response></Response>');
  }

  // ─── STATUS CALLBACK ──────────────────────────────────────────
  if (action === 'status' && req.method === 'POST') {
    var sb = req.body || {};
    console.log('[WhatsApp] Status:', sb.MessageSid, '→', sb.MessageStatus);

    if (sb.MessageSid && sb.MessageStatus) {
      try {
        var { createClient: cc5 } = require('@supabase/supabase-js');
        var sb5 = cc5(process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        await sb5.from('messages').update({ status: sb.MessageStatus }).eq('external_id', sb.MessageSid);
      } catch (e) { /* non-fatal */ }
    }

    return res.status(200).end('<Response></Response>');
  }

  // ─── LIST TEMPLATES ───────────────────────────────────────────
  if (action === 'templates') {
    return res.status(200).json({
      templates: [
        { name: 'appointment_reminder', category: 'UTILITY', language: 'en', body: 'Hi {{1}}, this is a reminder of your appointment with {{2}} on {{3}} at {{4}}. Reply YES to confirm or RESCHEDULE to change.', variables: ['customer_name', 'business_name', 'date', 'time'], status: 'pending_approval' },
        { name: 'appointment_confirmation', category: 'UTILITY', language: 'en', body: 'Hi {{1}}, your appointment with {{2}} has been confirmed for {{3}} at {{4}}. We look forward to seeing you!', variables: ['customer_name', 'business_name', 'date', 'time'], status: 'pending_approval' },
        { name: 'order_update', category: 'UTILITY', language: 'en', body: 'Hi {{1}}, your order #{{2}} has been {{3}}. Track at {{4}}.', variables: ['customer_name', 'order_number', 'status', 'tracking_url'], status: 'pending_approval' },
        { name: 'welcome_message', category: 'MARKETING', language: 'en', body: 'Welcome to {{1}}! Reply HELP for assistance or STOP to unsubscribe.', variables: ['business_name'], status: 'pending_approval' },
        { name: 'recordatorio_cita', category: 'UTILITY', language: 'es', body: 'Hola {{1}}, le recordamos su cita con {{2}} el {{3}} a las {{4}}. Responda SI para confirmar o CAMBIAR para reprogramar.', variables: ['nombre_cliente', 'nombre_negocio', 'fecha', 'hora'], status: 'pending_approval' },
        { name: 'confirmacion_cita', category: 'UTILITY', language: 'es', body: 'Hola {{1}}, su cita con {{2}} ha sido confirmada para el {{3}} a las {{4}}. Le esperamos!', variables: ['nombre_cliente', 'nombre_negocio', 'fecha', 'hora'], status: 'pending_approval' },
      ],
      note: 'Templates must be submitted to Meta for approval before production use. Sandbox testing does not require template approval.',
    });
  }

  return res.status(400).json({ error: 'Invalid action. Use: send, webhook, status, templates' });
};
