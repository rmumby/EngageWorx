// api/gmail-disconnect.js — Disconnect Gmail from user's account
// POST { } (JWT required)
// Deletes user_gmail_tokens row, revokes Google token

var { createClient } = require('@supabase/supabase-js');

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

  // Load existing tokens to revoke
  var { data: existing } = await supabase.from('user_gmail_tokens')
    .select('refresh_token, access_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing && existing.refresh_token && existing.refresh_token !== '__pending_oauth__') {
    // Revoke Google token (best effort)
    try {
      await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(existing.refresh_token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch (e) { console.warn('[gmail-disconnect] Revoke error:', e.message); }
  }

  // Delete row
  await supabase.from('user_gmail_tokens').delete().eq('user_id', userId);

  console.log('[gmail-disconnect] Gmail disconnected for user:', userId);
  return res.status(200).json({ ok: true });
};
