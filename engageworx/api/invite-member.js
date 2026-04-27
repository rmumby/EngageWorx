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

function generateTempPassword() {
  var crypto = require('crypto');
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  var pw = '';
  var bytes = crypto.randomBytes(14);
  for (var i = 0; i < 14; i++) pw += chars[bytes[i] % chars.length];
  return pw;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var body = req.body || {};
  var tenantId = body.tenant_id;
  var email = (body.email || '').trim().toLowerCase();
  var role = body.role || 'agent';
  var firstName = (body.first_name || '').trim();
  var lastName = (body.last_name || '').trim();
  var fullName = (firstName + ' ' + lastName).trim() || email.split('@')[0];
  if (!tenantId || !email) return res.status(400).json({ error: 'tenant_id and email required' });
  if (['admin', 'agent', 'viewer'].indexOf(role) === -1) return res.status(400).json({ error: 'role must be admin, agent, or viewer' });

  var supabase = getSupabase();

  try {
    var t = await supabase.from('tenants').select('id, name').eq('id', tenantId).maybeSingle();
    if (!t.data) return res.status(404).json({ error: 'tenant not found' });

    var prof = await supabase.from('user_profiles').select('id, email, tenant_id').ilike('email', email).maybeSingle();
    var userId = prof.data && prof.data.id;
    var invited = false;
    var tempPassword = null;

    if (!userId) {
      // Create auth user with temp password (immediate login, no magic link)
      tempPassword = generateTempPassword();
      try {
        var authRes = await supabase.auth.admin.createUser({
          email: email, password: tempPassword, email_confirm: true,
          user_metadata: { tenant_id: tenantId, role: role, full_name: fullName },
        });
        if (authRes.error) {
          // User may exist in auth but not in user_profiles
          var listRes = await supabase.auth.admin.listUsers();
          if (listRes.data && listRes.data.users) {
            var found = listRes.data.users.find(function(u) { return u.email && u.email.toLowerCase() === email; });
            if (found) userId = found.id;
          }
          if (userId) {
            await supabase.auth.admin.updateUserById(userId, { password: tempPassword, email_confirm: true, user_metadata: { tenant_id: tenantId, role: role, full_name: fullName } });
          }
        } else {
          userId = authRes.data.user.id;
        }
        invited = true;
      } catch (authErr) {
        console.error('[invite-member] Auth error:', authErr.message);
        return res.status(400).json({ error: 'Auth user creation failed: ' + authErr.message });
      }
      // Create user_profiles row
      if (userId) {
        await supabase.from('user_profiles').upsert({
          id: userId, email: email, tenant_id: tenantId, role: role, full_name: fullName,
        }, { onConflict: 'id' });
        console.log('👤 User created:', userId, email, fullName);
      }
    } else {
      // Existing user — update name if provided and currently empty
      if (fullName && fullName !== email.split('@')[0]) {
        await supabase.from('user_profiles').update({ full_name: fullName }).eq('id', userId).is('full_name', null);
      }
    }
    if (!userId) return res.status(500).json({ error: 'could not resolve user id' });

    // Upsert tenant_members
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

    console.log('[invite-member] ' + (alreadyMember ? 'already member' : invited ? 'invited new' : 'linked existing') + ' ' + email + ' (' + fullName + ') → ' + t.data.name + ' as ' + role);
    return res.status(200).json({
      success: true,
      invited: invited,
      already_member: alreadyMember,
      user_id: userId,
      email: email,
      full_name: fullName,
      tenant_name: t.data.name || t.data.brand_name,
      role: role,
      temp_password: invited ? tempPassword : undefined,
    });
  } catch (err) {
    console.error('[invite-member] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
