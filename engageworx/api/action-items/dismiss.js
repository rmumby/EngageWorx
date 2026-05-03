// api/action-items/dismiss.js — Dismiss an action item
// POST { action_item_id }

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

  var authHeader = req.headers.authorization || '';
  var jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return res.status(401).json({ error: 'Authorization required' });

  var supabase = getSupabase();
  var { data: userData } = await supabase.auth.getUser(jwt);
  if (!userData || !userData.user) return res.status(401).json({ error: 'Invalid token' });

  var itemId = (req.body || {}).action_item_id;
  if (!itemId) return res.status(400).json({ error: 'action_item_id required' });

  var { error } = await supabase.from('action_items').update({
    status: 'dismissed',
    dismissed_at: new Date().toISOString(),
  }).eq('id', itemId).eq('user_id', userData.user.id);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true });
};
