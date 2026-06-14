// api/invite-tenant.js — Automated tenant onboarding
// POST { tenant_name, admin_full_name, admin_email, industry?, website?, plan_slug, customer_type? }
// Creates: tenant + user_profile + tenant_member + chatbot_configs + escalation_rules + welcome email

var { createClient } = require('@supabase/supabase-js');
var crypto = require('crypto');
var { getPlatformConfig } = require('./_lib/platform-config');
var { renderTemplate } = require('./_lib/render-template');
var { sendEmail } = require('./_lib/send-email');
var { sendPlatformEmail } = require('./_lib/send-platform-email');
var { seedPipelineStages } = require('./_lib/seed-pipeline-stages');
var { ensureUserWithSetPasswordLink } = require('./_lib/set-password-link');
var { verifyTenantAuth } = require('./_lib/verify-tenant-auth');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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
  console.log('📋 [invite-tenant] Input:', { tenant_name: tenantName, admin: adminEmail, customer_type: customerType, plan: planSlug });
  var inviterTenantId = body.inviter_tenant_id || null;
  // Creator anchor for the welcome email's sender domain: the parent CSP if created under one,
  // else the SP. NEVER the brand-new tenant (its domain is always unverified at creation).
  var SP_TENANT_ID = process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387';
  var welcomeOwnerTenantId = inviterTenantId || SP_TENANT_ID;
  var phoneNumber = (body.phone_number || '').trim() || null;
  var pipelineLeadId = body.pipeline_lead_id || null;

  if (!tenantName || !adminName || !adminEmail) {
    return res.status(400).json({ error: 'tenant_name, admin_full_name, admin_email required' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  var supabase = getSupabase();

  // Auth: a superadmin may create any tenant; a tenant admin may only create sub-tenants under
  // their own tenant (inviter_tenant_id). null inviter ⇒ superadmin-only (top-level tenant).
  var auth = await verifyTenantAuth(supabase, req, inviterTenantId, { requireAdmin: true });
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  var warnings = [];
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
      customer_type: customerType,
      channels_enabled: ['sms', 'email'],
      message_limit: plan.message_limit,
      contact_limit: plan.contact_limit,
      user_seats: plan.user_seats,
      website_url: website,
      brand_primary: '#00C9FF',
      brand_secondary: '#E040FB',
      parent_tenant_id: inviterTenantId || null,
      pipeline_lead_id: pipelineLeadId || null,
    }).select('id').single();

    if (tenantIns.error) {
      console.error('[invite-tenant] Tenant insert error:', tenantIns.error.message);
      return res.status(500).json({ error: 'Failed to create tenant: ' + tenantIns.error.message });
    }
    var newTenantId = tenantIns.data.id;
    console.log('[invite-tenant] Tenant created:', newTenantId, tenantName, 'customer_type=' + customerType, 'plan=' + plan.slug);

    // Defensive: confirm the tenant row actually persisted before we provision a login for it.
    // Guards the failure mode where the insert returns an id but the row doesn't land — never
    // create an admin user / send a set-password link for a tenant that isn't really there.
    var tenantCheck = await supabase.from('tenants').select('id').eq('id', newTenantId).maybeSingle();
    if (tenantCheck.error || !tenantCheck.data) {
      console.error('[invite-tenant] Tenant did not persist after insert:', newTenantId, tenantCheck.error && tenantCheck.error.message);
      return res.status(500).json({ error: 'Tenant creation did not persist — aborted before provisioning login.' });
    }

    // Roll back a partial provision so a failure never leaves an orphaned auth user + a phantom
    // tenant_id (and so no login is emailed for a tenant that gets torn down). Deletes the
    // just-created auth user (never a pre-existing account), its profile, and the new tenant
    // plus the children seeded so far.
    async function rollbackProvisioning() {
      try {
        if (userId) {
          if (linkRes && linkRes.created) {
            await supabase.from('user_profiles').delete().eq('id', userId);
            try { await supabase.auth.admin.deleteUser(userId); } catch (e) { console.warn('[invite-tenant] rollback auth delete:', e.message); }
          } else {
            // Pre-existing account — unlink from the failed tenant, don't delete the user.
            await supabase.from('user_profiles').update({ tenant_id: null }).eq('id', userId);
          }
        }
      } catch (e) { console.warn('[invite-tenant] rollback user step:', e.message); }
      try { await supabase.from('phone_numbers').delete().eq('tenant_id', newTenantId); } catch (e) {}
      try { await supabase.from('pipeline_stages').delete().eq('tenant_id', newTenantId); } catch (e) {}
      try { await supabase.from('tenants').delete().eq('id', newTenantId); } catch (e) { console.warn('[invite-tenant] rollback tenant delete:', e.message); }
    }

    // Seed default pipeline stages (non-fatal if it fails)
    try { await seedPipelineStages(supabase, newTenantId); } catch (e) { console.warn('[invite-tenant] Stage seed error (non-fatal):', e.message); }

    // Link pipeline lead → tenant (if converting from pipeline)
    if (pipelineLeadId) {
      try {
        await supabase.from('leads').update({ converted_tenant_id: newTenantId }).eq('id', pipelineLeadId);
        console.log('[invite-tenant] Pipeline lead linked:', pipelineLeadId, '→', newTenantId);
      } catch (linkErr) { console.warn('[invite-tenant] Lead link error (non-fatal):', linkErr.message); }
    }

    // 2b. Auto-create phone_numbers row if phone number provided
    if (phoneNumber) {
      if (/^\+\d{8,15}$/.test(phoneNumber)) {
        var pnIns = await supabase.from('phone_numbers').insert({
          tenant_id: newTenantId,
          number: phoneNumber,
          status: 'active',
          type: '10dlc',
        });
        if (pnIns.error) {
          console.warn('📋 phone_numbers insert failed (non-fatal):', pnIns.error.message);
          warnings.push('Phone number assignment failed: ' + pnIns.error.message);
        } else {
          console.log('📋 Phone number assigned:', phoneNumber, '→', newTenantId);
        }
      } else {
        console.warn('📋 Invalid phone_number format (not E.164), skipping:', phoneNumber);
        warnings.push('Phone number not assigned — must be E.164 format (e.g. +14155551234)');
      }
    }

    // 3. Provision the admin's auth user and a single-use set-password link (no password on
    //    the wire). The recovery link lands on the portal's /auth/callback set-password form.
    var nameParts = adminName.split(' ');
    var firstName = nameParts[0] || adminName;
    var lastName = nameParts.slice(1).join(' ') || '';
    var userId = existingUser.data ? existingUser.data.id : null;
    var steps = { user_profile: false, tenant_member: false, set_password_link: false };

    var setPasswordLink = null;
    var linkRes = await ensureUserWithSetPasswordLink(supabase, {
      email: adminEmail,
      portal_url: pc.portal_url,
      user_id: userId,
      user_metadata: { tenant_id: newTenantId, role: 'admin', full_name: adminName },
    });
    if (linkRes.error) console.error('👤 set-password link error:', linkRes.error);
    if (linkRes.user_id) userId = linkRes.user_id;
    setPasswordLink = linkRes.action_link;
    steps.set_password_link = !!setPasswordLink;
    if (!setPasswordLink) warnings.push('Set-password link generation failed — admin will need a manual reset link');

    if (!userId) {
      // Still no user ID — generate one and hope user_profiles doesn't have FK to auth.users
      userId = crypto.randomUUID();
      console.warn('👤 No auth user created — using generated UUID:', userId);
    }
    console.log('👤 User ID resolved:', userId, adminEmail);

    // Insert or update user_profiles
    var userProfilePayload = { id: userId, email: adminEmail, tenant_id: newTenantId, role: 'admin', full_name: adminName };
    if (existingUser.data) {
      var upUpd = await supabase.from('user_profiles').update({
        tenant_id: newTenantId, role: 'admin', full_name: adminName,
      }).eq('id', userId);
      if (upUpd.error) console.error('👤 User update error:', upUpd.error.message, upUpd.error.details);
      else { steps.user_profile = true; console.log('👤 User linked to tenant:', userId); }
    } else {
      var userIns = await supabase.from('user_profiles').upsert(userProfilePayload, { onConflict: 'id' });
      if (userIns.error) {
        console.error('👤 User upsert error:', userIns.error.message, userIns.error.details, userIns.error.hint);
        // Retry with minimal columns if a column doesn't exist
        console.log('👤 Retrying with minimal columns...');
        var retryIns = await supabase.from('user_profiles').upsert({ id: userId, email: adminEmail, tenant_id: newTenantId, role: 'admin' }, { onConflict: 'id' });
        if (retryIns.error) console.error('👤 User retry error:', retryIns.error.message);
        else { steps.user_profile = true; console.log('👤 User created (minimal):', userId); }
      }
      else { steps.user_profile = true; console.log('👤 User created:', userId, adminEmail); }
    }

    // Hard-fail if the admin profile could not be written — roll back rather than leave an
    // orphaned auth user + phantom tenant_id and (later) email a login that won't work.
    if (!steps.user_profile) {
      await rollbackProvisioning();
      return res.status(500).json({ error: 'Failed to create admin profile — provisioning rolled back; no login email sent.' });
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

    // Hard-fail if the admin couldn't be linked to the tenant — same rollback rationale.
    if (!steps.tenant_member) {
      await rollbackProvisioning();
      return res.status(500).json({ error: 'Failed to link admin to tenant — provisioning rolled back; no login email sent.' });
    }

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
      set_password_link: setPasswordLink,
      plan_name: plan.name,
      support_email: pc.support_email,
      support_phone: pc.support_phone || '',
      calendar_url: pc.calendar_url || '',
      onboarding_guide_url: pc.onboarding_guide_url || '',
      headquarters: pc.headquarters || '',
    };

    var emailSubject = renderTemplate(pc.welcome_email_subject_template, templateVars);
    var emailHtml = renderTemplate(pc.welcome_email_html_template, templateVars);

    var emailResult;
    try {
      emailResult = await sendPlatformEmail(supabase, {
        recipient_tenant_id: newTenantId,
        // Gate + send from the CREATOR's verified domain (parent CSP or SP), not the new tenant's.
        owner_tenant_id: welcomeOwnerTenantId,
        to: adminEmail,
        from_name: pc.platform_name,
        subject: emailSubject,
        html: emailHtml,
      });
      console.log('📬 Welcome email: sent to ' + adminEmail + ' via ' + emailResult.method);
    } catch (emailErr) {
      emailResult = { success: false, error: emailErr.message };
      console.log('📬 Welcome email: FAILED — ' + emailErr.message);
      warnings.push('Welcome email failed: ' + emailErr.message);
    }

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

    // user_profile + tenant_member are guaranteed by the hard-fail guards above; reaching here
    // means the tenant, admin, and membership all landed before the welcome email was sent.
    console.log('✅ Onboarding complete:', { tenant_id: newTenantId, tenant_name: tenantName, admin: adminEmail, plan: plan.slug, type: customerType, steps: steps, warnings: warnings });

    return res.status(200).json({
      success: true,
      tenant_id: newTenantId,
      user_id: userId,
      welcome_email_sent: emailResult.success,
      set_password_link: setPasswordLink,
      steps: steps,
      warnings: warnings.length > 0 ? warnings : undefined,
    });

  } catch (e) {
    console.error('[invite-tenant] Error:', e.message, e.stack);
    return res.status(500).json({ error: e.message });
  }
};
