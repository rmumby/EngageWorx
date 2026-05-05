// api/action-items/send.js — Approve & send an action item's draft
// POST { action_item_id }
// Sends draft email via tenant's email method, marks status='sent'

var { createClient } = require('@supabase/supabase-js');
var { sendTenantEmail } = require('../_lib/send-tenant-email');

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

  var authHeader = req.headers.authorization || '';
  var jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return res.status(401).json({ error: 'Authorization required' });

  var supabase = getSupabase();
  var { data: userData, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !userData || !userData.user) return res.status(401).json({ error: 'Invalid token' });
  var userId = userData.user.id;

  var itemId = (req.body || {}).action_item_id;
  if (!itemId) return res.status(400).json({ error: 'action_item_id required' });

  // Fetch the action item
  var { data: item, error: fetchErr } = await supabase.from('action_items')
    .select('*').eq('id', itemId).eq('user_id', userId).eq('status', 'pending').single();

  if (fetchErr || !item) return res.status(404).json({ error: 'Action item not found or not pending' });

  if (!item.draft_recipients || item.draft_recipients.length === 0) {
    return res.status(400).json({ error: 'No recipients on this draft' });
  }

  console.log('[action-items/send]', { tenant_id: item.tenant_id, item_id: itemId, recipients: item.draft_recipients.length });

  // Resolve conversation for threading (find existing or create)
  var contactId = item.contact_id || null;
  if (!contactId && item.lead_id) {
    try {
      var leadLookup = await supabase.from('leads').select('contact_id').eq('id', item.lead_id).maybeSingle();
      if (leadLookup.data && leadLookup.data.contact_id) contactId = leadLookup.data.contact_id;
    } catch (e) {}
  }

  var conversationId = item.conversation_id || null;
  if (!conversationId && contactId && item.tenant_id) {
    var convLookup = await supabase.from('conversations').select('id')
      .eq('contact_id', contactId).eq('tenant_id', item.tenant_id).eq('channel', 'email')
      .in('status', ['active', 'waiting', 'snoozed'])
      .order('last_message_at', { ascending: false }).limit(1).maybeSingle();
    if (convLookup.data) conversationId = convLookup.data.id;
  }

  // Create conversation if none found — Action Board sends always create a thread
  if (!conversationId && item.tenant_id) {
    console.log('[action-items/send] No existing conversation — creating. contact_id:', contactId, 'tenant_id:', item.tenant_id);
    try {
      var newConv = await supabase.from('conversations').insert({
        tenant_id: item.tenant_id,
        contact_id: contactId,
        channel: 'email',
        subject: item.draft_subject || 'Following up',
        status: 'active',
        last_message_at: new Date().toISOString(),
        unread_count: 0,
      }).select('id').single();
      console.log('[action-items/send] Conversation insert result:', JSON.stringify({ data: newConv.data, error: newConv.error, status: newConv.status }));
      if (newConv.data && newConv.data.id) {
        conversationId = newConv.data.id;
      } else {
        console.warn('[action-items/send] Conversation create returned no id. error:', JSON.stringify(newConv.error));
        // Fallback: insert without .select() and read back
        var fallbackConv = await supabase.from('conversations').insert({
          tenant_id: item.tenant_id,
          contact_id: contactId,
          channel: 'email',
          subject: item.draft_subject || 'Following up',
          status: 'active',
          last_message_at: new Date().toISOString(),
          unread_count: 0,
        });
        console.log('[action-items/send] Fallback insert result:', JSON.stringify({ error: fallbackConv.error, status: fallbackConv.status }));
        if (!fallbackConv.error) {
          // Read back the conversation we just created
          var readBack = await supabase.from('conversations')
            .select('id').eq('tenant_id', item.tenant_id).eq('channel', 'email')
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
          if (readBack.data) conversationId = readBack.data.id;
          console.log('[action-items/send] Fallback read-back:', JSON.stringify({ id: readBack.data && readBack.data.id, error: readBack.error }));
        }
      }
    } catch (convErr) {
      console.error('[action-items/send] Conversation create exception:', convErr.message, convErr.stack);
    }
  }

  if (!conversationId) {
    console.warn('[action-items/send] No conversationId resolved — message row will not be stored. item:', itemId, 'contact_id:', contactId, 'tenant_id:', item.tenant_id);
  } else {
    console.log('[action-items/send] Using conversationId:', conversationId);
  }

  // Send to each recipient via tenant's configured email method
  var sendErrors = [];
  var sendResults = [];
  for (var i = 0; i < item.draft_recipients.length; i++) {
    var recip = item.draft_recipients[i];
    try {
      var sendResult = await sendTenantEmail(supabase, {
        tenant_id: item.tenant_id,
        to: recip.email,
        subject: item.draft_subject || 'Following up',
        html: item.draft_body_html || '<p>Following up on our conversation.</p>',
        conversation_id: conversationId,
      });
      sendResults.push({ email: recip.email, result: sendResult });
    } catch (sendErr) {
      sendErrors.push({ email: recip.email, error: sendErr.message });
    }
  }

  if (sendErrors.length > 0 && sendErrors.length === item.draft_recipients.length) {
    return res.status(502).json({ error: 'All sends failed', details: sendErrors });
  }

  // Store outbound message for threading
  var firstSuccess = sendResults[0];
  var threadId = firstSuccess && firstSuccess.result ? firstSuccess.result.threadId : null;
  var replyToAddr = firstSuccess && firstSuccess.result ? firstSuccess.result.replyToAddress : null;

  if (!firstSuccess) {
    console.warn('[action-items/send] No successful send — skipping message row. item:', itemId);
  } else if (!threadId) {
    console.warn('[action-items/send] sendTenantEmail returned no threadId — message row will lack reply routing. item:', itemId, 'conversationId:', conversationId);
  }
  if (!conversationId) {
    console.warn('[action-items/send] No conversationId — skipping message row insert. item:', itemId);
  }

  if (firstSuccess && conversationId) {
    try {
      await supabase.from('messages').insert({
        tenant_id: item.tenant_id,
        conversation_id: conversationId,
        contact_id: contactId,
        channel: 'email',
        direction: 'outbound',
        sender_type: 'agent',
        body: item.draft_body_html || item.draft_subject || 'Following up',
        status: 'sent',
        metadata: { reply_thread_id: threadId, reply_to_address: replyToAddr, source: 'action_board' },
        created_at: new Date().toISOString(),
      });
      await supabase.from('conversations').update({
        last_message_at: new Date().toISOString(),
        status: 'waiting',
      }).eq('id', conversationId);
    } catch (msgErr) {
      console.error('[action-items/send] Message row insert error:', msgErr.message);
    }
  }

  // Mark sent
  await supabase.from('action_items').update({
    status: 'sent',
    sent_at: new Date().toISOString(),
    final_sent_html: item.draft_body_html,
  }).eq('id', itemId);

  // Advance pipeline stage if mechanical
  if (item.stage_advance_type === 'mechanical' && item.predicted_stage_id && item.lead_id) {
    try {
      await supabase.from('leads').update({ pipeline_stage_id: item.predicted_stage_id }).eq('id', item.lead_id);
    } catch (_) {}
  }

  return res.status(200).json({
    success: true,
    sent_to: item.draft_recipients.map(function(r) { return r.email; }),
    send_errors: sendErrors.length > 0 ? sendErrors : undefined,
  });
};
