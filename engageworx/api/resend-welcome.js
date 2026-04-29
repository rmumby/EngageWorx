// api/resend-welcome.js — Re-send welcome email to a tenant's admin
// POST { tenant_id }
// JWT-gated, admin-only. Uses the same welcome template as invite-tenant.
// Does NOT reset the admin's password — just re-sends the welcome email
// with a note to use "Forgot Password" if they don't have credentials.

var { createClient } = require('@supabase/supabase-js');
var { getPlatformConfig } = require('./_lib/platform-config');
var { renderTemplate } = require('./_lib/render-template');
var { sendEmail } = require('./_lib/send-email');

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

  // ── Auth ────────────────────────────────────────────────────────────
  var authHeader = req.headers.authorization || '';
  var jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return res.status(401).json({ error: 'Authorization required' });

  var supabase = getSupabase();
  var { data: userData, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !userData || !userData.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  var callerUserId = userData.user.id;

  // ── Body ────────────────────────────────────────────────────────────
  var tenantId = (req.body || {}).tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'tenant_id is required' });

  // ── Caller must be admin/manager of the tenant, or SP admin ────────
  var { data: callerProfile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', callerUserId)
    .maybeSingle();

  var isSPAdmin = callerProfile && (callerProfile.role === 'superadmin' || callerProfile.role === 'super_admin' || callerProfile.role === 'sp_admin');

  if (!isSPAdmin) {
    var { data: membership } = await supabase
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenantId)
      .eq('user_id', callerUserId)
      .eq('status', 'active')
      .maybeSingle();

    if (!membership || (membership.role !== 'admin' && membership.role !== 'owner' && membership.role !== 'manager')) {
      return res.status(403).json({ error: 'Admin access required' });
    }
  }

  // ── Look up tenant ─────────────────────────────────────────────────
  var { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, name, plan, parent_tenant_id')
    .eq('id', tenantId)
    .maybeSingle();

  if (tenantErr || !tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  // ── Find admin user ────────────────────────────────────────────────
  var { data: adminMember } = await supabase
    .from('tenant_members')
    .select('user_id, role')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .in('role', ['admin', 'owner'])
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!adminMember) {
    return res.status(404).json({ error: 'No admin user found for this tenant' });
  }

  var { data: adminProfile } = await supabase
    .from('user_profiles')
    .select('email, full_name')
    .eq('id', adminMember.user_id)
    .maybeSingle();

  if (!adminProfile || !adminProfile.email) {
    return res.status(404).json({ error: 'Admin user has no email address' });
  }

  var adminEmail = adminProfile.email;
  var adminName = adminProfile.full_name || adminEmail.split('@')[0];
  var firstName = adminName.split(' ')[0];

  // ── Build welcome email ────────────────────────────────────────────
  var pc = await getPlatformConfig(tenant.parent_tenant_id || tenantId, supabase);

  // Find plan name
  var planName = tenant.plan || 'Starter';
  if (pc.plans && Array.isArray(pc.plans)) {
    var matchedPlan = pc.plans.find(function (p) { return p.slug === tenant.plan || p.name === tenant.plan; });
    if (matchedPlan) planName = matchedPlan.name;
  }

  var templateVars = {
    admin_first_name: firstName,
    tenant_name: tenant.name,
    platform_name: pc.platform_name,
    portal_url: pc.portal_url,
    admin_email: adminEmail,
    temp_password: '(use "Forgot Password" on the login page to set a new one)',
    plan_name: planName,
    support_email: pc.support_email,
    support_phone: pc.support_phone || '',
    calendar_url: pc.calendar_url || '',
    onboarding_guide_url: pc.onboarding_guide_url || '',
    headquarters: pc.headquarters || '',
  };

  var emailSubject = renderTemplate(pc.welcome_email_subject_template, templateVars);
  var emailHtml = renderTemplate(pc.welcome_email_html_template, templateVars);

  // Fallback if templates not configured
  if (!emailSubject) emailSubject = 'Welcome to ' + pc.platform_name;
  if (!emailHtml) emailHtml = '<p>Welcome to ' + pc.platform_name + ', ' + firstName + '! Log in at <a href="' + pc.portal_url + '">' + pc.portal_url + '</a>.</p>';

  console.log('[resend-welcome]', { tenant_id: tenantId, admin_email: adminEmail, tenant_name: tenant.name });

  var emailResult = await sendEmail({
    to: adminEmail,
    from: pc.support_email,
    fromName: pc.platform_name,
    subject: emailSubject,
    html: emailHtml,
  });

  if (!emailResult.success) {
    console.error('[resend-welcome] FAILED:', emailResult.error);
    return res.status(200).json({
      success: false,
      error: 'Email failed: ' + (emailResult.error || 'unknown error'),
      admin_email: adminEmail,
    });
  }

  console.log('[resend-welcome] sent to', adminEmail);
  return res.status(200).json({
    success: true,
    admin_email: adminEmail,
    message_id: emailResult.message_id,
  });
};
