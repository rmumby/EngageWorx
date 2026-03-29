var { createClient } = require('@supabase/supabase-js');
var { getNotifyEmails } = require('./_notify');

var supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

var EW_SP_TENANT_ID = 'c1bc59a8-5235-4921-9755-02514b574387';

// ── AI-personalised welcome email builder ─────────────────────────────────
async function buildWelcomeEmail(tenantId, email, plan, companyName) {
  var config = {
    from: 'hello@engwx.com',
    fromName: 'Rob at EngageWorx',
    calendly: 'https://calendly.com/rob-engwx/30min',
    aiPrompt: null,
    enabled: true,
  };

  var supabaseLocal = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (tenantId) {
    try {
      var tenantRes = await supabaseLocal.from('tenants')
        .select('welcome_email_enabled, welcome_email_from, welcome_email_from_name, welcome_email_ai_prompt, welcome_email_calendly')
        .eq('id', tenantId).single();
      if (tenantRes.data) {
        var t = tenantRes.data;
        if (t.welcome_email_enabled === false) return null;
        if (t.welcome_email_from) config.from = t.welcome_email_from;
        if (t.welcome_email_from_name) config.fromName = t.welcome_email_from_name;
        if (t.welcome_email_calendly) config.calendly = t.welcome_email_calendly;
        if (t.welcome_email_ai_prompt) config.aiPrompt = t.welcome_email_ai_prompt;
      }
    } catch (e) { /* use defaults */ }
  }

  var aiMessage = '';
  try {
    var AnthropicSdk = require('@anthropic-ai/sdk');
    var anthropic = new (AnthropicSdk.default || AnthropicSdk)({ apiKey: process.env.REACT_APP_ANTHROPIC_API_KEY });
    var systemPrompt = config.aiPrompt ||
      'You are Rob Mumby, Founder & CEO of EngageWorx — an AI-powered omnichannel customer communications platform (SMS, WhatsApp, Email, Voice, RCS). Write a short, warm, personal welcome message to a new customer. 3-4 sentences max. Founder tone — genuine, not corporate. Reference their company name and plan. Naturally include a mention of booking an onboarding call at ' + config.calendly + '. No subject line, no sign-off, just the body text.';
    var aiRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'New signup — Company: ' + companyName + ', Plan: ' + plan + ', Email: ' + email }]
    });
    aiMessage = aiRes.content[0].text.trim();
  } catch (aiErr) { console.log('[Stripe] AI welcome failed:', aiErr.message); }

  var planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  var personalNote = aiMessage
    ? '<div style="background:#f8fafc;border-left:3px solid #00C9FF;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:20px;font-size:15px;color:#1e293b;line-height:1.7;">' + aiMessage + '</div>'
    : '';

  var html =
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">' +
    '<div style="background:linear-gradient(135deg,#00C9FF,#E040FB);border-radius:12px;padding:32px;text-align:center;margin-bottom:24px;">' +
    '<span style="color:#fff;font-weight:900;font-size:22px;">EngageWorx</span>' +
    '<div style="color:#fff;font-size:13px;opacity:0.85;letter-spacing:1px;text-transform:uppercase;margin-top:4px;">AI-Powered CX</div>' +
    '<h1 style="color:#fff;margin:16px 0 8px;font-size:26px;font-weight:800;">Welcome! 🎉</h1>' +
    '<p style="color:rgba(255,255,255,0.9);margin:0;font-size:15px;">Your account is live and ready to go.</p>' +
    '</div>' +
    personalNote +
    '<div style="background:#fff;border-radius:12px;padding:28px;margin-bottom:20px;border:1px solid #e2e8f0;">' +
    '<h2 style="color:#1e293b;margin:0 0 16px;font-size:18px;">Your Login Details</h2>' +
    '<table style="width:100%;border-collapse:collapse;">' +
    '<tr><td style="padding:10px 0;color:#64748b;font-size:14px;width:120px;">Portal</td><td style="padding:10px 0;font-size:14px;"><a href="https://portal.engwx.com" style="color:#00C9FF;text-decoration:none;font-weight:700;">portal.engwx.com</a></td></tr>' +
    '<tr style="border-top:1px solid #f1f5f9;"><td style="padding:10px 0;color:#64748b;font-size:14px;">Email</td><td style="padding:10px 0;font-size:14px;color:#1e293b;font-weight:600;">' + email + '</td></tr>' +
    '<tr style="border-top:1px solid #f1f5f9;"><td style="padding:10px 0;color:#64748b;font-size:14px;">Plan</td><td style="padding:10px 0;font-size:14px;color:#1e293b;">' + planLabel + '</td></tr>' +
    '</table>' +
    '<div style="margin-top:20px;text-align:center;"><a href="https://portal.engwx.com" style="display:inline-block;background:linear-gradient(135deg,#00C9FF,#E040FB);color:#000;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:800;font-size:15px;">Log In to Your Portal →</a></div>' +
    '</div>' +
    '<div style="background:#fff;border-radius:12px;padding:28px;margin-bottom:20px;border:1px solid #e2e8f0;">' +
    '<h2 style="color:#1e293b;margin:0 0 16px;font-size:18px;">3 Things to Do First</h2>' +
    '<div style="padding:14px;background:#f8fafc;border-radius:8px;margin-bottom:10px;"><strong style="color:#1e293b;">1. Add your phone number</strong> — Settings → Phone Numbers</div>' +
    '<div style="padding:14px;background:#f8fafc;border-radius:8px;margin-bottom:10px;"><strong style="color:#1e293b;">2. Import your contacts</strong> — Contacts → Import</div>' +
    '<div style="padding:14px;background:#f8fafc;border-radius:8px;"><strong style="color:#1e293b;">3. Set up your AI Chatbot</strong> — AI Chatbot → configure your business info</div>' +
    '</div>' +
    '<div style="background:#fff;border-radius:12px;padding:28px;margin-bottom:20px;border:1px solid #e2e8f0;text-align:center;">' +
    '<h3 style="color:#1e293b;margin:0 0 8px;font-size:16px;">📅 Want a quick walkthrough?</h3>' +
    '<p style="color:#64748b;font-size:14px;margin:0 0 16px;">Book a free 30-minute onboarding call.</p>' +
    '<a href="' + config.calendly + '" style="display:inline-block;border:2px solid #00C9FF;color:#00C9FF;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">Book Onboarding Call →</a>' +
    '</div>' +
    '<div style="text-align:center;padding:20px 0;">' +
    '<strong style="color:#1e293b;">Rob Mumby</strong><br>' +
    '<span style="color:#64748b;font-size:13px;">Founder &amp; CEO, EngageWorx</span><br>' +
    '<span style="color:#94a3b8;font-size:12px;">SMS · WhatsApp · Email · Voice · RCS</span><br>' +
    '<a href="tel:+17869827800" style="color:#00C9FF;text-decoration:none;font-size:12px;">+1 (786) 982-7800</a> | ' +
    '<a href="https://engwx.com" style="color:#00C9FF;text-decoration:none;font-size:12px;">engwx.com</a>' +
    '</div></div>';

  return {
    from: config.from,
    fromName: config.fromName,
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
            var spEmails = await getNotifyEmails(EW_SP_TENANT_ID, 'notify_on_new_signup');
            if (spEmails.length > 0) {
              await sgMail.send({
                to: spEmails,
                from: { email: 'hello@engwx.com', name: 'EngageWorx' },
                subject: '🎉 New Signup: ' + companyName + ' (' + plan + ')',
                text: 'New signup\n\nCompany: ' + companyName + '\nEmail: ' + email + '\nPlan: ' + plan + '\nTenant ID: ' + tenant.id,
              });
              console.log('[Stripe] SP notification sent to:', spEmails);
            }
          } catch (spErr) { console.log('[Stripe] SP notify failed:', spErr.message); }
        }

        // AI-personalised welcome email — always fires
        try {
          var welcomeConfig = await buildWelcomeEmail(newTenantId, email, plan, companyName);
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

      case 'invoice.payment_succeeded': {
        var invoice = event.data.object;
        console.log('[Stripe] Payment succeeded:', invoice.customer_email, '$' + (invoice.amount_paid / 100));
        supabase.from('audit_log').insert({
          action: 'payment_succeeded',
          metadata: {
            email: invoice.customer_email,
            amount: invoice.amount_paid / 100,
            invoice_id: invoice.id,
          },
        }).then(function() {}).catch(function() {});
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
          console.log('[Stripe] Expired session but user already has tenant — skipping recovery email');
          break;
        }

        try {
          var existingAbandon = await supabase.from('leads').select('id').eq('email', expiredEmail).limit(1);
          if (!existingAbandon.data || existingAbandon.data.length === 0) {
            await supabase.from('leads').insert({
              name: expiredName || expiredEmail,
              email: expiredEmail,
              source: 'abandoned_checkout',
              stage: 'inquiry',
              type: 'prospect',
              urgency: 'normal',
              notes: 'Abandoned Stripe checkout — ' + expiredPlan + ' plan. Session expired.',
              ai_summary: 'Started signup but did not complete payment.',
              ai_next_action: 'Send recovery email and follow up within 48 hours.',
              last_action_at: new Date().toISOString().split('T')[0],
            });
            console.log('[Stripe] Abandoned checkout lead created:', expiredEmail);
          }
        } catch (leadErr) { console.log('[Stripe] Abandon lead create failed:', leadErr.message); }

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

          await sgMailRecover.send({
            to: expiredEmail,
            from: { email: 'hello@engwx.com', name: 'Rob at EngageWorx' },
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

      case 'customer.subscription.deleted': {
        var sub = event.data.object;
        console.log('[Stripe] Subscription cancelled:', sub.customer);
        break;
      }

      default:
        console.log('[Stripe] Unhandled event type:', event.type);
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('[Stripe Webhook] Error:', err.message, err.stack);
    return res.status(200).json({ received: true });
  }
};
