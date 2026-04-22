// /api/inbound-email.js — Vercel Serverless Function
// Receives inbound emails via SendGrid Inbound Parse
// All branding, from addresses, and business info pulled from Supabase channel_configs
// Zero hardcoded tenant values — works for any CSP, Agent, or Tenant
// New tenants self-configure via Settings → Channels → Email in the portal

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
);

// Disable Vercel's default body parser — we need raw body for multipart parsing
module.exports.config = { api: { bodyParser: false } };

// SP tenant ID — fallback routing only if no tenant matched by inbound_email
const EW_SP_TENANT_ID = (process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387');

// Simple multipart form-data parser
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      const contentType = req.headers['content-type'] || '';

      if (contentType.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(body);
        const result = {};
        for (const [key, value] of params) { result[key] = value; }
        return resolve(result);
      }

      if (contentType.includes('multipart/form-data')) {
        const boundary = contentType.split('boundary=')[1];
        if (!boundary) return resolve({ _raw: body });
        const parts = body.split('--' + boundary).filter(p => p.trim() && p.trim() !== '--');
        const result = {};
        parts.forEach(part => {
          const nameMatch = part.match(/name="([^"]+)"/);
          if (nameMatch) {
            const name = nameMatch[1];
            const valueStart = part.indexOf('\r\n\r\n');
            if (valueStart > -1) {
              let value = part.substring(valueStart + 4).trim();
              if (value.endsWith('--')) value = value.slice(0, -2).trim();
              if (value.endsWith('\r\n')) value = value.slice(0, -2);
              result[name] = value;
            }
          }
        });
        return resolve(result);
      }

      try { return resolve(JSON.parse(body)); } catch (e) {}

      try {
        const params = new URLSearchParams(body);
        const result = {};
        for (const [key, value] of params) { result[key] = value; }
        if (Object.keys(result).length > 0) return resolve(result);
      } catch (e) {}

      resolve({ _raw: body });
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!ANTHROPIC_API_KEY || !RESEND_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY or RESEND_API_KEY');
    return res.status(500).json({ error: 'Service not configured' });
  }

  try {
    const fields = await parseMultipart(req);
    console.log('📧 Inbound Parse received. Fields:', Object.keys(fields).join(', '));

    const { from: senderRaw, to, subject, text, html } = fields;

    // Parse sender
    const senderMatch = (senderRaw || '').match(/<([^>]+)>/) || [null, senderRaw];
    const senderEmail = (senderMatch[1] || senderRaw || '').trim().toLowerCase();
    const senderName = (senderRaw || '').replace(/<[^>]+>/, '').trim() || senderEmail;

    // ── INGESTION FILTER — runs BEFORE any DB writes ──────────────────────
    // (a) Domain blocklist
    if (/@([a-z0-9-]+\.)*linkedin\.com$/i.test(senderEmail) ||
        /@([a-z0-9-]+\.)*facebook(mail)?\.com$/i.test(senderEmail) ||
        /@([a-z0-9-]+\.)*fb\.com$/i.test(senderEmail) ||
        /@mailer-daemon\./i.test(senderEmail) ||
        /@postmaster\./i.test(senderEmail)) {
      console.log('🚫 Blocked domain: ' + senderEmail);
      return res.status(200).json({ skipped: true, reason: 'blocked_domain' });
    }

    // (b) Local-part blocklist
    if (/^(no-?reply|noreply|do-?not-?reply|automated|notifications?|bounce|mailer-daemon|postmaster|invitations|inmail-hit-reply|updates|alerts|digest|newsletter|mailing|list-manager)@/i.test(senderEmail)) {
      console.log('🚫 Blocked local-part: ' + senderEmail);
      return res.status(200).json({ skipped: true, reason: 'blocked_local_part' });
    }

    // (c) Header-based blocklist — bulk/automated mail
    var rawHeaders = (fields.headers || fields.header || '').toLowerCase();
    if (rawHeaders) {
      if (/list-unsubscribe/i.test(rawHeaders)) {
        console.log('🚫 Blocked bulk/automated headers from: ' + senderEmail + ' (list-unsubscribe)');
        return res.status(200).json({ skipped: true, reason: 'bulk_headers' });
      }
      if (/precedence:\s*(bulk|list)/i.test(rawHeaders)) {
        console.log('🚫 Blocked bulk/automated headers from: ' + senderEmail + ' (precedence)');
        return res.status(200).json({ skipped: true, reason: 'bulk_headers' });
      }
      if (/auto-submitted:\s*(auto-generated|auto-replied)/i.test(rawHeaders)) {
        console.log('🚫 Blocked bulk/automated headers from: ' + senderEmail + ' (auto-submitted)');
        return res.status(200).json({ skipped: true, reason: 'bulk_headers' });
      }
      if (/x-auto-response-suppress/i.test(rawHeaders)) {
        console.log('🚫 Blocked bulk/automated headers from: ' + senderEmail + ' (x-auto-response-suppress)');
        return res.status(200).json({ skipped: true, reason: 'bulk_headers' });
      }
    }

    // ── Step 1: Match tenant by recipient email via channel_configs ──
    let tenantId = null;
    let emailChannelConfig = {};

    try {
      const toEmail = (to || '').toLowerCase();
      const { data: configs } = await supabase
        .from('channel_configs')
        .select('tenant_id, config_encrypted')
        .eq('channel', 'email');

      if (configs) {
        for (const cfg of configs) {
          const inboundEmail = (cfg.config_encrypted?.inbound_email || '').toLowerCase();
          if (inboundEmail && toEmail.includes(inboundEmail.split('@')[0])) {
            tenantId = cfg.tenant_id;
            emailChannelConfig = cfg.config_encrypted || {};
            console.log(`📋 Tenant matched by inbound_email: ${tenantId} (${inboundEmail})`);
            break;
          }
        }
      }

      // Fall back to SP tenant
      if (!tenantId) {
        tenantId = EW_SP_TENANT_ID;
        console.log('📋 No tenant match — falling back to SP tenant');
        const { data: spConfig } = await supabase
          .from('channel_configs')
          .select('config_encrypted')
          .eq('tenant_id', EW_SP_TENANT_ID)
          .eq('channel', 'email')
          .single();
        if (spConfig?.config_encrypted) emailChannelConfig = spConfig.config_encrypted;
      }
    } catch (e) {
      console.log('Tenant match error:', e.message);
      tenantId = EW_SP_TENANT_ID;
    }

    // (d) Per-tenant blocked_domains check
    try {
      var tenantBlockRes = await supabase.from('tenants').select('blocked_domains').eq('id', tenantId).maybeSingle();
      var blockedDomains = (tenantBlockRes.data && Array.isArray(tenantBlockRes.data.blocked_domains)) ? tenantBlockRes.data.blocked_domains : [];
      if (blockedDomains.length > 0) {
        var senderDomain = senderEmail.split('@')[1] || '';
        var isBlocked = blockedDomains.some(function(entry) {
          entry = (entry || '').toLowerCase().trim();
          if (entry.indexOf('@') > -1) return senderEmail === entry;
          return senderDomain === entry || senderDomain.endsWith('.' + entry);
        });
        if (isBlocked) {
          console.log('🚫 Blocked by tenant blocklist: ' + senderEmail);
          return res.status(200).json({ skipped: true, reason: 'tenant_blocklist' });
        }
      }
    } catch (e) { console.log('Tenant blocklist check error:', e.message); }

    // ── Step 2: Resolve all config values from Supabase — no hardcoded fallbacks ──
    const replyFromEmail = emailChannelConfig.from_email;
    const replyFromName  = emailChannelConfig.from_name;
    const replyWebsite   = emailChannelConfig.website_url;
    const replyPhone     = emailChannelConfig.support_phone;
    const notifyEmail    = emailChannelConfig.notify_email || emailChannelConfig.admin_notify_email;
    const businessInfo   = emailChannelConfig.ai_business_info;

    // Skip internal emails from this tenant's own domain
    if (replyFromEmail && senderEmail === replyFromEmail.toLowerCase()) {
  console.log(`Skipping internal email from ${senderEmail}`);
  return res.status(200).json({ skipped: true, reason: 'internal' });
}

    // ── Step 3: Clean email body — strip HTML and signatures ──
    let rawBody = '';
    if (text && text.trim().length > 10) {
      rawBody = text.trim();
    } else if (html) {
      rawBody = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\[cid:[^\]]+\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Generic signature stripping — no hardcoded names
    // Tenants can extend via signature_strip_markers in their channel_config
    const genericSigMarkers = [
  '\n--\n', '--\r\n',
  '________________________________',
  '\nFrom:', '\r\nFrom:',
  '\r\nOn ', '\nOn ',           // Quoted reply: "On Thu, Apr 9..."
  '\n> ', '\r\n> ',             // Quoted lines starting with >
  'Sent from my iPhone', 'Sent from my Samsung',
  '[cid:', 'content.exclaimer',
  'Book time with me',
  'CONFIDENTIAL', 'DISCLAIMER',
];
    const tenantSigMarkers = (emailChannelConfig && emailChannelConfig.signature_strip_markers) || [];
    const allMarkers = [...genericSigMarkers, ...tenantSigMarkers];

    let emailBody = rawBody;
    for (const marker of allMarkers) {
      const idx = emailBody.indexOf(marker);
      if (idx > 20) { emailBody = emailBody.substring(0, idx).trim(); break; }
    }
    emailBody = emailBody.trim() || '(no message content)';

    const emailSubject = subject || '(no subject)';
    console.log(`📧 Inbound email from ${senderEmail}: ${emailSubject}`);

    // ── Step 4: Log to Supabase inbound_emails table ──
    let emailLogId = null;
    try {
      const { data: logEntry } = await supabase.from('inbound_emails').insert({
        sender_email: senderEmail,
        sender_name: senderName,
        subject: emailSubject,
        body: emailBody.substring(0, 10000),
        received_at: new Date().toISOString(),
        status: 'processing',
      }).select().single();
      emailLogId = logEntry?.id;
    } catch (logErr) {
      console.log('Email log skipped:', logErr.message);
    }

    // ── Step 5: Wire into Live Inbox — contact, conversation, inbound message ──
    let contactId = null;
    let conversationId = null;

    try {
      // Find or create contact
      const { data: existingContact } = await supabase
        .from('contacts').select('id')
        .eq('email', senderEmail).eq('tenant_id', tenantId).limit(1);

      if (existingContact?.length > 0) {
        contactId = existingContact[0].id;
        console.log('📋 Existing contact found:', contactId);
      } else {
        const nameParts = senderName.split(' ');
        const { data: newContact } = await supabase.from('contacts').insert({
          tenant_id: tenantId,
          first_name: nameParts[0] || senderName,
          last_name: nameParts.slice(1).join(' ') || '',
          email: senderEmail,
          status: 'active',
        }).select().single();
        contactId = newContact?.id;
        console.log('📋 New contact created:', contactId);
      }

      // Find or create conversation
      const { data: existingConv } = await supabase
        .from('conversations').select('id')
        .eq('contact_id', contactId).eq('channel', 'email').eq('tenant_id', tenantId)
        .in('status', ['active', 'waiting', 'snoozed'])
        .order('last_message_at', { ascending: false }).limit(1);

      if (existingConv?.length > 0) {
        conversationId = existingConv[0].id;
        await supabase.from('conversations').update({
          last_message_at: new Date().toISOString(),
          status: 'active',
          unread_count: 1,
        }).eq('id', conversationId);
        console.log('📋 Existing conversation updated:', conversationId);
      } else {
        const { data: newConv } = await supabase.from('conversations').insert({
          tenant_id: tenantId,
          contact_id: contactId,
          channel: 'email',
          subject: emailSubject,
          status: 'active',
          last_message_at: new Date().toISOString(),
          unread_count: 1,
        }).select().single();
        conversationId = newConv?.id;
        console.log('📋 New conversation created:', conversationId);
      }

      // ── Save inbound message — cleaned body, correct fields ──
      if (conversationId) {
        const { error: inboundErr } = await supabase.from('messages').insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          contact_id: contactId,
          channel: 'email',
          direction: 'inbound',
          sender_type: 'contact',
          body: emailBody.substring(0, 5000),
          status: 'delivered',
          created_at: new Date().toISOString(),
        });
        if (inboundErr) console.error('❌ Inbound message save error:', inboundErr.message);
        else console.log('📋 Inbound message saved');
      }

      console.log(`📋 Live Inbox wired: tenant=${tenantId}, contact=${contactId}, conversation=${conversationId}`);
    } catch (inboxErr) {
      console.log('Live Inbox wiring error:', inboxErr.message);
    }

    // ── Step 6: AI classification and reply — only if config is complete ──
    if (!replyFromEmail || !replyFromName) {
      console.log('⚠️ Skipping AI reply — tenant email config incomplete. Configure via Settings → Channels → Email.');
      return res.status(200).json({ success: true, replied: false, reason: 'config_incomplete', tenant: tenantId });
    }

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: `You are the AI email assistant for ${replyFromName}. You handle incoming emails professionally and helpfully.

${businessInfo ? `Business information:\n${businessInfo}` : `You represent ${replyFromName}. Answer questions helpfully and professionally.`}

${replyPhone ? `Support phone: ${replyPhone}` : ''}
${replyWebsite ? `Website: ${replyWebsite}` : ''}
${replyFromEmail ? `Email: ${replyFromEmail}` : ''}

Your job:
1. Classify the intent (sales_inquiry, partnership, support, demo_request, pricing, spam, other)
2. Write a warm, professional, concise reply (3-5 sentences max)
3. For sales/demo/partnership: express interest, highlight relevant value, offer to schedule a call
4. For support: acknowledge and offer help
5. For spam: do not reply (set intent to "spam", should_reply to false)
6. Always sign off as "The ${replyFromName} Team"
7. Never make up features or services
8. Do not use markdown formatting in the email body

Respond ONLY with valid JSON (no markdown backticks):
{
  "intent": "sales_inquiry|partnership|support|demo_request|pricing|spam|other",
  "sentiment": "positive|neutral|negative",
  "should_reply": true|false,
  "reply_subject": "Re: <original subject>",
  "reply_body": "Your reply text here",
  "notify_admin": true|false,
  "summary": "One-line summary for internal tracking"
}`,
        messages: [{
          role: 'user',
          content: `New email received:\nFrom: ${senderName} <${senderEmail}>\nSubject: ${emailSubject}\nBody: ${emailBody.substring(0, 3000)}`,
        }],
      }),
    });

    const aiData = await aiResponse.json();
    const aiText = aiData.content?.find(c => c.type === 'text')?.text || '{}';

    let parsed;
    try {
      parsed = JSON.parse(aiText.replace(/```json|```/g, '').trim());
    } catch (parseErr) {
      console.error('AI parse error:', parseErr.message);
      parsed = {
        intent: 'other',
        sentiment: 'neutral',
        should_reply: true,
        reply_subject: `Re: ${emailSubject}`,
        reply_body: `Thank you for reaching out to ${replyFromName}. We've received your message and will get back to you shortly.${replyPhone ? `\n\nFeel free to call us at ${replyPhone}.` : ''}${replyWebsite ? `\nVisit us at ${replyWebsite}.` : ''}\n\nBest regards,\nThe ${replyFromName} Team`,
        notify_admin: true,
        summary: 'AI parse failed — generic reply sent',
      };
    }

    // ── Step 7: Usage check ──
    let emailAllowed = true;
    try {
      const usageResult = await supabase.rpc('increment_usage', {
        p_tenant_id: tenantId,
        p_channel: 'email',
        p_count: 1,
      });
      if (usageResult.data && !usageResult.data.allowed) {
        emailAllowed = false;
        console.log('[Usage] Email reply blocked — tenant at limit:', tenantId);
      }
    } catch (ue) {
      console.log('[Usage] Check failed, allowing reply (fail-open)');
    }

    // ── Step 8: Send AI reply via Resend ──
    if (parsed.should_reply && emailAllowed) {
      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="padding: 24px;">
            ${parsed.reply_body.split('\n').map(line => line.trim()
              ? `<p style="color: #1a1a2e; font-size: 15px; line-height: 1.7; margin: 0 0 12px;">${line}</p>`
              : '').join('')}
          </div>
          <div style="border-top: 1px solid #e5e7eb; padding: 16px 24px; margin-top: 8px;">
            <p style="margin: 0; font-size: 13px; color: #6b7280;">
              <strong style="color: #1a1a2e;">${replyFromName}</strong><br/>
              ${replyWebsite ? `<a href="${replyWebsite}" style="color: #00C9FF; text-decoration: none;">${replyWebsite.replace('https://', '')}</a>` : ''}
              ${replyPhone ? ` · <a href="tel:${replyPhone.replace(/\D/g, '')}" style="color: #00C9FF; text-decoration: none;">${replyPhone}</a>` : ''}
            </p>
          </div>
        </div>
      `;

      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(Object.assign({
            from: `${replyFromName} <${replyFromEmail}>`,
            to: [senderEmail],
            subject: parsed.reply_subject || `Re: ${emailSubject}`,
            html: emailHtml,
            reply_to: replyFromEmail,
          }, emailChannelConfig.ai_omni_bcc && emailChannelConfig.ai_omni_bcc !== senderEmail ? { bcc: [emailChannelConfig.ai_omni_bcc] } : {})),
        });
        console.log(`✉️ Auto-reply sent from ${replyFromEmail} to ${senderEmail}`);
      } catch (sendErr) {
        console.error('Resend error:', sendErr.message);
      }

      // ── Save AI reply to Live Inbox — outside Resend try/catch so it always runs ──
      if (conversationId && tenantId && parsed.reply_body) {
        const { error: outErr } = await supabase.from('messages').insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          contact_id: contactId,
          channel: 'email',
          direction: 'outbound',
          sender_type: 'bot',
          body: parsed.reply_body,
          status: 'delivered',
          created_at: new Date().toISOString(),
        });
        if (outErr) console.error('❌ AI reply save error:', outErr.message);
        else console.log('✅ AI reply saved to Live Inbox');

        await supabase.from('conversations').update({
          last_message_at: new Date().toISOString(),
          status: 'waiting',
          unread_count: 0,
        }).eq('id', conversationId);
      }

    } else if (!emailAllowed && notifyEmail) {
      // Usage limit — forward to admin for manual follow-up
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${replyFromName} <${replyFromEmail}>`,
          to: [notifyEmail],
          subject: `[USAGE LIMIT] Unhandled email from ${senderEmail}`,
          html: `<p><strong>AI auto-reply blocked — usage limit reached.</strong></p><p>From: ${senderEmail}</p><p>Subject: ${emailSubject}</p><p>Please reply manually.</p>`,
        }),
      });
    }

    // ── Step 9: Notify admin for important inquiries ──
    if (parsed.notify_admin && notifyEmail) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${replyFromName} Notifications <notifications@engwx.com>`,
            to: [notifyEmail],
            subject: `📧 [${parsed.intent}] ${emailSubject} — from ${senderName}`,
            html: `
              <div style="font-family: -apple-system, sans-serif; max-width: 600px;">
                <div style="background: #0d1117; color: #e8f4fd; border-radius: 12px; padding: 24px; margin-bottom: 16px;">
                  <h2 style="margin: 0 0 12px; font-size: 18px; color: #00C9FF;">New ${parsed.intent.replace(/_/g, ' ').toUpperCase()} — ${replyFromName}</h2>
                  <table style="width: 100%; font-size: 14px;">
                    <tr><td style="color: #6b8bae; padding: 4px 0; width: 80px;">From</td><td style="color: #e8f4fd;">${senderName} &lt;${senderEmail}&gt;</td></tr>
                    <tr><td style="color: #6b8bae; padding: 4px 0;">Subject</td><td style="color: #e8f4fd;">${emailSubject}</td></tr>
                    <tr><td style="color: #6b8bae; padding: 4px 0;">Intent</td><td style="color: #00C9FF; font-weight: 700;">${parsed.intent}</td></tr>
                    <tr><td style="color: #6b8bae; padding: 4px 0;">Sentiment</td><td style="color: #e8f4fd;">${parsed.sentiment}</td></tr>
                    <tr><td style="color: #6b8bae; padding: 4px 0;">Summary</td><td style="color: #e8f4fd;">${parsed.summary}</td></tr>
                    <tr><td style="color: #6b8bae; padding: 4px 0;">Tenant</td><td style="color: #e8f4fd;">${replyFromName} (${tenantId})</td></tr>
                  </table>
                </div>
                <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
                  <h3 style="margin: 0 0 8px; font-size: 14px; color: #374151;">Original Message</h3>
                  <p style="color: #4b5563; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${emailBody.substring(0, 2000)}</p>
                </div>
                ${parsed.should_reply ? `
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px;">
                  <h3 style="margin: 0 0 8px; font-size: 14px; color: #166534;">AI Auto-Reply Sent</h3>
                  <p style="color: #4b5563; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${parsed.reply_body}</p>
                </div>` : '<p style="color: #dc2626; font-size: 13px;">No auto-reply sent.</p>'}
                <p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">Reply directly to ${senderEmail} to continue the conversation.</p>
              </div>
            `,
            reply_to: senderEmail,
          }),
        });
        console.log(`🔔 Admin notified: ${notifyEmail} about ${parsed.intent} from ${senderEmail}`);
      } catch (notifyErr) {
        console.error('Admin notification error:', notifyErr.message);
      }
    }

    // ── Step 10: Update inbound_emails log ──
    if (emailLogId) {
      try {
        await supabase.from('inbound_emails').update({
          intent: parsed.intent,
          sentiment: parsed.sentiment,
          ai_summary: parsed.summary,
          reply_sent: parsed.should_reply,
          reply_body: parsed.reply_body || null,
          status: 'processed',
        }).eq('id', emailLogId);
      } catch (logErr) {
        console.log('Log update skipped:', logErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      intent: parsed.intent,
      sentiment: parsed.sentiment,
      replied: parsed.should_reply,
      tenant: replyFromName,
    });

  } catch (err) {
    console.error('Inbound email error:', err);
    return res.status(500).json({ error: err.message });
  }
};
