// api/action-items/reassign.js — Reassign an action item to a different team member
// POST { action_item_id, target_user_id }
// Auth: caller must be admin/owner of the item's tenant
// Safety: target must be an active member of the SAME tenant

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
  var callerId = userData.user.id;

  var body = req.body || {};
  var itemId = body.action_item_id;
  var targetUserId = body.target_user_id;
  if (!itemId) return res.status(400).json({ error: 'action_item_id required' });
  if (!targetUserId) return res.status(400).json({ error: 'target_user_id required' });

  // Load the item to get its tenant_id
  var { data: item, error: itemErr } = await supabase.from('action_items')
    .select('id, tenant_id, user_id').eq('id', itemId).maybeSingle();
  if (itemErr || !item) return res.status(404).json({ error: 'Action item not found' });

  // Auth check 1: caller must be admin/owner of the item's tenant (or superadmin)
  var { data: callerProfile } = await supabase.from('user_profiles')
    .select('role').eq('id', callerId).maybeSingle();
  var isSuperAdmin = callerProfile && (callerProfile.role === 'superadmin' || callerProfile.role === 'super_admin' || callerProfile.role === 'sp_admin');

  if (!isSuperAdmin) {
    var { data: callerMember } = await supabase.from('tenant_members')
      .select('id, role').eq('tenant_id', item.tenant_id).eq('user_id', callerId).eq('status', 'active').maybeSingle();
    if (!callerMember) return res.status(403).json({ error: 'Not a member of this tenant' });
    if (callerMember.role !== 'admin' && callerMember.role !== 'owner') {
      return res.status(403).json({ error: 'Admin or owner role required to reassign' });
    }
  }

  // Auth check 2: target must be an active member of the SAME tenant
  var { data: targetMember } = await supabase.from('tenant_members')
    .select('id').eq('tenant_id', item.tenant_id).eq('user_id', targetUserId).eq('status', 'active').maybeSingle();
  if (!targetMember) {
    return res.status(400).json({ error: 'Target user is not an active member of this tenant' });
  }

  // Perform reassignment
  var { data: updated, error: updateErr } = await supabase.from('action_items').update({
    user_id: targetUserId,
    reassigned_by: callerId,
    reassigned_at: new Date().toISOString(),
  }).eq('id', itemId).select('*').single();

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  console.log('[action-items/reassign]', itemId, 'from', item.user_id, 'to', targetUserId, 'by', callerId);
  return res.status(200).json({ success: true, item: updated });
};
