// api/invite-member.js
// Adds an existing user to a tenant's tenant_members, or sends a Supabase invite
// email if they don't exist yet.
// POST { tenant_id, email, role: 'admin'|'agent' }

var { createClient } = require('@supabase/supabase-js');
var { ensureUserWithSetPasswordLink } = require('./_lib/set-password-link');
var { verifyTenantAuth } = require('./_lib/verify-tenant-auth');

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
  var firstName = (body.first_name || '').trim();
  var lastName = (body.last_name || '').trim();
  var fullName = (firstName + ' ' + lastName).trim() || email.split('@')[0];
  if (!tenantId || !email) return res.status(400).json({ error: 'tenant_id and email required' });
  if (['admin', 'agent', 'viewer'].indexOf(role) === -1) return res.status(400).json({ error: 'role must be admin, agent, or viewer' });

  var supabase = getSupabase();

  // Auth: only a superadmin or an admin of this tenant may add members (this returns a
  // set-password link for new users, so it must be gated).
  var auth = await verifyTenantAuth(supabase, req, tenantId, { requireAdmin: true });
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  var operatorId = auth.user.id;

  try {
    var t = await supabase.from('tenants').select('id, name, brand_name').eq('id', tenantId).maybeSingle();
    if (!t.data) return res.status(404).json({ error: 'tenant not found' });

    // Guard: block adding users to SP tenant who aren't already SP members
    var SP_TENANT_ID = process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387';
    if (tenantId === SP_TENANT_ID && body.confirm_sp_add !== true) {
      var existingProfile = await supabase.from('user_profiles').select('id').ilike('email', email).maybeSingle();
      var alreadySPMember = false;
      if (existingProfile.data) {
        var spMemberCheck = await supabase.from('tenant_members').select('id').eq('user_id', existingProfile.data.id).eq('tenant_id', SP_TENANT_ID).maybeSingle();
        alreadySPMember = !!(spMemberCheck.data);
      }
      if (!alreadySPMember) {
        return res.status(400).json({ error: 'Adding external users to the platform tenant requires confirm_sp_add:true', code: 'SP_ADD_GUARD' });
      }
    }

    var prof = await supabase.from('user_profiles').select('id, email, tenant_id').ilike('email', email).maybeSingle();
    var userId = prof.data && prof.data.id;
    var invited = false;
    var setPasswordLink = null;
    var pc = null;

    if (!userId) {
      // New portal user — provision an email-confirmed account and a single-use set-password
      // link. No password is generated, emailed, or returned (link-based onboarding).
      var { getPlatformConfig } = require('./_lib/platform-config');
      pc = await getPlatformConfig(tenantId, supabase);
      var linkRes = await ensureUserWithSetPasswordLink(supabase, {
        email: email,
        portal_url: pc.portal_url,
        user_metadata: { tenant_id: tenantId, role: role, full_name: fullName },
      });
      if (linkRes.error || !linkRes.user_id) {
        console.error('[invite-member] set-password link error:', linkRes.error);
        return res.status(400).json({ error: 'Could not provision login: ' + (linkRes.error || 'unknown error') });
      }
      userId = linkRes.user_id;
      setPasswordLink = linkRes.action_link;
      invited = true;
      // Create user_profiles row (tenant_id stored as TEXT — explicit String cast)
      await supabase.from('user_profiles').upsert({
        id: userId, email: email, tenant_id: String(tenantId), role: role, full_name: fullName,
      }, { onConflict: 'id' });
      console.log('👤 User created:', userId, email, fullName);
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

    // Audit log: member added or role changed
    try {
      var auditAction = alreadyMember ? null : (existingMember.data ? 'member.role_changed' : 'member.added');
      if (auditAction) {
        await supabase.rpc('log_audit_event', {
          p_action: auditAction,
          p_resource_type: 'tenant_members',
          p_tenant_id: tenantId,
          p_user_id: operatorId,
          p_resource_id: userId,
          p_details: { role: role, email: email, invited: invited },
          p_ip_address: null,
          p_user_agent: null,
        });
      }
    } catch (auditErr) { console.warn('[invite-member] Audit log error (non-fatal):', auditErr.message); }

    // Send welcome email to new team members — branded, link-based, no password on the wire.
    var welcomeEmailSent = false;
    if (invited && setPasswordLink) {
      try {
        var { renderTemplate } = require('./_lib/render-template');
        var { sendPlatformEmail } = require('./_lib/send-platform-email');
        var { setPasswordEmailHtml } = require('./_lib/set-password-link');
        var tenantName = t.data.brand_name || t.data.name;
        var emailVars = {
          first_name: firstName, full_name: fullName, tenant_name: tenantName,
          platform_name: pc.platform_name || 'Platform', portal_url: pc.portal_url || 'https://portal.engwx.com',
          email: email, role: role, set_password_link: setPasswordLink,
        };

        var emailSubject = renderTemplate(
          pc.team_member_welcome_email_subject || 'You\'ve been added to {tenant_name}',
          emailVars
        );
        // Honor a tenant-configured template if present; otherwise use the shared link-based default.
        var emailHtml = pc.team_member_welcome_email_template
          ? renderTemplate(pc.team_member_welcome_email_template, emailVars)
          : setPasswordEmailHtml(emailVars);

        var result = await sendPlatformEmail(supabase, { recipient_tenant_id: tenantId, to: email, from_name: tenantName, subject: emailSubject, html: emailHtml });
        welcomeEmailSent = result.success;
        if (result.success) console.log('📬 Team member welcome email sent to', email, 'via', result.method);
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
      set_password_link: invited ? setPasswordLink : undefined,
      welcome_email_sent: invited ? welcomeEmailSent : undefined,
    });
  } catch (err) {
    console.error('[invite-member] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
