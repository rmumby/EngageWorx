// api/invite-member.js
// Adds an existing user to a tenant's tenant_members, or sends a Supabase invite
// email if they don't exist yet.
// POST { tenant_id, email, role: 'admin'|'agent' }

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var body = req.body || {};
  var tenantId = body.tenant_id;
  var email = (body.email || '').trim().toLowerCase();
  var role = body.role || 'agent';
  if (!tenantId || !email) return res.status(400).json({ error: 'tenant_id and email required' });
  if (['admin', 'agent', 'viewer'].indexOf(role) === -1) return res.status(400).json({ error: 'role must be admin, agent, or viewer' });

  var supabase = getSupabase();

  try {
    // 1. Confirm tenant exists
    var t = await supabase.from('tenants').select('id, name').eq('id', tenantId).maybeSingle();
    if (!t.data) return res.status(404).json({ error: 'tenant not found' });

    // 2. See if the user already has a profile
    var prof = await supabase.from('user_profiles').select('id, email').ilike('email', email).maybeSingle();
    var userId = prof.data && prof.data.id;
    var invited = false;

    // 3. If no profile, invite via Supabase auth admin API. This sends a magic-link
    //    email that creates the auth.users row on first click.
    if (!userId) {
      try {
        var inv = await supabase.auth.admin.inviteUserByEmail(email, {
          data: { tenant_id: tenantId, role: role, invited_to_tenant: t.data.name },
        });
        if (inv.error) throw inv.error;
        userId = inv.data && inv.data.user && inv.data.user.id;
        invited = true;
        // Also create a user_profiles row so our own relations line up
        if (userId) {
          try {
            await supabase.from('user_profiles').upsert({
              id: userId, email: email, tenant_id: tenantId, role: role,
            }, { onConflict: 'id' });
          } catch (e) {}
        }
      } catch (invErr) {
        return res.status(400).json({ error: 'Invite failed: ' + invErr.message });
      }
    }
    if (!userId) return res.status(500).json({ error: 'could not resolve user id' });

    // 4. Upsert the tenant_members row. Strict tenant scope; idempotent on (user_id, tenant_id).
    var existingMember = await supabase.from('tenant_members').select('id, role, status').eq('user_id', userId).eq('tenant_id', tenantId).maybeSingle();
    var alreadyMember = false;
    if (existingMember.data && existingMember.data.id) {
      if (existingMember.data.status === 'active' && existingMember.data.role === role && !invited) {
        alreadyMember = true;
      } else {
        await supabase.from('tenant_members').update({ role: role, status: 'active', updated_at: new Date().toISOString() }).eq('id', existingMember.data.id);
      }
    } else {
      await supabase.from('tenant_members').insert({ user_id: userId, tenant_id: tenantId, role: role, status: 'active', joined_at: new Date().toISOString() });
    }

    console.log('[invite-member] ' + (alreadyMember ? 'already member' : invited ? 'invited new' : 'linked existing') + ' ' + email + ' → ' + t.data.name + ' as ' + role);
    return res.status(200).json({
      success: true,
      invited: invited,
      already_member: alreadyMember,
      user_id: userId,
      email: email,
      tenant_name: t.data.name || t.data.brand_name,
      role: role,
    });
  } catch (err) {
    console.error('[invite-member] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
