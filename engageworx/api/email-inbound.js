var anthropicSdk = require('@anthropic-ai/sdk');
var Anthropic = anthropicSdk.default || anthropicSdk;
var sgMail = require('@sendgrid/mail');
var { createClient } = require('@supabase/supabase-js');

var supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

var anthropic = new Anthropic({ apiKey: process.env.REACT_APP_ANTHROPIC_API_KEY });
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

var EW_TENANT_ID = 'c1bc59a8-5235-4921-9755-02514b574387'; // EngageWorx SP tenant

var EW_EMAIL_SYSTEM_PROMPT = `You are the AI assistant for EngageWorx, an AI-powered omnichannel customer communications platform. You handle inbound sales and support enquiries sent to hello@engwx.com.

ABOUT ENGAGEWORX:
- Platform: SMS, WhatsApp, Email, Voice, and RCS — all in one portal at portal.engwx.com
- Pricing: Starter $99/mo (1 number, 1,000 SMS), Growth $249/mo (3 numbers, 5,000 SMS), Pro $499/mo (10 numbers, 20,000 SMS, white-label, API). Enterprise: custom.
- SMS overage: $0.025/message. No platform fee — a key differentiator vs competitors.
- Built-in AI chatbot powered by Claude (Anthropic)
- Multi-tenant white-label architecture — businesses use it directly OR resell it to their own customers (CSP model)
- Target customers: restaurants, healthcare, retail, professional services, e-commerce, and service providers (CSPs/MSPs/telcos)
- Live at portal.engwx.com — free to try, no credit card required to start

YOUR ROLE:
- Reply professionally and helpfully to inbound enquiries
- Answer questions about pricing, features, channels, and setup
- Encourage prospects to sign up at portal.engwx.com or book a demo at calendly.com/rob-engwx/30min
- For complex technical questions, reassure them and offer a demo call
- For partnership or reseller enquiries, highlight the white-label CSP model
- Keep replies concise — 3-5 sentences or short paragraphs, never a wall of text
- Never mention Twilio, SendGrid, Supabase, Vercel, or any infrastructure provider
- Always be warm, professional, and founder-led in tone — this is a growing startup, not a faceless corporation
- Sign off as: EngageWorx Team (the human founder Rob reviews all replies)

TONE: Warm, confident, direct. Short sentences. No buzzwords like "game-changer" or "revolutionary".`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    console.log('email-inbound received:', typeof req.body, Object.keys(req.body || {}));

    var body = req.body || {};

    // SendGrid sends multipart/form-data — parse it manually if body is empty
    if (!body || Object.keys(body).length === 0) {
      var rawBody = await new Promise(function(resolve) {
        var chunks = [];
        req.on('data', function(chunk) { chunks.push(chunk); });
        req.on('end', function() { resolve(Buffer.concat(chunks).toString()); });
      });
      console.log('raw body length:', rawBody.length, 'content-type:', req.headers['content-type']);

      var contentType = req.headers['content-type'] || '';
      var boundary = contentType.split('boundary=')[1];
      if (boundary) {
        boundary = boundary.split(';')[0].trim();
        var parts = rawBody.split('--' + boundary);
        body = {};
        parts.forEach(function(part) {
          var match = part.match(/Content-Disposition: form-data; name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n$/);
          if (match) { body[match[1]] = match[2]; }
        });
        console.log('parsed body keys:', Object.keys(body));
      }
    }

    // SendGrid Inbound Parse fields
    var from        = body.from || '';
    var subject     = body.subject || '(no subject)';
    var text        = body.text || '';
    var html        = body.html || '';
    var senderName  = (from.match(/^([^<]+)</) || [])[1]?.trim() || '';
    var senderEmail = (from.match(/<([^>]+)>/) || [])[1] || from.trim();

    // Skip bounces, auto-replies, or mail from ourselves
    var skipPatterns = ['mailer-daemon', 'postmaster', 'no-reply', 'noreply', 'engwx.com'];
    if (skipPatterns.some(function(p) { return senderEmail.toLowerCase().includes(p); })) {
      console.log('Skipping auto/bounce email from:', senderEmail);
      return res.status(200).json({ skipped: true });
    }

    // Use plain text, fall back to stripping HTML
    var emailBody = text || html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (emailBody.length > 2000) emailBody = emailBody.substring(0, 2000) + '...';

    console.log('Processing email from:', senderEmail, 'subject:', subject);

    // ── Generate AI reply ─────────────────────────────────────────────────────
    var response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: EW_EMAIL_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: 'Inbound email from: ' + (senderName || senderEmail) + '\nSubject: ' + subject + '\n\nMessage:\n' + emailBody
      }]
    });

    var aiReply = response.content[0].text.trim();
    var replySubject = subject.startsWith('Re:') ? subject : 'Re: ' + subject;

    var htmlReply = aiReply
      .split('\n\n')
      .map(function(p) {
        return '<p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6;">' +
          p.replace(/\n/g, '<br>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') + '</p>';
      })
      .join('') +
      '<br><table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,sans-serif;font-size:13px;color:#555;">' +
      '<tr><td style="padding-right:16px;vertical-align:top;">' +
      '<div style="background:linear-gradient(135deg,#6B46C1,#3B82F6);color:white;font-weight:bold;font-size:15px;padding:8px 12px;border-radius:6px;letter-spacing:0.5px;">EW</div>' +
      '</td><td style="vertical-align:top;">' +
      '<div style="font-weight:bold;color:#222;font-size:14px;">EngageWorx Team</div>' +
      '<div style="color:#777;font-size:12px;margin-top:2px;">SMS · WhatsApp · Email · Voice · RCS</div>' +
      '<div style="margin-top:4px;">' +
      '📞 <a href="tel:+17869827800" style="color:#6B46C1;text-decoration:none;">+1 (786) 982-7800</a> &nbsp;|&nbsp;' +
      '🌐 <a href="https://engwx.com" style="color:#6B46C1;text-decoration:none;">engwx.com</a> &nbsp;|&nbsp;' +
      '📅 <a href="https://calendly.com/rob-engwx/30min" style="color:#6B46C1;text-decoration:none;">Book a demo</a>' +
      '</div></td></tr></table>';

    // ── Send reply ────────────────────────────────────────────────────────────
    await sgMail.send({
      to: senderEmail,
      from: { email: 'hello@engwx.com', name: 'EngageWorx' },
      replyTo: 'hello@engwx.com',
      subject: replySubject,
      text: aiReply + '\n\n--\nEngageWorx Team\n+1 (786) 982-7800\nengwx.com\nBook a demo: calendly.com/rob-engwx/30min',
      html: htmlReply,
    });
    console.log('✅ AI reply sent to:', senderEmail);

   // ── Wire into Live Inbox ──────────────────────────────────────────────────
    try {
      console.log('🔵 Inbox block started');
      // 1. Find or create contact
      var contactId = null;
      var nameParts = (senderName || '').split(' ');
      var firstName = nameParts[0] || senderEmail.split('@')[0];
      var lastName = nameParts.slice(1).join(' ') || '';

      var existingContactsResult = await supabase
        .from('contacts')
        .select('id')
        .eq('email', senderEmail)
        .eq('tenant_id', EW_TENANT_ID)
        .limit(1);
      var existingContacts = existingContactsResult.data;

      if (existingContacts && existingContacts.length > 0) {
        contactId = existingContacts[0].id;
      } else {
        var newContactResult = await supabase
          .from('contacts')
          .insert({
            tenant_id: EW_TENANT_ID,
            first_name: firstName,
            last_name: lastName,
            email: senderEmail,
            status: 'active',
          })
          .select()
          .single();
        contactId = newContactResult.data ? newContactResult.data.id : null;
      }
      console.log('📋 Contact id:', contactId);

      var conversationId = null;
      if (contactId) {
        var existingConvsResult = await supabase
          .from('conversations')
          .select('id')
          .eq('contact_id', contactId)
          .eq('tenant_id', EW_TENANT_ID)
          .eq('channel', 'email')
          .in('status', ['active', 'waiting'])
          .limit(1);
        var existingConvs = existingConvsResult.data;

        if (existingConvs && existingConvs.length > 0) {
          conversationId = existingConvs[0].id;
        } else {
          var newConvResult = await supabase
            .from('conversations')
            .insert({
              tenant_id: EW_TENANT_ID,
              contact_id: contactId,
              channel: 'email',
              status: 'waiting',
              subject: subject,
              last_message_at: new Date().toISOString(),
              unread_count: 1,
            })
            .select()
            .single();
          conversationId = newConvResult.data ? newConvResult.data.id : null;
        }
      }
      console.log('💬 Conversation id:', conversationId);

      if (conversationId) {
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          tenant_id: EW_TENANT_ID,
          direction: 'inbound',
          channel: 'email',
          from_address: senderEmail,
          to_address: 'hello@engwx.com',
          subject: subject,
          body: emailBody,
          status: 'delivered',
          metadata: { sender_name: senderName },
        });

        await supabase.from('messages').insert({
          conversation_id: conversationId,
          tenant_id: EW_TENANT_ID,
          direction: 'outbound',
          channel: 'email',
          from_address: 'hello@engwx.com',
          to_address: senderEmail,
          subject: replySubject,
          body: aiReply,
          status: 'sent',
          metadata: { ai_generated: true },
        });

        await supabase
          .from('conversations')
          .update({
            last_message_at: new Date().toISOString(),
            status: 'waiting',
            unread_count: 1,
          })
          .eq('id', conversationId);

        console.log('✅ Live Inbox updated — conversation:', conversationId);
      }
    } catch (inboxErr) {
      console.error('🔴 Live Inbox error:', inboxErr.message, inboxErr.stack);
    }
    console.log('🟢 Past inbox block, entering leads block');
    console.log('🔵 Starting leads block for:', senderEmail);
try {
  // Skip if already in pipeline
  var { data: existingLead } = await supabase
    .from('leads')
    .select('id')
    .eq('email', senderEmail)
    .limit(1);

  if (!existingLead || existingLead.length === 0) {
    // Ask AI to extract company name and intent from the email
    var summaryRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: 'Extract structured data from this inbound email. Respond ONLY with a JSON object, no markdown. Fields: company (string, guess from email domain if not mentioned), intent (one of: pricing, demo, partnership, support, general), urgency (one of: high, normal, low).',
      messages: [{ role: 'user', content: 'From: ' + (senderName || senderEmail) + '\nSubject: ' + subject + '\n\n' + emailBody }]
    });
    var extracted = { company: '', intent: 'general', urgency: 'normal' };
    try {
      var raw = summaryRes.content[0].text.replace(/```json|```/g, '').trim();
      extracted = JSON.parse(raw);
    } catch (e) { /* use defaults */ }

    // Derive company from email domain if AI didn't find one
    var company = extracted.company || senderEmail.split('@')[1]?.split('.')[0] || '';
    company = company.charAt(0).toUpperCase() + company.slice(1);

    await supabase.from('leads').insert({
      name: senderName || senderEmail,
      email: senderEmail,
      company: company,
      source: 'inbound_email',
      stage: 'inquiry',
      type: extracted.intent === 'partnership' ? 'partner' : 'prospect',
      urgency: extracted.urgency || 'normal',
      message: emailBody.substring(0, 500),
      notes: 'Auto-created from inbound email. Subject: ' + subject,
      ai_summary: 'Inbound enquiry via hello@engwx.com. Intent: ' + (extracted.intent || 'general'),
      ai_next_action: 'Review AI reply and follow up if needed.',
      last_action_at: new Date().toISOString().split('T')[0],
    });
    console.log('Lead auto-created for:', senderEmail, 'company:', company);

    // ── Auto-create Help Desk ticket for support/billing intents ─────────────
    var ticketIntents = ['support', 'billing'];
    if (ticketIntents.indexOf(extracted.intent) !== -1) {
      try {
        var ticketPriority = extracted.intent === 'billing' ? 'high' : (extracted.urgency === 'high' ? 'high' : 'normal');
        var ticketResult = await supabase.from('support_tickets').insert({
          tenant_id: EW_TENANT_ID,
          submitter_type: 'external',
          submitter_name: senderName || senderEmail,
          submitter_email: senderEmail,
          subject: subject,
          description: emailBody.substring(0, 1000),
          channel: 'email',
          category: extracted.intent,
          priority: ticketPriority,
          status: 'open',
          metadata: { source: 'inbound_email', ai_intent: extracted.intent }
        }).select().single();

        if (ticketResult.data) {
          await supabase.from('ticket_messages').insert({
            ticket_id: ticketResult.data.id,
            role: 'user',
            author_name: senderName || senderEmail,
            author_type: 'external',
            content: emailBody.substring(0, 1000),
          });
          console.log('✅ Support ticket auto-created:', ticketResult.data.ticket_number, 'intent:', extracted.intent);

          // Auto-escalate billing tickets
          if (extracted.intent === 'billing') {
            await supabase.from('support_tickets').update({
              status: 'escalated',
              escalation_reason: 'Billing enquiry via email — auto-escalated',
              escalation_trigger: 'ai_decision',
            }).eq('id', ticketResult.data.id);
            console.log('🚨 Billing ticket auto-escalated');
          }
        }
      } catch (ticketErr) {
        console.log('Support ticket auto-create failed (non-fatal):', ticketErr.message);
      }
    }
  } else {
    console.log('Lead already exists for:', senderEmail, '— skipping');
  }
} catch (leadErr) {
  console.error('Lead auto-create failed:', leadErr.message, JSON.stringify(leadErr));
}
    supabase.from('email_ai_log').insert({
      from_email: senderEmail,
      from_name: senderName,
      subject: subject,
      body_preview: emailBody.substring(0, 300),
      ai_reply_preview: aiReply.substring(0, 300),
      sent_at: new Date().toISOString()
    }).then(function() {}).catch(function(e) {
      console.log('Log insert skipped:', e.message);
    });

    return res.status(200).json({ success: true, replied_to: senderEmail });

  } catch (err) {
    console.error('email-inbound error:', err.message, err.stack);
    return res.status(200).json({ error: err.message });
  }
};
