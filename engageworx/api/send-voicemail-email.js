// /api/send-voicemail-email.js — Vercel Serverless Function
// Sends voicemail notification emails to tenants via Resend
// Called internally by twilio-voice.js after voicemail recording

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const {
    tenant_id,
    caller_number,
    recording_url,
    transcript,
    duration_seconds,
    call_sid,
  } = req.body;

  if (!tenant_id) {
    return res.status(400).json({ error: 'tenant_id required' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not configured');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  try {
    // Get tenant details and notification email
    const { data: tenant, error: tErr } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('id', tenant_id)
      .single();

    if (tErr || !tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Get tenant admin emails from tenant_members
    const { data: members } = await supabase
      .from('tenant_members')
      .select('user_id, role')
      .eq('tenant_id', tenant_id)
      .in('role', ['admin', 'owner']);

    if (!members || members.length === 0) {
      console.log('No admin members found for tenant', tenant_id);
      return res.status(200).json({ message: 'No recipients found' });
    }

    // Get email addresses from auth.users
    const userIds = members.map(m => m.user_id);
    const { data: users } = await supabase
      .from('auth.users')
      .select('id, email')
      .in('id', userIds);

    // Fallback: query user_profiles if auth.users direct query fails
    let recipientEmails = [];
    if (users && users.length > 0) {
      recipientEmails = users.map(u => u.email).filter(Boolean);
    } else {
      // Try user_profiles table
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, email')
        .in('id', userIds);
      if (profiles) {
        recipientEmails = profiles.map(p => p.email).filter(Boolean);
      }
    }

    // Last fallback: get emails from auth via admin API
    if (recipientEmails.length === 0) {
      for (const uid of userIds) {
        const { data: userData } = await supabase.auth.admin.getUserById(uid);
        if (userData?.user?.email) {
          recipientEmails.push(userData.user.email);
        }
      }
    }

    if (recipientEmails.length === 0) {
      console.log('No email addresses found for tenant admins');
      return res.status(200).json({ message: 'No recipient emails found' });
    }

    // Format the email
    const now = new Date();
    const timeStr = now.toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' });
    const durationStr = duration_seconds ? `${Math.floor(duration_seconds / 60)}m ${duration_seconds % 60}s` : 'Unknown';
    const callerDisplay = caller_number || 'Unknown caller';

    const subject = transcript
      ? `Voicemail from ${callerDisplay} — ${tenant.name}`
      : `New voicemail from ${callerDisplay} — ${tenant.name}`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 32px;">
        <div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb;">
          <div style="margin-bottom: 24px;">
            <h1 style="font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 4px;">New Voicemail</h1>
            <p style="color: #6b7280; font-size: 14px; margin: 0;">${tenant.name}</p>
          </div>

          <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 14px; width: 120px;">Caller</td>
                <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">${callerDisplay}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Date &amp; Time</td>
                <td style="padding: 6px 0; color: #111827; font-size: 14px;">${timeStr}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Duration</td>
                <td style="padding: 6px 0; color: #111827; font-size: 14px;">${durationStr}</td>
              </tr>
            </table>
          </div>

          ${transcript ? `
          <div style="margin-bottom: 24px;">
            <h2 style="font-size: 14px; font-weight: 700; color: #111827; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.5px;">Transcript</h2>
            <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px;">
              <p style="color: #92400e; font-size: 14px; line-height: 1.6; margin: 0;">${transcript}</p>
            </div>
          </div>
          ` : `
          <div style="margin-bottom: 24px;">
            <p style="color: #6b7280; font-size: 14px; font-style: italic;">Transcript is being generated and will be sent in a follow-up email.</p>
          </div>
          `}

          ${recording_url ? `
          <div style="margin-bottom: 24px;">
            <a href="${recording_url}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">Listen to Recording</a>
          </div>
          ` : ''}

          <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 8px;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">This voicemail was received by the EngageWorx voice system. <a href="https://portal.engwx.com" style="color: #2563eb; text-decoration: none;">Log in to your portal</a> to manage voice settings.</p>
          </div>
        </div>
      </div>
    `;

    // Send via Resend
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${tenant.name} Voicemail <voicemail@engwx.com>`,
        to: recipientEmails,
        subject: subject,
        html: htmlBody,
      }),
    });

    const emailResult = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error('Resend error:', emailResult);
      return res.status(500).json({ error: 'Failed to send email', details: emailResult });
    }

    console.log(`Voicemail email sent to ${recipientEmails.join(', ')} for tenant ${tenant.name}`);
    return res.status(200).json({ success: true, recipients: recipientEmails, emailId: emailResult.id });

  } catch (err) {
    console.error('Voicemail email error:', err);
    return res.status(500).json({ error: err.message });
  }
};
