var { createClient } = require('@supabase/supabase-js');
var { getNotifyEmails } = require('./_notify');
var { safeEnrolSequence } = require('./_lib/safe-enrol-sequence');
var { STAGE_KEYS, getPipelineStageId } = require('./_lib/pipelineStages');
var { sendTenantEmail: _sendTenantEmail } = require('./_lib/send-tenant-email');
var { notifyTenantAdmins } = require('./_lib/notify-tenant-admins');
var { seedPipelineStages } = require('./_lib/seed-pipeline-stages');

var supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

var EW_SP_TENANT_ID = (process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387');

// ── SP email config from portal ───────────────────────────────────────────
async function getSPEmailConfig() {
  try {
    var supabaseLocal = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    var res = await supabaseLocal.from('channel_configs').select('config_encrypted').eq('tenant_id', EW_SP_TENANT_ID).eq('channel', 'email').single();
    var cc = (res.data && res.data.config_encrypted) || {};
    return {
      from: cc.from_email || cc.welcome_email_from || (process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com'),
      fromName: cc.from_name || cc.welcome_email_from_name || 'EngageWorx',
    };
  } catch(e) { return { from: (process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com'), fromName: 'EngageWorx' }; }
}

// ── AI-personalised welcome email builder ─────────────────────────────────
// Updated buildWelcomeEmail function for stripe-webhook.js
// Changes:
// 1. Reads tenant brand color from tenants table
// 2. Reads welcome_email_steps from tenants table (configurable 3 steps)
// 3. Falls back to SP defaults if not set

async function buildWelcomeEmail(tenantId, email, plan, companyName, demoPassword) {
  var config = {
    from: (process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com'),
    fromName: 'Rob at EngageWorx',
    calendly: 'https://calendly.com/rob-engwx/30min',
    aiPrompt: null,
    enabled: true,
    brandColor: '#00C9FF',
    steps: null,
    subject: 'Welcome — your account is live 🎉',
  };

  var supabaseLocal = require('@supabase/supabase-js').createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (tenantId) {
    try {
      // Load from channel_configs (email channel)
      var configRes = await supabaseLocal.from('channel_configs')
        .select('config_encrypted')
        .eq('tenant_id', tenantId)
        .eq('channel', 'email')
        .single();
      if (configRes.data && configRes.data.config_encrypted) {
        var cc = configRes.data.config_encrypted;
        if (cc.welcome_email_enabled === 'Disabled') return null;
        if (cc.welcome_email_from) config.from = cc.welcome_email_from;
        if (cc.welcome_email_from_name) config.fromName = cc.welcome_email_from_name;
        if (cc.welcome_email_onboarding_link) config.calendly = cc.welcome_email_onboarding_link;
        if (cc.welcome_email_ai_prompt) config.aiPrompt = cc.welcome_email_ai_prompt;
      }

      // Load brand color + steps from tenants table
      var tenantRes = await supabaseLocal.from('tenants')
        .select('brand_primary, welcome_email_steps, welcome_email_subject')
        .eq('id', tenantId)
        .single();
      if (tenantRes.data) {
        if (tenantRes.data.brand_primary) config.brandColor = tenantRes.data.brand_primary;
        if (tenantRes.data.welcome_email_steps) config.steps = tenantRes.data.welcome_email_steps;
        if (tenantRes.data.welcome_email_subject) config.subject = tenantRes.data.welcome_email_subject;
      }
    } catch (e) { /* use defaults */ }
  }

  // Generate AI personalised message
  var aiMessage = '';
  try {
    var AnthropicSdk = require('@anthropic-ai/sdk');
    var anthropic = new (AnthropicSdk.default || AnthropicSdk)({ apiKey: process.env.ANTHROPIC_API_KEY });
    var systemPrompt = config.aiPrompt ||
      'You are Rob Mumby, Founder & CEO of EngageWorx — an AI-powered omnichannel customer communications platform (SMS, WhatsApp, Email, Voice, RCS). Write a short, warm personal welcome. Exactly 2 short paragraphs. First: warm welcome referencing their company name and plan. Second: invite them to book a quick call — mention it naturally without writing the URL. No subject line, no sign-off, no URLs anywhere in the text.';
    var aiRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'New signup — Company: ' + companyName + ', Plan: ' + plan + ', Email: ' + email }]
    });
    aiMessage = aiRes.content[0].text.trim();
  } catch (aiErr) { console.log('[Stripe] AI welcome failed:', aiErr.message); }

  var planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  var c1 = config.brandColor;
  // Generate a lighter secondary color from brand color
  var c2 = '#E040FB';

  // Configurable steps
  var defaultSteps = [
    { num: '1', title: 'Add your phone number', sub: 'Settings → Channels → SMS' },
    { num: '2', title: 'Import your contacts', sub: 'Contacts → Import' },
    { num: '3', title: 'Set up your AI Chatbot', sub: 'AI Chatbot → configure your business info' },
  ];
  var steps = config.steps ? JSON.parse(config.steps) : defaultSteps;

  var stepsHtml = steps.map(function(s) {
    return '<tr><td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;">' +
      '<div style="display:flex;align-items:center;gap:12px;">' +
      '<div style="width:28px;height:28px;border-radius:50%;background:' + c1 + '22;border:1px solid ' + c1 + '44;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:' + c1 + ';flex-shrink:0;">' + s.num + '</div>' +
      '<div><div style="font-size:14px;font-weight:700;color:#1e293b;">' + s.title + '</div>' +
      '<div style="font-size:12px;color:#94a3b8;margin-top:2px;">' + s.sub + '</div></div>' +
      '</div></td></tr>';
  }).join('');

  var html =
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">' +
    '<div style="max-width:600px;margin:0 auto;padding:32px 16px;">' +

    // Header
    '<div style="background:linear-gradient(135deg,' + c1 + ',' + c2 + ');border-radius:16px;padding:36px 32px;text-align:center;margin-bottom:20px;">' +
    '<div style="color:#fff;font-weight:900;font-size:24px;letter-spacing:-0.5px;">EngageWorx</div>' +
    '<div style="color:rgba(255,255,255,0.8);font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">AI-Powered CX</div>' +
    '<div style="color:#fff;font-size:36px;margin:16px 0 8px;">🎉</div>' +
    '<h1 style="color:#fff;margin:0;font-size:26px;font-weight:800;">Welcome, ' + companyName + '!</h1>' +
    '<p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px;">Your account is live and ready to go.</p>' +
    '</div>' +

    // AI personal note
    (aiMessage ? (
      '<div style="background:#fff;border-radius:12px;padding:24px 28px;margin-bottom:20px;border-left:4px solid ' + c1 + ';box-shadow:0 1px 3px rgba(0,0,0,0.06);">' +
      '<div style="font-size:14px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">A note from Rob</div>' +
      '<div style="font-size:15px;color:#1e293b;line-height:1.75;">' + aiMessage.replace(/\n\n/g, '</div><div style="font-size:15px;color:#1e293b;line-height:1.75;margin-top:12px;">') + '</div>' +
      '</div>'
    ) : '') +

    // Login details
    '<div style="background:#fff;border-radius:12px;padding:24px 28px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">' +
    '<div style="font-size:14px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:14px;">Your Login Details</div>' +
    '<table style="width:100%;border-collapse:collapse;">' +
    '<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 0;color:#94a3b8;font-size:13px;width:100px;">Portal</td><td style="padding:10px 0;font-size:13px;"><a href="https://portal.engwx.com" style="color:' + c1 + ';text-decoration:none;font-weight:700;">portal.engwx.com</a></td></tr>' +
    '<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 0;color:#94a3b8;font-size:13px;">Email</td><td style="padding:10px 0;font-size:13px;color:#1e293b;font-weight:600;">' + email + '</td></tr>' +
    + (demoPassword && demoPassword !== 'NaN' && demoPassword !== 'null' ? '<tr style="border-top:1px solid #f1f5f9;"><td style="padding:10px 0;color:#94a3b8;font-size:13px;width:100px;">Password</td><td style="padding:10px 0;font-size:13px;font-family:monospace;font-weight:700;color:#1e293b;">' + demoPassword + '</td></tr>' : '')
    + '<tr><td style="padding:10px 0;color:#94a3b8;font-size:13px;">Plan</td><td style="padding:10px 0;"><span style="background:' + c1 + '18;color:' + c1 + ';border:1px solid ' + c1 + '44;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700;">' + planLabel + '</span></td></tr>' +
    '</table>' +
    '<div style="margin-top:20px;text-align:center;">' +
    '<a href="https://portal.engwx.com" style="display:inline-block;background:linear-gradient(135deg,' + c1 + ',' + c2 + ');color:#000;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:800;font-size:15px;">Log In to Your Portal →</a>' +
    '</div></div>' +

    // 3 steps
    '<div style="background:#fff;border-radius:12px;padding:24px 28px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">' +
    '<div style="font-size:14px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:14px;">3 Things to Do First</div>' +
    '<table style="width:100%;border-collapse:collapse;">' + stepsHtml + '</table>' +
    '</div>' +

    // Calendly CTA
    '<div style="background:#fff;border-radius:12px;padding:24px 28px;margin-bottom:20px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.06);">' +
    '<div style="font-size:22px;margin-bottom:8px;">📅</div>' +
    '<div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:6px;">Want a quick walkthrough?</div>' +
    '<div style="font-size:13px;color:#64748b;margin-bottom:16px;">Book a free 30-minute onboarding call — we\'ll get you set up fast.</div>' +
    '<a href="' + config.calendly + '" style="display:inline-block;border:2px solid ' + c1 + ';color:' + c1 + ';padding:12px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">Book Onboarding Call →</a>' +
    '</div>' +

    // Signature
    '<div style="text-align:center;padding:20px 0 8px;">' +
    '<div style="display:inline-block;background:linear-gradient(135deg,' + c1 + ',' + c2 + ');color:#000;font-weight:900;font-size:16px;padding:8px 14px;border-radius:8px;margin-bottom:10px;">EW</div><br>' +
    '<div style="font-weight:700;color:#1e293b;font-size:14px;">Rob Mumby</div>' +
    '<div style="color:#64748b;font-size:13px;margin-top:2px;">Founder & CEO, EngageWorx</div>' +
    '<div style="color:#94a3b8;font-size:12px;margin-top:4px;">SMS · WhatsApp · Email · Voice · RCS</div>' +
    '<div style="margin-top:6px;font-size:12px;">' +
    '<a href="tel:+17869827800" style="color:' + c1 + ';text-decoration:none;">+1 (786) 982-7800</a>' +
    ' &nbsp;|&nbsp; ' +
    '<a href="https://engwx.com" style="color:' + c1 + ';text-decoration:none;">engwx.com</a>' +
    '</div></div>' +

    '</div></body></html>';

  return {
    from: config.from,
    fromName: config.fromName,
    subject: config.subject,
    html: html,
    text: (aiMessage || 'Welcome to EngageWorx!') + '\n\nYour portal: portal.engwx.com\nEmail: ' + email + '\nPlan: ' + planLabel + '\n\nBook an onboarding call: ' + config.calendly + '\n\nRob Mumby\nFounder & CEO, EngageWorx\n+1 (786) 982-7800\nengwx.com',
  };
}


module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var event = req.body;
  console.log('[Stripe Webhook] Event type:', event.type);

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        var session = event.data.object;

        // TCR registration payment — route separately
        if (session.metadata && session.metadata.type === 'tcr_registration') {
          var tcrSessionId = session.metadata.tcr_session_id;
          var paymentIntent = session.payment_intent;
          console.log('[Stripe] TCR checkout completed:', tcrSessionId, 'payment_intent:', paymentIntent);
          if (tcrSessionId) {
            // Idempotent: only update if not already paid
            var { data: tcrRows } = await supabase.from('tcr_wizard_sessions')
              .update({ payment_status: 'paid', stripe_charge_id: paymentIntent })
              .eq('id', tcrSessionId)
              .neq('payment_status', 'paid')
              .select('id');
            console.log('[Stripe] TCR payment_status updated:', tcrRows && tcrRows.length > 0 ? 'yes' : 'already paid or not found');
          }
          break;
        }

        var email = session.customer_email ||
          (session.customer_details && session.customer_details.email) ||
          (session.metadata && session.metadata.email);
        var plan = (session.metadata && session.metadata.plan) || 'starter';
        var companyName = (session.metadata && session.metadata.tenantName) ||
          (session.metadata && session.metadata.company_name) ||
          (session.customer_details && session.customer_details.name) ||
          'My Business';
        var demoPassword = (session.metadata && session.metadata.demo_password) || null;

        console.log('[Stripe] Checkout completed:', email, 'plan:', plan, 'company:', companyName);
        if (!email) { console.warn('[Stripe] No email in session'); break; }

        var sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);

        var userResult = await supabase.from('user_profiles').select('id, tenant_id').eq('email', email).limit(1);
        var userRow = userResult.data && userResult.data.length > 0 ? userResult.data[0] : null;
        var userId = userRow ? userRow.id : null;
        var existingTenantId = userRow ? userRow.tenant_id : null;
        var newTenantId = existingTenantId;

        if (!userId) {
          console.warn('[Stripe] No user found for:', email);
        } else if (existingTenantId) {
          console.log('[Stripe] User already has tenant, skipping creation');
        } else {
          var slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();

          // Pull business_name + website from the auth user's metadata so the
          // signup values persist onto the tenant row.
          var suppliedWebsite = null, suppliedBusinessName = null;
          try {
            var ulist = await supabase.auth.admin.listUsers();
            var u = (ulist.data && ulist.data.users) ? ulist.data.users.find(function(x) { return x.email === email; }) : null;
            if (u && u.user_metadata) {
              suppliedWebsite = u.user_metadata.website || null;
              suppliedBusinessName = u.user_metadata.business_name || null;
            }
          } catch (umErr) {}

          // Atomic provision: tenant + user_profiles binding + tenant_members admin row in one
          // service-role transaction. Replaces the separate insert/update/member writes so a
          // partial failure can't leave an orphaned profile with a phantom tenant_id.
          var prov = await supabase.rpc('provision_tenant_and_bind', {
            p_user_id: userId,
            p_name: companyName,
            p_slug: slug,
            p_customer_type: 'direct',
            p_entity_tier: 'tenant',
            p_status: 'active',
            p_parent_tenant_id: null,
            p_referred_by: null,
            p_is_sandbox: false,
            p_event_id: event.id,
          });
          if (prov.error) {
            // Duplicate webhook delivery: the RPC's stripe_events insert hit the PK
            // (stripe_events_pkey, SQLSTATE 23505). Acknowledge as a no-op 200 so Stripe stops
            // retrying — a 500 here would loop a no-op forever.
            if (prov.error.code === '23505' && (((prov.error.message || '') + (prov.error.details || '')).indexOf('stripe_events') !== -1)) {
              console.log('[Stripe] Duplicate delivery — event already processed:', event.id);
              return res.status(200).json({ received: true, duplicate: true });
            }
            console.error('[Stripe] provision_tenant_and_bind FAILED:', prov.error.message, '— no half-state created');
            break;
          }
          newTenantId = prov.data;

          // Columns the RPC doesn't set (non-fatal — the atomic binding above is what matters).
          var tDetail = await supabase.from('tenants').update({
            plan: plan,
            brand_primary: '#00C9FF',
            brand_name: suppliedBusinessName || companyName,
            website_url: suppliedWebsite,
            channels_enabled: ['sms', 'email', 'whatsapp'],
          }).eq('id', newTenantId);
          if (tDetail.error) console.warn('[stripe-webhook] tenant detail update (non-fatal):', tDetail.error.message);

          // Profile role/company_name (RPC already set tenant_id + tenant_type).
          await supabase.from('user_profiles').update({ role: 'admin', company_name: companyName }).eq('id', userId);

          // Seed default pipeline stages (non-fatal if it fails)
          try { await seedPipelineStages(supabase, newTenantId); } catch (e) { console.warn('[stripe-webhook] Stage seed error (non-fatal):', e.message); }

          console.log('[Stripe] Tenant provisioned:', newTenantId, 'for:', email);

          // Auto-create pipeline lead
          try {
            var existingLead = await supabase.from('leads').select('id').eq('email', email).limit(1);
            if (!existingLead.data || existingLead.data.length === 0) {
              var signupStageId = await getPipelineStageId(supabase, EW_SP_TENANT_ID, STAGE_KEYS.WON);
              await supabase.from('leads').insert({
                name: companyName,
                company: companyName,
                email: email,
                type: 'Direct Business',
                urgency: 'Warm',
                pipeline_stage_id: signupStageId,
                source: 'Website',
                notes: 'Auto-created from Stripe signup. Plan: ' + plan,
                last_action_at: new Date().toISOString().split('T')[0],
                last_activity_at: new Date().toISOString(),
                tenant_id: EW_SP_TENANT_ID,
              });
              console.log('[Stripe] Pipeline lead auto-created for:', email);
            }
          } catch (plErr) { console.log('[Stripe] Pipeline lead create failed (non-fatal):', plErr.message); }

          // Notify SP admins
          try {
            var spEmails = await getNotifyEmails(EW_SP_TENANT_ID, 'notify_on_new_signup');
            for (var spei = 0; spei < spEmails.length; spei++) {
              await _sendTenantEmail(supabase, {
                tenant_id: EW_SP_TENANT_ID,
                to: spEmails[spei],
                subject: '🎉 New Signup: ' + companyName + ' (' + plan + ')',
                text: 'New signup\n\nCompany: ' + companyName + '\nEmail: ' + email + '\nPlan: ' + plan + '\nTenant ID: ' + tenant.id,
                html: '<p>New signup</p><p>Company: ' + companyName + '</p><p>Email: ' + email + '</p><p>Plan: ' + plan + '</p>',
              });
            }
            if (spEmails.length > 0) console.log('[Stripe] SP notification sent to:', spEmails);
          } catch (spErr) { console.log('[Stripe] SP notify failed:', spErr.message); }
        }

        // AI-personalised welcome email — always fires
        try {
          var welcomeConfig = await buildWelcomeEmail(newTenantId, email, plan, companyName, demoPassword);
          if (welcomeConfig) {
            await _sendTenantEmail(supabase, {
              tenant_id: newTenantId || EW_SP_TENANT_ID,
              to: email,
              subject: 'Welcome — your account is live 🎉',
              text: welcomeConfig.text,
              html: welcomeConfig.html,
            });
            console.log('[Stripe] AI welcome email sent to:', email, 'from:', welcomeConfig.from);
          }
        } catch (welcomeErr) {
          console.log('[Stripe] Welcome email failed (non-fatal):', welcomeErr.message);
        }

        break;
      }

      case 'checkout.session.expired': {
  var expiredSession = event.data.object;
  var expiredEmail = expiredSession.customer_email ||
    (expiredSession.customer_details && expiredSession.customer_details.email) ||
    (expiredSession.metadata && expiredSession.metadata.email);
  var expiredName = (expiredSession.customer_details && expiredSession.customer_details.name) || '';
  var expiredPlan = (expiredSession.metadata && expiredSession.metadata.plan) || 'starter';

  console.log('[Stripe] Checkout expired:', expiredEmail);
  if (!expiredEmail) { console.warn('[Stripe] No email in expired session'); break; }

  var expiredUserResult = await supabase.from('user_profiles').select('id, tenant_id').eq('email', expiredEmail).limit(1);
  var expiredUser = expiredUserResult.data && expiredUserResult.data.length > 0 ? expiredUserResult.data[0] : null;

  if (expiredUser && expiredUser.tenant_id) {
    console.log('[Stripe] Expired session but user already has tenant — skipping');
    break;
  }

  // Create or update Pipeline lead
  var abandonedLeadId = null;
  try {
    var existingAbandon = await supabase.from('leads').select('id').eq('email', expiredEmail).limit(1);
    if (!existingAbandon.data || existingAbandon.data.length === 0) {
      var abandonStageId = await getPipelineStageId(supabase, EW_SP_TENANT_ID, STAGE_KEYS.LEAD);
      var abandonRes = await supabase.from('leads').insert({
        name: expiredName || null,
        company: expiredName || '',
        email: expiredEmail,
        source: 'abandoned_checkout',
        pipeline_stage_id: abandonStageId,
        type: 'Direct Business',
        urgency: 'Hot',
        billing_status: 'abandoned',
        notes: 'Abandoned Stripe checkout — ' + expiredPlan + ' plan. No credit card entered.',
        ai_next_action: 'Send recovery email and follow up within 48 hours.',
        last_action_at: new Date().toISOString().split('T')[0],
        last_activity_at: new Date().toISOString(),
        tenant_id: EW_SP_TENANT_ID,
      }).select('id').single();
      if (abandonRes.data) abandonedLeadId = abandonRes.data.id;
      console.log('[Stripe] Abandoned checkout lead created:', expiredEmail);
    } else {
      abandonedLeadId = existingAbandon.data[0].id;
      await supabase.from('leads').update({
        billing_status: 'abandoned',
        urgency: 'Hot',
        last_activity_at: new Date().toISOString(),
      }).eq('id', abandonedLeadId);
    }
  } catch (leadErr) { console.log('[Stripe] Abandon lead create failed:', leadErr.message); }

  // Create Contact (dedup on email)
  try {
    if (abandonedLeadId) {
      var existingContact = await supabase.from('contacts').select('id').eq('email', expiredEmail).eq('tenant_id', EW_SP_TENANT_ID).single();
      if (!existingContact.data) {
        var nameParts = (expiredName || '').trim().split(' ');
        await supabase.from('contacts').insert({
          first_name: nameParts[0] || expiredEmail,
          last_name: nameParts.slice(1).join(' ') || null,
          email: expiredEmail,
          company_name: expiredName || null,
          pipeline_lead_id: abandonedLeadId,
          tenant_id: EW_SP_TENANT_ID,
          status: 'active',
          source: 'abandoned_checkout',
        });
        console.log('[Stripe] Abandoned checkout contact created:', expiredEmail);
      }
    }
  } catch (contactErr) { console.log('[Stripe] Abandon contact create failed:', contactErr.message); }

  // Auto-enrol in abandoned checkout sequence if one exists
  try {
    if (abandonedLeadId) {
      var abandonSeqs = await supabase.from('sequences')
        .select('id, name')
        .eq('tenant_id', EW_SP_TENANT_ID)
        .ilike('name', '%abandon%')
        .limit(1);
      if (!abandonSeqs.data || abandonSeqs.data.length === 0) {
        abandonSeqs = await supabase.from('sequences')
          .select('id, name')
          .eq('tenant_id', EW_SP_TENANT_ID)
          .ilike('name', '%recover%')
          .limit(1);
      }
      if (abandonSeqs.data && abandonSeqs.data.length > 0) {
        var seqId = abandonSeqs.data[0].id;
        var firstStep = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', seqId).eq('step_number', 1).single();
        var startDate = new Date();
        if (firstStep.data && firstStep.data.delay_days > 0) {
          startDate.setDate(startDate.getDate() + firstStep.data.delay_days);
        }
        await safeEnrolSequence(supabase, { tenant_id: EW_SP_TENANT_ID, lead_id: abandonedLeadId, sequence_id: seqId, next_step_at: startDate.toISOString() });
        console.log('[Stripe] Enrolled abandoned lead in sequence:', abandonSeqs.data[0].name);
      }
    }
  } catch (seqErr) { console.log('[Stripe] Sequence enrol failed:', seqErr.message); }

  // Recovery outreach handled by Abandoned Checkout Recovery sequence — single-sender principle (CLAUDE.md)

  break;
}

      // ── SUBSCRIPTION CANCELLED / PAUSED ───────────────────────────────────
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused': {
        var cancelSub = event.data.object;
        var cancelCustomerId = cancelSub.customer;
        var cancelEventName = event.type === 'customer.subscription.deleted' ? 'cancelled' : 'paused';
        console.log('[Stripe] Subscription ' + cancelEventName + ':', cancelCustomerId);

        var cancelTenantRes = await supabase.from('tenants').select('id, name, plan').eq('stripe_customer_id', cancelCustomerId).maybeSingle();
        var cancelTenant = cancelTenantRes.data;
        if (!cancelTenant) { console.warn('[Stripe] No tenant for customer:', cancelCustomerId); break; }

        await supabase.from('tenants').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', cancelTenant.id);
        await supabase.from('tenant_members').update({ status: 'inactive' }).eq('tenant_id', cancelTenant.id);
        console.log('[Stripe] Tenant soft-disabled:', cancelTenant.name);

        try {
          await notifyTenantAdmins(supabase, cancelTenant.id, 'checkout_completed', { event: cancelEventName, plan: cancelTenant.plan, stripe_customer: cancelCustomerId }, {
            subject: 'Subscription ' + cancelEventName + ': ' + cancelTenant.name,
            html: '<h3>Subscription ' + cancelEventName.charAt(0).toUpperCase() + cancelEventName.slice(1) + '</h3>' +
              '<p><b>Tenant:</b> ' + cancelTenant.name + '</p>' +
              '<p><b>Plan:</b> ' + (cancelTenant.plan || 'unknown') + '</p>' +
              '<p><b>Date:</b> ' + new Date().toISOString() + '</p>' +
              '<p>Tenant soft-disabled. Data preserved for recovery.</p>',
          });
        } catch (ne) { console.log('[Stripe] Cancel notification failed:', ne.message); }

        try {
          var ownerRes = await supabase.from('tenant_members').select('user_id').eq('tenant_id', cancelTenant.id).eq('role', 'admin').limit(1);
          var ownerId = ownerRes.data && ownerRes.data[0] ? ownerRes.data[0].user_id : null;
          if (ownerId) {
            var ownerProfile = await supabase.from('user_profiles').select('email').eq('id', ownerId).single();
            var ownerEmail = ownerProfile.data ? ownerProfile.data.email : null;
            if (ownerEmail) {
              var ownerLeadRes = await supabase.from('leads').select('id').eq('email', ownerEmail).limit(1);
              var ownerLeadId = ownerLeadRes.data && ownerLeadRes.data[0] ? ownerLeadRes.data[0].id : null;
              if (!ownerLeadId) {
                var churnStageId = await getPipelineStageId(supabase, EW_SP_TENANT_ID, STAGE_KEYS.LOST);
                var newLead = await supabase.from('leads').insert({
                  name: cancelTenant.name, company: cancelTenant.name, email: ownerEmail,
                  source: 'churn', type: 'Direct Business', urgency: 'Hot',
                  pipeline_stage_id: churnStageId,
                  billing_status: cancelEventName, tenant_id: EW_SP_TENANT_ID,
                  notes: 'Subscription ' + cancelEventName + '. Plan was: ' + (cancelTenant.plan || 'unknown'),
                  last_action_at: new Date().toISOString().split('T')[0],
                  last_activity_at: new Date().toISOString(),
                }).select('id').single();
                ownerLeadId = newLead.data ? newLead.data.id : null;
              }
              if (ownerLeadId) {
                var recoverySeq = await supabase.from('sequences').select('id, name').eq('tenant_id', EW_SP_TENANT_ID).ilike('name', '%abandon%').limit(1);
                if (!recoverySeq.data || recoverySeq.data.length === 0) {
                  recoverySeq = await supabase.from('sequences').select('id, name').eq('tenant_id', EW_SP_TENANT_ID).ilike('name', '%recover%').limit(1);
                }
                if (recoverySeq.data && recoverySeq.data.length > 0) {
                  var rSeqId = recoverySeq.data[0].id;
                  var rFirstStep = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', rSeqId).eq('step_number', 1).single();
                  var rStart = new Date();
                  if (rFirstStep.data && rFirstStep.data.delay_days > 0) rStart.setDate(rStart.getDate() + rFirstStep.data.delay_days);
                  await safeEnrolSequence(supabase, { tenant_id: EW_SP_TENANT_ID, lead_id: ownerLeadId, sequence_id: rSeqId, next_step_at: rStart.toISOString() });
                  console.log('[Stripe] Enrolled churned lead in recovery sequence:', recoverySeq.data[0].name);
                }
              }
            }
          }
        } catch (seqErr) { console.log('[Stripe] Recovery enrol failed:', seqErr.message); }

        break;
      }

      // ── PAYMENT FAILED (final retry) ──────────────────────────────────────
      case 'invoice.payment_failed': {
        var failedInvoice = event.data.object;
        var failedCustomerId = failedInvoice.customer;
        var isLastAttempt = failedInvoice.next_payment_attempt === null;
        console.log('[Stripe] Payment failed:', failedCustomerId, 'final:', isLastAttempt);

        if (!isLastAttempt) {
          console.log('[Stripe] Not final retry — skipping disable');
          break;
        }

        var failedTenantRes = await supabase.from('tenants').select('id, name, plan').eq('stripe_customer_id', failedCustomerId).maybeSingle();
        var failedTenant = failedTenantRes.data;
        if (!failedTenant) { console.warn('[Stripe] No tenant for customer:', failedCustomerId); break; }

        await supabase.from('tenants').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', failedTenant.id);
        await supabase.from('tenant_members').update({ status: 'inactive' }).eq('tenant_id', failedTenant.id);

        try {
          await notifyTenantAdmins(supabase, failedTenant.id, 'payment_failed', { plan: failedTenant.plan, stripe_customer: failedCustomerId }, {
            subject: '🚨 Payment failed — action required: ' + failedTenant.name,
            html: '<h3>Payment Failed — Account Disabled</h3>' +
              '<p><b>Tenant:</b> ' + failedTenant.name + '</p>' +
              '<p><b>Plan:</b> ' + (failedTenant.plan || 'unknown') + '</p>' +
              '<p><b>Date:</b> ' + new Date().toISOString() + '</p>' +
              '<p>All payment retries have been exhausted and your account has been temporarily disabled. Your data is preserved.</p>' +
              '<p><b>To restore access:</b> please update your payment method at <a href="https://portal.engwx.com">portal.engwx.com</a> or contact support.</p>',
          });
        } catch (ne) { console.log('[Stripe] Fail notification error:', ne.message); }

        try {
          var failOwnerRes = await supabase.from('tenant_members').select('user_id').eq('tenant_id', failedTenant.id).eq('role', 'admin').limit(1);
          var failOwnerId = failOwnerRes.data && failOwnerRes.data[0] ? failOwnerRes.data[0].user_id : null;
          if (failOwnerId) {
            var failOwnerProfile = await supabase.from('user_profiles').select('email').eq('id', failOwnerId).single();
            var failOwnerEmail = failOwnerProfile.data ? failOwnerProfile.data.email : null;
            if (failOwnerEmail) {
              var failLeadRes = await supabase.from('leads').select('id').eq('email', failOwnerEmail).limit(1);
              var failLeadId = failLeadRes.data && failLeadRes.data[0] ? failLeadRes.data[0].id : null;
              if (!failLeadId) {
                var failStageId = await getPipelineStageId(supabase, EW_SP_TENANT_ID, STAGE_KEYS.LOST);
                var newFailLead = await supabase.from('leads').insert({
                  name: failedTenant.name, company: failedTenant.name, email: failOwnerEmail,
                  source: 'payment_failed', type: 'Direct Business', urgency: 'Hot',
                  pipeline_stage_id: failStageId,
                  billing_status: 'payment_failed', tenant_id: EW_SP_TENANT_ID,
                  notes: 'Payment failed after all retries. Plan was: ' + (failedTenant.plan || 'unknown'),
                  last_action_at: new Date().toISOString().split('T')[0],
                  last_activity_at: new Date().toISOString(),
                }).select('id').single();
                failLeadId = newFailLead.data ? newFailLead.data.id : null;
              }
              if (failLeadId) {
                var failRecoverySeq = await supabase.from('sequences').select('id').eq('tenant_id', EW_SP_TENANT_ID).ilike('name', '%abandon%').limit(1);
                if (!failRecoverySeq.data || failRecoverySeq.data.length === 0) {
                  failRecoverySeq = await supabase.from('sequences').select('id').eq('tenant_id', EW_SP_TENANT_ID).ilike('name', '%recover%').limit(1);
                }
                if (failRecoverySeq.data && failRecoverySeq.data.length > 0) {
                  var fSeqId = failRecoverySeq.data[0].id;
                  var fFirstStep = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', fSeqId).eq('step_number', 1).single();
                  var fStart = new Date();
                  if (fFirstStep.data && fFirstStep.data.delay_days > 0) fStart.setDate(fStart.getDate() + fFirstStep.data.delay_days);
                  await safeEnrolSequence(supabase, { tenant_id: EW_SP_TENANT_ID, lead_id: failLeadId, sequence_id: fSeqId, next_step_at: fStart.toISOString() });
                  console.log('[Stripe] Enrolled failed-payment lead in recovery sequence');
                }
              }
            }
          }
        } catch (seqErr) { console.log('[Stripe] Recovery enrol failed:', seqErr.message); }

        break;
      }

      // ── SUBSCRIPTION RESUMED / PAYMENT RECOVERED ──────────────────────────
      case 'customer.subscription.resumed':
      case 'invoice.paid': {
        var paidObj = event.data.object;
        var paidCustomerId = paidObj.customer;
        console.log('[Stripe] Recovery event:', event.type, 'customer:', paidCustomerId);

        var reactiveTenantRes = await supabase.from('tenants').select('id, name, status').eq('stripe_customer_id', paidCustomerId).maybeSingle();
        var reactiveTenant = reactiveTenantRes.data;
        if (!reactiveTenant) { console.log('[Stripe] No tenant for customer:', paidCustomerId); break; }
        if (reactiveTenant.status === 'active') { console.log('[Stripe] Tenant already active — no action'); break; }

        await supabase.from('tenants').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', reactiveTenant.id);
        await supabase.from('tenant_members').update({ status: 'active' }).eq('tenant_id', reactiveTenant.id);
        console.log('[Stripe] Tenant reactivated:', reactiveTenant.name);

        try {
          var ownerReactRes = await supabase.from('tenant_members').select('user_id').eq('tenant_id', reactiveTenant.id).eq('role', 'admin').limit(1);
          var reactOwnerId = ownerReactRes.data && ownerReactRes.data[0] ? ownerReactRes.data[0].user_id : null;
          if (reactOwnerId) {
            var reactProfile = await supabase.from('user_profiles').select('email').eq('id', reactOwnerId).single();
            var reactEmail = reactProfile.data ? reactProfile.data.email : null;
            if (reactEmail) {
              var reactLeadRes = await supabase.from('leads').select('id').eq('email', reactEmail).limit(1);
              if (reactLeadRes.data && reactLeadRes.data.length > 0) {
                var reactLeadId = reactLeadRes.data[0].id;
                await supabase.from('lead_sequences').update({ status: 'cancelled' }).eq('lead_id', reactLeadId).eq('status', 'active');
                console.log('[Stripe] Cancelled recovery sequence for reactivated lead:', reactEmail);
              }
            }
          }
        } catch (seqErr) { console.log('[Stripe] Sequence cancel failed:', seqErr.message); }

        try {
          await notifyTenantAdmins(supabase, reactiveTenant.id, 'subscription_updated', { event: 'reactivated', stripe_customer: paidCustomerId }, {
            subject: 'Tenant reactivated: ' + reactiveTenant.name,
            html: '<h3>Subscription Reactivated</h3>' +
              '<p><b>Tenant:</b> ' + reactiveTenant.name + '</p>' +
              '<p><b>Date:</b> ' + new Date().toISOString() + '</p>' +
              '<p>Tenant and team member access restored.</p>',
          });
        } catch (ne) { console.log('[Stripe] Reactivation notification error:', ne.message); }

        break;
      }

      default:
        console.log('[Stripe] Unhandled event type:', event.type);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Stripe Webhook] Error:', err.message);
    return res.status(200).json({ received: true, error: err.message });
  }
};
