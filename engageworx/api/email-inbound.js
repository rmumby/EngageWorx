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

// ─── AI EMAIL INTELLIGENCE — match + analyze + action ────────────────────
async function resolveTenantForSender(senderEmail) {
  var sender = (senderEmail || '').toLowerCase().trim();
  if (!sender) return null;
  try {
    var c = await supabase.from('contacts').select('tenant_id').ilike('email', sender).limit(1).maybeSingle();
    if (c.data && c.data.tenant_id) return c.data.tenant_id;
  } catch(e) {}
  try {
    var l = await supabase.from('leads').select('tenant_id').ilike('email', sender).limit(1).maybeSingle();
    if (l.data && l.data.tenant_id) return l.data.tenant_id;
  } catch(e) {}
  try {
    var domain = sender.split('@')[1] || '';
    if (domain) {
      var t = await supabase.from('tenants').select('id').or('custom_domain.ilike.%' + domain + '%,website_url.ilike.%' + domain + '%').limit(1).maybeSingle();
      if (t.data) return t.data.id;
    }
  } catch(e) {}
  return null;
}

async function checkSpam(tenantId, senderEmail, subject) {
  if (!tenantId) return { spam: false };
  try {
    var t = await supabase.from('tenants').select('blocked_domains, blocked_keywords').eq('id', tenantId).maybeSingle();
    var domains = (t.data && Array.isArray(t.data.blocked_domains)) ? t.data.blocked_domains : [];
    var keywords = (t.data && Array.isArray(t.data.blocked_keywords)) ? t.data.blocked_keywords : [];
    var s = (senderEmail || '').toLowerCase();
    var subj = (subject || '').toLowerCase();
    for (var i = 0; i < domains.length; i++) {
      var d = String(domains[i] || '').toLowerCase().trim();
      if (d && s.indexOf(d) !== -1) return { spam: true, matched: 'domain:' + d };
    }
    for (var j = 0; j < keywords.length; j++) {
      var k = String(keywords[j] || '').toLowerCase().trim();
      if (k && subj.indexOf(k) !== -1) return { spam: true, matched: 'keyword:' + k };
    }
  } catch (e) { console.warn('[Spam] check error:', e.message); }
  return { spam: false };
}

async function analyzeAndActionEmail(ctx) {
  // ctx: { senderEmail, senderName, subject, body, conversationId }
  try {
    var sender = (ctx.senderEmail || '').toLowerCase().trim();
    if (!sender) return;

    // 1. Match: contact, lead, tenant
    var match = { contactId: null, leadId: null, tenantId: null, leadStage: null };
    try {
      var c = await supabase.from('contacts').select('id, tenant_id, pipeline_lead_id').ilike('email', sender).limit(1).maybeSingle();
      if (c.data) { match.contactId = c.data.id; match.tenantId = c.data.tenant_id; match.leadId = c.data.pipeline_lead_id; }
    } catch(e) {}
    try {
      if (!match.leadId) {
        var l = await supabase.from('leads').select('id, tenant_id, stage').ilike('email', sender).limit(1).maybeSingle();
        if (l.data) { match.leadId = l.data.id; match.tenantId = match.tenantId || l.data.tenant_id; match.leadStage = l.data.stage; }
      } else {
        var lr = await supabase.from('leads').select('stage').eq('id', match.leadId).maybeSingle();
        if (lr.data) match.leadStage = lr.data.stage;
      }
    } catch(e) {}
    try {
      if (!match.tenantId) {
        var domain = sender.split('@')[1] || '';
        if (domain) {
          var t = await supabase.from('tenants').select('id').or('custom_domain.ilike.%' + domain + '%,website_url.ilike.%' + domain + '%').limit(1).maybeSingle();
          if (t.data) match.tenantId = t.data.id;
        }
      }
    } catch(e) {}

    // 2. Last 3 interactions for this contact
    var history = [];
    if (match.contactId) {
      try {
        var msgs = await supabase.from('messages').select('direction, channel, body, created_at').eq('contact_id', match.contactId).order('created_at', { ascending: false }).limit(3);
        history = (msgs.data || []).reverse().map(function(m) {
          return '[' + (m.direction === 'inbound' ? 'FROM CONTACT' : 'TO CONTACT') + ' · ' + m.channel + ' · ' + (m.created_at || '').substring(0, 10) + ']\n' + (m.body || '').substring(0, 400);
        }).join('\n\n');
      } catch(e) {}
    }

    // 3. Claude analysis
    var systemPrompt = 'You are EngageWorx sales ops AI. Analyze an inbound email and decide ONE action.' +
      '\n\nPricing: Starter $99/mo, Growth $249/mo, Pro $499/mo, Enterprise custom.' +
      '\nFeatures: SMS, WhatsApp, Email, Voice, RCS, AI chatbot, CSP white-label, commissions.' +
      '\nReturn STRICT JSON: {"action": "advance_stage"|"enroll_sequence"|"review"|"auto_reply"|"no_action", "reasoning": "1-2 sentences", "summary": "body in 1 sentence", "reply_draft": "text if auto_reply else null", "new_stage": "stage id if advance_stage else null", "sequence_name": "name to enroll else null"}' +
      '\n\nStages: inquiry, demo_shared, sandbox_shared, opportunity, package_selection, go_live, customer, dormant.' +
      '\nUse auto_reply ONLY for simple factual questions answerable from pricing/features above. Everything else → review with a suggested reply_draft.';

    var prompt = 'Email from: ' + sender + (ctx.senderName ? ' (' + ctx.senderName + ')' : '') +
      '\nSubject: ' + (ctx.subject || '') +
      '\nCurrent pipeline stage: ' + (match.leadStage || 'none') +
      '\n\nBody:\n' + (ctx.body || '').substring(0, 2000) +
      (history ? '\n\n---- Recent interactions ----\n' + history : '') +
      '\n\nReturn JSON only.';

    var decision = { action: 'review', reasoning: 'Claude unavailable', summary: (ctx.body || '').substring(0, 200), reply_draft: null, new_stage: null, sequence_name: null };
    try {
      var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1000, system: systemPrompt, messages: [{ role: 'user', content: prompt }] }),
      });
      var aiData = await aiRes.json();
      var txt = (aiData.content || []).find(function(b) { return b.type === 'text'; })?.text || '';
      var m = txt.match(/\{[\s\S]*\}/);
      if (m) decision = Object.assign(decision, JSON.parse(m[0]));
    } catch (aiErr) { console.warn('[EmailAI] Claude error:', aiErr.message); }

    // 3b. If the matched tenant has a Calendly link set, append a booking CTA
    //     to any Claude-drafted reply (auto_reply or review).
    if (decision.reply_draft && match.tenantId) {
      try {
        var tInfo = await supabase.from('tenants').select('calendly_url').eq('id', match.tenantId).maybeSingle();
        var cu = tInfo.data && tInfo.data.calendly_url ? tInfo.data.calendly_url.trim() : '';
        if (cu && decision.reply_draft.indexOf(cu) === -1) {
          decision.reply_draft = decision.reply_draft.trimEnd() + '\n\nYou can book a time with me here: ' + cu;
        }
      } catch (cErr) {}
    }

    // 4. Store in email_actions
    var ins = await supabase.from('email_actions').insert({
      contact_id: match.contactId, lead_id: match.leadId, tenant_id: match.tenantId,
      email_from: sender, email_subject: ctx.subject || null,
      email_body_summary: decision.summary || (ctx.body || '').substring(0, 200),
      claude_action: decision.action || 'review',
      claude_reasoning: decision.reasoning || null,
      claude_reply_draft: decision.reply_draft || null,
      action_payload: { new_stage: decision.new_stage, sequence_name: decision.sequence_name },
      status: 'pending',
    }).select('id').single();
    var actionId = ins.data ? ins.data.id : null;

    // 5. Auto-execute if Claude chose auto_reply (email/WhatsApp only, not SMS)
    if (decision.action === 'auto_reply' && decision.reply_draft) {
      try {
        if (process.env.SENDGRID_API_KEY) {
          var replySubj = (ctx.subject || '').startsWith('Re:') ? ctx.subject : 'Re: ' + (ctx.subject || 'your message');
          await sgMail.send({
            to: sender,
            from: { email: 'hello@engwx.com', name: 'EngageWorx' },
            subject: replySubj,
            text: decision.reply_draft,
            html: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.6;white-space:pre-wrap;">' + decision.reply_draft.replace(/</g,'&lt;') + '</div>',
          });
          if (actionId) await supabase.from('email_actions').update({ status: 'actioned', actioned_at: new Date().toISOString() }).eq('id', actionId);
        }
      } catch (seErr) { console.warn('[EmailAI] Auto-reply send error:', seErr.message); }
    }

    // 6. Auto-execute stage advance if lead exists
    if (decision.action === 'advance_stage' && match.leadId && decision.new_stage) {
      try {
        await supabase.from('leads').update({ stage: decision.new_stage, last_activity_at: new Date().toISOString() }).eq('id', match.leadId);
        if (actionId) await supabase.from('email_actions').update({ status: 'actioned', actioned_at: new Date().toISOString() }).eq('id', actionId);
      } catch (stErr) { console.warn('[EmailAI] Stage advance error:', stErr.message); }
    }

    // 7. Auto-enroll sequence if Claude named one
    if (decision.action === 'enroll_sequence' && match.leadId && decision.sequence_name && match.tenantId) {
      try {
        var seq = await supabase.from('sequences').select('id').eq('tenant_id', match.tenantId).ilike('name', '%' + decision.sequence_name + '%').limit(1).maybeSingle();
        if (!seq.data) seq = await supabase.from('sequences').select('id').eq('tenant_id', 'c1bc59a8-5235-4921-9755-02514b574387').ilike('name', '%' + decision.sequence_name + '%').limit(1).maybeSingle();
        if (seq.data) {
          var fs = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', seq.data.id).eq('step_number', 1).single();
          var nextAt = new Date(Date.now() + ((fs.data && fs.data.delay_days) || 0) * 86400000).toISOString();
          await supabase.from('lead_sequences').upsert({
            tenant_id: match.tenantId, lead_id: match.leadId, sequence_id: seq.data.id,
            current_step: 0, status: 'active', enrolled_at: new Date().toISOString(), next_step_at: nextAt,
          }, { onConflict: 'lead_id,sequence_id' });
          if (actionId) await supabase.from('email_actions').update({ status: 'actioned', actioned_at: new Date().toISOString() }).eq('id', actionId);
        }
      } catch (seqErr) { console.warn('[EmailAI] Sequence enrol error:', seqErr.message); }
    }

    console.log('[EmailAI] Processed', sender, 'action:', decision.action, 'matched contact/lead/tenant:', !!match.contactId, !!match.leadId, !!match.tenantId);
  } catch (err) { console.error('[EmailAI] analyzeAndActionEmail error:', err.message); }
}

async function tryQualifyProspect(email, replyBody, channel) {
  try {
    if (!email) return 0;
    var r = await supabase.from('leads').select('id, name, phone, email, tenant_id, qualified').eq('email', email).eq('qualified', false);
    var matches = r.data || [];
    if (matches.length === 0) return 0;

    var extracted = { name: null, phone: null };
    try {
      var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 200,
          system: 'Extract sender info from prospect replies. Return STRICT JSON only: {"name": "full name" or null, "phone": "phone" or null}. No other text.',
          messages: [{ role: 'user', content: 'Reply message: ' + (replyBody || '') + '\n\nExtract the sender\'s name (if mentioned) and phone number (if mentioned). Return JSON.' }],
        }),
      });
      var aiData = await aiRes.json();
      var text = (aiData.content || []).find(function(b) { return b.type === 'text'; })?.text || '';
      var m = text.match(/\{[\s\S]*\}/); if (m) extracted = JSON.parse(m[0]);
    } catch (aiErr) {}

    var now = new Date().toISOString();
    for (var l of matches) {
      var upd = { qualified: true, stage: 'inquiry', urgency: 'Hot', prospect_stage: null, last_activity_at: now, last_action_at: new Date().toISOString().split('T')[0] };
      if (extracted.name && (!l.name || l.name === 'Unknown')) upd.name = extracted.name;
      if (extracted.phone && !l.phone) upd.phone = extracted.phone;
      await supabase.from('leads').update(upd).eq('id', l.id);
      try {
        var seqs = await supabase.from('sequences').select('id').or('tenant_id.eq.' + l.tenant_id + ',tenant_id.eq.c1bc59a8-5235-4921-9755-02514b574387').ilike('name', '%contact qualification%');
        if (seqs.data && seqs.data.length > 0) {
          var sids = seqs.data.map(function(s) { return s.id; });
          await supabase.from('lead_sequences').update({ status: 'cancelled' }).eq('lead_id', l.id).in('sequence_id', sids).eq('status', 'active');
        }
      } catch (sErr) {}
      try {
        if (process.env.SENDGRID_API_KEY) {
          var qualName = upd.name || l.name || 'Prospect';
          await sgMail.send({
            to: 'rob@engwx.com',
            from: { email: 'notifications@engwx.com', name: 'EngageWorx' },
            subject: '✅ ' + qualName + ' just qualified from ' + channel,
            html: '<h3>Lead Qualified</h3><p><b>Name:</b> ' + qualName + '</p><p><b>Phone:</b> ' + (upd.phone || l.phone || '—') + '</p><p><b>Email:</b> ' + (l.email || '—') + '</p><p><b>Channel:</b> ' + channel + '</p><p><b>Reply preview:</b> ' + (replyBody || '').substring(0, 300) + '</p>',
          });
        }
      } catch (nErr) {}
    }
    console.log('[Qualify] Qualified', matches.length, 'prospect(s) via', channel);
    return matches.length;
  } catch (err) { console.error('[Qualify] Error:', err.message); return 0; }
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

    // ── Per-tenant spam filter ────────────────────────────────────────────────
    var spamTenantId = await resolveTenantForSender(senderEmail);
    var spamCheck = await checkSpam(spamTenantId, senderEmail, subject);
    if (spamCheck.spam) {
      console.log('🚫 Spam detected:', spamCheck.matched, 'from:', senderEmail);
      try {
        var tid = spamTenantId;
        var nameParts2 = (senderName || '').split(' ');
        var firstName2 = nameParts2[0] || senderEmail.split('@')[0];
        var lastName2 = nameParts2.slice(1).join(' ') || '';
        var contactId2 = null;
        var ec = await supabase.from('contacts').select('id').eq('email', senderEmail).eq('tenant_id', tid).limit(1);
        if (ec.data && ec.data.length > 0) contactId2 = ec.data[0].id;
        else {
          var nc = await supabase.from('contacts').insert({ tenant_id: tid, first_name: firstName2, last_name: lastName2, email: senderEmail, status: 'spam' }).select().single();
          contactId2 = nc.data ? nc.data.id : null;
        }
        var convId2 = null;
        if (contactId2) {
          var nconv = await supabase.from('conversations').insert({
            tenant_id: tid, contact_id: contactId2, channel: 'email', status: 'spam',
            subject: subject, last_message_at: new Date().toISOString(), unread_count: 0,
          }).select().single();
          convId2 = nconv.data ? nconv.data.id : null;
          if (convId2) {
            await supabase.from('messages').insert({
              tenant_id: tid, conversation_id: convId2, contact_id: contactId2, channel: 'email',
              direction: 'inbound', sender_type: 'contact', body: emailBody, status: 'spam',
            });
          }
        }
      } catch (spamErr) { console.warn('[Spam] log error:', spamErr.message); }
      return res.status(200).json({ spam: true, matched: spamCheck.matched });
    }

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

    // ── Qualify unqualified prospects on reply ────────────────────────────────
    tryQualifyProspect(senderEmail, emailBody, 'Email').catch(function() {});

    // ── AI Email Intelligence — Claude analysis + action ──────────────────────
    analyzeAndActionEmail({ senderEmail: senderEmail, senderName: senderName, subject: subject, body: emailBody, conversationId: conversationId }).catch(function() {});

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
