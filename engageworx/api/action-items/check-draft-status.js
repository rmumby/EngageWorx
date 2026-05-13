// api/action-items/check-draft-status.js — Single-row draft status check
// POST { action_item_id }
// Used by client-side polling + foreground checks.
// Returns { status, draft_exists, was_sent, gmail_message_id }

var { createClient } = require('@supabase/supabase-js');
var { getGmailClient } = require('../_lib/gmail-client');

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

  var jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;
  if (!jwt) return res.status(401).json({ error: 'Authentication required' });

  var supabase = getSupabase();
  var { data: userData, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !userData || !userData.user) return res.status(401).json({ error: 'Invalid token' });

  var itemId = (req.body || {}).action_item_id;
  if (!itemId) return res.status(400).json({ error: 'action_item_id required' });

  var { data: item } = await supabase.from('action_items')
    .select('id, status, gmail_draft_id, gmail_thread_id, gmail_user_id, gmail_drafted_at')
    .eq('id', itemId)
    .maybeSingle();

  if (!item) return res.status(404).json({ error: 'Action item not found' });
  if (item.status !== 'drafted_to_gmail') return res.status(200).json({ status: item.status, draft_exists: false, was_sent: false });
  if (!item.gmail_draft_id || !item.gmail_user_id) return res.status(200).json({ status: item.status, draft_exists: false, was_sent: false });

  var gmail;
  try {
    gmail = await getGmailClient(supabase, item.gmail_user_id);
  } catch (e) {
    return res.status(200).json({ status: item.status, draft_exists: null, was_sent: false, error: e.message });
  }

  // Check if draft still exists
  try {
    var draftRes = await gmail.fetch('/drafts/' + item.gmail_draft_id);

    if (draftRes.ok) {
      // Draft still exists — not sent yet
      return res.status(200).json({ status: 'drafted_to_gmail', draft_exists: true, was_sent: false });
    }

    if (draftRes.status === 404) {
      // Draft gone — check if it was sent via the thread
      if (item.gmail_thread_id) {
        try {
          var threadRes = await gmail.fetch('/threads/' + item.gmail_thread_id + '?format=metadata&metadataHeaders=From');
          if (threadRes.ok) {
            var threadData = await threadRes.json();
            var messages = threadData.messages || [];
            var draftedAtMs = item.gmail_drafted_at ? new Date(item.gmail_drafted_at).getTime() : 0;

            // Look for a SENT message after the draft was created
            var sentMsg = messages.find(function(m) {
              var isSent = (m.labelIds || []).indexOf('SENT') !== -1;
              var afterDraft = parseInt(m.internalDate || '0') > draftedAtMs;
              return isSent && afterDraft;
            });

            if (sentMsg) {
              // Draft was sent from Gmail
              await supabase.from('action_items').update({
                status: 'sent',
                gmail_message_id: sentMsg.id,
                sent_at: new Date(parseInt(sentMsg.internalDate)).toISOString(),
              }).eq('id', itemId).eq('status', 'drafted_to_gmail');

              console.log('[check-draft-status] Draft sent from Gmail:', itemId, 'message:', sentMsg.id);
              return res.status(200).json({ status: 'sent', draft_exists: false, was_sent: true, gmail_message_id: sentMsg.id });
            }
          }
        } catch (threadErr) {
          console.warn('[check-draft-status] Thread check error:', threadErr.message);
        }
      }

      // Draft deleted without sending — revert to pending
      await supabase.from('action_items').update({
        status: 'pending',
        gmail_draft_id: null,
        gmail_thread_id: null,
        gmail_drafted_at: null,
        gmail_user_id: null,
        gmail_message_id: null,
        has_new_activity_since_draft: false,
      }).eq('id', itemId).eq('status', 'drafted_to_gmail');

      console.log('[check-draft-status] Draft deleted without send, reverted to pending:', itemId);
      return res.status(200).json({ status: 'pending', draft_exists: false, was_sent: false, reverted: true });
    }

    // Unexpected status
    return res.status(200).json({ status: item.status, draft_exists: null, was_sent: false, gmail_status: draftRes.status });

  } catch (e) {
    console.error('[check-draft-status] Error:', e.message);
    return res.status(200).json({ status: item.status, draft_exists: null, was_sent: false, error: e.message });
  }
};
