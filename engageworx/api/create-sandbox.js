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

  if (!email || !password || !companyName) {
    return res.status(400).json({ error: 'Missing required fields: email, password, companyName' });
  }

  try {
    // Step 1: Create auth user
    var authResult = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: fullName, company_name: companyName },
    });

    var userId = null;
    if (authResult.error) {
      // User might already exist
      if (authResult.error.message.includes('already') || authResult.error.message.includes('exists')) {
        // Look up existing user
        var listResult = await supabase.auth.admin.listUsers();
        var existingUser = (listResult.data && listResult.data.users)
          ? listResult.data.users.find(function(u) { return u.email === email; })
          : null;
        if (existingUser) {
          userId = existingUser.id;
        } else {
          return res.status(400).json({ error: 'User exists but could not be found: ' + authResult.error.message });
        }
      } else {
        return res.status(400).json({ error: 'Auth error: ' + authResult.error.message });
      }
    } else {
      userId = authResult.data.user.id;
    }

    // Step 2: Check if user already has a tenant
    var memberCheck = await supabase.from('tenant_members').select('tenant_id').eq('user_id', userId).limit(1);
    if (memberCheck.data && memberCheck.data.length > 0) {
      return res.status(400).json({ error: 'User already has a tenant: ' + memberCheck.data[0].tenant_id });
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
      is_sandbox: true,
      is_demo: isDemo,
      onboarding_completed: isDemo ? true : false,
    }).select().single();

    if (tenantResult.error) {
      return res.status(500).json({ error: 'Tenant creation failed: ' + tenantResult.error.message });
    }

    var tenant = tenantResult.data;

    // Step 4: Link user to tenant
    var memberResult = await supabase.from('tenant_members').insert({
      user_id: userId,
      tenant_id: tenant.id,
      role: 'admin',
      status: 'active',
    });

    if (memberResult.error) {
      return res.status(500).json({ error: 'Member link failed: ' + memberResult.error.message });
    }

    // Step 4b: Create user profile (required for auth flow)
    try {
      await supabase.from('user_profiles').upsert({
        id: userId,
        email: email,
        tenant_id: tenant.id,
        role: 'admin',
        company_name: companyName,
        full_name: fullName,
      });
    } catch (profileErr) {
      console.error('[Sandbox] Profile create error:', profileErr.message);
    }

    // Step 5: Send notification to Rob
    try {
      var RESEND_KEY = process.env.RESEND_API_KEY;
      if (RESEND_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'EngageWorx <hello@engwx.com>',
            to: [(process.env.PLATFORM_ADMIN_EMAIL || 'rob@engwx.com')],
            subject: 'Sandbox created: ' + companyName,
            html: '<h2>New Sandbox Account</h2><p><b>Company:</b> ' + companyName + '</p><p><b>Contact:</b> ' + fullName + '</p><p><b>Email:</b> ' + email + '</p><p><b>Plan:</b> ' + plan + '</p><p><b>Tenant ID:</b> ' + tenant.id + '</p><p><b>Password:</b> ' + password + '</p><p>Created via SP Portal.</p>',
          }),
        });
      }
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
