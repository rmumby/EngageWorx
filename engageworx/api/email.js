// /api/email.js — Single Vercel Serverless Function for all email operations
// POST /api/email?action=send     → Send transactional email
// POST /api/email?action=test     → Test email
// POST /api/email?action=template → Send using template

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'SENDGRID_API_KEY not configured' });

  const action = req.query.action || 'send';

  // ─── SEND EMAIL ───────────────────────────────────────────────────
  async function sendEmail({ to, from, fromName, subject, text, html, replyTo }) {
    const payload = {
      personalizations: [{ to: Array.isArray(to) ? to.map(e => ({ email: e })) : [{ email: to }] }],
      from: { email: from || 'hello@engwx.com', name: fromName || 'EngageWorx' },
      subject: subject,
      content: [],
    };

    if (text) payload.content.push({ type: 'text/plain', value: text });
    if (html) payload.content.push({ type: 'text/html', value: html });
    if (!text && !html) payload.content.push({ type: 'text/plain', value: '' });
    if (replyTo) payload.reply_to = { email: replyTo };

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // SendGrid returns 202 for accepted, no body
    if (response.status === 202) {
      return { ok: true, status: 202 };
    }

    const data = await response.json().catch(() => ({}));
    return { ok: false, status: response.status, data };
  }

  // ─── TEST ─────────────────────────────────────────────────────────
  if (action === 'test') {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'Missing "to" email address' });

    const result = await sendEmail({
      to,
      subject: '🚀 EngageWorx Email Test Successful!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: linear-gradient(135deg, #0a1628, #131b2e); border-radius: 16px; padding: 40px; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 16px;">🚀</div>
            <h1 style="color: #00C9FF; margin: 0 0 8px; font-size: 24px;">EngageWorx</h1>
            <h2 style="color: #ffffff; margin: 0 0 16px; font-size: 20px;">Email Integration Active!</h2>
            <p style="color: #6B8BAE; font-size: 14px; line-height: 1.6; margin: 0;">
              Your SendGrid integration is working perfectly.<br/>
              Transactional and marketing emails are ready to send.
            </p>
            <div style="margin-top: 24px; padding: 16px; background: rgba(0,201,255,0.1); border-radius: 8px; border: 1px solid rgba(0,201,255,0.2);">
              <span style="color: #00E676; font-weight: bold;">✓ Domain verified</span>&nbsp;&nbsp;
              <span style="color: #00E676; font-weight: bold;">✓ API connected</span>&nbsp;&nbsp;
              <span style="color: #00E676; font-weight: bold;">✓ Ready to send</span>
            </div>
          </div>
          <p style="color: #999; font-size: 11px; text-align: center; margin-top: 20px;">
            Sent from EngageWorx · <a href="https://engwx.com" style="color: #00C9FF;">engwx.com</a>
          </p>
        </div>
      `,
      text: 'EngageWorx Email Test Successful! Your SendGrid integration is working perfectly.',
    });

    if (result.ok) {
      return res.status(200).json({ success: true, message: 'Test email sent!' });
    }

    return res.status(result.status).json({ error: 'SendGrid error', details: result.data });
  }

  // ─── SEND ─────────────────────────────────────────────────────────
  if (action === 'send') {
    const { to, subject, html, text, from, fromName, replyTo } = req.body;

    if (!to || !subject) {
      return res.status(400).json({ error: 'Missing required fields: to, subject' });
    }
    if (!html && !text) {
      return res.status(400).json({ error: 'Missing required field: html or text' });
    }

    try {
      const result = await sendEmail({ to, from, fromName, subject, html, text, replyTo });

      if (result.ok) {
        return res.status(200).json({ success: true, message: 'Email sent' });
      }

      return res.status(result.status).json({ error: 'SendGrid error', details: result.data });
    } catch (err) {
      console.error('Send email error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ─── TEMPLATE SEND ────────────────────────────────────────────────
  if (action === 'template') {
    const { to, templateId, dynamicData, from, fromName } = req.body;

    if (!to || !templateId) {
      return res.status(400).json({ error: 'Missing required fields: to, templateId' });
    }

    try {
      const payload = {
        personalizations: [{
          to: Array.isArray(to) ? to.map(e => ({ email: e })) : [{ email: to }],
          dynamic_template_data: dynamicData || {},
        }],
        from: { email: from || 'hello@engwx.com', name: fromName || 'EngageWorx' },
        template_id: templateId,
      };

      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 202) {
        return res.status(200).json({ success: true, message: 'Template email sent' });
      }

      const data = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: 'SendGrid error', details: data });
    } catch (err) {
      console.error('Template email error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(400).json({ error: 'Invalid action. Use ?action=send|test|template' });
};
