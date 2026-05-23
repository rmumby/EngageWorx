// api/team/invite.js — Invite a new team member (service-role)
// POST /api/team/invite { tenant_id, email, full_name, role, sender_email_override?, notify_on_escalation?, notify_on_new_lead? }

var { createClient } = require('@supabase/supabase-js');
var { sendTenantEmail } = require('../_lib/send-tenant-email');

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
  var email = (body.email || '').trim().toLowerCase();
  var fullName = (body.full_name || '').trim();
  var role = body.role || 'agent';

  if (!tenantId || !email || !fullName) return res.status(400).json({ error: 'tenant_id, email, and full_name required' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format' });

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

  // Check if already a member
  var { data: existingMember } = await supabase.from('tenant_members')
    .select('id, user_id')
    .eq('tenant_id', tenantId)
    .or('notify_email.eq.' + email)
    .maybeSingle();

  // Also check by user_id via user_profiles email
  if (!existingMember) {
    var { data: existingProfile } = await supabase.from('user_profiles').select('id').ilike('email', email).maybeSingle();
    if (existingProfile) {
      var { data: existingByUid } = await supabase.from('tenant_members').select('id').eq('tenant_id', tenantId).eq('user_id', existingProfile.id).maybeSingle();
      if (existingByUid) existingMember = existingByUid;
    }
  }

  if (existingMember) return res.status(409).json({ error: 'Already a member of this tenant', existing_id: existingMember.id });

  // Find or create auth user
  var authUserId = null;
  var tempPassword = null;
  var magicLink = null;

  var { data: existingUser } = await supabase.from('user_profiles').select('id').ilike('email', email).maybeSingle();
  if (existingUser) {
    authUserId = existingUser.id;
  } else {
    // Create auth user with magic link
    try {
      var { data: inviteData, error: inviteErr } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: email,
        options: { data: { full_name: fullName } },
      });
      if (inviteErr) throw inviteErr;
      authUserId = inviteData.user.id;
      magicLink = inviteData.properties.action_link;
    } catch (magicErr) {
      // Fallback: create with temp password
      tempPassword = 'EW' + Math.random().toString(36).slice(2, 10) + '!';
      try {
        var { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
          email: email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (createErr) throw createErr;
        authUserId = newUser.user.id;
      } catch (createErr2) {
        return res.status(500).json({ error: 'Failed to create user: ' + createErr2.message });
      }
    }
  }

  // Upsert user_profiles
  await supabase.from('user_profiles').upsert({
    id: authUserId,
    email: email,
    full_name: fullName,
    tenant_id: tenantId,
    role: role,
  }, { onConflict: 'id' });

  // Create tenant_members row
  var { error: memberErr } = await supabase.from('tenant_members').insert({
    user_id: authUserId,
    tenant_id: tenantId,
    role: role,
    status: 'active',
    notify_email: email,
    sender_email_override: body.sender_email_override || null,
    notify_on_escalation: body.notify_on_escalation !== false,
    notify_on_new_lead: !!body.notify_on_new_lead,
    joined_at: new Date().toISOString(),
  });

  if (memberErr) return res.status(500).json({ error: 'Member insert failed: ' + memberErr.message });

  // Send invite email
  var welcomeSent = false;
  try {
    var { data: tenant } = await supabase.from('tenants').select('name, brand_name').eq('id', tenantId).maybeSingle();
    var tenantName = (tenant && (tenant.brand_name || tenant.name)) || 'EngageWorx';
    var loginUrl = magicLink || 'https://portal.engwx.com';

    await sendTenantEmail(supabase, {
      tenant_id: tenantId,
      to: email,
      subject: 'Welcome to ' + tenantName,
      html: '<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;">' +
        '<h2 style="color:#1e293b;margin:0 0 12px;">' + tenantName + '</h2>' +
        '<p style="color:#475569;font-size:14px;line-height:1.6;">Hi ' + fullName.split(' ')[0] + ',</p>' +
        '<p style="color:#475569;font-size:14px;line-height:1.6;">You\'ve been invited to join <strong>' + tenantName + '</strong> as <strong>' + role + '</strong>.</p>' +
        '<a href="' + loginUrl + '" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;margin:16px 0;">Sign In</a>' +
        (tempPassword ? '<p style="color:#94a3b8;font-size:12px;margin-top:16px;">Temporary password: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">' + tempPassword + '</code></p>' : '') +
        '</div>',
      text: 'Hi ' + fullName.split(' ')[0] + ', you\'ve been invited to ' + tenantName + ' as ' + role + '. Sign in at ' + loginUrl + (tempPassword ? ' (temp password: ' + tempPassword + ')' : ''),
    });
    welcomeSent = true;
  } catch (emailErr) { console.warn('[team/invite] Welcome email failed:', emailErr.message); }

  console.log('[team/invite]', { tenant_id: tenantId, email: email, role: role, auth_user_id: authUserId, magic_link: !!magicLink, welcome_sent: welcomeSent });

  return res.status(200).json({
    ok: true,
    user_id: authUserId,
    welcome_email_sent: welcomeSent,
    has_magic_link: !!magicLink,
    temp_password: tempPassword || null,
  });
};
