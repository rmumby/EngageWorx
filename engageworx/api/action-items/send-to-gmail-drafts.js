// api/action-items/send-to-gmail-drafts.js — Create a Gmail draft from an action item
// POST { action_item_id }
// Returns { ok, gmail_draft_id, deep_link }

var { createClient } = require('@supabase/supabase-js');
var { getGmailClient } = require('../_lib/gmail-client');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function buildMimeMessage(from, to, subject, htmlBody) {
  var boundary = 'boundary_' + Date.now().toString(36);
  var lines = [
    'From: ' + from,
    'To: ' + (Array.isArray(to) ? to.join(', ') : to),
    'Subject: ' + (subject || '(no subject)'),
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + boundary + '"',
    '',
    '--' + boundary,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    (htmlBody || '').replace(/<[^>]+>/g, '').substring(0, 5000),
    '',
    '--' + boundary,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    htmlBody || '',
    '',
    '--' + boundary + '--',
  ];
  return lines.join('\r\n');
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

  var itemId = (req.body || {}).action_item_id;
  if (!itemId) return res.status(400).json({ error: 'action_item_id required' });

  // Load action item
  var { data: item, error: fetchErr } = await supabase.from('action_items')
    .select('id, tenant_id, status, draft_subject, draft_body_html, draft_recipients')
    .eq('id', itemId)
    .maybeSingle();

  if (fetchErr || !item) return res.status(404).json({ error: 'Action item not found' });
  if (item.status !== 'pending') return res.status(400).json({ error: 'Action item is ' + item.status + ', must be pending' });

  // Verify user is member of this tenant
  var { data: member } = await supabase.from('tenant_members')
    .select('id').eq('user_id', userId).eq('tenant_id', item.tenant_id).eq('status', 'active').maybeSingle();
  if (!member) {
    // SP admin fallback
    var { data: profile } = await supabase.from('user_profiles').select('role').eq('id', userId).maybeSingle();
    if (!profile || !['superadmin', 'super_admin', 'sp_admin'].includes(profile.role)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
  }

  // Get Gmail client for this user
  var gmail;
  try {
    gmail = await getGmailClient(supabase, userId);
  } catch (e) {
    return res.status(400).json({ error: e.message, needs_gmail_connect: true });
  }

  // Build recipients
  var recipients = item.draft_recipients || [];
  var toAddresses = recipients.map(function(r) {
    return typeof r === 'string' ? r : (r.email || r.address || '');
  }).filter(Boolean);

  if (toAddresses.length === 0) {
    return res.status(400).json({ error: 'No recipients on this action item' });
  }

  // Build MIME message
  var mime = buildMimeMessage(gmail.emailAddress, toAddresses, item.draft_subject, item.draft_body_html);
  var raw = Buffer.from(mime).toString('base64url');

  // Create Gmail draft
  try {
    var draftRes = await gmail.fetch('/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { raw: raw } }),
    });

    if (!draftRes.ok) {
      var errBody = await draftRes.json().catch(function() { return {}; });
      console.error('[send-to-gmail-drafts] Gmail API error:', draftRes.status, errBody);
      if (draftRes.status === 401) {
        return res.status(401).json({ error: 'Gmail connection expired. Please reconnect in Settings.', needs_gmail_connect: true });
      }
      return res.status(500).json({ error: 'Gmail draft creation failed: ' + (errBody.error && errBody.error.message || 'HTTP ' + draftRes.status) });
    }

    var draftData = await draftRes.json();
    var draftId = draftData.id;
    var threadId = draftData.message && draftData.message.threadId;

    // Update action item
    await supabase.from('action_items').update({
      status: 'drafted_to_gmail',
      gmail_draft_id: draftId,
      gmail_thread_id: threadId,
      gmail_user_id: userId,
      gmail_drafted_at: new Date().toISOString(),
      has_new_activity_since_draft: false,
    }).eq('id', itemId);

    console.log('[send-to-gmail-drafts] Draft created:', draftId, 'item:', itemId, 'user:', userId);

    var deepLink = 'https://mail.google.com/mail/u/0/#drafts?compose=' + draftId;
    return res.status(200).json({ ok: true, gmail_draft_id: draftId, gmail_thread_id: threadId, deep_link: deepLink });

  } catch (e) {
    console.error('[send-to-gmail-drafts] Error:', e.message);
    return res.status(500).json({ error: 'Failed to create Gmail draft: ' + e.message });
  }
};
