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

// ─── FORM BODY PARSER ─────────────────────────────────────────────────────
// Twilio webhooks are application/x-www-form-urlencoded, not JSON.
// Vercel's default body parser mishandles this — we read and parse raw bytes.
async function parseFormBody(req) {
  return new Promise((resolve, reject) => {
    // If Vercel already parsed it and fields look correct, use it
    if (req.body && typeof req.body === 'object' && req.body.MessageSid) {
      return resolve(req.body);
    }
    let raw = '';
    req.on('data', chunk => { raw += chunk.toString(); });
    req.on('end', () => {
      try {
        const parsed = Object.fromEntries(new URLSearchParams(raw));
        resolve(parsed);
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

async function sendSMS(to, body, from) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = from || process.env.TWILIO_PHONE_NUMBER;

  const auth   = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const params = new URLSearchParams();
  params.append('To',   to);
  params.append('From', fromNumber);
  params.append('Body', body);

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  return { data: await response.json(), ok: response.ok, status: response.status };
}

// ─── FIND OR CREATE CONTACT ────────────────────────────────────────────────
async function findOrCreateContact(supabase, tenantId, phone) {
  if (!tenantId) return null;
  try {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenantId)
      .or(`phone.eq.${phone},mobile.eq.${phone}`)
      .single();

    if (existing?.id) return existing.id;

    const { data: created } = await supabase
      .from('contacts')
      .insert({
        tenant_id:  tenantId,
        phone:      phone,
        source:     'inbound_sms',
        status:     'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    return created?.id || null;
  } catch (err) {
    console.error('[Contact] findOrCreate error:', err.message);
    return null;
  }
}

// ─── FIND OR CREATE CONVERSATION ──────────────────────────────────────────
async function findOrCreateConversation(supabase, tenantId, contactId, fromPhone) {
  if (!tenantId || !contactId) return null;
  try {
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('tenant_id',  tenantId)
      .eq('channel',    'sms')
      .eq('contact_id', contactId)
      .in('status', ['active', 'waiting', 'snoozed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existing?.id) return existing.id;

    const { data: created } = await supabase
      .from('conversations')
      .insert({
        tenant_id:            tenantId,
        contact_id:           contactId,
        channel:              'sms',
        status:               'active',
        subject:              `SMS from ${fromPhone}`,
        last_message_at:      new Date().toISOString(),
        last_message_preview: '',
        message_count:        0,
        unread_count:         1,
        created_at:           new Date().toISOString(),
        updated_at:           new Date().toISOString(),
      })
      .select('id')
      .single();

    return created?.id || null;
  } catch (err) {
    console.error('[Conversation] findOrCreate error:', err.message);
    return null;
  }
}

// ─── NOTIFY INBOUND ────────────────────────────────────────────────────────
async function notifyInbound(supabase, tenantId, from, body) {
  try {
    if (!tenantId) return;

    var membersResult = await supabase
      .from('tenant_members')
      .select('user_id, notify_email')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    var members = membersResult.data || [];
    if (members.length === 0) return;

    var userIds = members.map(function(m) { return m.user_id; });

    var profilesResult = await supabase
      .from('user_profiles')
      .select('id, email')
      .in('id', userIds);

    var profiles = profilesResult.data || [];

    var emailsToNotify = members.map(function(m) {
      var profile = profiles.find(function(p) { return p.id === m.user_id; });
      return m.notify_email || (profile && profile.email) || null;
    }).filter(Boolean);

    if (emailsToNotify.length === 0) return;

    var sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    var html =
      '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 20px;">' +
      '<div style="background:linear-gradient(135deg,#00C9FF,#E040FB);border-radius:10px;padding:20px;text-align:center;margin-bottom:24px;">' +
      '<span style="color:#fff;font-weight:900;font-size:18px;">EngageWorx</span>' +
      '<div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:4px;">New Inbound SMS</div>' +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">' +
      '<tr><td style="padding:10px 12px;font-weight:bold;color:#374151;width:80px;">From</td><td style="padding:10px 12px;color:#111;">' + from + '</td></tr>' +
      '<tr style="background:#F9FAFB;"><td style="padding:10px 12px;font-weight:bold;color:#374151;">Message</td><td style="padding:10px 12px;color:#111;">' + (body || '') + '</td></tr>' +
      '</table>' +
      '<div style="margin-top:20px;text-align:center;">' +
      '<a href="https://portal.engwx.com" style="display:inline-block;background:linear-gradient(135deg,#00C9FF,#E040FB);color:#000;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:800;font-size:14px;">Open Live Inbox →</a>' +
      '</div></div>';

    for (var i = 0; i < emailsToNotify.length; i++) {
      await sgMail.send({
        to: emailsToNotify[i],
        from: { email: 'hello@engwx.com', name: 'EngageWorx' },
        subject: 'New inbound SMS from ' + from,
        text: 'New inbound SMS from ' + from + ':\n\n' + body + '\n\nOpen Live Inbox: https://portal.engwx.com',
        html: html,
      });
      console.log('[Notify] Inbound SMS notification sent to:', emailsToNotify[i]);
    }
  } catch (err) {
    console.error('[Notify] notifyInbound error:', err.message);
  }
}

    if (emailsToNotify.length === 0) {
      const adminEmail = process.env.PLATFORM_ADMIN_EMAIL;
      if (adminEmail) emailsToNotify = [adminEmail];
    }

    if (emailsToNotify.length === 0) {
      console.log('[Notify] No recipients found for inbound notification');
      return;
    }

    // Always use production URL — VERCEL_URL resolves to preview deployments
    const baseUrl = 'https://portal.engwx.com';

    for (const email of emailsToNotify) {
      await fetch(`${baseUrl}/api/email`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:      email,
          subject: `New inbound SMS from ${from}`,
          html: `
            <p>A new inbound SMS has arrived in your Live Inbox.</p>
            <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
              <tr>
                <td style="padding:6px 12px;font-weight:bold;color:#374151;">From</td>
                <td style="padding:6px 12px;">${from}</td>
              </tr>
              <tr style="background:#F9FAFB;">
                <td style="padding:6px 12px;font-weight:bold;color:#374151;">Message</td>
                <td style="padding:6px 12px;">${body}</td>
              </tr>
            </table>
            <p style="margin-top:16px;">
              <a href="https://portal.engwx.com" style="color:#00BFFF;font-weight:600;">Open Live Inbox →</a>
            </p>
          `,
        }),
      });
      console.log(`[Notify] Inbound notification sent to ${email}`);
    }
  } catch (err) {
    console.error('[Notify] Failed to send inbound notification:', err);
  }
}

// ─── MAIN HANDLER ──────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'POST only' });

  const action = req.query.action || 'send';

  // ─── TEST ───────────────────────────────────────────────────────────────
  if (action === 'test') {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'Missing "to" phone number' });

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return res.status(500).json({
        error:      'Missing env vars',
        has_sid:    !!accountSid,
        has_token:  !!authToken,
        has_number: !!fromNumber,
      });
    }

    const result = await sendSMS(
      to,
      '🚀 EngageWorx SMS test successful! Your Twilio integration is live.',
      fromNumber
    );

    if (!result.ok) {
      return res.status(result.status).json({
        error:    result.data.message,
        code:     result.data.code,
        moreInfo: result.data.more_info,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Test SMS sent!',
      sid:     result.data.sid,
      to:      result.data.to,
      from:    result.data.from,
      status:  result.data.status,
    });
  }

  // ─── SEND ───────────────────────────────────────────────────────────────
  if (action === 'send') {
    const { to, body, from, tenant_id } = req.body;
    if (!to || !body) return res.status(400).json({ error: 'Missing required fields: to, body' });

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken)
      return res.status(500).json({ error: 'Twilio credentials not configured' });

    if (tenant_id) {
      try {
        const supabaseUsage = getSupabase();
        const usageResult   = await supabaseUsage.rpc('increment_usage', {
          p_tenant_id: tenant_id,
          p_channel:   'sms',
          p_count:     1,
        });
        if (usageResult.data && !usageResult.data.allowed) {
          return res.status(429).json({
            error:     'Message limit reached. Purchase a top-up or upgrade your plan.',
            usage:     usageResult.data.usage,
            limit:     usageResult.data.limit,
            remaining: 0,
            status:    'blocked',
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
          error:    result.data.message,
          code:     result.data.code,
          moreInfo: result.data.more_info,
        });
      }

      return res.status(200).json({
        success:     true,
        messageSid:  result.data.sid,
        status:      result.data.status,
        to:          result.data.to,
        from:        result.data.from,
        dateCreated: result.data.date_created,
      });
    } catch (err) {
      console.error('Send SMS error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ─── WEBHOOK (Twilio inbound + status) ──────────────────────────────────
  if (action === 'webhook') {
    // !! CRITICAL: Parse raw form body — Twilio sends application/x-www-form-urlencoded
    // Vercel's default JSON body parser corrupts this, so we parse manually.
    let twilioBody;
    try {
      twilioBody = await parseFormBody(req);
    } catch (parseErr) {
      console.error('[Twilio] Body parse error:', parseErr.message);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send('<Response></Response>');
    }

    console.log('[Twilio] Parsed webhook body:', JSON.stringify(twilioBody));

    try {
      const {
        MessageSid, From, To, Body, NumMedia,
        MessageStatus, SmsStatus, ErrorCode, ErrorMessage,
      } = twilioBody;

      const supabase = getSupabase();

      // ── Delivery status update ──────────────────────────────────────────
      // MessageStatus is only present on outbound delivery callbacks.
      // SmsStatus=received arrives on INBOUND messages too — do NOT use it to gate here.
      if (MessageStatus) {
        // Map Twilio status values to allowed DB values
        const statusMap = { received: 'delivered', receiving: 'delivered', accepted: 'queued' };
        const status = statusMap[MessageStatus] || MessageStatus;
        console.log(`[Twilio] Status update: ${MessageSid} → ${status}`);

        await supabase
          .from('messages')
          .update({
            status,
            error_code:    ErrorCode    || null,
            error_message: ErrorMessage || null,
            updated_at:    new Date().toISOString(),
          })
          .eq('provider_message_id', MessageSid);

        res.setHeader('Content-Type', 'text/xml');
        return res.status(200).send('<Response></Response>');
      }

      // ── Inbound SMS ─────────────────────────────────────────────────────
      console.log(`[Twilio] Inbound from ${From} to ${To}: ${Body}`);

      // 1. Resolve tenant from phone_numbers table
      let tenantId = null;
      try {
        const { data: phoneRecord } = await supabase
          .from('phone_numbers')
          .select('tenant_id')
          .eq('number', To)
          .single();

        if (phoneRecord?.tenant_id) {
          tenantId = phoneRecord.tenant_id;
          console.log(`[Twilio] Resolved tenant ${tenantId} for number ${To}`);
        } else {
          console.log(`[Twilio] No tenant found for ${To} — using platform fallback`);
        }
      } catch (lookupErr) {
        console.log('[Twilio] Tenant lookup failed:', lookupErr.message);
      }

      // 2. Classify message type
      const upperBody   = (Body || '').trim().toUpperCase();
      const optOutWords = ['STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT','OPTOUT','REVOKE'];
      const optInWords  = ['START','SUBSCRIBE','YES'];
      const helpWords   = ['HELP','INFO'];

      let messageType = 'inbound';
      if (optOutWords.includes(upperBody))     messageType = 'opt_out';
      else if (optInWords.includes(upperBody)) messageType = 'opt_in';
      else if (helpWords.includes(upperBody))  messageType = 'help';

      // 3. Find or create contact
      const contactId = await findOrCreateContact(supabase, tenantId, From);

      // 3b. Auto-create pipeline lead for SP tenant (non-blocking)
      if (tenantId) {
        try {
          var { getNotifyEmails } = require('./_notify');
          var spTenantId = 'c1bc59a8-5235-4921-9755-02514b574387';
          // 3b. Auto-create pipeline lead for SP tenant (non-blocking)
      try {
        var spTenantId = 'c1bc59a8-5235-4921-9755-02514b574387';
        if (tenantId === spTenantId) {
          var existingLead = await supabase.from('leads').select('id').eq('notes', From).limit(1);
          var leadCheck = await supabase.from('leads').select('id').or('name.eq.' + From + ',notes.ilike.%' + From + '%').limit(1);
          if (!leadCheck.data || leadCheck.data.length === 0) {
            var smsIntent = 'general';
            try {
              var AnthropicSdk = require('@anthropic-ai/sdk');
              var anthropicClient = new (AnthropicSdk.default || AnthropicSdk)({ apiKey: process.env.REACT_APP_ANTHROPIC_API_KEY });
              var intentRes = await anthropicClient.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 100,
                system: 'Classify this inbound SMS intent. Respond with ONLY one word: pricing, support, demo, partnership, or general.',
                messages: [{ role: 'user', content: Body }]
              });
              smsIntent = intentRes.content[0].text.trim().toLowerCase();
            } catch (aiErr) { /* non-fatal */ }

            await supabase.from('leads').insert({
              name: From,
              company: From,
              type: 'Unknown',
              urgency: 'Warm',
              stage: 'inquiry',
              source: 'inbound_sms',
              notes: 'Auto-created from inbound SMS from ' + From + '. Message: ' + (Body || '').substring(0, 200),
              ai_summary: 'Inbound SMS inquiry. Intent: ' + smsIntent,
              last_action_at: new Date().toISOString().split('T')[0],
              last_activity_at: new Date().toISOString(),
            });
            console.log('[SMS] Pipeline lead auto-created for:', From);
          }
        }
      } catch (plErr) { console.log('[SMS] Pipeline lead create failed (non-fatal):', plErr.message); }

      // 7. Handle opt-in / opt-out contact status updates
      if (messageType === 'opt_out' && contactId) {
        await supabase
          .from('contacts')
          .update({ status: 'unsubscribed', updated_at: now })
          .eq('id', contactId);
      } else if (messageType === 'opt_in' && contactId) {
        await supabase
          .from('contacts')
          .update({ status: 'active', updated_at: now })
          .eq('id', contactId);
      }

      // 8. Send inbound notification email (non-blocking)
      notifyInbound(supabase, tenantId, From, Body);

      // ── AI AUTO-RESPONSE ─────────────────────────────────────────────────
      if (messageType === 'inbound' && process.env.ANTHROPIC_API_KEY) {
        try {
          let aiAllowed = true;

          if (tenantId) {
            try {
              const usageCheck = await supabase.rpc('increment_usage', {
                p_tenant_id: tenantId,
                p_channel:   'sms',
                p_count:     1,
              });
              if (usageCheck.data && !usageCheck.data.allowed) {
                aiAllowed = false;
                console.log('[Usage] AI reply blocked — tenant', tenantId, 'at limit');
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
              businessName:      tenant?.name                    || 'our business',
              industry:          tenant?.industry                || 'general business',
              personality:       chatbotConfig?.personality      || 'friendly and professional',
              knowledgeBase:     chatbotConfig?.knowledge_base   || '',
              escalationRules:   chatbotConfig?.escalation_rules || '',
              maxResponseLength: 160,
            };
          }

          const { data: history } = await supabase
            .from('messages')
            .select('direction, body, created_at')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true })
            .limit(10);

          // Always use production URL — VERCEL_URL resolves to preview deployments
          const baseUrl = 'https://portal.engwx.com';

          const aiResponse = await fetch(`${baseUrl}/api/ai?action=respond`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message:             Body,
              conversationHistory: history || [],
              tenantConfig,
            }),
          });

          const aiData = await aiResponse.json();

          if (aiData.success && aiData.response && !aiData.escalate) {
            res.setHeader('Content-Type', 'text/xml');
            return res.status(200).send(
              `<Response><Message>${aiData.response
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
              }</Message></Response>`
            );
          }

          console.log(`[AI] Escalating from ${From}: ${aiData.escalate ? 'escalation requested' : 'AI failed'}`);

        } catch (aiErr) {
          console.error('[AI] Auto-response error:', aiErr);
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
