// api/weddings/archive.js — Archive an event (soft-delete via status='archived')
// POST /api/weddings/archive
// Auth: superadmin OR active tenant member

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

  var supabase = getSupabase();
  var body = req.body || {};

  var authHeader = req.headers.authorization || '';
  var token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  var { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid auth token' });

  var eventId = body.event_id;
  if (!eventId) return res.status(400).json({ error: 'event_id required' });

  // Look up event + verify tenant
  var { data: event, error: eventErr } = await supabase.from('weddings')
    .select('id, tenant_id, status').eq('id', eventId).maybeSingle();
  if (eventErr || !event) return res.status(404).json({ error: 'Event not found' });

  // Verify caller access
  var { data: callerProfile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  var isSA = callerProfile && (callerProfile.role === 'superadmin' || callerProfile.role === 'super_admin' || callerProfile.role === 'sp_admin');
  if (!isSA) {
    var { data: mem } = await supabase.from('tenant_members').select('id').eq('tenant_id', event.tenant_id).eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (!mem) return res.status(403).json({ error: 'Not authorized for this tenant' });
  }

  // Soft-delete: set status to 'archived'
  var newStatus = event.status === 'archived' ? 'planning' : 'archived';
  var { error: updateErr } = await supabase.from('weddings')
    .update({ status: newStatus }).eq('id', eventId);
  if (updateErr) return res.status(500).json({ error: updateErr.message });

  console.log('[weddings/archive] Event', newStatus === 'archived' ? 'archived' : 'restored', ':', eventId);
  return res.status(200).json({ success: true, new_status: newStatus });
};
