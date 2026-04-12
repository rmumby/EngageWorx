// /api/email-inbound.js — Inbound email handler via SendGrid Inbound Parse
var sgMail = require('@sendgrid/mail');
var { createClient } = require('@supabase/supabase-js');

var supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

var EW_TENANT_ID = 'c1bc59a8-5235-4921-9755-02514b574387';

async function pauseSequencesForContact(email) {
  try {
    if (!email) return;
    var leads = await supabase.from('leads').select('id').eq('email', email).limit(10);
    if (!leads.data || leads.data.length === 0) return;
    var ids = leads.data.map(function(l) { return l.id; });
    var r = await supabase.from('lead_sequences').update({ status: 'paused' }).in('lead_id', ids).eq('status', 'active');
    if (r.count > 0) console.log('[Sequences] Paused', r.count, 'enrollment(s) — email reply from', email);
  } catch (e) { console.error('[Sequences] Pause error:', e.message); }
}

async function reactivateArchivedLeadsForContact(email) {
  try {
    if (!email) return 0;
    var r = await supabase.from('leads').select('id, name, tenant_id, notes, reactivated_at').eq('email', email).eq('archived', true);
    var matches = r.data || [];
    if (matches.length === 0) return 0;

    var now = new Date().toISOString();
    var today = new Date().toISOString().split('T')[0];
    var dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    var notifyEligible = [];

    for (var l of matches) {
      var recentlyReactivated = l.reactivated_at && new Date(l.reactivated_at).getTime() > dayAgo;
      if (!recentlyReactivated) notifyEligible.push(l);
      var reactNote = (l.notes || '') + '\n[Auto-reactivated ' + today + ': inbound email received]';
      await supabase.from('leads').update({ archived: false, stage: 'inquiry', urgency: 'Hot', reactivated_at: now, last_activity_at: now, last_action_at: today, notes: reactNote }).eq('id', l.id);
      try {
        var seq = await supabase.from('sequences').select('id').eq('tenant_id', l.tenant_id).ilike('name', '%new lead%general outreach%').limit(1);
        if (!seq.data || seq.data.length === 0) seq = await supabase.from('sequences').select('id').eq('tenant_id', l.tenant_id).ilike('name', '%general outreach%').limit(1);
        if (!seq.data || seq.data.length === 0) seq = await supabase.from('sequences').select('id').eq('tenant_id', l.tenant_id).ilike('name', '%new lead%').limit(1);
        if (seq.data && seq.data.length > 0) {
          var sid = seq.data[0].id;
          var fs = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', sid).eq('step_number', 1).single();
          var start = new Date(); if (fs.data && fs.data.delay_days > 0) start.setDate(start.getDate() + fs.data.delay_days);
          await supabase.from('lead_sequences').upsert({
            tenant_id: l.tenant_id, lead_id: l.id, sequence_id: sid,
            current_step: 0, status: 'active', enrolled_at: now, next_step_at: start.toISOString(),
          }, { onConflict: 'lead_id,sequence_id' });
        }
      } catch (seqErr) {}
    }

    if (notifyEligible.length > 0) {
      try {
        if (process.env.SENDGRID_API_KEY) {
          await sgMail.send({
            to: 'rob@engwx.com',
            from: { email: 'notifications@engwx.com', name: 'EngageWorx' },
            subject: '🔄 Lead Reactivated: ' + notifyEligible.map(function(x) { return x.name; }).join(', '),
            html: '<h3>Archived Lead Reactivated (email inbound)</h3>' +
              notifyEligible.map(function(x) { return '<p><b>' + x.name + '</b> — id: <code>' + x.id + '</code></p>'; }).join('') +
              '<p>Flipped <code>archived=true</code> → <code>false</code>. Enrolled in New Lead — General Outreach sequence.</p>',
          });
        }
      } catch (nErr) {}
    } else {
      console.log('[Reactivate] Skipped notification — all', matches.length, 'lead(s) reactivated within the last 24h');
    }

    console.log('[Reactivate] Reactivated', matches.length, 'archived lead(s) via email reply from', email);
    return matches.length;
  } catch (err) { console.error('[Reactivate] Error:', err.message); return 0; }
}

async function notifyInboundSendGrid(contactName, channel, preview) {
  try {
    if (!process.env.SENDGRID_API_KEY) return;
    await sgMail.send({
      to: 'rob@engwx.com',
      from: { email: 'notifications@engwx.com', name: 'EngageWorx' },
      subject: 'New ' + channel + ' from ' + (contactName || 'Unknown'),
      html: '<h3>Inbound ' + channel + ' Message</h3><p><b>Contact:</b> ' + (contactName || 'Unknown') + '</p><p><b>Channel:</b> ' + channel + '</p><p><b>Preview:</b> ' + (preview || '').substring(0, 300) + '</p><p><a href="https://portal.engwx.com">Open Live Inbox →</a></p>',
    });
  } catch (e) { console.error('[Notify] SendGrid error:', e.message); }
}

var EW_EMAIL_SYSTEM_PROMPT = 'You are the AI assistant for EngageWorx, an AI-powered omnichannel customer communications platform. You handle inbound sales and support enquiries sent to hello@engwx.com.\n\nABOUT ENGAGEWORX:\n- Platform: SMS, WhatsApp, Email, Voice, and RCS — all in one portal at portal.engwx.com\n- Pricing: Starter $99/mo, Growth $249/mo, Pro $499/mo. Enterprise: custom.\n- No platform fee — a key differentiator vs competitors like GoHighLevel\n- Built-in AI chatbot powered by Claude (Anthropic)\n- Multi-tenant white-label architecture — businesses use it directly OR resell it (CSP model)\n- Live at portal.engwx.com\n\nYOUR ROLE:\n- Reply professionally and helpfully to inbound enquiries\n- Answer questions about pricing, features, channels, and setup\n- Encourage prospects to sign up at portal.engwx.com or book a demo at calendly.com/rob-engwx/30min\n- For partnership or reseller enquiries, highlight the white-label CSP model\n- Keep replies concise — 3-5 sentences or short paragraphs, never a wall of text\n- Never mention Twilio, SendGrid, Supabase, Vercel, or any infrastructure provider\n- Sign off as: EngageWorx Team\n\nTONE: Warm, confident, direct. Short sentences. No buzzwords.';

async function getAIReply(message) {
  var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) throw new Error('No Anthropic API key');
  var response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: EW_EMAIL_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: message }],
    }),
  });
  if (!response.ok) {
    var err = await response.json();
    throw new Error('Claude error: ' + JSON.stringify(err));
  }
  var data = await response.json();
  return data.content && data.content[0] && data.content[0].text
    ? data.content[0].text.trim()
    : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    console.log('email-inbound received:', typeof req.body, Object.keys(req.body || {}));

    var body = req.body || {};

    // SendGrid sends multipart/form-data — parse manually if body is empty
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

    var from        = body.from || '';
    var subject     = body.subject || '(no subject)';
    var text        = body.text || '';
    var html        = body.html || '';
    var senderName  = (from.match(/^([^<]+)</) || [])[1];
    senderName = senderName ? senderName.trim() : '';
    var senderEmail = (from.match(/<([^>]+)>/) || [])[1] || from.trim();

    // Skip bounces, auto-replies, or mail from ourselves
    var skipPatterns = ['mailer-daemon', 'postmaster', 'no-reply', 'noreply', 'engwx.com'];
    if (skipPatterns.some(function(p) { return senderEmail.toLowerCase().includes(p); })) {
      console.log('Skipping auto/bounce email from:', senderEmail);
      return res.status(200).json({ skipped: true });
    }

    var emailBody = text || html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (emailBody.length > 2000) emailBody = emailBody.substring(0, 2000) + '...';

    console.log('Processing email from:', senderEmail, 'subject:', subject);

    // ── Generate AI reply ────────────────────────────────────────────────────
    var aiReply = null;
    try {
      aiReply = await getAIReply(
        'Inbound email from: ' + (senderName || senderEmail) + '\nSubject: ' + subject + '\n\nMessage:\n' + emailBody
      );
      console.log('✅ AI reply generated, length:', aiReply ? aiReply.length : 0);
    } catch (aiErr) {
      console.error('AI reply error:', aiErr.message);
      aiReply = 'Thank you for reaching out to EngageWorx! Our team will get back to you shortly. In the meantime, feel free to explore the platform at portal.engwx.com or book a demo at calendly.com/rob-engwx/30min.';
    }

    var replySubject = subject.startsWith('Re:') ? subject : 'Re: ' + subject;

    var htmlReply = aiReply.split('\n\n').map(function(p) {
      return '<p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6;">' +
        p.replace(/\n/g, '<br>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') + '</p>';
    }).join('') +
    '<br><table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,sans-serif;font-size:13px;color:#555;">' +
    '<tr><td style="padding-right:16px;vertical-align:top;">' +
    '<div style="background:linear-gradient(135deg,#00C9FF,#E040FB);color:white;font-weight:bold;font-size:15px;padding:8px 12px;border-radius:6px;">EW</div>' +
    '</td><td style="vertical-align:top;">' +
    '<div style="font-weight:bold;color:#222;font-size:14px;">EngageWorx Team</div>' +
    '<div style="color:#777;font-size:12px;margin-top:2px;">SMS · WhatsApp · Email · Voice · RCS</div>' +
    '<div style="margin-top:4px;">' +
    '📞 <a href="tel:+17869827800" style="color:#00C9FF;text-decoration:none;">+1 (786) 982-7800</a> &nbsp;|&nbsp;' +
    '🌐 <a href="https://engwx.com" style="color:#00C9FF;text-decoration:none;">engwx.com</a> &nbsp;|&nbsp;' +
    '📅 <a href="https://calendly.com/rob-engwx/30min" style="color:#00C9FF;text-decoration:none;">Book a demo</a>' +
    '</div></td></tr></table>';

    // ── Send reply via SendGrid ───────────────────────────────────────────────
    try {
      await sgMail.send({
        to: senderEmail,
        from: { email: 'hello@engwx.com', name: 'EngageWorx' },
        replyTo: 'hello@engwx.com',
        subject: replySubject,
        text: aiReply + '\n\n--\nEngageWorx Team\n+1 (786) 982-7800\nengwx.com\nBook a demo: calendly.com/rob-engwx/30min',
        html: htmlReply,
      });
      console.log('✅ AI reply sent to:', senderEmail);
    } catch (sgErr) {
      console.error('SendGrid error:', sgErr.message);
    }

    // ── Live Inbox ────────────────────────────────────────────────────────────
    try {
      console.log('🔵 Inbox block started');

      // 1. Find or create contact
      var contactId = null;
      var nameParts = (senderName || '').split(' ');
      var firstName = nameParts[0] || senderEmail.split('@')[0];
      var lastName = nameParts.slice(1).join(' ') || '';

      var existingContactsResult = await supabase.from('contacts').select('id').eq('email', senderEmail).eq('tenant_id', EW_TENANT_ID).limit(1);
      if (existingContactsResult.data && existingContactsResult.data.length > 0) {
        contactId = existingContactsResult.data[0].id;
      } else {
        var newContactResult = await supabase.from('contacts').insert({
          tenant_id: EW_TENANT_ID,
          first_name: firstName,
          last_name: lastName,
          email: senderEmail,
          status: 'active',
        }).select().single();
        contactId = newContactResult.data ? newContactResult.data.id : null;
      }
      console.log('📋 Contact id:', contactId);

      // 2. Find or create conversation
      var conversationId = null;
      if (contactId) {
        var existingConvsResult = await supabase.from('conversations').select('id').eq('contact_id', contactId).eq('tenant_id', EW_TENANT_ID).eq('channel', 'email').in('status', ['active', 'waiting']).limit(1);
        if (existingConvsResult.data && existingConvsResult.data.length > 0) {
          conversationId = existingConvsResult.data[0].id;
        } else {
          var newConvResult = await supabase.from('conversations').insert({
            tenant_id: EW_TENANT_ID,
            contact_id: contactId,
            channel: 'email',
            status: 'waiting',
            subject: subject,
            last_message_at: new Date().toISOString(),
            unread_count: 1,
          }).select().single();
          conversationId = newConvResult.data ? newConvResult.data.id : null;
        }
      }
      console.log('💬 Conversation id:', conversationId);

      // 3. Save messages
      if (conversationId) {
        var now = new Date().toISOString();

        // Inbound message
        var inboundInsert = await supabase.from('messages').insert({
          conversation_id: conversationId,
          tenant_id: EW_TENANT_ID,
          direction: 'inbound',
          channel: 'email',
          body: emailBody,
          status: 'delivered',
          sender_type: 'contact',
          metadata: { from: senderEmail, to: 'hello@engwx.com', subject: subject, sender_name: senderName },
          created_at: now,
        });
        if (inboundInsert.error) console.error('Inbound message insert error:', inboundInsert.error.message);

        // AI outbound reply
        var outboundInsert = await supabase.from('messages').insert({
          conversation_id: conversationId,
          tenant_id: EW_TENANT_ID,
          direction: 'outbound',
          channel: 'email',
          body: aiReply,
          status: 'sent',
          sender_type: 'bot',
          metadata: { from: 'hello@engwx.com', to: senderEmail, subject: replySubject, ai_generated: true },
          created_at: new Date(Date.now() + 1000).toISOString(),
        });
        if (outboundInsert.error) console.error('Outbound message insert error:', outboundInsert.error.message);

        // Update conversation
        await supabase.from('conversations').update({
          last_message_at: new Date().toISOString(),
          last_message_preview: emailBody.substring(0, 100),
          status: 'waiting',
          unread_count: 1,
        }).eq('id', conversationId);

        console.log('✅ Live Inbox updated — conversation:', conversationId);
      }
    } catch (inboxErr) {
      console.error('🔴 Live Inbox error:', inboxErr.message, inboxErr.stack);
    }

    // ── Halt sequences on reply ───────────────────────────────────────────────
    pauseSequencesForContact(senderEmail).catch(function() {});

    // ── Reactivate archived leads on reply ────────────────────────────────────
    reactivateArchivedLeadsForContact(senderEmail).catch(function() {});

    // ── Notify admin via SendGrid ────────────────────────────────────────────
    notifyInboundSendGrid(senderName || senderEmail, 'Email', emailBody).catch(function() {});

    // ── Pipeline lead ─────────────────────────────────────────────────────────
    try {
      var existingLeadResult = await supabase.from('leads').select('id').eq('email', senderEmail).limit(1);
      if (!existingLeadResult.data || existingLeadResult.data.length === 0) {
        var company = senderEmail.split('@')[1] ? senderEmail.split('@')[1].split('.')[0] : '';
        company = company.charAt(0).toUpperCase() + company.slice(1);
        await supabase.from('leads').insert({
          name: senderName || senderEmail,
          email: senderEmail,
          company: company,
          source: 'inbound_email',
          stage: 'inquiry',
          urgency: 'Warm',
          notes: 'Auto-created from inbound email. Subject: ' + subject,
          last_action_at: new Date().toISOString().split('T')[0],
          last_activity_at: new Date().toISOString(),
          tenant_id: EW_TENANT_ID,
        });
        console.log('Lead auto-created for:', senderEmail);
      } else {
        console.log('Lead already exists for:', senderEmail);
      }
    } catch (leadErr) {
      console.error('Lead auto-create failed:', leadErr.message);
    }

    return res.status(200).json({ success: true, replied_to: senderEmail });

  } catch (err) {
    console.error('email-inbound error:', err.message, err.stack);
    return res.status(200).json({ error: err.message });
  }
};
