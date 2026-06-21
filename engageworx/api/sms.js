// /api/sms.js — Single Vercel Serverless Function for all SMS operations
// POST /api/sms?action=send    → Send SMS
// POST /api/sms?action=test    → Test SMS
// POST /api/sms?action=webhook → Twilio inbound/status webhook

const { createClient } = require('@supabase/supabase-js');
const { buildSystemPrompt } = require('./_lib/build-system-prompt');
const { STAGE_KEYS, getPipelineStageId } = require('./_lib/pipelineStages');
const CD = require('../src/lib/candidacyDefaults');

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
          model: 'claude-haiku-4-5', max_tokens: 200,
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
      var smsQualStageId = await getPipelineStageId(supabase, l.tenant_id, STAGE_KEYS.LEAD);
      var upd = { qualified: true, pipeline_stage_id: smsQualStageId, urgency: 'Hot', prospect_stage: null, last_activity_at: now, last_action_at: new Date().toISOString().split('T')[0] };
      if (extracted.name && (!l.name || l.name === 'Unknown' || l.name === '')) upd.name = extracted.name;
      if (extracted.phone && !l.phone) upd.phone = extracted.phone;
      await supabase.from('leads').update(upd).eq('id', l.id);

      // Cancel qualification sequence enrollment (any tenant-scoped or master-SP qualification sequence)
      try {
        var seqs = await supabase.from('sequences').select('id').or('tenant_id.eq.' + l.tenant_id + ',tenant_id.eq.' + (process.env.REACT_APP_SP_TENANT_ID || process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387') + '').ilike('name', '%contact qualification%');
        if (seqs.data && seqs.data.length > 0) {
          var sids = seqs.data.map(function(s) { return s.id; });
          await supabase.from('lead_sequences').update({ status: 'cancelled' }).eq('lead_id', l.id).in('sequence_id', sids).eq('status', 'active');
        }
      } catch (sErr) {}

      // Notify tenant admins
      try {
        var { notifyTenantAdmins: _notifySMS1 } = require('./_lib/notify-tenant-admins');
        var qualName = upd.name || l.name || 'Prospect';
        await _notifySMS1(supabase, l.tenant_id, 'sms_optout', { name: qualName, phone: upd.phone || l.phone, channel: channel }, {
          subject: '✅ ' + qualName + ' just qualified from ' + channel,
          html: '<h3>Lead Qualified</h3><p><b>Name:</b> ' + qualName + '</p><p><b>Phone:</b> ' + (upd.phone || l.phone || '—') + '</p><p><b>Email:</b> ' + (l.email || '—') + '</p><p><b>Channel:</b> ' + channel + '</p><p><b>Reply preview:</b> ' + (replyBody || '').substring(0, 300) + '</p>',
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
      var smsReactStageId = await getPipelineStageId(supabase, l.tenant_id, STAGE_KEYS.LEAD);
      await supabase.from('leads').update({
        archived: false, pipeline_stage_id: smsReactStageId, urgency: 'Hot', reactivated_at: now,
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
          var _safeEnrol = require('./_lib/safe-enrol-sequence');
          await _safeEnrol.safeEnrolSequence(supabase, { tenant_id: l.tenant_id, lead_id: l.id, sequence_id: sid, next_step_at: start.toISOString() });
        }
      } catch (seqErr) { console.warn('[Reactivate] Seq enrol error:', seqErr.message); }
    }

    // Notify tenant admins — only for leads not already reactivated in the last 24h
    if (notifyEligible.length > 0) {
      try {
        var { notifyTenantAdmins: _notifySMS2 } = require('./_lib/notify-tenant-admins');
        var _reactTenantId = notifyEligible[0].tenant_id || null;
        await _notifySMS2(supabase, _reactTenantId, 'sms_optin', { leads: notifyEligible.map(function(x) { return x.name; }) }, {
          subject: '🔄 Lead Reactivated: ' + notifyEligible.map(function(x) { return x.name; }).join(', '),
          html: '<h3>Archived Lead Reactivated (SMS inbound)</h3>' +
            notifyEligible.map(function(x) { return '<p><b>' + x.name + '</b></p>'; }).join('') +
            '<p>Lead unarchived and enrolled in outreach sequence.</p>',
        });
      } catch (nErr) {}
    } else {
      console.log('[Reactivate] Skipped notification — all', unique.length, 'lead(s) reactivated within the last 24h');
    }

    console.log('[Reactivate] Reactivated', unique.length, 'archived lead(s) via SMS reply');
    return unique.length;
  } catch (err) { console.error('[Reactivate] Error:', err.message); return 0; }
}

// ─── INBOUND NOTIFICATION ─────────────────────────────────────
async function notifyInboundSendGrid(contactName, channel, messagePreview, inboundTenantId, supabaseClient) {
  try {
    var { notifyTenantAdmins: _notifySMS3 } = require('./_lib/notify-tenant-admins');
    await _notifySMS3(supabaseClient || getSupabase(), inboundTenantId || null, 'sms_unknown_sender', { contact: contactName, channel: channel }, {
      subject: 'New ' + channel + ' from ' + (contactName || 'Unknown'),
      html: '<h3>Inbound ' + channel + ' Message</h3>' +
        '<p><b>Contact:</b> ' + (contactName || 'Unknown') + '</p>' +
        '<p><b>Channel:</b> ' + channel + '</p>' +
        '<p><b>Preview:</b> ' + (messagePreview || '').substring(0, 300) + '</p>' +
        '<p><a href="https://portal.engwx.com">Open Live Inbox →</a></p>',
    });
  } catch (e) { console.error('[Notify] notifyTenantAdmins error:', e.message); }
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
async function sendSMS(to, body, from, opts) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = from || process.env.TWILIO_PHONE_NUMBER;
  const auth = Buffer.from(accountSid + ':' + authToken).toString('base64');
  const params = new URLSearchParams();
  params.append('To', to);
  var msSid = (opts && opts.messagingServiceSid) || process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (msSid) {
    params.append('MessagingServiceSid', msSid);
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
async function getAIReply(supabase, tenantId, message, channel, opts) {
  try {
    var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) { console.log('[AI] No Anthropic key'); return null; }
    var extra = opts || {};

    var channelsActive = ['sms', 'whatsapp', 'email'];
    if (tenantId) {
      try {
        var chatbotResult = await supabase.from('chatbot_configs').select('channels_active, temperature').eq('tenant_id', tenantId).maybeSingle();
        if (chatbotResult.data && chatbotResult.data.channels_active) channelsActive = chatbotResult.data.channels_active;
      } catch (e) {}
    }
    if (!channelsActive.includes(channel)) {
      console.log('[AI] Channel', channel, 'not active — skipping');
      return null;
    }

    var systemPrompt = await buildSystemPrompt({ tenantId: tenantId, channel: 'sms', supabase: supabase, candidacyState: extra.candidacyState });

    // Append state-specific instructions
    if (extra.candidacyState === 'awaiting_candidate_name') {
      var nameAskCopy = extra.nameAskTemplate || CD.CANDIDACY_NAME_ASK;
      systemPrompt += '\n\n--- CURRENT STATE: APPROVED CANDIDATE — NAME CAPTURE ---\n' +
        'This person has been approved as a candidate. Do NOT greet them as new. Do NOT ask for a photo. Do NOT ask for a phone number. Do NOT ask for an email address. ' +
        'Your ONLY task: ask for their name. Use this wording as your guide (adapt naturally to the conversation): "' + nameAskCopy + '" ' +
        'Once they share their name, thank them warmly and let them know the team will be in touch to schedule.';
    }
    if (extra.candidacyState === 'candidate_complete') {
      systemPrompt += '\n\n--- CURRENT STATE: CANDIDATE COMPLETE ---\n' +
        'This person is an approved, captured candidate. Their info is recorded. ' +
        'If they message, respond helpfully and briefly. Do NOT re-collect info. Do NOT ask for a photo.';
    }
    if (extra.hasPhoto) {
      systemPrompt += '\n\nIMPORTANT: This person has already sent a photo. Do NOT ask for a photo again.';
    }

    // Build messages array with conversation history
    var aiMessages = [];
    if (extra.conversationId && supabase) {
      try {
        var { data: historyMsgs } = await supabase.from('messages').select('direction, body, sender_type')
          .eq('conversation_id', extra.conversationId)
          .order('created_at', { ascending: true }).limit(20);
        if (historyMsgs && historyMsgs.length > 0) {
          for (var hi = 0; hi < historyMsgs.length; hi++) {
            var hm = historyMsgs[hi];
            if (!hm.body || !hm.body.trim()) continue;
            var role = (hm.direction === 'inbound') ? 'user' : 'assistant';
            // Avoid consecutive same-role messages (API requirement)
            if (aiMessages.length > 0 && aiMessages[aiMessages.length - 1].role === role) {
              aiMessages[aiMessages.length - 1].content += '\n' + hm.body;
            } else {
              aiMessages.push({ role: role, content: hm.body });
            }
          }
        }
      } catch (_) {}
    }
    // Append current inbound as the final user message
    if (aiMessages.length === 0 || aiMessages[aiMessages.length - 1].role !== 'user') {
      aiMessages.push({ role: 'user', content: message });
    } else {
      aiMessages[aiMessages.length - 1].content += '\n' + message;
    }

    var claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 160,
        temperature: (chatbotResult && chatbotResult.data && chatbotResult.data.temperature !== null) ? chatbotResult.data.temperature : 0.7,
        system: systemPrompt,
        messages: aiMessages,
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
  // Tenant-scoped, race-safe find-or-create via RPC (migration 052).
  try {
    const { data, error } = await supabase.rpc('find_or_create_contact', { p_tenant_id: tenantId, p_phone: phone, p_source: 'inbound_sms' });
    if (error) { console.error('[Contact] find_or_create_contact rpc error:', error.message); return null; }
    return data || null;
  } catch (err) {
    console.error('[Contact] findOrCreate error:', err.message);
    return null;
  }
}

// ─── FIND OR CREATE CONVERSATION ──────────────────────────────────────────
async function findOrCreateConversation(supabase, tenantId, contactId, fromPhone, channel) {
  channel = channel || 'sms';
  if (!tenantId || !contactId) return null;
  // SMS: reattach to ANY existing thread (regardless of status) or create — via RPC
  // (one SMS thread per tenant+contact; migration 053). Replaces the status-gated
  // find-or-create that spawned a new thread whenever the prior one was resolved.
  if (channel === 'sms') {
    try {
      const { data, error } = await supabase.rpc('upsert_sms_conversation', { p_tenant_id: tenantId, p_contact_id: contactId, p_from_phone: fromPhone });
      if (error) { console.error('[Conversation] upsert_sms_conversation rpc error:', error.message); return null; }
      return data || null;
    } catch (err) {
      console.error('[Conversation] sms findOrCreate error:', err.message);
      return null;
    }
  }
  // Non-SMS: existing status-gated find-or-create (email keeps multiple threads).
  try {
    const { data: existing } = await supabase.from('conversations').select('id').eq('tenant_id', tenantId).eq('channel', channel).eq('contact_id', contactId).in('status', ['active', 'waiting', 'snoozed']).order('created_at', { ascending: false }).limit(1).maybeSingle();
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
    const result = await sendSMS(to, '🚀 EngageWorx SMS test successful! Your messaging integration is live.', fromNumber);
    if (!result.ok) return res.status(result.status).json({ error: result.data.message, code: result.data.code });
    return res.status(200).json({ success: true, message: 'Test SMS sent!', sid: result.data.sid });
  }

  // ─── SEND ───────────────────────────────────────────────────────────────
  if (action === 'send') {
    const { to, body, from, tenant_id, conversation_id } = req.body;
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
        // Defense in depth: gate on the live registration outcome, not sms_enabled alone — never send
        // for a killed registration even if sms_enabled lagged (the post-approval-monitor window). Block
        // when the tenant's MOST RECENT wizard session is rejected/suspended (latest, so a stale rejection
        // before a newer approval doesn't over-block). SP/Conecta/Delamere have no such latest session.
        var latestReg = await supabaseGate.from('tcr_wizard_sessions')
          .select('status').eq('tenant_id', tenant_id)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (latestReg.data && ['rejected', 'suspended'].indexOf(latestReg.data.status) !== -1) {
          return res.status(403).json({
            error: 'SMS registration was rejected or suspended — re-register before sending.',
            code: 'SMS_REGISTRATION_KILLED',
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
    // Route +48 (Poland) numbers through the Poland carrier integration instead of Twilio
    var normalizedTo = String(to).replace(/[\s\-\(\)]/g, '');
    if (normalizedTo.indexOf('+48') === 0 || (normalizedTo.indexOf('48') === 0 && normalizedTo.length === 11)) {
      try {
        var plRes = await fetch((process.env.PORTAL_URL || 'https://portal.engwx.com') + '/api/poland-carrier?action=sms-outbound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: tenant_id, to: normalizedTo, body: body }),
        });
        var plData = await plRes.json();
        if (plRes.ok) return res.status(200).json({ success: true, routed: 'poland', transport: plData.transport || 'poland_carrier', body: plData.body });
        return res.status(plRes.status).json({ error: 'Poland carrier error', detail: plData });
      } catch (plErr) {
        console.warn('[SMS] Poland route failed, falling through to Twilio:', plErr.message);
        // Fall through to Twilio as last resort
      }
    }
    try {
      // Load tenant's messaging service SID if tenant_id provided
      var sendMsSid = undefined;
      if (tenant_id) {
        try {
          var ccSend = await getSupabase().from('channel_configs').select('config_encrypted').eq('tenant_id', tenant_id).eq('channel', 'sms').maybeSingle();
          if (ccSend.data && ccSend.data.config_encrypted) sendMsSid = ccSend.data.config_encrypted.twilio_messaging_service_sid;
        } catch (_) {}
      }
      const result = await sendSMS(to, body, from, { messagingServiceSid: sendMsSid });
      if (!result.ok) return res.status(result.status).json({ error: result.data.message, code: result.data.code });
      // Human send clears candidacy gate (D3: manual messages always send + resume auto)
      if (conversation_id) {
        try {
          var sb = getSupabase();
          var { data: convCheck } = await sb.from('conversations').select('candidacy_state').eq('id', conversation_id).maybeSingle();
          if (convCheck && convCheck.candidacy_state === 'awaiting_candidacy_approval') {
            await sb.from('conversations').update({ candidacy_state: 'auto', updated_at: new Date().toISOString() }).eq('id', conversation_id);
            try { await sb.rpc('log_audit_event', { p_action: 'candidacy.resumed_by_human', p_resource_type: 'conversations', p_tenant_id: tenant_id, p_user_id: null, p_resource_id: conversation_id, p_details: {}, p_ip_address: null, p_user_agent: null }); } catch (_) {}
          }
        } catch (_) {}
      }
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

      // 1. Resolve tenant via phone_numbers (authoritative source)
      var tenantId = null;
      var normalizedTo = To.replace(/[\s\-\(\)\.]/g, '');
      if (normalizedTo.charAt(0) === '+') {
        try {
          var phoneResult = await supabase
            .from('phone_numbers')
            .select('tenant_id')
            .eq('number', normalizedTo)
            .eq('status', 'active')
            .maybeSingle();
          if (phoneResult.data && phoneResult.data.tenant_id) {
            tenantId = phoneResult.data.tenant_id;
            console.log('[sms] Resolved tenant', tenantId, 'from phone_numbers for', normalizedTo);
          }
        } catch (e) { console.log('[sms] phone_numbers lookup failed:', e.message); }
      } else {
        console.warn('[sms] Non-E.164 To number, cannot resolve:', To);
      }

      if (!tenantId) {
        console.error('[sms] No tenant for inbound message', {
          to: To, from: From, messageSid: req.body.MessageSid || req.body.SmsSid,
          timestamp: new Date().toISOString()
        });
        res.setHeader('Content-Type', 'text/xml'); return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }

      // Load tenant SMS channel_config for outbound routing (messaging service SID)
      var tenantSmsConfig = null;
      try {
        var ccResult = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', tenantId).eq('channel', 'sms').maybeSingle();
        if (ccResult.data) tenantSmsConfig = ccResult.data.config_encrypted;
      } catch (e) { /* non-fatal */ }

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

      // 3b. Detect MMS and download media to Storage
      // Read from twilioBody (parsed webhook), NOT req.body (may be unparsed)
      var numMedia = parseInt(twilioBody.NumMedia || '0', 10);
      var storagePaths = [];
      if (numMedia > 0) {
        var twilioAuth = Buffer.from((process.env.TWILIO_ACCOUNT_SID || '') + ':' + (process.env.TWILIO_AUTH_TOKEN || '')).toString('base64');
        var extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4' };
        for (var mi = 0; mi < numMedia; mi++) {
          var twilioUrl = twilioBody['MediaUrl' + mi];
          var contentType = twilioBody['MediaContentType' + mi] || 'image/jpeg';
          if (!twilioUrl) continue;
          var ext = extMap[contentType] || 'jpg';
          var mediaSid = twilioUrl.split('/').pop() || ('media_' + mi);
          var storagePath = tenantId + '/conversations/' + conversationId + '/' + MessageSid + '-' + mediaSid + '.' + ext;
          try {
            // Download from Twilio
            var dlRes = await fetch(twilioUrl, { headers: { 'Authorization': 'Basic ' + twilioAuth } });
            if (!dlRes.ok) throw new Error('Twilio download ' + dlRes.status);
            var buf = Buffer.from(await dlRes.arrayBuffer());
            // Upload to Supabase Storage
            var { error: upErr } = await supabase.storage.from('tenant-photos').upload(storagePath, buf, { contentType: contentType, upsert: true });
            if (upErr) throw new Error('Storage upload: ' + upErr.message);
            storagePaths.push(storagePath);
            console.log('[SMS] MMS media saved to Storage:', storagePath, '(' + buf.length + ' bytes)');
          } catch (dlErr) {
            console.error('[SMS] MMS download/upload failed, falling back to Twilio URL:', dlErr.message);
            storagePaths.push(twilioUrl); // Fallback: store Twilio URL
          }
        }
        console.log('[SMS] MMS processed:', { numMedia: numMedia, storagePaths: storagePaths });
      }

      // 4. Save inbound message (with storage paths if MMS)
      try {
        const msgInsert = await supabase.from('messages').insert({
          tenant_id: tenantId, conversation_id: conversationId, contact_id: contactId,
          direction: 'inbound', channel: channel, body: Body || (numMedia > 0 ? '[Photo]' : ''), status: 'delivered',
          sender_type: 'contact', provider_message_id: MessageSid,
          media_urls: storagePaths.length > 0 ? storagePaths : null,
          metadata: { from: From, to: To, numMedia: numMedia }, created_at: now,
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

      // 5b. Contact enrichment: Haiku extraction for name, email, concerns, urgency (D2)
      // Skip on empty/media-only body. Awaited (~1-2s, within Twilio's 15s timeout).
      if (Body && Body.trim().length >= 3 && contactId) {
        try {
          var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
          if (ANTHROPIC_KEY) {
            var exController = new AbortController();
            var exTimeoutId = setTimeout(function() { exController.abort(); }, 15000);
            var exRes = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
              signal: exController.signal,
              body: JSON.stringify({
                model: 'claude-haiku-4-5', max_tokens: 150, temperature: 0,
                system: 'Extract contact information from this SMS message. Return ONLY valid JSON: {"first_name":null,"last_name":null,"email":null,"stated_concerns":null,"urgency_signal":null}. first_name/last_name = the person\'s actual name if they stated it. email = an email address if they shared one. stated_concerns = what they want help with (e.g. "composite bonding", "pricing question"). urgency_signal = any time pressure (e.g. "wedding next month", "traveling this week"). Return null for any field not explicitly stated. Do NOT invent or guess. Do NOT extract greetings, common words, or partial phrases as names.',
                messages: [{ role: 'user', content: Body.trim() }],
              }),
            });
            clearTimeout(exTimeoutId);
            if (exRes.ok) {
              var exData = await exRes.json();
              var exText = (exData.content || []).find(function(b) { return b.type === 'text'; });
              if (exText) {
                var jsonMatch = (exText.text || '').match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  var extracted = JSON.parse(jsonMatch[0]);
                  var { data: curContact } = await supabase.from('contacts').select('first_name, last_name, email, custom_fields').eq('id', contactId).maybeSingle();
                  if (curContact) {
                    var enrichUpdates = {};
                    if (extracted.first_name && !curContact.first_name) enrichUpdates.first_name = extracted.first_name;
                    if (extracted.last_name && !curContact.last_name) enrichUpdates.last_name = extracted.last_name;
                    if (extracted.email && !curContact.email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(extracted.email)) {
                      enrichUpdates.email = extracted.email.toLowerCase();
                    }
                    var cf = curContact.custom_fields || {};
                    if (extracted.stated_concerns && !cf.stated_concerns) { cf.stated_concerns = extracted.stated_concerns; enrichUpdates.custom_fields = cf; }
                    if (extracted.urgency_signal && !cf.urgency_signal) { cf.urgency_signal = extracted.urgency_signal; enrichUpdates.custom_fields = cf; }
                    if (Object.keys(enrichUpdates).length > 0) {
                      await supabase.from('contacts').update(enrichUpdates).eq('id', contactId).eq('tenant_id', tenantId);
                      console.log('[SMS] Contact enriched:', contactId, Object.keys(enrichUpdates));
                    }
                  }
                }
              }
            }
          }
        } catch (enrichErr) { /* non-fatal */ }
      }

      // 6. Auto-create pipeline lead for SP tenant
      try {
        if (tenantId === (process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387')) {
          var leadCheck = await supabase.from('leads').select('id').or('name.eq.' + From + ',notes.ilike.%' + From + '%').limit(1);
          if (!leadCheck.data || leadCheck.data.length === 0) {
            var smsStageId = await getPipelineStageId(supabase, tenantId, STAGE_KEYS.LEAD);
            await supabase.from('leads').insert({
              tenant_id: tenantId,
              name: null, company: null, type: 'Unknown', urgency: 'Warm',
              pipeline_stage_id: smsStageId,
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
        // Opt-out MUST suppress all future outbound. is_blocked is the only field the send/enroll
        // gates check (status='unsubscribed' alone was never consulted), so set both. blocked_at
        // records the opt-out time. Re-subscribe (opt_in below) clears it.
        await supabase.from('contacts').update({ status: 'unsubscribed', is_blocked: true, blocked_at: now, updated_at: now }).eq('id', contactId);
      } else if (messageType === 'opt_in' && contactId) {
        // Re-subscribe (START/UNSTOP): clear the opt-out block so outbound can resume.
        await supabase.from('contacts').update({ status: 'active', is_blocked: false, blocked_at: null, updated_at: now }).eq('id', contactId);
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

      // 8d. Omnichannel digest: log Claude analysis to email_actions
      try {
        var oi = require('./_omnichannel-insight');
        oi.logInboundInsight({
          supabase: supabase, channel: 'sms',
          senderEmail: contactEmail, senderPhone: From,
          senderName: null, subject: null, body: Body,
        }).catch(function() {});
      } catch (oiErr) { console.warn('[SMS] digest log error:', oiErr.message); }

      // 9. Notify inbound (non-blocking)
      var contactDisplayName = From;
      try { var cn = await supabase.from('contacts').select('first_name, last_name').eq('id', contactId).single(); if (cn.data) contactDisplayName = [cn.data.first_name, cn.data.last_name].filter(Boolean).join(' ') || From; } catch(e) {}
      notifyInboundSendGrid(contactDisplayName, channel.toUpperCase(), Body, tenantId, supabase).catch(function() {});
      notifyInbound(supabase, tenantId, From, Body).catch(function(err) {
        console.error('[Notify] Error:', err.message);
      });

      // 8e. Candidacy gate: MMS on gated tenant → ack + hold for human verdict
      // Gate OFF: no MMS interception — photo saved at step 4, flows to AI at step 9
      console.log('[GATE] decision:', { numMedia: numMedia, messageType: messageType, tenantId: tenantId, conversationId: conversationId, twilioNumMedia: twilioBody.NumMedia });
      if (numMedia > 0 && messageType === 'inbound') {
        var candidacyGateEnabled = false;
        var candidacyStateRead = null;
        try {
          var gateCheck = await supabase.from('chatbot_configs').select('candidacy_gate_enabled, candidacy_ack_template, candidacy_approve_template, candidacy_reject_template')
            .eq('tenant_id', tenantId).limit(1).maybeSingle();
          if (gateCheck.data && gateCheck.data.candidacy_gate_enabled === true) candidacyGateEnabled = true;
        } catch (_) {}
        try {
          var stateRead = await supabase.from('conversations').select('candidacy_state').eq('id', conversationId).maybeSingle();
          candidacyStateRead = stateRead.data ? stateRead.data.candidacy_state : 'QUERY_EMPTY';
        } catch (_) { candidacyStateRead = 'QUERY_ERROR'; }
        console.log('[GATE] evaluated:', { candidacyGateEnabled: candidacyGateEnabled, candidacyState: candidacyStateRead, branch: candidacyGateEnabled ? 'GATE_ON' : 'GATE_OFF_FALLTHROUGH' });

        if (candidacyGateEnabled) {
          // Gate fires ONLY on NULL or 'auto'. All other states are no-ops:
          // awaiting → already gated, no re-ack, early return
          // approved → already cleared, skip gate, fall through to AI at step 9
          // rejected → terminal, early return (step 8f suppresses AI)
          var skipGate = false;
          try {
            var currentConvState = await supabase.from('conversations').select('candidacy_state').eq('id', conversationId).maybeSingle();
            var curState = currentConvState.data ? currentConvState.data.candidacy_state : null;
            if (curState === 'awaiting_candidacy_approval' || curState === 'rejected') {
              console.log('[SMS] MMS received, candidacy state:', curState, '— no re-gate:', conversationId);
              res.setHeader('Content-Type', 'text/xml'); return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
            }
            if (curState === 'approved' || curState === 'awaiting_candidate_name' || curState === 'candidate_complete') {
              console.log('[SMS] MMS on post-approval conversation — skipping gate, flowing to AI:', conversationId);
              skipGate = true;
            }
          } catch (_) {}
          if (!skipGate) {

          // Ack message: config template > AI-generated holding ack > (never hardcoded)
          var ackMessage = null;
          if (gateCheck.data && gateCheck.data.candidacy_ack_template) {
            ackMessage = gateCheck.data.candidacy_ack_template;
          } else {
            // AI-generated holding ack — constrained: acknowledge photo, set expectation, MUST NOT assess
            try {
              var ackReply = await getAIReply(supabase, tenantId,
                '[SYSTEM: The patient just sent a smile photo. Generate a brief, warm acknowledgment (1-2 sentences). ' +
                'Tell them you received their photo and someone from the team will review it shortly. ' +
                'Do NOT assess candidacy, do NOT mention pricing, do NOT make any clinical statement. ' +
                'Just acknowledge receipt and set expectation of a follow-up.]', channel);
              if (ackReply) ackMessage = ackReply;
            } catch (_) {}
          }
          if (!ackMessage) ackMessage = CD.CANDIDACY_ACK;

          console.log('[SMS] Candidacy gate MMS:', { from: From, tenant: tenantId, media: storagePaths.length });
          try {
            await sendSMS(From, ackMessage, To, { messagingServiceSid: tenantSmsConfig && tenantSmsConfig.twilio_messaging_service_sid });
            await supabase.from('messages').insert({
              tenant_id: tenantId, conversation_id: conversationId, contact_id: contactId,
              direction: 'outbound', channel: channel, body: ackMessage,
              status: 'sent', sender_type: 'bot', metadata: { from: To, to: From, mms_ack: true, candidacy_gate: true }, created_at: new Date().toISOString(),
            });
          } catch (mmsErr) { console.error('[SMS] MMS ack error:', mmsErr.message); }

          // Flip state to awaiting
          try {
            await supabase.from('conversations').update({
              candidacy_state: 'awaiting_candidacy_approval', unread_count: 1, updated_at: new Date().toISOString(),
            }).eq('id', conversationId);
          } catch (flagErr) { console.error('[SMS] Flag error:', flagErr.message); }

          // Beta-simple: no draft row. Buttons send templates directly.
          res.setHeader('Content-Type', 'text/xml'); return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
          } // end if (!skipGate) — approved falls through to step 9
        }
        // Gate OFF: fall through to step 9 (AI auto-response handles MMS like any inbound)
      }

      // 8f. Load conversation state + photo presence for AI branching
      var convCandidacyState = null;
      var convStatus = null;
      var convResolutionReason = null;
      var convHasPhoto = false;
      if (messageType === 'inbound' && conversationId) {
        try {
          var convStateRes = await supabase.from('conversations').select('candidacy_state, status').eq('id', conversationId).maybeSingle();
          if (convStateRes.data) {
            convCandidacyState = convStateRes.data.candidacy_state;
            convStatus = convStateRes.data.status;
          }
        } catch (_) {}
        // Check if any inbound message in this conversation has media
        try {
          var { data: photoCheck } = await supabase.from('messages')
            .select('id').eq('conversation_id', conversationId).eq('direction', 'inbound')
            .not('media_urls', 'is', null).limit(1);
          if (photoCheck && photoCheck.length > 0) convHasPhoto = true;
        } catch (_) {}
      }

      // Suppress: awaiting verdict OR rejected (post-reject silence)
      if (messageType === 'inbound' && conversationId) {
        if (convCandidacyState === 'awaiting_candidacy_approval') {
          console.log('[SMS] AI suppressed — awaiting candidacy approval:', conversationId);
          res.setHeader('Content-Type', 'text/xml'); return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        }
        if (convCandidacyState === 'rejected' || (convStatus === 'resolved' && convResolutionReason === 'rejected')) {
          console.log('[SMS] AI suppressed — rejected/resolved:', conversationId);
          res.setHeader('Content-Type', 'text/xml'); return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        }
      }

      // 8g. Name-capture completion check: step 5b may have extracted the name already
      // When name is found, ALWAYS early-return — never fall through to AI.
      if (messageType === 'inbound' && convCandidacyState === 'awaiting_candidate_name' && contactId) {
        var capName = null;
        try {
          var { data: capContact } = await supabase.from('contacts').select('first_name, phone').eq('id', contactId).maybeSingle();
          if (capContact && capContact.first_name && capContact.first_name.trim()) capName = capContact.first_name;
        } catch (capReadErr) { console.error('[SMS] Name-capture read error:', capReadErr.message); }

        if (capName) {
          // 1. Tag + state transition via RPC
          try {
            await supabase.rpc('complete_candidate_capture', {
              p_tenant_id: tenantId, p_contact_id: contactId,
              p_conversation_id: conversationId, p_phone: From,
            });
          } catch (rpcErr) { console.error('[SMS] complete_candidate_capture RPC error:', rpcErr.message); }

          // 2. Send completion template verbatim
          var completeBody = null;
          try {
            var { data: completeConfig } = await supabase.from('chatbot_configs')
              .select('candidacy_complete_template').eq('tenant_id', tenantId).limit(1).maybeSingle();
            if (completeConfig) completeBody = completeConfig.candidacy_complete_template;
          } catch (_) {}
          if (!completeBody) completeBody = CD.CANDIDACY_COMPLETE;
          try {
            await sendSMS(From, completeBody, To, { messagingServiceSid: tenantSmsConfig && tenantSmsConfig.twilio_messaging_service_sid });
            await supabase.from('messages').insert({
              tenant_id: tenantId, conversation_id: conversationId, contact_id: contactId,
              direction: 'outbound', channel: channel, body: completeBody,
              status: 'sent', sender_type: 'bot',
              metadata: { candidacy_complete: true }, created_at: new Date().toISOString(),
            });
          } catch (compErr) { console.error('[SMS] Completion send error:', compErr.message); }

          // 3. Go quiet — unconditional early-return, AI never takes a turn
          console.log('[SMS] Name captured (' + capName + '), candidate complete:', contactId);
          res.setHeader('Content-Type', 'text/xml'); return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        }
      }

      // 9. AI auto-response (state-aware)
      if (messageType === 'inbound') {
        try {
          // Load name-ask template if in name-capture state
          var nameAskTemplate = null;
          if (convCandidacyState === 'awaiting_candidate_name') {
            try {
              var { data: nameConfig } = await supabase.from('chatbot_configs').select('candidacy_name_ask_template').eq('tenant_id', tenantId).limit(1).maybeSingle();
              if (nameConfig) nameAskTemplate = nameConfig.candidacy_name_ask_template;
            } catch (_) {}
          }
          var aiReply = await getAIReply(supabase, tenantId, Body, channel, {
            candidacyState: convCandidacyState,
            hasPhoto: convHasPhoto,
            conversationId: conversationId,
            nameAskTemplate: nameAskTemplate,
          });
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
              smsResult = await sendSMS(From, aiReply, To, { messagingServiceSid: tenantSmsConfig && tenantSmsConfig.twilio_messaging_service_sid });
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

            // Usage meter: increment outbound counter for this tenant
            try {
              var _usage = require('./_usage-meter');
              var col = channel === 'whatsapp' ? 'whatsapp_used' : 'sms_used';
              _usage.incrementTenantCounter(supabase, tenantId, col, 1);
            } catch (mErr) {}
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
