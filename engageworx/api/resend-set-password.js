// api/resend-set-password.js
// Regenerates a single-use set-password link for an already-provisioned user and re-sends the
// branded link email. Serves both onboarding paths (tenant admin + team member) — the SA/admin
// success modals call this for their "Resend / regenerate link" action. No password on the wire.
// POST { tenant_id, email }

var { createClient } = require('@supabase/supabase-js');
var { getPlatformConfig } = require('./_lib/platform-config');
var { renderTemplate } = require('./_lib/render-template');
var { sendPlatformEmail } = require('./_lib/send-platform-email');
var { ensureUserWithSetPasswordLink, setPasswordEmailHtml } = require('./_lib/set-password-link');
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
  if (!tenantId || !email) return res.status(400).json({ error: 'tenant_id and email required' });

  var supabase = getSupabase();

  // Auth: only a superadmin or an admin of this tenant may mint a set-password link.
  var auth = await verifyTenantAuth(supabase, req, tenantId, { requireAdmin: true });
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  try {
    var t = await supabase.from('tenants').select('id, name, brand_name, parent_tenant_id').eq('id', tenantId).maybeSingle();
    if (!t.data) return res.status(404).json({ error: 'tenant not found' });

    // Sender anchor: the parent CSP if any, else the SP — never the (possibly unverified) tenant.
    var SP_TENANT_ID = process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387';
    var ownerTenantId = t.data.parent_tenant_id || SP_TENANT_ID;

    var pc = await getPlatformConfig(tenantId, supabase);
    var tenantName = t.data.brand_name || t.data.name;

    // Resolve the existing user + their name/role for the email.
    var prof = await supabase.from('user_profiles').select('id, full_name, role').ilike('email', email).maybeSingle();
    var userId = prof.data && prof.data.id;
    var fullName = (prof.data && prof.data.full_name) || email.split('@')[0];
    var firstName = fullName.split(' ')[0];
    var role = (prof.data && prof.data.role) || null;

    var linkRes = await ensureUserWithSetPasswordLink(supabase, {
      email: email,
      portal_url: pc.portal_url,
      user_id: userId,
      user_metadata: { tenant_id: tenantId, full_name: fullName },
    });
    if (linkRes.error || !linkRes.action_link) {
      console.error('[resend-set-password] link error:', linkRes.error);
      return res.status(400).json({ error: 'Could not generate set-password link: ' + (linkRes.error || 'unknown error') });
    }

    var emailVars = {
      first_name: firstName, full_name: fullName, tenant_name: tenantName,
      platform_name: pc.platform_name || 'Platform', portal_url: pc.portal_url || 'https://portal.engwx.com',
      email: email, role: role, set_password_link: linkRes.action_link,
    };
    var emailSubject = renderTemplate(
      pc.team_member_welcome_email_subject || 'Set your password for {tenant_name}',
      emailVars
    );

    var emailSent = false;
    try {
      var result = await sendPlatformEmail(supabase, {
        recipient_tenant_id: tenantId,
        owner_tenant_id: ownerTenantId,
        to: email,
        from_name: pc.platform_name || tenantName,
        subject: emailSubject,
        html: setPasswordEmailHtml(emailVars),
      });
      emailSent = result.success;
      if (!result.success) console.warn('[resend-set-password] email FAILED:', result.error);
    } catch (emailErr) {
      console.warn('[resend-set-password] email error:', emailErr.message);
    }

    console.log('[resend-set-password] regenerated link for ' + email + ' on tenant ' + tenantId + ' (email_sent=' + emailSent + ')');
    return res.status(200).json({ success: true, set_password_link: linkRes.action_link, email: email, email_sent: emailSent });
  } catch (err) {
    console.error('[resend-set-password] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
