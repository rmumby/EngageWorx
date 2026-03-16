// /api/send-voicemail-email.js — Vercel Serverless Function
// Sends voicemail notification emails via Resend
// Called by twilio-voice.js after voicemail recording or transcription

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  var body = req.body || {};
  var tenantId = body.tenant_id;
  var callerNumber = body.caller_number || 'Unknown caller';
  var recordingUrl = body.recording_url || null;
  var transcript = body.transcript || null;
  var durationSeconds = body.duration_seconds || 0;
  var recipientEmail = body.voicemail_email || null;

  console.log('📧 Voicemail email request:', JSON.stringify({ tenantId: tenantId, caller: callerNumber, hasTranscript: !!transcript, recipient: recipientEmail }));

  var RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not configured');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  // If no recipient email passed, look it up from voice config
  if (!recipientEmail && tenantId) {
    try {
      var supabase = require('@supabase/supabase-js').createClient(
        process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
      );
      var result = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', tenantId).eq('channel', 'voice').single();
      if (result.data && result.data.config_encrypted) {
        recipientEmail = result.data.config_encrypted.voicemail_email || null;
      }
    } catch (e) {
      console.warn('Voice config lookup error:', e.message);
    }
  }

  if (!recipientEmail) {
    console.log('No recipient email found');
    return res.status(200).json({ message: 'No recipient email' });
  }

  try {
    var now = new Date();
    var timeStr = now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' });
    var durationStr = durationSeconds ? (Math.floor(durationSeconds / 60) + 'm ' + (durationSeconds % 60) + 's') : 'Unknown';

    var subject = transcript
      ? 'Voicemail from ' + callerNumber + ' (transcript included)'
      : 'New voicemail from ' + callerNumber;

    var htmlBody = '<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 32px;">'
      + '<div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb;">'
      + '<h1 style="font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 4px;">New Voicemail</h1>'
      + '<p style="color: #6b7280; font-size: 14px; margin: 0 0 24px;">EngageWorx Voice</p>'
      + '<div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin-bottom: 24px;">'
      + '<p style="margin: 6px 0; color: #6b7280; font-size: 14px;"><strong>Caller:</strong> ' + callerNumber + '</p>'
      + '<p style="margin: 6px 0; color: #6b7280; font-size: 14px;"><strong>Date:</strong> ' + timeStr + '</p>'
      + '<p style="margin: 6px 0; color: #6b7280; font-size: 14px;"><strong>Duration:</strong> ' + durationStr + '</p>'
      + '</div>';

    if (transcript) {
      htmlBody += '<div style="margin-bottom: 24px;">'
        + '<h2 style="font-size: 14px; font-weight: 700; color: #111827; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.5px;">Transcript</h2>'
        + '<div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px;">'
        + '<p style="color: #92400e; font-size: 14px; line-height: 1.6; margin: 0;">' + transcript + '</p>'
        + '</div></div>';
    }

    if (recordingUrl) {
      htmlBody += '<div style="margin-bottom: 24px;">'
        + '<a href="' + recordingUrl + '" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">Listen to Recording</a>'
        + '</div>';
    }

    htmlBody += '<div style="border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 8px;">'
      + '<p style="color: #9ca3af; font-size: 12px; margin: 0;">EngageWorx Voice System | <a href="https://portal.engwx.com" style="color: #2563eb; text-decoration: none;">Log in to portal</a></p>'
      + '</div></div></div>';

    var emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'EngageWorx Voicemail <voicemail@engwx.com>',
        to: [recipientEmail],
        subject: subject,
        html: htmlBody,
      }),
    });

    var emailResult = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error('Resend error:', JSON.stringify(emailResult));
      return res.status(500).json({ error: 'Failed to send email', details: emailResult });
    }

    console.log('📧 Voicemail email sent to ' + recipientEmail);
    return res.status(200).json({ success: true, recipient: recipientEmail, emailId: emailResult.id });

  } catch (err) {
    console.error('Voicemail email error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
