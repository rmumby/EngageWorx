// api/candidacy-approve.js — Human approval/rejection of candidacy verdict
// POST { conversation_id, verdict: 'approved' | 'rejected', tenant_id }
// Sends templated SMS to the patient, resumes AI auto-response.

var { createClient } = require('@supabase/supabase-js');
var CD = require('../src/lib/candidacyDefaults');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var supabase = getSupabase();
  var body = req.body || {};
  var conversationId = body.conversation_id;
  var verdict = body.verdict;

  if (!conversationId || !verdict) {
    return res.status(400).json({ error: 'conversation_id and verdict required' });
  }
  if (['approved', 'rejected'].indexOf(verdict) === -1) {
    return res.status(400).json({ error: 'verdict must be approved or rejected' });
  }

  // Auth: verify caller
  var authHeader = req.headers.authorization || '';
  var token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing auth' });
  var { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid auth' });

  // Load conversation — tenant_id derived from the row, NOT from the request body
  var { data: conv, error: convErr } = await supabase.from('conversations')
    .select('id, tenant_id, contact_id, channel, candidacy_state')
    .eq('id', conversationId).maybeSingle();
  if (convErr || !conv) return res.status(404).json({ error: 'Conversation not found' });
  var tenantId = conv.tenant_id;
  // Cross-check: if body includes tenant_id, reject on mismatch (guard only)
  if (body.tenant_id && body.tenant_id !== tenantId) {
    return res.status(403).json({ error: 'Tenant mismatch' });
  }
  // Authorization: caller must be a member of this tenant OR superadmin
  var { data: callerProfile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  var isSA = callerProfile && callerProfile.role === 'superadmin';
  if (!isSA) {
    var { data: membership } = await supabase.from('tenant_members').select('id').eq('tenant_id', tenantId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (!membership) return res.status(403).json({ error: 'Not authorized for this tenant' });
  }

  if (conv.candidacy_state !== 'awaiting_candidacy_approval') {
    return res.status(400).json({ error: 'Conversation is not awaiting candidacy approval', current_state: conv.candidacy_state });
  }

  // Load chatbot config for templated verdict messages
  var { data: config } = await supabase.from('chatbot_configs')
    .select('candidacy_approve_template, candidacy_reject_template, candidacy_name_ask_template')
    .eq('tenant_id', tenantId).limit(1).maybeSingle();

  // Load contact for phone + name check
  var contactPhone = null;
  var contactHasName = false;
  if (conv.contact_id) {
    var { data: contact } = await supabase.from('contacts').select('phone, mobile_phone, first_name').eq('id', conv.contact_id).maybeSingle();
    if (contact) {
      contactPhone = contact.phone || contact.mobile_phone;
      contactHasName = !!(contact.first_name && contact.first_name.trim());
    }
  }
  // Fallback: get phone from conversation's last inbound message metadata
  if (!contactPhone) {
    var { data: lastMsg } = await supabase.from('messages')
      .select('metadata').eq('conversation_id', conversationId).eq('direction', 'inbound')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (lastMsg && lastMsg.metadata) contactPhone = lastMsg.metadata.from;
  }

  if (!contactPhone) {
    return res.status(400).json({ error: 'Cannot find contact phone number for this conversation' });
  }

  // Load tenant SMS config for messaging service SID
  var tenantMsSid = null;
  try {
    var { data: cc } = await supabase.from('channel_configs').select('config_encrypted')
      .eq('tenant_id', tenantId).eq('channel', 'sms').maybeSingle();
    if (cc && cc.config_encrypted) tenantMsSid = cc.config_encrypted.twilio_messaging_service_sid;
  } catch (_) {}

  // Resolve the from number (tenant's configured number)
  var fromNumber = null;
  try {
    var { data: pn } = await supabase.from('phone_numbers').select('number')
      .eq('tenant_id', tenantId).eq('status', 'active').limit(1).maybeSingle();
    if (pn) fromNumber = pn.number;
  } catch (_) {}

  // Build verdict message: user textarea > config template > fallback
  var messageBody;
  if (verdict === 'rejected') {
    messageBody = (config && config.candidacy_reject_template) || CD.CANDIDACY_REJECT;
  } else if (body.message && body.message.trim()) {
    messageBody = body.message.trim();
  } else if (config && config.candidacy_approve_template) {
    messageBody = config.candidacy_approve_template;
  } else {
    messageBody = CD.CANDIDACY_APPROVE;
  }

  // No leak guard here — this is the human-approved send path.
  // Mila's edited/approved text sends verbatim. Leak guard lives
  // only on auto-generated draft content (sms.js draft insert).

  // Send verdict SMS
  try {
    var { sendSMS } = require('./sms');
    // sendSMS isn't exported — use inline Twilio call
    var accountSid = process.env.TWILIO_ACCOUNT_SID;
    var authToken = process.env.TWILIO_AUTH_TOKEN;
    var auth = Buffer.from(accountSid + ':' + authToken).toString('base64');
    var params = new URLSearchParams();
    params.append('To', contactPhone);
    if (tenantMsSid) {
      params.append('MessagingServiceSid', tenantMsSid);
    } else if (fromNumber) {
      params.append('From', fromNumber);
    } else {
      params.append('From', process.env.TWILIO_PHONE_NUMBER || '+17869827800');
    }
    params.append('Body', messageBody);
    var smsRes = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json', {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    var smsData = await smsRes.json();
    if (!smsRes.ok) {
      console.error('[candidacy-approve] SMS send failed:', smsData);
    } else {
      console.log('[candidacy-approve] Verdict SMS sent:', { verdict: verdict, to: contactPhone, sid: smsData.sid });
    }
  } catch (smsErr) {
    console.error('[candidacy-approve] SMS error:', smsErr.message);
  }

  // Save verdict message to conversation
  try {
    await supabase.from('messages').insert({
      tenant_id: tenantId, conversation_id: conversationId, contact_id: conv.contact_id,
      direction: 'outbound', channel: conv.channel || 'sms',
      body: messageBody, status: 'sent', sender_type: 'agent',
      metadata: { candidacy_verdict: verdict, approved_by: user.id },
      created_at: new Date().toISOString(),
    });
  } catch (_) {}

  // Update conversation state per verdict
  if (verdict === 'approved') {
    if (contactHasName) {
      // Name already known — complete capture immediately via RPC
      try {
        await supabase.rpc('complete_candidate_capture', {
          p_tenant_id: tenantId, p_contact_id: conv.contact_id,
          p_conversation_id: conversationId, p_phone: contactPhone,
        });
      } catch (rpcErr) { console.error('[candidacy-approve] RPC error:', rpcErr.message); }
    } else {
      // Name unknown — approval template already includes the name-ask copy;
      // transition to capture state and let the candidate's reply trigger extraction
      await supabase.from('conversations').update({
        candidacy_state: 'awaiting_candidate_name', updated_at: new Date().toISOString(),
      }).eq('id', conversationId);
    }
  } else {
    // Rejected → resolve
    await supabase.from('conversations').update({
      candidacy_state: 'rejected', status: 'resolved', updated_at: new Date().toISOString(),
    }).eq('id', conversationId);
  }
  var newState = verdict === 'approved' ? (contactHasName ? 'candidate_complete' : 'awaiting_candidate_name') : 'rejected';

  // Audit log
  try {
    await supabase.rpc('log_audit_event', {
      p_action: 'candidacy.' + verdict,
      p_resource_type: 'conversations',
      p_tenant_id: tenantId,
      p_user_id: user.id,
      p_resource_id: conversationId,
      p_details: { verdict: verdict, contact_phone: contactPhone },
      p_ip_address: null,
      p_user_agent: null,
    });
  } catch (_) {}

  return res.status(200).json({
    success: true,
    verdict: verdict,
    conversation_id: conversationId,
    message_sent: true,
    candidacy_state: newState,
  });
};
