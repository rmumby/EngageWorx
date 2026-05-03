// api/action-items/snooze.js — Snooze an action item
// POST { action_item_id, duration: "1d" | "3d" | "1w" }

var { createClient } = require('@supabase/supabase-js');

var DURATIONS = {
  '1d': 1 * 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
};

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

  var body = req.body || {};
  var itemId = body.action_item_id;
  var duration = body.duration || '1d';
  if (!itemId) return res.status(400).json({ error: 'action_item_id required' });

  var ms = DURATIONS[duration];
  if (!ms) return res.status(400).json({ error: 'Invalid duration. Use: 1d, 3d, 1w' });

  var snoozeUntil = new Date(Date.now() + ms).toISOString();

  var { error } = await supabase.from('action_items').update({
    status: 'snoozed',
    snooze_until: snoozeUntil,
  }).eq('id', itemId).eq('user_id', userData.user.id);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true, snooze_until: snoozeUntil });
};
