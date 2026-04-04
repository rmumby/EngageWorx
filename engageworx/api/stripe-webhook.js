var { createClient } = require('@supabase/supabase-js');
var { getNotifyEmails } = require('./_notify');

var supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

var EW_SP_TENANT_ID = 'c1bc59a8-5235-4921-9755-02514b574387';

// ── SP email config from portal ───────────────────────────────────────────
async function getSPEmailConfig() {
  try {
    var supabaseLocal = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    var res = await supabaseLocal.from('channel_configs').select('config_encrypted').eq('tenant_id', EW_SP_TENANT_ID).eq('channel', 'email').single();
    var cc = (res.data && res.data.config_encrypted) || {};
    return {
      from: cc.from_email || cc.welcome_email_from || 'hello@engwx.com',
      fromName: cc.from_name || cc.welcome_email_from_name || 'EngageWorx',
    };
  } catch(e) { return { from: 'hello@engwx.com', fromName: 'EngageWorx' }; }
}

// ── AI-personalised welcome email builder ─────────────────────────────────
// Updated buildWelcomeEmail function for stripe-webhook.js
// Changes:
// 1. Reads tenant brand color from tenants table
// 2. Reads welcome_email_steps from tenants table (configurable 3 steps)
// 3. Falls back to SP defaults if not set

async function buildWelcomeEmail(tenantId, email, plan, companyName, demoPassword) {
  var config = {
    from: 'hello@engwx.com',
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
    var anthropic = new (AnthropicSdk.default || AnthropicSdk)({ apiKey: process.env.REACT_APP_ANTHROPIC_API_KEY });
    var systemPrompt = config.aiPrompt ||
      'You are Rob Mumby, Founder & CEO of EngageWorx — an AI-powered omnichannel customer communications platform (SMS, WhatsApp, Email, Voice, RCS). Write a short, warm personal welcome. Exactly 2 short paragraphs. First: warm welcome referencing their company name and plan. Second: invite them to book a quick call — mention it naturally without writing the URL. No subject line, no sign-off, no URLs anywhere in the text.';
    var aiRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
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
          var tenantResult = await supabase.from('tenants').insert({
            name: companyName,
            slug: slug,
            plan: plan,
            status: 'active',
            brand_primary: '#00C9FF',
            brand_name: companyName,
            channels_enabled: ['sms', 'email', 'whatsapp'],
          }).select().single();

          if (tenantResult.error) {
            console.error('[Stripe] Tenant create error:', tenantResult.error.message);
            break;
          }

          var tenant = tenantResult.data;
          newTenantId = tenant.id;

          await supabase.from('user_profiles').update({
            tenant_id: tenant.id,
            role: 'admin',
            company_name: companyName,
          }).eq('id', userId);

          await supabase.from('tenant_members').insert({
            tenant_id: tenant.id,
            user_id: userId,
            role: 'admin',
            status: 'active',
            joined_at: new Date().toISOString(),
            notify_on_escalation: true,
            notify_on_new_signup: false,
            notify_on_payment: true,
            notify_on_new_lead: false,
          });

          console.log('[Stripe] Tenant created:', tenant.id, 'for:', email);

          // Auto-create pipeline lead
          try {
            var existingLead = await supabase.from('leads').select('id').eq('email', email).limit(1);
            if (!existingLead.data || existingLead.data.length === 0) {
              await supabase.from('leads').insert({
                name: companyName,
                company: companyName,
                email: email,
                type: 'Direct Business',
                urgency: 'Warm',
                stage: 'customer',
                source: 'Website',
                notes: 'Auto-created from Stripe signup. Plan: ' + plan,
                last_action_at: new Date().toISOString().split('T')[0],
                last_activity_at: new Date().toISOString(),
              });
              console.log('[Stripe] Pipeline lead auto-created for:', email);
            }
          } catch (plErr) { console.log('[Stripe] Pipeline lead create failed (non-fatal):', plErr.message); }

          // Notify SP admins
          try {
            var spEmailCfg = await getSPEmailConfig();
            var spEmails = await getNotifyEmails(EW_SP_TENANT_ID, 'notify_on_new_signup');
            if (spEmails.length > 0) {
              await sgMail.send({
                to: spEmails,
                from: { email: spEmailCfg.from, name: spEmailCfg.fromName },
                subject: '🎉 New Signup: ' + companyName + ' (' + plan + ')',
                text: 'New signup\n\nCompany: ' + companyName + '\nEmail: ' + email + '\nPlan: ' + plan + '\nTenant ID: ' + tenant.id,
              });
              console.log('[Stripe] SP notification sent to:', spEmails);
            }
          } catch (spErr) { console.log('[Stripe] SP notify failed:', spErr.message); }
        }

        // AI-personalised welcome email — always fires
        try {
          var welcomeConfig = await buildWelcomeEmail(newTenantId, email, plan, companyName, demoPassword);
          if (welcomeConfig) {
            await sgMail.send({
              to: email,
              from: { email: welcomeConfig.from, name: welcomeConfig.fromName },
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
      var abandonRes = await supabase.from('leads').insert({
        name: expiredName || expiredEmail,
        company: expiredName || '',
        email: expiredEmail,
        source: 'abandoned_checkout',
        stage: 'inquiry',
        type: 'Direct Business',
        urgency: 'Hot',
        billing_status: 'abandoned',
        notes: 'Abandoned Stripe checkout — ' + expiredPlan + ' plan. No credit card entered.',
        ai_next_action: 'Send recovery email and follow up within 48 hours.',
        last_action_at: new Date().toISOString().split('T')[0],
        last_activity_at: new Date().toISOString(),
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
      var existingContact = await supabase.from('contacts').select('id').eq('email', expiredEmail).eq('tenant_id', SP_TENANT_ID).single();
      if (!existingContact.data) {
        var nameParts = (expiredName || '').trim().split(' ');
        await supabase.from('contacts').insert({
          first_name: nameParts[0] || expiredEmail,
          last_name: nameParts.slice(1).join(' ') || null,
          email: expiredEmail,
          company_name: expiredName || null,
          pipeline_lead_id: abandonedLeadId,
          tenant_id: SP_TENANT_ID,
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
        .eq('tenant_id', SP_TENANT_ID)
        .ilike('name', '%abandon%')
        .limit(1);
      if (!abandonSeqs.data || abandonSeqs.data.length === 0) {
        // Fall back to any sequence with 'recovery' or 'checkout' in name
        abandonSeqs = await supabase.from('sequences')
          .select('id, name')
          .eq('tenant_id', SP_TENANT_ID)
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
        await supabase.from('lead_sequences').upsert({
          tenant_id: SP_TENANT_ID,
          lead_id: abandonedLeadId,
          sequence_id: seqId,
          current_step: 0,
          status: 'active',
          enrolled_at: new Date().toISOString(),
          next_step_at: startDate.toISOString(),
        }, { onConflict: 'lead_id,sequence_id' });
        console.log('[Stripe] Enrolled abandoned lead in sequence:', abandonSeqs.data[0].name);
      }
    }
  } catch (seqErr) { console.log('[Stripe] Sequence enrol failed:', seqErr.message); }

  // Recovery email
  try {
    var sgMailRecover = require('@sendgrid/mail');
    sgMailRecover.setApiKey(process.env.SENDGRID_API_KEY);
    var firstName = expiredName ? expiredName.split(' ')[0] : 'there';
    var recoverHtml =
      '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;">' +
      '<div style="text-align:center;margin-bottom:32px;"><div style="background:linear-gradient(135deg,#00C9FF,#E040FB);display:inline-block;padding:8px 16px;border-radius:8px;"><span style="color:#fff;font-weight:900;font-size:20px;">EngageWorx</span></div></div>' +
      '<p style="font-size:15px;color:#1e293b;line-height:1.7;margin:0 0 16px;">Hi ' + firstName + ',</p>' +
      '<p style="font-size:15px;color:#1e293b;line-height:1.7;margin:0 0 16px;">Looks like you started signing up for EngageWorx but didn\'t quite finish — no worries at all.</p>' +
      '<p style="font-size:15px;color:#1e293b;line-height:1.7;margin:0 0 16px;">If you hit a snag, had a question, or just got pulled away — I\'m happy to help. Just reply to this email and I\'ll get back to you personally.</p>' +
      '<div style="text-align:center;margin:28px 0;"><a href="https://portal.engwx.com" style="display:inline-block;background:linear-gradient(135deg,#00C9FF,#E040FB);color:#000;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:800;font-size:15px;">Complete Signup →</a></div>' +
      '<div style="text-align:center;margin:0 0 32px;"><a href="https://calendly.com/rob-engwx/30min" style="display:inline-block;border:2px solid #00C9FF;color:#00C9FF;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">Book a Quick Call →</a></div>' +
      '<table cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:16px;vertical-align:top;"><div style="background:linear-gradient(135deg,#00C9FF,#E040FB);color:#000;font-weight:900;font-size:15px;padding:8px 12px;border-radius:6px;">EW</div></td><td style="vertical-align:top;"><div style="font-weight:bold;color:#222;font-size:14px;">Rob Mumby</div><div style="color:#555;font-size:13px;">Founder &amp; CEO, EngageWorx</div><div style="margin-top:4px;font-size:12px;"><a href="tel:+17869827800" style="color:#00C9FF;text-decoration:none;">+1 (786) 982-7800</a> | <a href="https://engwx.com" style="color:#00C9FF;text-decoration:none;">engwx.com</a></div></td></tr></table></div>';

    var spRecoverCfg = await getSPEmailConfig();
    await sgMailRecover.send({
      to: expiredEmail,
      from: { email: spRecoverCfg.from, name: spRecoverCfg.fromName },
      subject: 'Did you have any questions about EngageWorx?',
      text: 'Hi ' + firstName + ',\n\nLooks like you started signing up but didn\'t quite finish.\n\nReady to jump back in? portal.engwx.com\n\nBook a quick call: calendly.com/rob-engwx/30min\n\nRob Mumby\nFounder & CEO, EngageWorx',
      html: recoverHtml,
    });
    console.log('[Stripe] Recovery email sent to:', expiredEmail);
  } catch (recoverErr) {
    console.log('[Stripe] Recovery email failed (non-fatal):', recoverErr.message);
  }

  break;
}
};
