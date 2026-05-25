// api/team/update.js — Update a team member's details (service-role, bypasses RLS)
// POST /api/team/update { tenant_id, user_id, full_name?, role?, sender_email_override?, notify_on_escalation?, notify_on_new_lead? }

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var supabase = getSupabase();
  var body = req.body || {};
  var tenantId = body.tenant_id;
  var targetUserId = body.user_id;
  if (!tenantId || !targetUserId) return res.status(400).json({ error: 'tenant_id and user_id required' });

  // Auth
  var authHeader = req.headers.authorization || '';
  var token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  var { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid auth token' });

  // Authorization check
  var { data: callerProfile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  var isSuperAdmin = callerProfile && (callerProfile.role === 'superadmin' || callerProfile.role === 'super_admin' || callerProfile.role === 'sp_admin');

  if (!isSuperAdmin) {
    var { data: membership } = await supabase.from('tenant_members').select('id, role').eq('tenant_id', tenantId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (!membership || membership.role !== 'admin') return res.status(403).json({ error: 'Not authorized — admin role required' });
  }

  // Update user_profiles.full_name if provided
  if (body.full_name !== undefined) {
    var { error: profileErr } = await supabase.from('user_profiles').update({ full_name: body.full_name.trim() || null }).eq('id', targetUserId);
    if (profileErr) console.warn('[team/update] user_profiles update error:', profileErr.message);
  }

  // Update tenant_members fields
  var memberUpdate = {};
  if (body.role !== undefined) memberUpdate.role = body.role;
  if (body.sender_email_override !== undefined) memberUpdate.sender_email_override = body.sender_email_override || null;
  if (body.notify_on_escalation !== undefined) memberUpdate.notify_on_escalation = !!body.notify_on_escalation;
  if (body.notify_on_new_lead !== undefined) memberUpdate.notify_on_new_lead = !!body.notify_on_new_lead;
  if (body.notify_email !== undefined) memberUpdate.notify_email = body.notify_email || null;

  // Backfill notify_email from user_profiles.email when escalation is toggled on
  if (body.notify_on_escalation === true) {
    var { data: currentMember } = await supabase.from('tenant_members')
      .select('notify_email').eq('tenant_id', tenantId).eq('user_id', targetUserId).maybeSingle();
    if (currentMember && !currentMember.notify_email) {
      var { data: targetProfile } = await supabase.from('user_profiles')
        .select('email').eq('id', targetUserId).maybeSingle();
      if (targetProfile && targetProfile.email) {
        memberUpdate.notify_email = targetProfile.email;
        console.log('[team/update] Backfilled notify_email from profile:', targetProfile.email);
      }
    }
  }

  if (Object.keys(memberUpdate).length > 0) {
    var { error: memberErr } = await supabase.from('tenant_members').update(memberUpdate).eq('tenant_id', tenantId).eq('user_id', targetUserId);
    if (memberErr) return res.status(500).json({ error: memberErr.message });
  }

  console.log('[team/update]', { tenant_id: tenantId, user_id: targetUserId, fields: Object.keys(memberUpdate).concat(body.full_name !== undefined ? ['full_name'] : []) });
  return res.status(200).json({ ok: true });
};
