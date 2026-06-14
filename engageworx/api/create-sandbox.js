// /api/create-sandbox.js — Create a trial sandbox OR demo tenant in one call.
// POST /api/create-sandbox
// Body: { email, fullName, companyName, plan, is_demo?, customer_type?, creator_tenant_id? }
//
// Link-based onboarding: no plaintext password. The admin receives a single-use set-password link
// (also returned for the SP to copy). Sandbox => is_sandbox=true/is_demo=false; demo => the inverse.
// All provisioning goes through the shared createTenant primitive.

var { createClient } = require('@supabase/supabase-js');
var { verifyTenantAuth } = require('./_lib/verify-tenant-auth');
var { createTenant } = require('./_lib/create-tenant');

var SP_TENANT_ID = process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });
  }
  var supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  var body = req.body || {};
  var email = (body.email || '').trim().toLowerCase();
  var fullName = body.fullName || '';
  var companyName = body.companyName || '';
  var plan = body.plan || 'growth';
  var isDemo = body.is_demo === true;
  var customerType = body.customer_type || 'direct';
  var creatorTenantId = body.creator_tenant_id || null;

  if (!email || !companyName) {
    return res.status(400).json({ error: 'Missing required fields: email, companyName' });
  }

  // Auth: superadmin, or an admin of the creating tenant. null creator => superadmin-only.
  var auth = await verifyTenantAuth(supabase, req, creatorTenantId, { requireAdmin: true });
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  try {
    var result = await createTenant(supabase, {
      email: email,
      fullName: fullName,
      companyName: companyName,
      plan: plan,
      customerType: customerType,
      isSandbox: !isDemo,
      isDemo: isDemo,
      creatorTenantId: creatorTenantId || SP_TENANT_ID,
      status: 'trial',
      operatorId: auth.user.id,
    });
    if (!result.ok) return res.status(result.status || 500).json({ error: result.error });

    // Notify creating-tenant admins (non-fatal, no credentials in payload).
    try {
      var { notifyTenantAdmins: _notifySB } = require('./_lib/notify-tenant-admins');
      await _notifySB(supabase, result.tenant.id, isDemo ? 'demo_created' : 'sandbox_created',
        { company: companyName, contact: fullName, email: email, plan: plan }, {
          subject: (isDemo ? 'Demo' : 'Sandbox') + ' created: ' + companyName,
          html: '<h2>New ' + (isDemo ? 'Demo' : 'Sandbox') + ' Account</h2><p><b>Company:</b> ' + companyName + '</p><p><b>Contact:</b> ' + fullName + '</p><p><b>Email:</b> ' + email + '</p><p><b>Plan:</b> ' + plan + '</p>',
        });
    } catch (e) { /* non-fatal */ }

    return res.status(200).json({
      success: true,
      userId: result.userId,
      tenantId: result.tenant.id,
      tenantName: companyName,
      slug: result.tenant.slug,
      plan: plan,
      email: email,
      customer_type: result.tenant.customer_type,
      is_sandbox: result.tenant.is_sandbox,
      is_demo: result.tenant.is_demo,
      set_password_link: result.setPasswordLink,
      welcome_email_sent: result.welcomeEmailSent,
    });
  } catch (err) {
    console.error('[create-sandbox] error:', err);
    return res.status(500).json({ error: 'Internal error: ' + err.message });
  }
};
