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
  var customerType = body.customer_type || null;
  var inviterTenantId = body.inviter_tenant_id || null;

  if (!tenantName || !adminName || !adminEmail) {
    return res.status(400).json({ error: 'tenant_name, admin_full_name, admin_email required' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  var supabase = getSupabase();
  // Use inviter's platform_config (CSP overrides SP defaults)
  var pc = await getPlatformConfig(inviterTenantId, supabase);

  // Validate platform_config is fully populated
  var missingPc = [];
  if (!pc.welcome_contact_source) missingPc.push('welcome_contact_source');
  if (!pc.customer_type_options || !Array.isArray(pc.customer_type_options) || pc.customer_type_options.length === 0) missingPc.push('customer_type_options');
  if (missingPc.length > 0) {
    return res.status(400).json({ error: 'Platform Settings not yet configured. SP admin must populate ' + missingPc.join(', ') + ' in Platform Settings before tenant onboarding can run.' });
  }

  if (!customerType) {
    return res.status(400).json({ error: 'customer_type required' });
  }

  // Validate plan
  var plans = Array.isArray(pc.plans) ? pc.plans : [];
  var plan = plans.find(function(p) { return p.slug === planSlug; });
  if (!plan) {
    return res.status(400).json({ error: 'Unknown plan: ' + planSlug + '. Configure plans in Platform Settings.' });
  }

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
    console.log('📋 Tenant created:', newTenantId, tenantName, customerType);

    // 3. Create user via Supabase Auth FIRST — get the real auth user ID
    var tempPassword = generateTempPassword();
    var nameParts = adminName.split(' ');
    var firstName = nameParts[0] || adminName;
    var lastName = nameParts.slice(1).join(' ') || '';
    var userId = existingUser.data ? existingUser.data.id : null;
    var steps = { user_profile: false, tenant_member: false };

    if (!userId) {
      // Create auth user first — this is the source of truth for user ID
      try {
        var authRes = await supabase.auth.admin.createUser({
          email: adminEmail,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { tenant_id: newTenantId, role: 'admin', full_name: adminName },
        });
        if (authRes.error) {
          // User might already exist in auth but not in user_profiles
          console.warn('👤 Auth createUser error (trying invite):', authRes.error.message);
          var invRes = await supabase.auth.admin.inviteUserByEmail(adminEmail, {
            data: { tenant_id: newTenantId, role: 'admin', full_name: adminName },
          });
          if (invRes.data && invRes.data.user) userId = invRes.data.user.id;
          else {
            // Last resort: look up by email in auth
            var listRes = await supabase.auth.admin.listUsers();
            if (listRes.data && listRes.data.users) {
              var found = listRes.data.users.find(function(u) { return u.email && u.email.toLowerCase() === adminEmail; });
              if (found) userId = found.id;
            }
          }
        } else {
          userId = authRes.data.user.id;
        }
      } catch (authErr) {
        console.error('👤 Auth error:', authErr.message);
      }
    }

    if (!userId) {
      // Still no user ID — generate one and hope user_profiles doesn't have FK to auth.users
      userId = crypto.randomUUID();
      console.warn('👤 No auth user created — using generated UUID:', userId);
    }
    console.log('👤 User ID resolved:', userId, adminEmail);

    // Insert or update user_profiles
    if (existingUser.data) {
      var upUpd = await supabase.from('user_profiles').update({
        tenant_id: newTenantId, role: 'admin', full_name: adminName,
        company_name: tenantName, status: 'active',
      }).eq('id', userId);
      if (upUpd.error) console.error('👤 User update error:', upUpd.error.message, upUpd.error.details);
      else { steps.user_profile = true; console.log('👤 User linked to tenant:', userId); }
    } else {
      var userIns = await supabase.from('user_profiles').upsert({
        id: userId, email: adminEmail, tenant_id: newTenantId, role: 'admin',
        full_name: adminName, company_name: tenantName, status: 'active',
      }, { onConflict: 'id' });
      if (userIns.error) console.error('👤 User upsert error:', userIns.error.message, userIns.error.details, userIns.error.hint);
      else { steps.user_profile = true; console.log('👤 User created:', userId, adminEmail); }
    }

    // 4. Create tenant_member
    var tmIns = await supabase.from('tenant_members').upsert({
      tenant_id: newTenantId, user_id: userId, role: 'admin', status: 'active',
      joined_at: new Date().toISOString(),
      notify_on_escalation: true, notify_on_new_signup: true,
      notify_on_payment: true, notify_on_new_lead: true,
    }, { onConflict: 'user_id,tenant_id' });
    if (tmIns.error) console.error('🤝 tenant_members upsert error:', tmIns.error.message, tmIns.error.details, tmIns.error.hint);
    else { steps.tenant_member = true; console.log('🤝 Member created: user=' + userId + ' tenant=' + newTenantId); }

    // 5. Create chatbot_configs
    var businessContext = tenantName;
    if (industry) businessContext += ' (' + industry + ')';
    if (website) businessContext += ' — ' + website;
    var cbIns = await supabase.from('chatbot_configs').insert({
      tenant_id: newTenantId,
      bot_name: 'Aria',
      channels_active: ['sms', 'email'],
      knowledge_base: businessContext,
    });
    if (cbIns.error) console.error('💬 chatbot_configs insert error:', cbIns.error.message);
    else console.log('💬 Chatbot config seeded for', newTenantId);

    // 6. Create default escalation rules
    var defaultRules = Array.isArray(pc.default_escalation_rules) ? pc.default_escalation_rules : [];
    if (defaultRules.length > 0) {
      var ruleRows = defaultRules.map(function(r) {
        return {
          tenant_id: newTenantId, rule_name: r.rule_name, description: r.description || null,
          trigger_type: r.trigger_type, trigger_config: r.trigger_config || {},
          action_type: r.action_type, action_config: r.action_config || {},
          priority: r.priority || 10, active: true,
        };
      });
      var rulesIns = await supabase.from('escalation_rules').insert(ruleRows);
      if (rulesIns.error) console.error('🚨 Escalation rules insert error:', rulesIns.error.message);
      else console.log('🚨 Escalation rules seeded:', ruleRows.length, 'rules');
    }

    // 7. Send welcome email
    var templateVars = {
      admin_first_name: firstName,
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
    console.log('📬 Welcome email:', emailResult.success ? 'sent to ' + adminEmail : 'FAILED — ' + emailResult.error);

    // 8. Log welcome email to new tenant's Live Inbox
    var welcomeTags = Array.isArray(pc.welcome_contact_tags) ? pc.welcome_contact_tags : [];
    var contactIns = await supabase.from('contacts').insert({
      tenant_id: newTenantId, email: adminEmail,
      first_name: firstName, last_name: lastName, status: 'active',
      source: pc.welcome_contact_source || 'onboarding',
      tags: welcomeTags,
    }).select('id').single();

    if (contactIns.error) {
      console.error('📇 Contact insert error:', contactIns.error.message, contactIns.error.details);
    } else {
      var welcomeContactId = contactIns.data.id;
      console.log('📇 Contact logged:', welcomeContactId);

      var convIns = await supabase.from('conversations').insert({
        tenant_id: newTenantId, contact_id: welcomeContactId, channel: 'email',
        status: 'active', subject: emailSubject,
        last_message_at: new Date().toISOString(), unread_count: 1,
      }).select('id').single();

      if (convIns.error) {
        console.error('📨 Conversation insert error:', convIns.error.message, convIns.error.details);
      } else {
        var welcomeConvId = convIns.data.id;
        console.log('📨 Conversation logged:', welcomeConvId);

        var msgIns = await supabase.from('messages').insert({
          tenant_id: newTenantId, conversation_id: welcomeConvId, contact_id: welcomeContactId,
          channel: 'email', direction: 'outbound', sender_type: 'system',
          body: emailHtml, status: 'sent', provider: 'sendgrid',
          sent_at: new Date().toISOString(),
          metadata: { source: 'onboarding', plan: plan.slug, subject: emailSubject },
          created_at: new Date().toISOString(),
        });
        if (msgIns.error) console.error('📨 Message insert error:', msgIns.error.message, msgIns.error.details);
        else console.log('📨 Message logged to Live Inbox');
      }
    }

    var warnings = [];
    if (!steps.user_profile) warnings.push('user_profiles insert failed — admin may not be able to log in');
    if (!steps.tenant_member) warnings.push('tenant_members insert failed — admin not linked to tenant');

    console.log('✅ Onboarding complete:', { tenant_id: newTenantId, tenant_name: tenantName, admin: adminEmail, plan: plan.slug, type: customerType, steps: steps, warnings: warnings });

    return res.status(200).json({
      success: true,
      tenant_id: newTenantId,
      user_id: userId,
      welcome_email_sent: emailResult.success,
      temp_password_for_admin_display: tempPassword,
      steps: steps,
      warnings: warnings.length > 0 ? warnings : undefined,
    });

  } catch (e) {
    console.error('[invite-tenant] Error:', e.message, e.stack);
    return res.status(500).json({ error: e.message });
  }
};
