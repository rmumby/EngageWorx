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
  // SendGrid sends a POST with multipart/form-data
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

  // Parse multipart form data fields
  var contentType = req.headers['content-type'] || '';
  var boundary = contentType.split('boundary=')[1];
  if (boundary) {
    boundary = boundary.split(';')[0].trim();
    var parts = rawBody.split('--' + boundary);
    body = {};
    parts.forEach(function(part) {
      var match = part.match(/Content-Disposition: form-data; name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n$/);
      if (match) {
        body[match[1]] = match[2];
      }
    });
    console.log('parsed body keys:', Object.keys(body));
  }
}

    // SendGrid Inbound Parse fields
    var from        = body.from || '';
    var to          = body.to || '';
    var subject     = body.subject || '(no subject)';
    var text        = body.text || '';
    var html        = body.html || '';
    var senderName  = from.match(/^([^<]+)</)?.[1]?.trim() || '';
    var senderEmail = from.match(/<([^>]+)>/)?.[1] || from.trim();

    // Skip if it's a bounce, auto-reply, or from ourselves
    var skipPatterns = ['mailer-daemon', 'postmaster', 'no-reply', 'noreply', 'engwx.com'];
    if (skipPatterns.some(function(p) { return senderEmail.toLowerCase().includes(p); })) {
      console.log('Skipping auto/bounce email from:', senderEmail);
      return res.status(200).json({ skipped: true });
    }

    // Use plain text, fall back to stripping HTML
    var emailBody = text || html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    // Trim to reasonable length
    if (emailBody.length > 2000) emailBody = emailBody.substring(0, 2000) + '...';

    console.log('Processing email from:', senderEmail, 'subject:', subject);

    // Generate AI reply
    var response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: EW_EMAIL_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: 'Inbound email from: ' + (senderName || senderEmail) + '\nSubject: ' + subject + '\n\nMessage:\n' + emailBody
        }
      ]
    });

    var aiReply = response.content[0].text.trim();

    // Build the reply email
    var replySubject = subject.startsWith('Re:') ? subject : 'Re: ' + subject;

    var htmlReply = aiReply
      .split('\n\n')
      .map(function(p) { return '<p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6;">' + p.replace(/\n/g, '<br>') + '</p>'; })
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

    // Send reply to original sender + CC rob@engwx.com
    await sgMail.send({
      to: senderEmail,
      from: { email: 'hello@engwx.com', name: 'EngageWorx' },
      cc: 'rob@engwx.com',
      replyTo: 'hello@engwx.com',
      subject: replySubject,
      text: aiReply + '\n\n--\nEngageWorx Team\n+1 (786) 982-7800\nengwx.com\nBook a demo: calendly.com/rob-engwx/30min',
      html: htmlReply,
    });

    console.log('AI reply sent to:', senderEmail, 'CC: rob@engwx.com');

    // Log to Supabase for audit trail (non-blocking)
    supabase.from('email_ai_log').insert({
      from_email: senderEmail,
      from_name: senderName,
      subject: subject,
      body_preview: emailBody.substring(0, 300),
      ai_reply_preview: aiReply.substring(0, 300),
      sent_at: new Date().toISOString()
    }).then(function() {}).catch(function(e) { console.log('Log insert skipped (table may not exist):', e.message); });

    return res.status(200).json({ success: true, replied_to: senderEmail });

  } catch (err) {
    console.error('email-inbound error:', err.message, err.stack);
    // Still return 200 to SendGrid so it doesn't retry
    return res.status(200).json({ error: err.message });
  }
};
