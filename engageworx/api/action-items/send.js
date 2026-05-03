// api/action-items/send.js — Approve & send an action item's draft
// POST { action_item_id }
// Sends draft email via tenant's email method, marks status='sent'

var { createClient } = require('@supabase/supabase-js');
var { sendEmail } = require('../_lib/send-email');

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

  // Resolve sender info
  var fromEmail = process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com';
  var fromName = 'EngageWorx';
  try {
    var { data: profile } = await supabase.from('user_profiles')
      .select('full_name, email, sender_email').eq('id', userId).maybeSingle();
    if (profile) {
      fromName = profile.full_name || fromName;
      fromEmail = profile.sender_email || profile.email || fromEmail;
    }
  } catch (_) {}

  // Send to each recipient
  var sendErrors = [];
  for (var i = 0; i < item.draft_recipients.length; i++) {
    var recip = item.draft_recipients[i];
    var result = await sendEmail({
      to: recip.email,
      from: fromEmail,
      fromName: fromName,
      subject: item.draft_subject || 'Following up',
      html: item.draft_body_html || '<p>Following up on our conversation.</p>',
    });
    if (!result.success) {
      sendErrors.push({ email: recip.email, error: result.error });
    }
  }

  if (sendErrors.length > 0 && sendErrors.length === item.draft_recipients.length) {
    return res.status(502).json({ error: 'All sends failed', details: sendErrors });
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
