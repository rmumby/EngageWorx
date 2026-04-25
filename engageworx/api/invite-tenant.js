// api/invite-tenant.js — Automated tenant onboarding
// POST { tenant_name, admin_full_name, admin_email, industry?, website?, plan_slug, customer_type? }
// Creates: tenant + user_profile + tenant_member + chatbot_configs + escalation_rules + welcome email

var { createClient } = require('@supabase/supabase-js');
var crypto = require('crypto');
var { getPlatformConfig } = require('./_lib/platform-config');
var { renderTemplate } = require('./_lib/render-template');
var { sendEmail } = require('./_lib/send-email');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function generateTempPassword() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  var pw = '';
  var bytes = crypto.randomBytes(14);
  for (var i = 0; i < 14; i++) pw += chars[bytes[i] % chars.length];
  return pw;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var body = req.body || {};
  var tenantName = (body.tenant_name || '').trim();
  var adminName = (body.admin_full_name || '').trim();
  var adminEmail = (body.admin_email || '').trim().toLowerCase();
  var industry = body.industry || null;
  var website = body.website || null;
  var planSlug = body.plan_slug || 'starter';
  var customerType = body.customer_type || 'direct';
  var inviterTenantId = body.inviter_tenant_id || null;

  if (!tenantName || !adminName || !adminEmail) {
    return res.status(400).json({ error: 'tenant_name, admin_full_name, admin_email required' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  var supabase = getSupabase();
  var pc = await getPlatformConfig(supabase);

  // Validate plan
  var plans = Array.isArray(pc.plans) ? pc.plans : [];
  var plan = plans.find(function(p) { return p.slug === planSlug; });
  if (!plan) plan = { slug: planSlug, name: planSlug, monthly_price: null, message_limit: 5000, contact_limit: 10000, user_seats: 3 };

  try {
    // 1. Check admin email not already on another tenant
    var existingUser = await supabase.from('user_profiles').select('id, tenant_id').ilike('email', adminEmail).maybeSingle();
    if (existingUser.data && existingUser.data.tenant_id) {
      return res.status(409).json({ error: 'Email ' + adminEmail + ' is already associated with a tenant' });
    }

    // 2. Create tenant
    var slug = tenantName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
    var tenantIns = await supabase.from('tenants').insert({
      name: tenantName,
      brand_name: tenantName,
      slug: slug,
      plan: plan.slug,
      status: 'trial',
      tenant_type: customerType,
      channels_enabled: ['sms', 'email'],
      message_limit: plan.message_limit,
      contact_limit: plan.contact_limit,
      user_seats: plan.user_seats,
      industry: industry,
      website_url: website,
      brand_primary: '#00C9FF',
      brand_secondary: '#E040FB',
      parent_tenant_id: inviterTenantId || null,
    }).select('id').single();

    if (tenantIns.error) {
      console.error('[invite-tenant] Tenant insert error:', tenantIns.error.message);
      return res.status(500).json({ error: 'Failed to create tenant: ' + tenantIns.error.message });
    }
    var newTenantId = tenantIns.data.id;
    console.log('[invite-tenant] Tenant created:', newTenantId, tenantName);

    // 3. Create user profile (or link existing)
    var tempPassword = generateTempPassword();
    var userId = existingUser.data ? existingUser.data.id : crypto.randomUUID();
    var nameParts = adminName.split(' ');

    if (existingUser.data) {
      await supabase.from('user_profiles').update({
        tenant_id: newTenantId, role: 'admin', full_name: adminName,
        company_name: tenantName, status: 'active',
      }).eq('id', userId);
    } else {
      var userIns = await supabase.from('user_profiles').insert({
        id: userId, email: adminEmail, tenant_id: newTenantId, role: 'admin',
        full_name: adminName, company_name: tenantName, status: 'active',
      });
      if (userIns.error) console.error('[invite-tenant] User insert error:', userIns.error.message);
    }

    // Invite via Supabase Auth (sends magic link + creates auth.users)
    try {
      await supabase.auth.admin.inviteUserByEmail(adminEmail, {
        data: { tenant_id: newTenantId, role: 'admin', full_name: adminName },
      });
    } catch (authErr) {
      console.warn('[invite-tenant] Auth invite failed (may already exist):', authErr.message);
    }

    // 4. Create tenant_member
    await supabase.from('tenant_members').insert({
      tenant_id: newTenantId, user_id: userId, role: 'admin', status: 'active',
      joined_at: new Date().toISOString(),
      notify_on_escalation: true, notify_on_new_signup: true,
      notify_on_payment: true, notify_on_new_lead: true,
    });

    // 5. Create chatbot_configs with platform defaults
    await supabase.from('chatbot_configs').insert({
      tenant_id: newTenantId,
      bot_name: 'Aria',
      channels_active: ['sms', 'email'],
    });

    // 6. Create default escalation rules from platform_config
    var defaultRules = Array.isArray(pc.default_escalation_rules) ? pc.default_escalation_rules : [];
    if (defaultRules.length > 0) {
      var ruleRows = defaultRules.map(function(r) {
        return {
          tenant_id: newTenantId,
          rule_name: r.rule_name,
          description: r.description || null,
          trigger_type: r.trigger_type,
          trigger_config: r.trigger_config || {},
          action_type: r.action_type,
          action_config: r.action_config || {},
          priority: r.priority || 10,
          active: true,
        };
      });
      var rulesIns = await supabase.from('escalation_rules').insert(ruleRows);
      if (rulesIns.error) console.warn('[invite-tenant] Escalation rules insert error:', rulesIns.error.message);
    }

    // 7. Send welcome email
    var templateVars = {
      admin_first_name: nameParts[0] || adminName,
      tenant_name: tenantName,
      platform_name: pc.platform_name,
      portal_url: pc.portal_url,
      admin_email: adminEmail,
      temp_password: tempPassword,
      plan_name: plan.name,
      support_email: pc.support_email,
      support_phone: pc.support_phone || '',
      calendar_url: pc.calendar_url || '',
      onboarding_guide_url: pc.onboarding_guide_url || '',
      headquarters: pc.headquarters || '',
    };

    var emailSubject = renderTemplate(pc.welcome_email_subject_template, templateVars);
    var emailHtml = renderTemplate(pc.welcome_email_html_template, templateVars);

    var emailResult = await sendEmail({
      to: adminEmail,
      from: pc.support_email,
      fromName: pc.platform_name,
      subject: emailSubject,
      html: emailHtml,
    });

    console.log('[invite-tenant] Welcome email:', emailResult.success ? 'sent' : 'failed — ' + emailResult.error);

    // 8. Log welcome email to new tenant's Live Inbox
    try {
      var contactIns = await supabase.from('contacts').insert({
        tenant_id: newTenantId, email: pc.support_email,
        first_name: pc.platform_name, last_name: 'Team', status: 'active',
      }).select('id').single();
      var welcomeContactId = contactIns.data ? contactIns.data.id : null;

      if (welcomeContactId) {
        var convIns = await supabase.from('conversations').insert({
          tenant_id: newTenantId, contact_id: welcomeContactId, channel: 'email',
          status: 'active', subject: emailSubject,
          last_message_at: new Date().toISOString(), unread_count: 1,
        }).select('id').single();
        var welcomeConvId = convIns.data ? convIns.data.id : null;

        if (welcomeConvId) {
          await supabase.from('messages').insert({
            tenant_id: newTenantId, conversation_id: welcomeConvId, contact_id: welcomeContactId,
            channel: 'email', direction: 'outbound', sender_type: 'bot',
            body: 'Welcome to ' + pc.platform_name + '! Your ' + tenantName + ' account is ready. Sign in at ' + pc.portal_url + ' with ' + adminEmail + '.',
            status: 'sent', metadata: { source: 'onboarding', plan: plan.slug },
            created_at: new Date().toISOString(),
          });
        }
      }
    } catch (inboxErr) {
      console.warn('[invite-tenant] Live Inbox log error:', inboxErr.message);
    }

    console.log('[invite-tenant] Complete:', { tenant_id: newTenantId, admin: adminEmail, plan: plan.slug, type: customerType });

    return res.status(200).json({
      success: true,
      tenant_id: newTenantId,
      user_id: userId,
      welcome_email_sent: emailResult.success,
      temp_password_for_admin_display: tempPassword,
    });

  } catch (e) {
    console.error('[invite-tenant] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
