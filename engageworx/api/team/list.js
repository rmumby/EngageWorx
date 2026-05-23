// api/team/list.js — List team members for a tenant (service-role, bypasses RLS)
// GET /api/team/list?tenant_id=xxx
// Auth: caller must be superadmin OR active member of the tenant

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  var supabase = getSupabase();
  var tenantId = req.query.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });

  // Auth: get calling user from JWT
  var authHeader = req.headers.authorization || '';
  var token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  var { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid auth token' });

  // Check authorization: superadmin OR active member of tenant
  var { data: callerProfile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  var isSuperAdmin = callerProfile && (callerProfile.role === 'superadmin' || callerProfile.role === 'super_admin' || callerProfile.role === 'sp_admin');

  if (!isSuperAdmin) {
    var { data: membership } = await supabase.from('tenant_members').select('id').eq('tenant_id', tenantId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (!membership) return res.status(403).json({ error: 'Not authorized for this tenant' });
  }

  // Fetch members + profiles using service role (bypasses RLS)
  var { data: members, error: memErr } = await supabase
    .from('tenant_members')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('joined_at', { ascending: false });

  if (memErr) return res.status(500).json({ error: memErr.message });

  var userIds = (members || []).map(function(m) { return m.user_id; }).filter(Boolean);
  var profileMap = {};

  if (userIds.length > 0) {
    var { data: profiles } = await supabase.from('user_profiles').select('id, email, full_name, company_name, sender_email').in('id', userIds);
    (profiles || []).forEach(function(p) { profileMap[p.id] = p; });
  }

  var enriched = (members || []).map(function(m) {
    var profile = profileMap[m.user_id] || {};
    return {
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      status: m.status,
      displayName: profile.full_name || profile.company_name || profile.email || m.notify_email || 'Unknown',
      displayEmail: profile.email || m.notify_email || null,
      senderEmail: m.sender_email_override || profile.sender_email || '',
      notify_email: m.notify_email,
      notify_on_escalation: m.notify_on_escalation || false,
      notify_on_new_lead: m.notify_on_new_lead || false,
      notify_via_sms: m.notify_via_sms || false,
      sender_email_override: m.sender_email_override || null,
      joined_at: m.joined_at,
    };
  });

  return res.status(200).json({ members: enriched });
};
