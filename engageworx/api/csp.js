// /api/csp.js — CSP (Channel Service Provider) management API
// GET  /api/csp?action=tenants     → List CSP's tenants with usage
// GET  /api/csp?action=status      → CSP dashboard summary
// POST /api/csp?action=create      → Create a sub-tenant under CSP
// GET  /api/csp?action=check       → Check if current user is a CSP

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var supabase = getSupabase();
  var action = req.query.action || 'tenants';

  // ─── CHECK IF USER IS CSP ────────────────────────────────────
  if (action === 'check') {
    var userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'Missing user_id' });

    try {
      var result = await supabase.rpc('is_csp_admin', { p_user_id: userId });
      if (result.error || !result.data || result.data.length === 0) {
        return res.status(200).json({ is_csp: false });
      }
      return res.status(200).json(result.data[0]);
    } catch (err) {
      return res.status(200).json({ is_csp: false, error: err.message });
    }
  }

  // ─── LIST CSP'S TENANTS WITH USAGE ────────────────────────────
  if (action === 'tenants') {
    var cspTenantId = req.query.csp_tenant_id;
    if (!cspTenantId) return res.status(400).json({ error: 'Missing csp_tenant_id' });

    try {
      var result = await supabase.rpc('get_csp_tenants', { p_csp_tenant_id: cspTenantId });
      if (result.error) {
        return res.status(500).json({ error: result.error.message });
      }
      return res.status(200).json({
        csp_tenant_id: cspTenantId,
        tenants: result.data || [],
        count: result.data ? result.data.length : 0,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ─── CSP DASHBOARD SUMMARY ───────────────────────────────────
  if (action === 'status') {
    var cspTenantId = req.query.csp_tenant_id;
    if (!cspTenantId) return res.status(400).json({ error: 'Missing csp_tenant_id' });

    try {
      // Get CSP info
      var cspResult = await supabase.from('tenants').select('name, plan, status, created_at').eq('id', cspTenantId).maybeSingle();
      if (!cspResult.data) return res.status(404).json({ error: 'CSP tenant not found' });

      // Get tenant count and usage
      var tenantsResult = await supabase.rpc('get_csp_tenants', { p_csp_tenant_id: cspTenantId });
      var tenants = tenantsResult.data || [];

      // Get plan limits
      var planResult = await supabase.from('plan_limits').select('*').eq('plan_name', cspResult.data.plan).maybeSingle();
      var planLimits = planResult.data || { monthly_messages: 0 };

      // Calculate aggregates
      var totalMessages = 0;
      var totalSms = 0;
      var totalWhatsapp = 0;
      var totalEmail = 0;
      for (var i = 0; i < tenants.length; i++) {
        totalMessages += parseInt(tenants[i].total_messages) || 0;
        totalSms += parseInt(tenants[i].sms_sent) || 0;
        totalWhatsapp += parseInt(tenants[i].whatsapp_sent) || 0;
        totalEmail += parseInt(tenants[i].email_sent) || 0;
      }

      return res.status(200).json({
        csp: {
          id: cspTenantId,
          name: cspResult.data.name,
          plan: cspResult.data.plan,
          status: cspResult.data.status,
        },
        tenants: {
          count: tenants.length,
          limit: planLimits.monthly_messages ? Math.floor(planLimits.monthly_messages / 1000) : 0,
        },
        usage: {
          total_messages: totalMessages,
          sms_sent: totalSms,
          whatsapp_sent: totalWhatsapp,
          email_sent: totalEmail,
          plan_limit: planLimits.monthly_messages || 0,
          percentage_used: planLimits.monthly_messages > 0 ? Math.round((totalMessages / planLimits.monthly_messages) * 100 * 10) / 10 : 0,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ─── CREATE SUB-TENANT UNDER CSP ──────────────────────────────
  if (action === 'create' && req.method === 'POST') {
    var cspTenantId = req.body.csp_tenant_id;
    var email = (req.body.email || '').trim().toLowerCase();
    var password = req.body.password || '';
    var fullName = req.body.full_name || '';
    var companyName = req.body.company_name || '';
    var plan = req.body.plan || 'starter';

    if (!cspTenantId || !email || !password || !companyName) {
      return res.status(400).json({ error: 'Missing required fields: csp_tenant_id, email, password, company_name' });
    }

    // Verify the CSP tenant exists and is a CSP
    var cspCheck = await supabase.from('tenants').select('id, name, tenant_type').eq('id', cspTenantId).maybeSingle();
    if (!cspCheck.data || cspCheck.data.tenant_type !== 'csp') {
      return res.status(403).json({ error: 'Not a valid CSP tenant' });
    }

    try {
      // Create auth user
      var authResult = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: { full_name: fullName, company_name: companyName },
      });

      var userId = null;
      if (authResult.error) {
        if (authResult.error.message.includes('already') || authResult.error.message.includes('exists')) {
          var listResult = await supabase.auth.admin.listUsers();
          var existing = (listResult.data && listResult.data.users) ? listResult.data.users.find(function(u) { return u.email === email; }) : null;
          if (existing) userId = existing.id;
          else return res.status(400).json({ error: 'User exists but could not be found' });
        } else {
          return res.status(400).json({ error: authResult.error.message });
        }
      } else {
        userId = authResult.data.user.id;
      }

      // Create tenant with parent_tenant_id pointing to CSP
      var slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      var slugCheck = await supabase.from('tenants').select('id').eq('slug', slug).maybeSingle();
      if (slugCheck.data) slug = slug + '-' + Date.now().toString(36).slice(-4);

      var tenantResult = await supabase.from('tenants').insert({
        name: companyName,
        slug: slug,
        plan: plan,
        status: 'active',
        parent_tenant_id: cspTenantId,
        tenant_type: 'business',
      }).select().single();

      if (tenantResult.error) {
        return res.status(500).json({ error: 'Tenant creation failed: ' + tenantResult.error.message });
      }

      var tenant = tenantResult.data;

      // Link user
      await supabase.from('tenant_members').insert({
        user_id: userId,
        tenant_id: tenant.id,
        role: 'admin',
        status: 'active',
      });

      // Create user profile
      await supabase.from('user_profiles').upsert({
        id: userId,
        email: email,
        tenant_id: tenant.id,
        role: 'admin',
        company_name: companyName,
        full_name: fullName,
      });

      // Notify Rob
      try {
        var RESEND_KEY = process.env.RESEND_API_KEY;
        if (RESEND_KEY) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'EngageWorx <hello@engwx.com>',
              to: ['rob@engwx.com'],
              subject: 'CSP sub-tenant created: ' + companyName + ' (under ' + cspCheck.data.name + ')',
              html: '<h2>New CSP Sub-Tenant</h2><p><b>CSP:</b> ' + cspCheck.data.name + '</p><p><b>Tenant:</b> ' + companyName + '</p><p><b>Email:</b> ' + email + '</p><p><b>Plan:</b> ' + plan + '</p><p><b>Tenant ID:</b> ' + tenant.id + '</p>',
            }),
          });
        }
      } catch (ne) {}

      return res.status(200).json({
        success: true,
        tenant_id: tenant.id,
        tenant_name: companyName,
        slug: slug,
        plan: plan,
        csp_id: cspTenantId,
        csp_name: cspCheck.data.name,
        user_id: userId,
        email: email,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action. Use: check, tenants, status, create' });
};
