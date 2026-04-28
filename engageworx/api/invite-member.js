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

    // Send welcome email to new team members
    var welcomeEmailSent = false;
    if (invited && tempPassword) {
      try {
        var { getPlatformConfig } = require('./_lib/platform-config');
        var { renderTemplate } = require('./_lib/render-template');
        var { sendEmail } = require('./_lib/send-email');
        var pc = await getPlatformConfig(tenantId, supabase);
        var tenantName = t.data.brand_name || t.data.name;

        var emailSubject = renderTemplate(
          pc.team_member_welcome_email_subject || 'You\'ve been added to {tenant_name}',
          { tenant_name: tenantName, platform_name: pc.platform_name || 'Platform', role: role, full_name: fullName, first_name: firstName }
        );

        var defaultHtml = '<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;">' +
          '<h2 style="color:#1e293b;margin:0 0 16px;">Welcome to ' + tenantName + '</h2>' +
          '<p style="color:#475569;font-size:15px;line-height:1.6;">Hi {first_name},</p>' +
          '<p style="color:#475569;font-size:15px;line-height:1.6;">You\'ve been added as <strong>{role}</strong> on {tenant_name}. Here are your login credentials:</p>' +
          '<div style="background:rgba(0,201,255,0.06);border:1px solid rgba(0,201,255,0.2);border-radius:12px;padding:16px;margin:16px 0;">' +
          '<table style="width:100%;font-size:14px;"><tr><td style="color:#6b8bae;padding:4px 0;">Portal</td><td style="font-weight:700;"><a href="{portal_url}" style="color:#00C9FF;">{portal_url}</a></td></tr>' +
          '<tr><td style="color:#6b8bae;padding:4px 0;">Email</td><td>{email}</td></tr>' +
          '<tr><td style="color:#6b8bae;padding:4px 0;">Temp Password</td><td style="color:#FFD600;font-family:monospace;font-weight:700;">{temp_password}</td></tr></table></div>' +
          '<p style="color:#475569;font-size:14px;">Please change your password on first login.</p>' +
          '<a href="{portal_url}" style="display:inline-block;background:linear-gradient(135deg,#00C9FF,#E040FB);color:#000;font-weight:800;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px;margin:12px 0;">Sign In</a>' +
          '</div>';

        var emailHtml = renderTemplate(
          pc.team_member_welcome_email_template || defaultHtml,
          { first_name: firstName, full_name: fullName, tenant_name: tenantName, platform_name: pc.platform_name || 'Platform', portal_url: pc.portal_url || 'https://portal.engwx.com', email: email, temp_password: tempPassword, role: role }
        );

        var fromEmail = pc.support_email || process.env.PLATFORM_FROM_EMAIL;
        var result = await sendEmail({ to: email, from: fromEmail, fromName: tenantName, subject: emailSubject, html: emailHtml });
        welcomeEmailSent = result.success;
        if (result.success) console.log('📬 Team member welcome email sent to', email);
        else console.warn('📬 Team member welcome email FAILED:', result.error);
      } catch (emailErr) {
        console.warn('[invite-member] Welcome email error:', emailErr.message);
      }
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
      welcome_email_sent: invited ? welcomeEmailSent : undefined,
    });
  } catch (err) {
    console.error('[invite-member] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
