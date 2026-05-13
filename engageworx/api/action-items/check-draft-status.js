// api/action-items/check-draft-status.js — Single-row draft status check
// POST { action_item_id }
// Used by client-side polling + foreground checks.
// Returns { status, draft_exists, was_sent, gmail_message_id, diagnostics }
//
// TODO: Activity detection — has_new_activity_since_draft is never written today.
// To enable the "New activity since draft" warning badge on the Action Board,
// this endpoint (or the hourly reconciler) needs to compare gmail_drafted_at
// against new conversation_messages on the related lead/contact. If any
// message.created_at > gmail_drafted_at exists, set has_new_activity_since_draft=true
// on the action_item row. Separate workstream — do not implement here.

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

  var diagnostics = { draft_get_status: null, sent_messages_found: 0, sent_match_id: null, thread_messages_total: 0 };

  try {
    // 1. Check draft existence
    var draftRes = await gmail.fetch('/drafts/' + item.gmail_draft_id);
    diagnostics.draft_get_status = draftRes.status;
    var draftExists = draftRes.ok;

    // 2. ALWAYS check thread for sent messages — regardless of draft status
    // Gmail can report draft as still existing even after the user hits Send
    var sentMsg = null;
    if (item.gmail_thread_id) {
      try {
        var threadRes = await gmail.fetch('/threads/' + item.gmail_thread_id + '?format=full');
        if (threadRes.ok) {
          var threadData = await threadRes.json();
          var messages = threadData.messages || [];
          diagnostics.thread_messages_total = messages.length;
          var draftedAtMs = item.gmail_drafted_at ? new Date(item.gmail_drafted_at).getTime() : 0;

          // Find all SENT messages after the draft was created
          var sentMessages = messages.filter(function(m) {
            var isSent = (m.labelIds || []).indexOf('SENT') !== -1;
            var afterDraft = parseInt(m.internalDate || '0') > draftedAtMs;
            return isSent && afterDraft;
          });
          diagnostics.sent_messages_found = sentMessages.length;

          if (sentMessages.length > 0) {
            sentMsg = sentMessages[0];
            diagnostics.sent_match_id = sentMsg.id;
          }
        }
      } catch (threadErr) {
        console.warn('[check-draft-status] Thread check error:', threadErr.message);
      }
    }

    // 3. If a sent message was found in the thread — mark as sent
    if (sentMsg) {
      // Extract body HTML from the sent message
      var finalHtml = null;
      try {
        var parts = sentMsg.payload && sentMsg.payload.parts ? sentMsg.payload.parts : [sentMsg.payload];
        var htmlPart = (parts || []).find(function(p) { return p && p.mimeType === 'text/html'; });
        if (htmlPart && htmlPart.body && htmlPart.body.data) {
          finalHtml = Buffer.from(htmlPart.body.data, 'base64url').toString('utf-8');
        }
      } catch (bodyErr) { console.warn('[check-draft-status] Body extract error:', bodyErr.message); }

      await supabase.from('action_items').update({
        status: 'sent',
        gmail_message_id: sentMsg.id,
        sent_at: new Date(parseInt(sentMsg.internalDate)).toISOString(),
        final_sent_html: finalHtml,
      }).eq('id', itemId).eq('status', 'drafted_to_gmail');

      console.log('[check-draft-status] Draft sent from Gmail:', itemId, 'message:', sentMsg.id, 'draft_still_existed:', draftExists);
      return res.status(200).json({ status: 'sent', draft_exists: draftExists, was_sent: true, gmail_message_id: sentMsg.id, diagnostics: diagnostics });
    }

    // 4. No sent message found
    if (draftExists) {
      // Draft still in Gmail, not yet sent
      return res.status(200).json({ status: 'drafted_to_gmail', draft_exists: true, was_sent: false, diagnostics: diagnostics });
    }

    // 5. Draft gone AND no sent message → deleted without sending → revert
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
    return res.status(200).json({ status: 'pending', draft_exists: false, was_sent: false, reverted: true, diagnostics: diagnostics });

  } catch (e) {
    console.error('[check-draft-status] Error:', e.message);
    return res.status(200).json({ status: item.status, draft_exists: null, was_sent: false, error: e.message, diagnostics: diagnostics });
  }
};
