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
    const { to, body, from } = req.body;
    if (!to || !body) return res.status(400).json({ error: 'Missing required fields: to, body' });

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) return res.status(500).json({ error: 'Twilio credentials not configured' });

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

      // Inbound SMS
      console.log(`[Twilio] Inbound from ${From}: ${Body}`);

      const upperBody = (Body || '').trim().toUpperCase();
      const optOutWords = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE'];
      const optInWords = ['START', 'SUBSCRIBE', 'YES'];
      const helpWords = ['HELP', 'INFO'];

      let messageType = 'inbound';
      if (optOutWords.includes(upperBody)) messageType = 'opt_out';
      else if (optInWords.includes(upperBody)) messageType = 'opt_in';
      else if (helpWords.includes(upperBody)) messageType = 'help';

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
        created_at: new Date().toISOString(),
      });

      if (messageType === 'opt_out') {
        await supabase.from('contacts')
          .update({ sms_opted_out: true, sms_opted_out_at: new Date().toISOString() })
          .eq('phone', From);
      } else if (messageType === 'opt_in') {
        await supabase.from('contacts')
          .update({ sms_opted_out: false, sms_opted_in_at: new Date().toISOString() })
          .eq('phone', From);
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
