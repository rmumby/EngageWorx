// Updated buildWelcomeEmail function for stripe-webhook.js
// Changes:
// 1. Reads tenant brand color from tenants table
// 2. Reads welcome_email_steps from tenants table (configurable 3 steps)
// 3. Falls back to SP defaults if not set

// Updated buildWelcomeEmail function for stripe-webhook.js
// Changes:
// 1. Reads tenant brand color from tenants table
// 2. Reads welcome_email_steps from tenants table (configurable 3 steps)
// 3. Falls back to SP defaults if not set

async async function buildWelcomeEmail(tenantId, email, plan, companyName) {
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
    '<tr><td style="padding:10px 0;color:#94a3b8;font-size:13px;">Plan</td><td style="padding:10px 0;"><span style="background:' + c1 + '18;color:' + c1 + ';border:1px solid ' + c1 + '44;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700;">' + planLabel + '</span></td></tr>' +
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
    '<tr><td style="padding:10px 0;color:#94a3b8;font-size:13px;">Plan</td><td style="padding:10px 0;"><span style="background:' + c1 + '18;color:' + c1 + ';border:1px solid ' + c1 + '44;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700;">' + planLabel + '</span></td></tr>' +
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
