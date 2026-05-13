// api/gmail-disconnect.js — Disconnect Gmail from user's account
// POST { } (JWT required)
// Reverts any drafted_to_gmail action items, deletes Gmail drafts (best effort), revokes token

var { createClient } = require('@supabase/supabase-js');
var { getGmailClient } = require('./_lib/gmail-client');

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
  var userId = userData.user.id;

  // 1. Find action items in drafted_to_gmail state for this user
  var { data: draftedItems } = await supabase.from('action_items')
    .select('id, gmail_draft_id')
    .eq('gmail_user_id', userId)
    .eq('status', 'drafted_to_gmail');

  var cleanupResults = { reverted: 0, drafts_deleted: 0, draft_delete_errors: 0 };

  if (draftedItems && draftedItems.length > 0) {
    // Try to get Gmail client for draft cleanup (may fail if token already bad)
    var gmail = null;
    try { gmail = await getGmailClient(supabase, userId); } catch (e) {
      console.warn('[gmail-disconnect] Could not get Gmail client for cleanup:', e.message);
    }

    for (var i = 0; i < draftedItems.length; i++) {
      var item = draftedItems[i];

      // Delete Gmail draft (best effort — swallow failures)
      if (gmail && item.gmail_draft_id) {
        try {
          var delRes = await gmail.fetch('/drafts/' + item.gmail_draft_id, { method: 'DELETE' });
          if (delRes.ok || delRes.status === 404) cleanupResults.drafts_deleted++;
          else cleanupResults.draft_delete_errors++;
        } catch (e) {
          console.warn('[gmail-disconnect] Draft delete error for item', item.id, ':', e.message);
          cleanupResults.draft_delete_errors++;
        }
      }

      // Revert action item to pending
      await supabase.from('action_items').update({
        status: 'pending',
        gmail_draft_id: null,
        gmail_thread_id: null,
        gmail_drafted_at: null,
        gmail_user_id: null,
        gmail_message_id: null,
        has_new_activity_since_draft: false,
      }).eq('id', item.id);
      cleanupResults.reverted++;
    }
  }

  // 2. Revoke Google token (best effort)
  var { data: existing } = await supabase.from('user_gmail_tokens')
    .select('refresh_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing && existing.refresh_token) {
    try {
      await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(existing.refresh_token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch (e) { console.warn('[gmail-disconnect] Revoke error:', e.message); }
  }

  // 3. Delete token row
  await supabase.from('user_gmail_tokens').delete().eq('user_id', userId);

  console.log('[gmail-disconnect] Gmail disconnected for user:', userId, 'cleanup:', JSON.stringify(cleanupResults));
  return res.status(200).json({ ok: true, cleanup: cleanupResults });
};
