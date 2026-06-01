// /api/create-sandbox.js — Create trial tenant accounts in one call
// POST /api/create-sandbox
// Body: { email, password, fullName, companyName, plan }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var { createClient } = require('@supabase/supabase-js');
  var supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });
  }

  var body = req.body || {};
  var email = (body.email || '').trim().toLowerCase();
  var password = body.password || '';
  var fullName = body.fullName || '';
  var companyName = body.companyName || '';
  var plan = body.plan || 'growth';
  var isDemo = body.is_demo === true;
  // Sandbox endpoint: is_sandbox = !isDemo (mutual exclusion with is_demo)

  if (!email || !password || !companyName) {
    return res.status(400).json({ error: 'Missing required fields: email, password, companyName' });
  }

  // Auth: get operator from JWT (for audit log)
  var operatorId = null;
  var authHeader = req.headers.authorization || '';
  var opToken = authHeader.replace('Bearer ', '');
  if (opToken) {
    try { var { data: { user: opUser } } = await supabase.auth.getUser(opToken); if (opUser) operatorId = opUser.id; } catch (_) {}
  }

  try {
    // Step 1: Create auth user (or resolve existing)
    var userId = null;
    var existingUser = false;
    var authResult = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: fullName, company_name: companyName },
    });

    if (authResult.error) {
      if (authResult.error.message.includes('already') || authResult.error.message.includes('exists')) {
        // Existing user — resolve via user_profiles (not listUsers)
        var profLookup = await supabase.from('user_profiles').select('id').ilike('email', email).maybeSingle();
        if (profLookup.data && profLookup.data.id) {
          userId = profLookup.data.id;
          existingUser = true;
          console.log('[create-sandbox] Existing user found via user_profiles:', userId, email);
        } else {
          return res.status(400).json({ error: 'Auth user exists but no profile row — orphaned account. Contact support.', code: 'ORPHANED_AUTH_USER' });
        }
      } else {
        return res.status(400).json({ error: 'Auth error: ' + authResult.error.message });
      }
    } else {
      userId = authResult.data.user.id;
    }

    // Step 3: Create tenant
    var slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    // Check if slug exists, append number if needed
    var slugCheck = await supabase.from('tenants').select('id').eq('slug', slug).limit(1);
    if (slugCheck.data && slugCheck.data.length > 0) {
      slug = slug + '-' + Date.now().toString(36).slice(-4);
    }

    var tenantResult = await supabase.from('tenants').insert({
      name: companyName,
      slug: slug,
      plan: plan,
      status: 'trial',
      is_sandbox: !isDemo,
      is_demo: isDemo,
      onboarding_completed: isDemo ? true : false,
    }).select().single();

    if (tenantResult.error) {
      return res.status(500).json({ error: 'Tenant creation failed: ' + tenantResult.error.message });
    }

    var tenant = tenantResult.data;

    // Seed pipeline stages (non-fatal)
    try { var { seedPipelineStages } = require('./_lib/seed-pipeline-stages'); await seedPipelineStages(supabase, tenant.id); } catch (e) { console.warn('[create-sandbox] Stage seed error:', e.message); }

    // Seed demo data if is_demo (non-fatal)
    if (isDemo) {
      try { var { seedDemoTenant } = require('./_lib/seed-demo-tenant'); await seedDemoTenant(tenant.id, supabase); } catch (e) { console.warn('[create-sandbox] Demo seed error:', e.message); }
    }

    // Step 4: Link user to tenant (idempotent — guard against dupes)
    var existingLink = await supabase.from('tenant_members').select('id').eq('user_id', userId).eq('tenant_id', tenant.id).maybeSingle();
    if (!existingLink.data) {
      var memberResult = await supabase.from('tenant_members').insert({
        user_id: userId,
        tenant_id: tenant.id,
        role: 'admin',
        status: 'active',
        joined_at: new Date().toISOString(),
      });
      if (memberResult.error) {
        return res.status(500).json({ error: 'Member link failed: ' + memberResult.error.message });
      }
    }

    // Step 4b: Create/update user profile (tenant_id is TEXT — explicit cast)
    try {
      await supabase.from('user_profiles').upsert({
        id: userId,
        email: email,
        tenant_id: String(tenant.id),
        role: 'admin',
        company_name: companyName,
        full_name: fullName,
      }, { onConflict: 'id' });
    } catch (profileErr) {
      console.error('[Sandbox] Profile create error:', profileErr.message);
    }

    // Step 4c: Audit log
    try {
      await supabase.rpc('log_audit_event', {
        p_action: 'member.added',
        p_resource_type: 'tenant_members',
        p_tenant_id: tenant.id,
        p_user_id: operatorId,
        p_resource_id: userId,
        p_details: { role: 'admin', email: email, via: existingUser ? 'sandbox_existing_user' : 'sandbox_new_user' },
        p_ip_address: null,
        p_user_agent: null,
      });
    } catch (auditErr) { console.warn('[create-sandbox] Audit log error (non-fatal):', auditErr.message); }

    // Step 4d: For existing users, trigger password reset so they can access the sandbox
    if (existingUser) {
      try {
        await supabase.auth.admin.updateUserById(userId, { password: password });
        console.log('[create-sandbox] Password updated for existing user:', email);
      } catch (pwErr) {
        console.warn('[create-sandbox] Password update for existing user failed (non-fatal):', pwErr.message);
      }
    }

    // Step 5: Queue notification (no email, no credentials in payload)
    try {
      var { notifyTenantAdmins: _notifySB } = require('./_lib/notify-tenant-admins');
      await _notifySB(supabase, tenant.id, 'sandbox_created', { company: companyName, contact: fullName, email: email, plan: plan }, {
        subject: 'Sandbox created: ' + companyName,
        html: '<h2>New Sandbox Account</h2><p><b>Company:</b> ' + companyName + '</p><p><b>Contact:</b> ' + fullName + '</p><p><b>Email:</b> ' + email + '</p><p><b>Plan:</b> ' + plan + '</p><p>Created via SP Portal. Log in to the portal to manage.</p>',
      });
    } catch (e) { /* notification error is non-fatal */ }

    return res.status(200).json({
      success: true,
      userId: userId,
      tenantId: tenant.id,
      tenantName: companyName,
      slug: slug,
      plan: plan,
      email: email,
    });

  } catch (err) {
    console.error('Sandbox creation error:', err);
    return res.status(500).json({ error: 'Internal error: ' + err.message });
  }
};
