// /api/sms.js — Single Vercel Serverless Function for all SMS operations
// POST /api/sms?action=send    → Send SMS
// POST /api/sms?action=test    → Test SMS
// POST /api/sms?action=webhook → Twilio inbound/status webhook

const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
  );
}

// ─── HALT SEQUENCES ON REPLY ──────────────────────────────────────────────
async function pauseSequencesForContact(supabase, contactPhone, contactEmail, tenantId) {
  try {
    var leadIds = [];
    if (contactPhone) {
      var byPhone = await supabase.from('leads').select('id').eq('phone', contactPhone).limit(10);
      if (byPhone.data) leadIds = leadIds.concat(byPhone.data.map(function(l) { return l.id; }));
    }
    if (contactEmail) {
      var byEmail = await supabase.from('leads').select('id').eq('email', contactEmail).limit(10);
      if (byEmail.data) leadIds = leadIds.concat(byEmail.data.map(function(l) { return l.id; }));
    }
    if (leadIds.length === 0) return 0;
    var unique = [...new Set(leadIds)];
    var result = await supabase.from('lead_sequences').update({ status: 'paused' }).in('lead_id', unique).eq('status', 'active');
    var paused = result.count || 0;
    if (paused > 0) console.log('[Sequences] Paused', paused, 'enrollment(s) — contact replied');
    return paused;
  } catch (e) { console.error('[Sequences] Pause error:', e.message); return 0; }
}

// ─── QUALIFY UNQUALIFIED PROSPECTS ON INBOUND ────────────────────────────
async function tryQualifyProspect(supabase, phone, email, replyBody, channel) {
  try {
    var matches = [];
    if (phone) {
      var p = await supabase.from('leads').select('id, name, phone, email, tenant_id, qualified').eq('phone', phone).eq('qualified', false);
      if (p.data) matches = matches.concat(p.data);
    }
    if (email) {
      var e = await supabase.from('leads').select('id, name, phone, email, tenant_id, qualified').eq('email', email).eq('qualified', false);
      if (e.data) matches = matches.concat(e.data);
    }
    if (matches.length === 0) return 0;
    var seen = {}; var unique = matches.filter(function(l) { if (seen[l.id]) return false; seen[l.id] = true; return true; });

    // Claude extraction — name + phone from the reply
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
      var m = text.match(/\{[\s\S]*\}/);
      if (m) extracted = JSON.parse(m[0]);
    } catch (aiErr) { console.warn('[Qualify] Claude error:', aiErr.message); }

    var now = new Date().toISOString();
    for (var l of unique) {
      var upd = { qualified: true, stage: 'inquiry', urgency: 'Hot', prospect_stage: null, last_activity_at: now, last_action_at: new Date().toISOString().split('T')[0] };
      if (extracted.name && (!l.name || l.name === 'Unknown' || l.name === '')) upd.name = extracted.name;
      if (extracted.phone && !l.phone) upd.phone = extracted.phone;
      await supabase.from('leads').update(upd).eq('id', l.id);

      // Cancel qualification sequence enrollment (any tenant-scoped or master-SP qualification sequence)
      try {
        var seqs = await supabase.from('sequences').select('id').or('tenant_id.eq.' + l.tenant_id + ',tenant_id.eq.c1bc59a8-5235-4921-9755-02514b574387').ilike('name', '%contact qualification%');
        if (seqs.data && seqs.data.length > 0) {
          var sids = seqs.data.map(function(s) { return s.id; });
          await supabase.from('lead_sequences').update({ status: 'cancelled' }).eq('lead_id', l.id).in('sequence_id', sids).eq('status', 'active');
        }
      } catch (sErr) {}

      // Notify rob@engwx.com
      try {
        var sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        var qualName = upd.name || l.name || 'Prospect';
        await sgMail.send({
          to: 'rob@engwx.com',
          from: { email: 'notifications@engwx.com', name: 'EngageWorx' },
          subject: '✅ ' + qualName + ' just qualified from ' + channel,
          html: '<h3>Lead Qualified</h3><p><b>Name:</b> ' + qualName + '</p><p><b>Phone:</b> ' + (upd.phone || l.phone || '—') + '</p><p><b>Email:</b> ' + (l.email || '—') + '</p><p><b>Channel:</b> ' + channel + '</p><p><b>Reply preview:</b> ' + (replyBody || '').substring(0, 300) + '</p><p><b>Lead ID:</b> <code>' + l.id + '</code></p>',
        });
      } catch (nErr) {}
    }
    console.log('[Qualify] Qualified', unique.length, 'prospect(s) via', channel);
    return unique.length;
  } catch (err) { console.error('[Qualify] Error:', err.message); return 0; }
}

// ─── REACTIVATE ARCHIVED LEADS ON INBOUND ─────────────────────────────────
async function reactivateArchivedLeadsForContact(supabase, phone, email) {
  try {
    var matches = [];
    if (phone) {
      var p = await supabase.from('leads').select('id, name, tenant_id, notes, reactivated_at').eq('phone', phone).eq('archived', true);
      if (p.data) matches = matches.concat(p.data);
    }
    if (email) {
      var e = await supabase.from('leads').select('id, name, tenant_id, notes, reactivated_at').eq('email', email).eq('archived', true);
      if (e.data) matches = matches.concat(e.data);
    }
    if (matches.length === 0) return 0;
    var seen = {}; var unique = matches.filter(function(l) { if (seen[l.id]) return false; seen[l.id] = true; return true; });

    var now = new Date().toISOString();
    var today = new Date().toISOString().split('T')[0];
    var dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    var notifyEligible = [];

    for (var l of unique) {
      // Dedup: skip the notification if this lead was reactivated in the last 24h
      var recentlyReactivated = l.reactivated_at && new Date(l.reactivated_at).getTime() > dayAgo;
      if (!recentlyReactivated) notifyEligible.push(l);

      var reactNote = (l.notes || '') + '\n[Auto-reactivated ' + today + ': inbound message received]';
      await supabase.from('leads').update({
        archived: false, stage: 'inquiry', urgency: 'Hot', reactivated_at: now,
        last_activity_at: now, last_action_at: today, notes: reactNote,
      }).eq('id', l.id);

      // Enroll in New Lead — General Outreach sequence
      try {
        var seq = await supabase.from('sequences').select('id, name').eq('tenant_id', l.tenant_id).ilike('name', '%new lead%general outreach%').limit(1);
        if (!seq.data || seq.data.length === 0) seq = await supabase.from('sequences').select('id, name').eq('tenant_id', l.tenant_id).ilike('name', '%general outreach%').limit(1);
        if (!seq.data || seq.data.length === 0) seq = await supabase.from('sequences').select('id, name').eq('tenant_id', l.tenant_id).ilike('name', '%new lead%').limit(1);
        if (seq.data && seq.data.length > 0) {
          var sid = seq.data[0].id;
          var fs = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', sid).eq('step_number', 1).single();
          var start = new Date(); if (fs.data && fs.data.delay_days > 0) start.setDate(start.getDate() + fs.data.delay_days);
          await supabase.from('lead_sequences').upsert({
            tenant_id: l.tenant_id, lead_id: l.id, sequence_id: sid,
            current_step: 0, status: 'active', enrolled_at: now, next_step_at: start.toISOString(),
          }, { onConflict: 'lead_id,sequence_id' });
        }
      } catch (seqErr) { console.warn('[Reactivate] Seq enrol error:', seqErr.message); }
    }

    // Notify rob@engwx.com — only for leads not already reactivated in the last 24h
    if (notifyEligible.length > 0) {
      try {
        var sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        await sgMail.send({
          to: 'rob@engwx.com',
          from: { email: 'notifications@engwx.com', name: 'EngageWorx' },
          subject: '🔄 Lead Reactivated: ' + notifyEligible.map(function(x) { return x.name; }).join(', '),
          html: '<h3>Archived Lead Reactivated (SMS inbound)</h3>' +
            notifyEligible.map(function(x) { return '<p><b>' + x.name + '</b> — id: <code>' + x.id + '</code></p>'; }).join('') +
            '<p>Flipped <code>archived=true</code> → <code>false</code>. Enrolled in New Lead — General Outreach sequence.</p>',
        });
      } catch (nErr) {}
    } else {
      console.log('[Reactivate] Skipped notification — all', unique.length, 'lead(s) reactivated within the last 24h');
    }

    console.log('[Reactivate] Reactivated', unique.length, 'archived lead(s) via SMS reply');
    return unique.length;
  } catch (err) { console.error('[Reactivate] Error:', err.message); return 0; }
}

// ─── INBOUND NOTIFICATION (SENDGRID) ─────────────────────────────────────
async function notifyInboundSendGrid(contactName, channel, messagePreview) {
  try {
    var sgKey = process.env.SENDGRID_API_KEY;
    if (!sgKey) return;
    var sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(sgKey);
    await sgMail.send({
      to: 'rob@engwx.com',
      from: { email: 'notifications@engwx.com', name: 'EngageWorx' },
      subject: 'New ' + channel + ' from ' + (contactName || 'Unknown'),
      html: '<h3>Inbound ' + channel + ' Message</h3>' +
        '<p><b>Contact:</b> ' + (contactName || 'Unknown') + '</p>' +
        '<p><b>Channel:</b> ' + channel + '</p>' +
        '<p><b>Preview:</b> ' + (messagePreview || '').substring(0, 300) + '</p>' +
        '<p><a href="https://portal.engwx.com">Open Live Inbox →</a></p>',
    });
  } catch (e) { console.error('[Notify] SendGrid error:', e.message); }
}

// ─── FORM BODY PARSER ─────────────────────────────────────────────────────
async function parseFormBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object' && req.body.MessageSid) {
      return resolve(req.body);
    }
    let raw = '';
    req.on('data', chunk => { raw += chunk.toString(); });
    req.on('end', () => {
      try {
        const parsed = Object.fromEntries(new URLSearchParams(raw));
        resolve(parsed);
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ─── SEND SMS ─────────────────────────────────────────────────────────────
async function sendSMS(to, body, from) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = from || process.env.TWILIO_PHONE_NUMBER;
  const auth = Buffer.from(accountSid + ':' + authToken).toString('base64');
  const params = new URLSearchParams();
  params.append('To', to);
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    params.append('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
  } else {
    params.append('From', fromNumber);
  }
  params.append('Body', body);
  const response = await fetch(
    'https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json',
    {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    }
  );
  return { data: await response.json(), ok: response.ok, status: response.status };
}

// ─── AI REPLY ─────────────────────────────────────────────────────────────
async function getAIReply(supabase, tenantId, message, channel) {
  try {
    var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) { console.log('[AI] No Anthropic key'); return null; }

    var systemPrompt = 'You are a helpful assistant. Keep replies under 160 characters for SMS. No markdown.';
    var channelsActive = ['sms', 'whatsapp', 'email'];

    if (tenantId) {
      try {
        var chatbotResult = await supabase.from('chatbot_configs').select('system_prompt, channels_active, personality_preset, knowledge_base').eq('tenant_id', tenantId).single();
        if (chatbotResult.data) {
          if (chatbotResult.data.system_prompt) systemPrompt = chatbotResult.data.system_prompt + ' Keep replies under 160 characters for SMS. No markdown.';
          if (chatbotResult.data.channels_active) channelsActive = chatbotResult.data.channels_active;
          if (chatbotResult.data.knowledge_base) systemPrompt += '\n\nKnowledge Base:\n' + chatbotResult.data.knowledge_base;
        }
      } catch (e) { console.log('[AI] Chatbot config lookup failed:', e.message); }
    }

    if (!channelsActive.includes(channel)) {
      console.log('[AI] Channel', channel, 'not active — skipping');
      return null;
    }

    var claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 160,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      }),
    });

    if (!claudeRes.ok) {
      var err = await claudeRes.json();
      console.error('[AI] Claude error:', JSON.stringify(err));
      return null;
    }

    var claudeData = await claudeRes.json();
    var reply = claudeData.content && claudeData.content[0] && claudeData.content[0].text
      ? claudeData.content[0].text.trim()
      : null;

    console.log('[AI] Claude reply:', reply);
    return reply;
  } catch (e) {
    console.error('[AI] getAIReply error:', e.message);
    return null;
  }
}

// ─── FIND OR CREATE CONTACT ────────────────────────────────────────────────
async function findOrCreateContact(supabase, tenantId, phone) {
  if (!tenantId) return null;
  try {
    const { data: existing } = await supabase.from('contacts').select('id').eq('tenant_id', tenantId).or('phone.eq.' + phone + ',mobile.eq.' + phone).single();
    if (existing && existing.id) return existing.id;
    const { data: created } = await supabase.from('contacts').insert({
      tenant_id: tenantId, phone: phone, source: 'inbound_sms', status: 'active',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).select('id').single();
    return created ? created.id : null;
  } catch (err) {
    console.error('[Contact] findOrCreate error:', err.message);
    return null;
  }
}

// ─── FIND OR CREATE CONVERSATION ──────────────────────────────────────────
async function findOrCreateConversation(supabase, tenantId, contactId, fromPhone, channel) {
  channel = channel || 'sms';
  if (!tenantId || !contactId) return null;
  try {
    const { data: existing } = await supabase.from('conversations').select('id').eq('tenant_id', tenantId).eq('channel', channel).eq('contact_id', contactId).in('status', ['active', 'waiting', 'snoozed']).order('created_at', { ascending: false }).limit(1).single();
    if (existing && existing.id) return existing.id;
    const { data: created } = await supabase.from('conversations').insert({
      tenant_id: tenantId, contact_id: contactId, channel: channel, status: 'active',
      subject: channel.toUpperCase() + ' from ' + fromPhone,
      last_message_at: new Date().toISOString(), last_message_preview: '',
      message_count: 0, unread_count: 1,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).select('id').single();
    return created ? created.id : null;
  } catch (err) {
    console.error('[Conversation] findOrCreate error:', err.message);
    return null;
  }
}

// ─── NOTIFY INBOUND ────────────────────────────────────────────────────────
async function notifyInbound(supabase, tenantId, from, body) {
  try {
    if (!tenantId) return;
    var membersResult = await supabase.from('tenant_members').select('user_id, notify_email').eq('tenant_id', tenantId).eq('status', 'active');
    var members = membersResult.data || [];
    if (members.length === 0) return;
    var userIds = members.map(function(m) { return m.user_id; });
    var profilesResult = await supabase.from('user_profiles').select('id, email').in('id', userIds);
    var profiles = profilesResult.data || [];
    var emailsToNotify = members.map(function(m) {
      var profile = profiles.find(function(p) { return p.id === m.user_id; });
      return m.notify_email || (profile && profile.email) || null;
    }).filter(Boolean);
    if (emailsToNotify.length === 0) { console.log('[Notify] No recipients'); return; }
    for (var i = 0; i < emailsToNotify.length; i++) {
      var email = emailsToNotify[i];
      await fetch('https://portal.engwx.com/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          subject: 'New inbound SMS from ' + from,
          html: '<p>A new inbound SMS has arrived in your Live Inbox.</p><p><strong>From:</strong> ' + from + '</p><p><strong>Message:</strong> ' + body + '</p><p><a href="https://portal.engwx.com">Open Live Inbox →</a></p>',
        }),
      });
      console.log('[Notify] Sent to', email);
    }
  } catch (err) {
    console.error('[Notify] Failed:', err.message);
  }
}

// ─── MAIN HANDLER ──────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const action = req.query.action || 'send';

  // ─── TEST ───────────────────────────────────────────────────────────────
  if (action === 'test') {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'Missing "to" phone number' });
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!accountSid || !authToken || !fromNumber) {
      return res.status(500).json({ error: 'Missing env vars', has_sid: !!accountSid, has_token: !!authToken, has_number: !!fromNumber });
    }
    const result = await sendSMS(to, '🚀 EngageWorx SMS test successful! Your Twilio integration is live.', fromNumber);
    if (!result.ok) return res.status(result.status).json({ error: result.data.message, code: result.data.code });
    return res.status(200).json({ success: true, message: 'Test SMS sent!', sid: result.data.sid });
  }

  // ─── SEND ───────────────────────────────────────────────────────────────
  if (action === 'send') {
    const { to, body, from, tenant_id } = req.body;
    if (!to || !body) return res.status(400).json({ error: 'Missing required fields: to, body' });
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) return res.status(500).json({ error: 'Twilio credentials not configured' });

    // TCR gate: tenant must have sms_enabled=true to send
    if (tenant_id) {
      try {
        const supabaseGate = getSupabase();
        const gateRes = await supabaseGate.from('tenants').select('sms_enabled, tcr_status').eq('id', tenant_id).single();
        if (gateRes.data && gateRes.data.sms_enabled !== true) {
          return res.status(403).json({
            error: 'SMS not enabled for this tenant. Complete A2P 10DLC registration first.',
            tcr_status: gateRes.data.tcr_status || 'not_started',
            code: 'SMS_NOT_ENABLED',
          });
        }
      } catch (gateErr) { console.log('[SMS Gate] Check failed, blocking:', gateErr.message); return res.status(403).json({ error: 'SMS gate check failed', code: 'SMS_GATE_ERROR' }); }
    }

    if (tenant_id) {
      try {
        const supabaseUsage = getSupabase();
        const usageResult = await supabaseUsage.rpc('increment_usage', { p_tenant_id: tenant_id, p_channel: 'sms', p_count: 1 });
        if (usageResult.data && !usageResult.data.allowed) {
          return res.status(429).json({ error: 'Message limit reached.', status: 'blocked' });
        }
      } catch (usageErr) { console.log('[Usage] Check failed, allowing:', usageErr.message); }
    }
    try {
      const result = await sendSMS(to, body, from);
      if (!result.ok) return res.status(result.status).json({ error: result.data.message, code: result.data.code });
      return res.status(200).json({ success: true, messageSid: result.data.sid, status: result.data.status });
    } catch (err) {
      console.error('Send SMS error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ─── WEBHOOK ────────────────────────────────────────────────────────────
  if (action === 'webhook') {
    let twilioBody;
    try {
      twilioBody = await parseFormBody(req);
    } catch (parseErr) {
      console.error('[Twilio] Body parse error:', parseErr.message);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send('<Response></Response>');
    }

    if (!twilioBody || !twilioBody.MessageSid) {
      console.log('[Twilio] No MessageSid in body');
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send('<Response></Response>');
    }

    console.log('[Twilio] Parsed webhook body:', JSON.stringify(twilioBody));

    try {
      const { MessageSid, Body, MessageStatus, ErrorCode, ErrorMessage } = twilioBody;
      const From = (twilioBody.From || '').replace(/^whatsapp:/i, '');
      const To   = (twilioBody.To   || '').replace(/^whatsapp:/i, '');
      const isWhatsApp = (twilioBody.From || '').toLowerCase().startsWith('whatsapp:');
      const supabase = getSupabase();

      // ── Delivery status update ──────────────────────────────────────────
      if (MessageStatus) {
        const statusMap = { received: 'delivered', receiving: 'delivered', accepted: 'queued' };
        const status = statusMap[MessageStatus] || MessageStatus;
        console.log('[Twilio] Status update:', MessageSid, '→', status);
        await supabase.from('messages').update({
          status, error_code: ErrorCode || null, error_message: ErrorMessage || null, updated_at: new Date().toISOString(),
        }).eq('provider_message_id', MessageSid);
        res.setHeader('Content-Type', 'text/xml');
        return res.status(200).send('<Response></Response>');
      }

      // ── Inbound message ─────────────────────────────────────────────────
      console.log('[Twilio] Inbound from', From, 'to', To + ':', Body);

      // 1. Resolve tenant
      var tenantId = null;
      try {
        const { data: phoneRecord } = await supabase.from('phone_numbers').select('tenant_id').eq('number', To).single();
        if (phoneRecord && phoneRecord.tenant_id) {
          tenantId = phoneRecord.tenant_id;
          console.log('[Twilio] Resolved tenant', tenantId, 'from phone_numbers for', To);
        }
      } catch (e) { console.log('[Twilio] phone_numbers lookup failed:', e.message); }

      if (!tenantId) {
        try {
          const { data: configs } = await supabase.from('channel_configs').select('tenant_id, config_encrypted').in('channel', ['sms', 'whatsapp']).eq('enabled', true);
          const normalizedTo = To.replace(/[\s\-\(\)\+]/g, '');
          const match = (configs || []).find(function(c) {
            var num = ((c.config_encrypted || {}).phone_number || '').replace(/[\s\-\(\)\+]/g, '');
            return num && normalizedTo.endsWith(num.slice(-9));
          });
          if (match) { tenantId = match.tenant_id; console.log('[Twilio] Resolved tenant from channel_configs:', tenantId); }
        } catch (e) { console.log('[Twilio] channel_configs lookup failed:', e.message); }
      }

      if (!tenantId) {
        tenantId = 'c1bc59a8-5235-4921-9755-02514b574387';
        console.log('[Twilio] Using SP tenant fallback');
      }

      // 2. Classify message type
      const upperBody = (Body || '').trim().toUpperCase();
      const optOutWords = ['STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT','OPTOUT','REVOKE'];
      const optInWords  = ['START','SUBSCRIBE','YES'];
      const helpWords   = ['HELP','INFO'];
      var messageType = 'inbound';
if (optOutWords.includes(upperBody)) messageType = 'opt_out';
else if (optInWords.includes(upperBody)) messageType = 'opt_in';
else if (helpWords.includes(upperBody)) messageType = 'help';

      // 3. Find or create contact + conversation
      const channel = isWhatsApp ? 'whatsapp' : 'sms';
      const contactId = await findOrCreateContact(supabase, tenantId, From);
      const now = new Date().toISOString();
      const conversationId = await findOrCreateConversation(supabase, tenantId, contactId, From, channel);

      // 4. Save inbound message
      try {
        const msgInsert = await supabase.from('messages').insert({
          tenant_id: tenantId, conversation_id: conversationId, contact_id: contactId,
          direction: 'inbound', channel: channel, body: Body, status: 'delivered',
          sender_type: 'contact', provider_message_id: MessageSid,
          metadata: { from: From, to: To }, created_at: now,
        });
        if (msgInsert.error) console.error('[SMS] Message insert error:', msgInsert.error.message);
        else console.log('[SMS] Inbound message saved successfully');
      } catch (msgErr) { console.error('[SMS] Message insert failed:', msgErr.message); }

      // 5. Update conversation
      if (conversationId) {
        await supabase.from('conversations').update({
          last_message_at: now, last_message_preview: (Body || '').substring(0, 100), updated_at: now,
        }).eq('id', conversationId);
      }

      // 6. Auto-create pipeline lead for SP tenant
      try {
        if (tenantId === 'c1bc59a8-5235-4921-9755-02514b574387') {
          var leadCheck = await supabase.from('leads').select('id').or('name.eq.' + From + ',notes.ilike.%' + From + '%').limit(1);
          if (!leadCheck.data || leadCheck.data.length === 0) {
            await supabase.from('leads').insert({
              name: From, company: From, type: 'Unknown', urgency: 'Warm', stage: 'inquiry',
              source: 'inbound_sms',
              notes: 'Auto-created from inbound SMS from ' + From + '. Message: ' + (Body || '').substring(0, 200),
              last_action_at: new Date().toISOString().split('T')[0],
              last_activity_at: new Date().toISOString(),
            });
            console.log('[SMS] Pipeline lead auto-created for:', From);
          }
        }
      } catch (plErr) { console.log('[SMS] Pipeline lead create failed (non-fatal):', plErr.message); }

      // 7. Opt-in / opt-out / help
      if (messageType === 'opt_out' && contactId) {
        await supabase.from('contacts').update({ status: 'unsubscribed', updated_at: now }).eq('id', contactId);
      } else if (messageType === 'opt_in' && contactId) {
        await supabase.from('contacts').update({ status: 'active', updated_at: now }).eq('id', contactId);
        await sendSMS(From, 'EngageWorx: You are now opted in to receive messages. Message frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to opt out.', To);
      } else if (messageType === 'help') {
        await sendSMS(From, 'EngageWorx: For help visit engwx.com or call +1 (786) 982-7800. Reply STOP to unsubscribe. Msg & data rates may apply.', To);
      }
      // 8. Halt sequences on reply (non-blocking)
      var contactEmail = null;
      try { var ce = await supabase.from('contacts').select('email').eq('id', contactId).single(); contactEmail = ce.data?.email; } catch(e) {}
      pauseSequencesForContact(supabase, From, contactEmail, tenantId).catch(function() {});

      // 8b. Reactivate archived leads on reply
      reactivateArchivedLeadsForContact(supabase, From, contactEmail).catch(function() {});

      // 8c. Qualify unqualified prospects on reply
      tryQualifyProspect(supabase, From, contactEmail, Body, 'SMS').catch(function() {});

      // 9. Notify inbound (non-blocking)
      var contactDisplayName = From;
      try { var cn = await supabase.from('contacts').select('first_name, last_name').eq('id', contactId).single(); if (cn.data) contactDisplayName = [cn.data.first_name, cn.data.last_name].filter(Boolean).join(' ') || From; } catch(e) {}
      notifyInboundSendGrid(contactDisplayName, channel.toUpperCase(), Body).catch(function() {});
      notifyInbound(supabase, tenantId, From, Body).catch(function(err) {
        console.error('[Notify] Error:', err.message);
      });

      // 9. AI auto-response
      if (messageType === 'inbound') {
        try {
          var aiReply = await getAIReply(supabase, tenantId, Body, channel);
          if (aiReply) {
            console.log('[AI] Sending reply to', From, 'via', channel, ':', aiReply);
            var smsResult;
            if (isWhatsApp) {
              // Send via WhatsApp
              var waAccountSid = process.env.TWILIO_ACCOUNT_SID;
              var waAuthToken = process.env.TWILIO_AUTH_TOKEN;
              var waAuth = Buffer.from(waAccountSid + ':' + waAuthToken).toString('base64');
              var waParams = new URLSearchParams();
              waParams.append('To', 'whatsapp:' + From);
              waParams.append('From', 'whatsapp:' + To);
              waParams.append('Body', aiReply);
              var waRes = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + waAccountSid + '/Messages.json', {
                method: 'POST',
                headers: { 'Authorization': 'Basic ' + waAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: waParams.toString(),
              });
              smsResult = { data: await waRes.json(), ok: waRes.ok };
            } else {
              smsResult = await sendSMS(From, aiReply, To);
            }
            console.log('[AI] Reply result:', JSON.stringify(smsResult.data));

            // Save AI reply to messages table
            try {
              await supabase.from('messages').insert({
                tenant_id: tenantId, conversation_id: conversationId, contact_id: contactId,
                direction: 'outbound', channel: channel, body: aiReply, status: 'sent',
                sender_type: 'bot', metadata: { from: To, to: From }, created_at: new Date().toISOString(),
              });
            } catch (e) { console.log('[AI] Message save failed:', e.message); }
          }
        } catch (aiErr) {
          console.error('[AI] Error:', aiErr.message);
        }
      }

      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send('<Response></Response>');

    } catch (err) {
      console.error('[Twilio] Webhook error:', err.message);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send('<Response></Response>');
    }
  }

  return res.status(400).json({ error: 'Invalid action. Use ?action=send|test|webhook' });
};
