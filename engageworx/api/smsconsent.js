const twilio = require('twilio');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+17869827800';

const OPT_IN_MESSAGE = 'EngageWorx: You are now opted in to receive messages. Message frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to opt out.';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var name = (req.body.name || '').trim();
  var phone = (req.body.phone || '').trim();
  var consent = req.body.consent;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone are required' });
  }

  if (!consent) {
    return res.status(400).json({ error: 'Consent is required' });
  }

  // Normalize phone number
  var normalizedPhone = phone.replace(/[^0-9+]/g, '');
  if (!normalizedPhone.startsWith('+')) {
    normalizedPhone = '+1' + normalizedPhone.replace(/^1/, '');
  }

  try {
    // Save opt-in to Supabase
    var { error: dbError } = await supabase.from('sms_optins').insert({
      name: name,
      phone: normalizedPhone,
      source: 'web_form',
      consent_text: 'I agree to receive SMS messages from EngageWorx. Message frequency varies. Msg & data rates may apply. Reply STOP to unsubscribe.',
      opted_in_at: new Date().toISOString(),
      ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null,
    });

    if (dbError) {
      console.error('[smsconsent] DB error:', dbError.message);
      // Non-fatal — still try to send the SMS
    }

    // Send confirmation SMS via Twilio
    var message = await twilioClient.messages.create({
      body: OPT_IN_MESSAGE,
      from: FROM_NUMBER,
      to: normalizedPhone,
    });

    console.log('[smsconsent] SMS sent:', message.sid, 'to', normalizedPhone);

    return res.status(200).json({
      success: true,
      message: 'Opted in successfully',
      sid: message.sid,
    });

  } catch (err) {
    console.error('[smsconsent] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
