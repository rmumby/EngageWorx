// /api/sms.js — Single Vercel Serverless Function for all SMS operations
// POST /api/sms?action=send    → Send SMS
// POST /api/sms?action=test    → Test SMS
// POST /api/sms?action=webhook → Twilio inbound/status webhook

const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
  );
}

async function sendSMS(to, body, from) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = from || process.env.TWILIO_PHONE_NUMBER;

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const params = new URLSearchParams();
  params.append('To', to);
  params.append('From', fromNumber);
  params.append('Body', body);

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  return { data: await response.json(), ok: response.ok, status: response.status };
}

// ─── NOTIFY INBOUND ────────────────────────────────────────────────────────
// Looks up tenant members with inbound_message notifications enabled.
// Falls back to PLATFORM_ADMIN_EMAIL if none found.
async function notifyInbound(supabase, tenantId, from, body) {
  try {
    let emailsToNotify = [];

    if (tenantId) {
      // 1. Get active tenant members
      const { data: members } = await supabase
        .from('tenant_members')
        .select('user_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'active');

      if (members && members.length > 0) {
        const userIds = members.map(m => m.user_id);

        // 2. Filter to those with inbound_message email notifications enabled
        const { data: prefs } = await supabase
          .from('notification_preferences')
          .select('user_id')
          .in('user_id', userIds)
          .eq('event_type', 'inbound_message')
          .eq('email_enabled', true);

        const notifiableUserIds = prefs ? prefs.map(p => p.user_id) : [];

        // 3. If no explicit prefs found, fall back to all active members
        const lookupIds = notifiableUserIds.length > 0 ? notifiableUserIds : userIds;

        // 4. Get emails from users table
        const { data: users } = await supabase
          .from('users')
          .select('email')
          .in('id', lookupIds);

        if (users && users.length > 0) {
          emailsToNotify = users.map(u => u.email).filter(Boolean);
        }
      }
    }

    // Fallback to platform admin if no tenant emails found
    if (emailsToNotify.length === 0) {
      const adminEmail = process.env.PLATFORM_ADMIN_EMAIL;
      if (adminEmail) emailsToNotify = [adminEmail];
    }

    if (emailsToNotify.length === 0) {
      console.log('[Notify] No recipients found for inbound notification');
      return;
    }

    // 5. Send notification via /api/email
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://portal.engwx.com';

    for (const email of emailsToNotify) {
      await fetch(`${baseUrl}/api/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          subject: `New inbound SMS from ${from}`,
          html: `
            <p>A new inbound SMS has arrived in your Live Inbox.</p>
            <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
              <tr><td style="padding:6px 12px;font-weight:bold;color:#374151;">From</td><td style="padding:6px 12px;">${from}</td></tr>
              <tr style="background:#F9FAFB;"><td style="padding:6px 12px;font-weight:bold;color:#374151;">Message</td><td style="padding:6px 12px;">${body}</td></tr>
            </table>
            <p style="margin-top:16px;"><a href="https://portal.engwx.com" style="color:#00BFFF;font-weight:600;">Open Live Inbox →</a></p>
          `,
        }),
      });
      console.log(`[Notify] Inbound notification sent to ${email}`);
    }
  } catch (err) {
    console.error('[Notify] Failed to send inbound notification:', err);
    // Fail silently — don't block the webhook
  }
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const action = req.query.action || 'send';

  // ─── TEST ─────────────────────────────────────────────────────────
  if (action === 'test') {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'Missing "to" phone number' });

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return res.status(500).json({
        error: 'Missing env vars',
        has_sid: !!accountSid,
        has_token: !!authToken,
        has_number: !!fromNumber,
      });
    }

    const result = await sendSMS(to, '🚀 EngageWorx SMS test successful! Your Twilio integration is live.', fromNumber);

    if (!result.ok) {
      return res.status(result.status).json({
        error: result.data.message,
        code: result.data.code,
        moreInfo: result.data.more_info,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Test SMS sent!',
      sid: result.data.sid,
      to: result.data.to,
      from: result.data.from,
      status: result.data.status,
    });
  }

  // ─── SEND ─────────────────────────────────────────────────────────
  if (action === 'send') {
    const { to, body, from, tenant_id } = req.body;
    if (!to || !body) return res.status(400).json({ error: 'Missing required fields: to, body' });

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) return res.status(500).json({ error: 'Twilio credentials not configured' });

    // ── Usage check before sending ──
    if (tenant_id) {
      try {
        var supabaseUsage = getSupabase();
        var usageResult = await supabaseUsage.rpc('increment_usage', {
          p_tenant_id: tenant_id,
          p_channel: 'sms',
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
        console.log('[Usage] Check failed, allowing message (fail-open):', usageErr.message);
      }
    }

    try {
      const result = await sendSMS(to, body, from);

      if (!result.ok) {
        return res.status(result.status).json({
          error: result.data.message,
          code: result.data.code,
          moreInfo: result.data.more_info,
        });
      }

      return res.status(200).json({
        success: true,
        messageSid: result.data.sid,
        status: result.data.status,
        to: result.data.to,
        from: result.data.from,
        dateCreated: result.data.date_created,
      });
    } catch (err) {
      console.error('Send SMS error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ─── WEBHOOK (Twilio inbound + status) ────────────────────────────
  if (action === 'webhook') {
    try {
      const {
        MessageSid, From, To, Body, NumMedia,
        MessageStatus, SmsStatus, ErrorCode, ErrorMessage,
      } = req.body;

      const supabase = getSupabase();

      // Delivery status update
      if (MessageStatus || SmsStatus) {
        const status = MessageStatus || SmsStatus;
        console.log(`[Twilio] Status update: ${MessageSid} → ${status}`);

        await supabase
          .from('messages')
          .update({
            status,
            error_code: ErrorCode || null,
            error_message: ErrorMessage || null,
            updated_at: new Date().toISOString(),
          })
          .eq('external_id', MessageSid);

        res.setHeader('Content-Type', 'text/xml');
        return res.status(200).send('<Response></Response>');
      }

      // ── Inbound SMS ────────────────────────────────────────────────

      console.log(`[Twilio] Inbound from ${From} to ${To}: ${Body}`);

      // 1. Look up tenant by To number BEFORE insert
      let tenantId = null;
      try {
        const { data: channelConfig } = await supabase
          .from('channel_configs')
          .select('tenant_id, config')
          .eq('phone_number', To)
          .single();

        if (channelConfig?.tenant_id) {
          tenantId = channelConfig.tenant_id;
          console.log(`[Twilio] Resolved tenant ${tenantId} for number ${To}`);
        } else {
          // Also try phone_numbers table as fallback
          const { data: phoneRecord } = await supabase
            .from('phone_numbers')
            .select('tenant_id')
            .eq('number', To)
            .single();

          if (phoneRecord?.tenant_id) {
            tenantId = phoneRecord.tenant_id;
            console.log(`[Twilio] Resolved tenant ${tenantId} via phone_numbers for ${To}`);
          }
        }
      } catch (lookupErr) {
        console.log('[Twilio] Tenant lookup failed, inserting without tenant_id:', lookupErr.message);
      }

      // 2. Classify message type
      const upperBody = (Body || '').trim().toUpperCase();
      const optOutWords = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE'];
      const optInWords = ['START', 'SUBSCRIBE', 'YES'];
      const helpWords = ['HELP', 'INFO'];

      let messageType = 'inbound';
      if (optOutWords.includes(upperBody)) messageType = 'opt_out';
      else if (optInWords.includes(upperBody)) messageType = 'opt_in';
      else if (helpWords.includes(upperBody)) messageType = 'help';

      // 3. Insert message WITH tenant_id
      await supabase.from('messages').insert({
        external_id: MessageSid,
        direction: 'inbound',
        channel: 'sms',
        from_number: From,
        to_number: To,
        body: Body,
        status: 'received',
        message_type: messageType,
        media_count: parseInt(NumMedia || '0'),
        tenant_id: tenantId,         // ← now included
        created_at: new Date().toISOString(),
      });

      // 4. Handle opt-in / opt-out contact updates
      if (messageType === 'opt_out') {
        await supabase.from('contacts')
          .update({ sms_opted_out: true, sms_opted_out_at: new Date().toISOString() })
          .eq('phone', From);
      } else if (messageType === 'opt_in') {
        await supabase.from('contacts')
          .update({ sms_opted_out: false, sms_opted_in_at: new Date().toISOString() })
          .eq('phone', From);
      }

      // 5. Send inbound notification email to tenant admins / platform admin
      notifyInbound(supabase, tenantId, From, Body);

      // ─── AI AUTO-RESPONSE ───────────────────────────────────────────
      // Only respond to regular inbound messages (not opt-in/out/help)
      if (messageType === 'inbound' && process.env.ANTHROPIC_API_KEY) {
        try {
          // Re-use tenantId already resolved above
          var aiAllowed = true;
          if (tenantId) {
            try {
              var usageCheck = await supabase.rpc('increment_usage', {
                p_tenant_id: tenantId,
                p_channel: 'sms',
                p_count: 1,
              });
              if (usageCheck.data && !usageCheck.data.allowed) {
                aiAllowed = false;
                console.log('[Usage] AI reply blocked - tenant', tenantId, 'at limit');
              }
            } catch (ue) {
              console.log('[Usage] Check failed, allowing AI reply (fail-open)');
            }
          }

          if (!aiAllowed) {
            res.setHeader('Content-Type', 'text/xml');
            return res.status(200).send('<Response></Response>');
          }

          let tenantConfig = {};
          if (tenantId) {
            const { data: tenant } = await supabase
              .from('tenants')
              .select('name, industry')
              .eq('id', tenantId)
              .single();

            const { data: chatbotConfig } = await supabase
              .from('chatbot_configs')
              .select('*')
              .eq('tenant_id', tenantId)
              .single();

            tenantConfig = {
              businessName: tenant?.name || 'our business',
              industry: tenant?.industry || 'general business',
              personality: chatbotConfig?.personality || 'friendly and professional',
              knowledgeBase: chatbotConfig?.knowledge_base || '',
              escalationRules: chatbotConfig?.escalation_rules || '',
              maxResponseLength: 160,
            };
          }

          // Fetch recent conversation history
          const { data: history } = await supabase
            .from('messages')
            .select('direction, body, created_at')
            .or(`from_number.eq.${From},to_number.eq.${From}`)
            .order('created_at', { ascending: true })
            .limit(10);

          // Call AI endpoint
          const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : 'https://portal.engwx.com';

          const aiResponse = await fetch(`${baseUrl}/api/ai?action=respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: Body,
              conversationHistory: history || [],
              tenantConfig,
            }),
          });

          const aiData = await aiResponse.json();

          if (aiData.success && aiData.response && !aiData.escalate) {
            res.setHeader('Content-Type', 'text/xml');
            return res.status(200).send(
              `<Response><Message>${aiData.response.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Message></Response>`
            );
          }

          console.log(`[AI] Escalating message from ${From}: ${aiData.escalate ? 'escalation requested' : 'AI failed'}`);

        } catch (aiErr) {
          console.error('[AI] Auto-response error:', aiErr);
          // Fail silently — don't block the webhook
        }
      }

      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send('<Response></Response>');

    } catch (err) {
      console.error('[Twilio] Webhook error:', err);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send('<Response></Response>');
    }
  }

  return res.status(400).json({ error: 'Invalid action. Use ?action=send|test|webhook' });
};
