// /api/webhook/twilio.js — Vercel Serverless Function
// Handles inbound SMS and delivery status callbacks from Twilio

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  // Twilio sends webhooks as POST with form-encoded body
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      MessageSid,
      AccountSid,
      From,
      To,
      Body,
      NumMedia,
      // Delivery status fields
      MessageStatus,
      SmsStatus,
      ErrorCode,
      ErrorMessage,
    } = req.body;

    // ─── DELIVERY STATUS UPDATE ───────────────────────────────────────
    if (MessageStatus || SmsStatus) {
      const status = MessageStatus || SmsStatus;
      console.log(`[Twilio] Status update: ${MessageSid} → ${status}`);

      // Update message status in database
      const { error } = await supabase
        .from('messages')
        .update({
          status: status,
          error_code: ErrorCode || null,
          error_message: ErrorMessage || null,
          updated_at: new Date().toISOString(),
        })
        .eq('external_id', MessageSid);

      if (error) console.error('[Twilio] DB update error:', error);

      // Respond with empty TwiML (no reply)
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send('<Response></Response>');
    }

    // ─── INBOUND SMS ──────────────────────────────────────────────────
    console.log(`[Twilio] Inbound SMS from ${From}: ${Body}`);

    // Check for opt-out keywords
    const upperBody = (Body || '').trim().toUpperCase();
    const optOutKeywords = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE'];
    const optInKeywords = ['START', 'SUBSCRIBE', 'YES'];
    const helpKeywords = ['HELP', 'INFO'];

    let messageType = 'inbound';
    if (optOutKeywords.includes(upperBody)) messageType = 'opt_out';
    else if (optInKeywords.includes(upperBody)) messageType = 'opt_in';
    else if (helpKeywords.includes(upperBody)) messageType = 'help';

    // Store inbound message
    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        external_id: MessageSid,
        direction: 'inbound',
        channel: 'sms',
        from_number: From,
        to_number: To,
        body: Body,
        status: 'received',
        message_type: messageType,
        media_count: parseInt(NumMedia || '0'),
        raw_payload: req.body,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('[Twilio] DB insert error:', insertError);
      // Don't fail the webhook — Twilio will retry
    }

    // Handle opt-out/opt-in/help (Twilio handles default responses,
    // but log them for our records)
    if (messageType === 'opt_out') {
      console.log(`[Twilio] Opt-out received from ${From}`);
      // Update contact opt-out status
      await supabase
        .from('contacts')
        .update({ sms_opted_out: true, sms_opted_out_at: new Date().toISOString() })
        .eq('phone', From);
    } else if (messageType === 'opt_in') {
      console.log(`[Twilio] Opt-in received from ${From}`);
      await supabase
        .from('contacts')
        .update({ sms_opted_out: false, sms_opted_in_at: new Date().toISOString() })
        .eq('phone', From);
    }

    // Respond with empty TwiML (Twilio handles STOP/HELP auto-replies)
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<Response></Response>');

  } catch (err) {
    console.error('[Twilio] Webhook error:', err);
    // Always return 200 to prevent Twilio retries on app errors
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<Response></Response>');
  }
}
