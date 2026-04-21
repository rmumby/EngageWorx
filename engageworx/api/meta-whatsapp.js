// api/meta-whatsapp.js — Meta WhatsApp Cloud API webhook handler
// Handles inbound messages from tenants who bring their own Meta WhatsApp credentials
// Tenant is identified by Phone Number ID stored in channel_configs

var { createClient } = require('@supabase/supabase-js');

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'engwx-meta-webhook-2026';

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  // ── Webhook verification (GET) ────────────────────────────────
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    console.log('[MetaWA] GET verification attempt — mode:', mode, 'token:', token, 'challenge:', challenge);
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[MetaWA] Webhook verified successfully');
      return res.status(200).send(challenge);
    }
    console.log('[MetaWA] Verification FAILED — token mismatch. Expected:', VERIFY_TOKEN, 'Got:', token);
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method !== 'POST') return res.status(405).end();

  // Process BEFORE responding so Vercel doesn't terminate early
  try {
    var supabase = getSupabase();
    var body = req.body;

    // Parse Meta webhook payload
    var entry = body.entry?.[0];
    var changes = entry?.changes?.[0];
    var value = changes?.value;

    if (!value || !value.messages) {
      return res.status(200).json({ status: 'ok' });
    }

    var phoneNumberId = value.metadata?.phone_number_id;
    var messages = value.messages || [];
    var contacts = value.contacts || [];

    console.log('[MetaWA] Received phoneNumberId:', phoneNumberId);
    console.log('[MetaWA] Messages count:', messages.length);

    if (!phoneNumberId || messages.length === 0) {
      return res.status(200).json({ status: 'ok' });
    }

    // Look up tenant by Phone Number ID from channel_configs
    var configResult = await supabase
      .from('channel_configs')
      .select('tenant_id, config_encrypted')
      .eq('channel', 'whatsapp')
      .eq('enabled', true);

    var tenantId = null;
    var accessToken = null;

    if (configResult.data) {
      for (var config of configResult.data) {
        var cfg = config.config_encrypted || {};
        console.log('[MetaWA] Checking config phone_number_id:', cfg.phone_number_id, 'vs incoming:', phoneNumberId);
        if (cfg.phone_number_id === phoneNumberId) {
          tenantId = config.tenant_id;
          accessToken = cfg.access_token;
          break;
        }
      }
    }

    if (!tenantId) {
      console.warn('[MetaWA] No tenant found for Phone Number ID:', phoneNumberId);
      return res.status(200).json({ status: 'ok' });
    }

    console.log('[MetaWA] Tenant found:', tenantId);

    // Process each message
    for (var msg of messages) {
      var from = msg.from;
      var messageText = msg.text?.body || msg.type || '';
      var waContact = contacts.find(c => c.wa_id === from);
      var senderName = waContact?.profile?.name || from;

      console.log('[MetaWA] Inbound from', from, 'to tenant', tenantId, ':', messageText);

      // Find or create contact
      var contactResult = await supabase
        .from('contacts')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('phone', '+' + from)
        .maybeSingle();

      var contactId = contactResult.data?.id;
      if (!contactId) {
        var newContact = await supabase.from('contacts').insert({
          tenant_id: tenantId,
          phone: '+' + from,
          name: senderName,
          channel: 'whatsapp',
        }).select('id').single();
        contactId = newContact.data?.id;
        console.log('[MetaWA] Created new contact:', contactId);
      }

      // Find or create conversation
      var convResult = await supabase
        .from('conversations')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('contact_id', contactId)
        .eq('channel', 'whatsapp')
        .in('status', ['active', 'waiting', 'snoozed'])
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      var conversationId = convResult.data?.id;
      if (!conversationId) {
        var newConv = await supabase.from('conversations').insert({
          tenant_id: tenantId,
          contact_id: contactId,
          channel: 'whatsapp',
          status: 'active',
        }).select('id');
        console.log('[MetaWA] Conversation insert result:', JSON.stringify(newConv));
        if (newConv.error) console.error('[MetaWA] Conversation insert ERROR:', newConv.error.message);
        conversationId = newConv.data?.[0]?.id;
        if (!conversationId) console.error('[MetaWA] Conversation ID still undefined after insert');
        console.log('[MetaWA] Created new conversation:', conversationId);
      }

      // Store inbound message
      await supabase.from('messages').insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        contact_id: contactId,
        direction: 'inbound',
        channel: 'whatsapp',
        body: messageText,
        status: 'delivered',
        provider: 'meta',
        provider_message_id: msg.id,
        sender_type: 'contact',
        metadata: { from: '+' + from, phone_number_id: phoneNumberId },
      });

      console.log('[MetaWA] Inbound message stored');

      // Run AI chatbot if enabled
      try {
        var chatbotResult = await supabase
          .from('chatbot_configs')
          .select('*')
          .eq('tenant_id', tenantId)
          .maybeSingle();

        var chatbot = chatbotResult.data;
        console.log('[MetaWA] Chatbot config found:', !!chatbot, 'channels_active:', chatbot?.channels_active);

        if (chatbot && chatbot.channels_active?.includes('whatsapp')) {
          var Anthropic = require('@anthropic-ai/sdk');
          var anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

          var systemPrompt = chatbot.system_prompt || 'You are a helpful assistant. Keep replies under 160 characters.';
          if (chatbot.knowledge_base) systemPrompt += '\n\nKnowledge Base:\n' + chatbot.knowledge_base;

          var aiRes = await anthropic.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 500,
            system: systemPrompt,
            messages: [{ role: 'user', content: messageText }],
          });

          var reply = aiRes.content[0].text.trim();
          console.log('[MetaWA] AI reply generated:', reply.substring(0, 50) + '...');

          // Send reply via Meta Cloud API
          if (accessToken && reply) {
            var metaRes = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: from,
                type: 'text',
                text: { body: reply },
              }),
            });
            var metaData = await metaRes.json();
            console.log('[MetaWA] Meta API response:', JSON.stringify(metaData));

            // Store outbound AI reply
            await supabase.from('messages').insert({
              tenant_id: tenantId,
              conversation_id: conversationId,
              contact_id: contactId,
              direction: 'outbound',
              channel: 'whatsapp',
              body: reply,
              status: 'sent',
              provider: 'meta',
              sender_type: 'bot',
              metadata: { to: '+' + from, phone_number_id: phoneNumberId },
            });

            console.log('[MetaWA] Outbound message stored');
          }
        } else {
          console.log('[MetaWA] Chatbot not active for whatsapp — skipping AI response');
        }
      } catch (aiErr) {
        console.error('[MetaWA] AI chatbot error:', aiErr.message);
      }
    }

    return res.status(200).json({ status: 'ok' });

  } catch (err) {
    console.error('[MetaWA] Handler error:', err.message);
    return res.status(200).json({ status: 'ok' }); // Always return 200 to Meta
  }
};
