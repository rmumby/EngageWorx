// /api/inbound-email.js — Vercel Serverless Function
// Receives inbound emails via SendGrid Inbound Parse
// Runs through Claude AI for intelligent auto-response
// Sends reply via Resend from hello@engwx.com
//
// Flow: Email to hello@engwx.com → SendGrid Inbound Parse → This endpoint → Claude AI → Resend reply
//
// IMPORTANT: SendGrid sends multipart/form-data, so we need to parse it manually.
// Vercel's default body parser doesn't handle multipart.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
);

// Disable Vercel's default body parser — we need raw body for multipart parsing
module.exports.config = { api: { bodyParser: false } };

// Simple multipart form-data parser
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      const contentType = req.headers['content-type'] || '';
      
      // If it's URL-encoded (SendGrid sometimes sends this way)
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(body);
        const result = {};
        for (const [key, value] of params) { result[key] = value; }
        return resolve(result);
      }
      
      // If it's multipart/form-data
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
              // Remove trailing boundary marker
              if (value.endsWith('--')) value = value.slice(0, -2).trim();
              if (value.endsWith('\r\n')) value = value.slice(0, -2);
              result[name] = value;
            }
          }
        });
        return resolve(result);
      }

      // Try JSON
      try { return resolve(JSON.parse(body)); } catch (e) {}
      
      // Fallback: try URL-encoded
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
  // SendGrid sends POST with multipart form data
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
    // Parse SendGrid's multipart/form-data POST
    const fields = await parseMultipart(req);
    
    console.log('📧 Inbound Parse received. Fields:', Object.keys(fields).join(', '));

    const {
      from: senderRaw,
      to,
      subject,
      text,
      html,
      sender_ip,
      envelope: envelopeRaw,
    } = fields;

    // Parse sender email from "Name <email@example.com>" format
    const senderMatch = (senderRaw || '').match(/<([^>]+)>/) || [null, senderRaw];
    const senderEmail = (senderMatch[1] || senderRaw || '').trim().toLowerCase();
    const senderName = (senderRaw || '').replace(/<[^>]+>/, '').trim() || senderEmail;

    // Skip auto-replies, bounces, and noreply addresses
    const skipPatterns = ['noreply', 'no-reply', 'mailer-daemon', 'postmaster', 'bounce', 'auto-reply', 'autoreply'];
    if (skipPatterns.some(p => senderEmail.includes(p))) {
      console.log(`Skipping auto-reply from ${senderEmail}`);
      return res.status(200).json({ skipped: true, reason: 'auto-reply' });
    }

    // Skip emails from ourselves
    if (senderEmail.includes('engwx.com')) {
      console.log(`Skipping internal email from ${senderEmail}`);
      return res.status(200).json({ skipped: true, reason: 'internal' });
    }

    const emailBody = text || (html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');
    const emailSubject = subject || '(no subject)';

    console.log(`📧 Inbound email from ${senderEmail}: ${emailSubject}`);

    // ── Log to Supabase ──
    let emailLogId = null;
    try {
      const { data: logEntry } = await supabase.from('inbound_emails').insert({
        sender_email: senderEmail,
        sender_name: senderName,
        subject: emailSubject,
        body: emailBody.substring(0, 10000), // Limit stored body
        received_at: new Date().toISOString(),
        status: 'processing',
      }).select().single();
      emailLogId = logEntry?.id;
    } catch (logErr) {
      // Table might not exist yet — continue without logging
      console.log('Email log skipped (table may not exist):', logErr.message);
    }

    // ── Wire into Live Inbox: Create contact, conversation, and messages ──
    // Find the My Business tenant (EngageWorx's own tenant)
    let tenantId = null;
    let contactId = null;
    let conversationId = null;
    try {
      // Get My Business tenant
      const { data: tenants, error: tenantErr } = await supabase.from('tenants').select('id, name').limit(10);
      console.log('📋 Tenants found:', JSON.stringify(tenants?.map(t => ({ id: t.id, name: t.name }))));
      if (tenantErr) console.log('📋 Tenant error:', tenantErr.message);
      
      // Find tenant named "My Business" or use first available tenant
      // Try to match tenant by recipient email address via channel_configs
let matchedTenant = null;
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
        matchedTenant = cfg.tenant_id;
        break;
      }
    }
  }
} catch (e) { console.log('Tenant match error:', e.message); }

// Fall back to EngageWorx SP tenant
const EW_SP_TENANT_ID = 'c1bc59a8-5235-4921-9755-02514b574387';
tenantId = matchedTenant || EW_SP_TENANT_ID;
console.log('📋 Matched tenant:', tenantId, matchedTenant ? '(by email)' : '(default SP)');
      console.log('📋 Using tenant:', tenantId);

      // Load email channel config for AI customization
      var emailChannelConfig = {};
      try {
        var ecResult = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', tenantId).eq('channel', 'email').single();
        if (ecResult.data && ecResult.data.config_encrypted) emailChannelConfig = ecResult.data.config_encrypted;
      } catch (e) { /* use defaults */ }

      if (tenantId) {
        // Find or create contact
        const { data: existingContact, error: contactErr } = await supabase.from('contacts').select('id').eq('email', senderEmail).eq('tenant_id', tenantId).limit(1);
        if (contactErr) console.log('📋 Contact lookup error:', contactErr.message);
        
        if (existingContact?.length > 0) {
          contactId = existingContact[0].id;
          console.log('📋 Existing contact found:', contactId);
        } else {
          const nameParts = senderName.split(' ');
          const { data: newContact, error: newContactErr } = await supabase.from('contacts').insert({
            tenant_id: tenantId,
            first_name: nameParts[0] || senderName,
            last_name: nameParts.slice(1).join(' ') || '',
            email: senderEmail,
            status: 'active',
          }).select().single();
          if (newContactErr) console.log('📋 Contact create error:', newContactErr.message);
          contactId = newContact?.id;
          console.log('📋 New contact created:', contactId);
        }

        // Find existing conversation or create new one
        const { data: existingConv, error: convErr } = await supabase.from('conversations').select('id').eq('contact_id', contactId).eq('channel', 'email').eq('tenant_id', tenantId).limit(1);
        if (convErr) console.log('📋 Conversation lookup error:', convErr.message);
        
        if (existingConv?.length > 0) {
          conversationId = existingConv[0].id;
          const { error: updateErr } = await supabase.from('conversations').update({
            last_message_at: new Date().toISOString(),
            status: 'active',
            unread_count: 1,
          }).eq('id', conversationId);
          if (updateErr) console.log('📋 Conversation update error:', updateErr.message);
          console.log('📋 Existing conversation updated:', conversationId);
        } else {
          const { data: newConv, error: newConvErr } = await supabase.from('conversations').insert({
            tenant_id: tenantId,
            contact_id: contactId,
            channel: 'email',
            subject: emailSubject,
            status: 'active',
            last_message_at: new Date().toISOString(),
            unread_count: 1,
          }).select().single();
          if (newConvErr) console.log('📋 Conversation create error:', newConvErr.message);
          conversationId = newConv?.id;
          console.log('📋 New conversation created:', conversationId);
        }

        // Insert inbound message
        if (conversationId) {
          const { error: msgErr } = await supabase.from('messages').insert({
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
          if (msgErr) console.log('📋 Message insert error:', msgErr.message);
          else console.log('📋 Inbound message saved');
        }
      }
      console.log(`📋 Live Inbox wired: tenant=${tenantId}, contact=${contactId}, conversation=${conversationId}`);
    } catch (inboxErr) {
      console.log('Live Inbox wiring skipped:', inboxErr.message);
    }

    // ── Classify intent and generate response with Claude ──
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
        system: `You are the AI email assistant. You handle incoming emails professionally and helpfully.

` + (emailChannelConfig.ai_business_info ? ('Business information:\n' + emailChannelConfig.ai_business_info) : `Key facts about EngageWorx:
- AI-powered CPaaS platform: SMS, RCS, WhatsApp, Email, Voice
- White-label multi-tenant architecture for service providers and direct businesses
- Built-in AI chatbot with 90%+ resolution rate (powered by Claude)
- Visual flow builder, campaign management, real-time analytics
- Voice IVR system with voicemail and transcription
- Plans: Starter $99/mo, Growth $249/mo, Pro $499/mo, Enterprise custom
- Self-service: go live in under 5 minutes
- No platform fee — transparent pricing
- Contact: +1 (786) 982-7800, hello@engwx.com, www.engwx.com`) + `

Your job:
1. Classify the intent (sales_inquiry, partnership, support, demo_request, pricing, spam, other)
2. Write a warm, professional, concise reply (3-5 sentences max)
3. For sales/demo/partnership inquiries: express interest, highlight relevant features, offer to schedule a call
4. For support: acknowledge and offer help
5. For spam or irrelevant: do not reply (set intent to "spam")
6. Always sign off as "The EngageWorx Team"
7. Never make up features that don't exist
8. Do not use markdown formatting in the email body
9. NEVER share login credentials, passwords, portal URLs, or account access details
10. NEVER offer or promise trial accounts, sandbox access, or free portal access
11. For demo requests: direct them to the interactive demo at www.engwx.com/demo or offer to schedule a live walkthrough call
12. For trial/access requests: let them know a team member will follow up personally to discuss their needs
13. Do not share internal information about the platform architecture or infrastructure

Respond ONLY with valid JSON (no markdown backticks):
{
  "intent": "sales_inquiry|partnership|support|demo_request|pricing|spam|other",
  "sentiment": "positive|neutral|negative",
  "should_reply": true|false,
  "reply_subject": "Re: <original subject>",
  "reply_body": "Your reply text here",
  "notify_rob": true|false,
  "summary": "One-line summary for internal tracking"
}`,
        messages: [{
          role: 'user',
          content: `New email received:
From: ${senderName} <${senderEmail}>
Subject: ${emailSubject}
Body: ${emailBody.substring(0, 3000)}`
        }],
      }),
    });

    const aiData = await aiResponse.json();
    const aiText = aiData.content?.find(c => c.type === 'text')?.text || '{}';
    
    // Parse AI response (strip any backticks just in case)
    let parsed;
    try {
      const cleaned = aiText.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('AI response parse error:', parseErr.message, aiText);
      parsed = {
        intent: 'other',
        sentiment: 'neutral',
        should_reply: true,
        reply_subject: `Re: ${emailSubject}`,
        reply_body: `Thank you for reaching out to EngageWorx. We've received your message and our team will get back to you shortly.\n\nIn the meantime, feel free to call us at +1 (786) 982-7800 or visit www.engwx.com.\n\nBest regards,\nThe EngageWorx Team`,
        notify_rob: true,
        summary: 'Failed to parse AI response — sent generic reply',
      };
    }

    // ── Send auto-reply via Resend (if should_reply) ──
    let replyResult = null;

    // ── Usage check before AI email reply ──
    var emailAllowed = true;
    try {
      // Look up tenant by the To address or default to My Business
      var { data: ewTenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', 'my-business')
        .single();
      var emailTenantId = ewTenant ? ewTenant.id : null;

      if (emailTenantId) {
        var emailUsageResult = await supabase.rpc('increment_usage', {
          p_tenant_id: emailTenantId,
          p_channel: 'email',
          p_count: 1,
        });
        if (emailUsageResult.data && !emailUsageResult.data.allowed) {
          emailAllowed = false;
          console.log('[Usage] Email reply blocked - tenant at limit');
        }
      }
    } catch (ue) {
      console.log('[Usage] Email check failed, allowing reply (fail-open)');
    }

    if (parsed.should_reply && emailAllowed) {
      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="padding: 24px;">
            ${parsed.reply_body.split('\n').map(line => `<p style="color: #1a1a2e; font-size: 15px; line-height: 1.7; margin: 0 0 12px;">${line}</p>`).join('')}
          </div>
          <div style="border-top: 1px solid #e5e7eb; padding: 16px 24px; margin-top: 8px;">
            <p style="margin: 0; font-size: 13px; color: #6b7280;">
              <strong style="color: #1a1a2e;">EngageWorx</strong> — AI-Powered Customer Communications<br/>
              <a href="https://www.engwx.com" style="color: #00C9FF; text-decoration: none;">www.engwx.com</a> · 
              <a href="tel:+17869827800" style="color: #00C9FF; text-decoration: none;">+1 (786) 982-7800</a>
            </p>
          </div>
        </div>
      `;

      try {
        // Usage check before sending AI email reply
        var emailAllowed = true;
        if (tenantId) {
          try {
            var usageResult = await supabase.rpc('increment_usage', {
              p_tenant_id: tenantId,
              p_channel: 'email',
              p_count: 1,
            });
            if (usageResult.data && !usageResult.data.allowed) {
              emailAllowed = false;
              console.log('[Usage] AI email reply blocked — tenant at limit:', tenantId);
            }
          } catch (ue) {
            // Fail open
            console.error('[Usage] Email check failed, allowing:', ue.message);
          }
        }

        if (!emailAllowed) {
          console.log('📧 Email reply blocked by usage limit. Message saved to inbox for manual follow-up.');
          // Still forward to Rob so it doesn't get lost
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'EngageWorx <hello@engwx.com>',
              to: ['rob@engwx.com'],
              subject: '[USAGE LIMIT] Re: ' + emailSubject,
              html: '<p><strong>AI auto-reply blocked — usage limit reached.</strong></p><p>From: ' + senderEmail + '</p><p>Subject: ' + emailSubject + '</p><p>Please reply manually.</p>',
            }),
          });
          return res.status(200).json({ received: true, reply_sent: false, reason: 'usage_limit' });
        }

        const sendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'EngageWorx <hello@engwx.com>',
            to: [senderEmail],
            subject: parsed.reply_subject || `Re: ${emailSubject}`,
            html: emailHtml,
            reply_to: 'hello@engwx.com',
          }),
        });
        replyResult = await sendResponse.json();
        console.log(`✉️ Auto-reply sent to ${senderEmail}: ${parsed.reply_subject}`);

        // Log AI reply as outbound message in Live Inbox
        if (conversationId && tenantId) {
          try {
            await supabase.from('messages').insert({
              tenant_id: tenantId,
              conversation_id: conversationId,
              contact_id: contactId,
              channel: 'email',
              direction: 'outbound',
              sender_type: 'ai',
              body: parsed.reply_body,
              status: 'delivered',
              created_at: new Date().toISOString(),
            });
            await supabase.from('conversations').update({
              last_message_at: new Date().toISOString(),
              status: 'waiting',
              unread_count: 0,
            }).eq('id', conversationId);
          } catch (replyLogErr) {
            console.log('Reply log skipped:', replyLogErr.message);
          }
        }
      } catch (sendErr) {
        console.error('Resend error:', sendErr);
      }
    }

    // ── Notify Rob for important inquiries ──
    if (parsed.notify_rob) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'EngageWorx AI <notifications@engwx.com>',
            to: ['rob@engwx.com'],
            subject: `📧 [${parsed.intent}] ${emailSubject} — from ${senderName}`,
            html: `
              <div style="font-family: -apple-system, sans-serif; max-width: 600px;">
                <div style="background: #0d1117; color: #e8f4fd; border-radius: 12px; padding: 24px; margin-bottom: 16px;">
                  <h2 style="margin: 0 0 12px; font-size: 18px; color: #00C9FF;">New Inquiry — ${parsed.intent.replace('_', ' ').toUpperCase()}</h2>
                  <table style="width: 100%; font-size: 14px;">
                    <tr><td style="color: #6b8bae; padding: 4px 0;">From</td><td style="color: #e8f4fd;">${senderName} &lt;${senderEmail}&gt;</td></tr>
                    <tr><td style="color: #6b8bae; padding: 4px 0;">Subject</td><td style="color: #e8f4fd;">${emailSubject}</td></tr>
                    <tr><td style="color: #6b8bae; padding: 4px 0;">Intent</td><td style="color: #00C9FF; font-weight: 700;">${parsed.intent}</td></tr>
                    <tr><td style="color: #6b8bae; padding: 4px 0;">Sentiment</td><td style="color: #e8f4fd;">${parsed.sentiment}</td></tr>
                    <tr><td style="color: #6b8bae; padding: 4px 0;">AI Summary</td><td style="color: #e8f4fd;">${parsed.summary}</td></tr>
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
                </div>` : '<p style="color: #dc2626; font-size: 13px;">No auto-reply sent (classified as spam or not applicable).</p>'}
                <p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">Reply directly to ${senderEmail} to continue the conversation.</p>
              </div>
            `,
            reply_to: senderEmail,
          }),
        });
        console.log(`🔔 Rob notified about ${parsed.intent} from ${senderEmail}`);
      } catch (notifyErr) {
        console.error('Rob notification error:', notifyErr);
      }
    }

    // ── Update Supabase log ──
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
      notified_rob: parsed.notify_rob,
    });

  } catch (err) {
    console.error('Inbound email error:', err);
    return res.status(500).json({ error: err.message });
  }
};
