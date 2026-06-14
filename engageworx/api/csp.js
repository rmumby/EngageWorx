// /api/csp.js — CSP (Channel Service Provider) management API
// GET  /api/csp?action=tenants          → List CSP's tenants with usage
// GET  /api/csp?action=status           → CSP dashboard summary
// POST /api/csp?action=create           → Create a sub-tenant under CSP
// GET  /api/csp?action=check            → Check if current user is a CSP
// POST /api/csp?action=test_welcome_email → Send a test welcome email

var { createClient } = require('@supabase/supabase-js');
var { seedPipelineStages } = require('./_lib/seed-pipeline-stages');
var { verifyTenantAuth } = require('./_lib/verify-tenant-auth');
var { createTenant } = require('./_lib/create-tenant');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
  );
}

// ─── SHARED WELCOME EMAIL FUNCTION ───────────────────────────────────────────
async function sendWelcomeEmail(supabase, cspTenantId, email, companyName, plan) {
  var RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return;

  // Load CSP welcome email settings
  var welcomeSettings = await supabase
    .from('tenants')
    .select('welcome_email_enabled, welcome_email_from, welcome_email_from_name, welcome_email_ai_prompt, welcome_email_onboarding_link, welcome_email_steps, brand_primary, brand_name, name')
    .eq('id', cspTenantId)
    .single();
  var ws = welcomeSettings.data || {};

  if (ws.welcome_email_enabled === false) return;

  var brandColor = ws.brand_primary || '#00C9FF';
  var senderName = ws.welcome_email_from_name || ws.brand_name || ws.name || 'EngageWorx';
  var senderEmail = ws.welcome_email_from || (process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com');
  var calendlyUrl = ws.welcome_email_onboarding_link || 'https://calendly.com/rob-engwx/cpexpo-the-venetian';
  var planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);

  // Generate AI personalised message
  var aiMessage = '';
  try {
    var Anthropic = require('@anthropic-ai/sdk');
    var anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    var systemPrompt = ws.welcome_email_ai_prompt ||
      'You are ' + senderName + ', writing a welcome email to a new customer. Write exactly 2 short paragraphs. First: warm personal welcome referencing their company name and plan. Second: invite them to book a call. No URLs, no sign-off.';
    var aiRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'New signup — Company: ' + companyName + ', Plan: ' + plan + ', Email: ' + email }]
    });
    aiMessage = aiRes.content[0].text.trim();
  } catch (aiErr) {
    console.log('[CSP] AI welcome failed:', aiErr.message);
  }

  // Build steps HTML
  var defaultSteps = [
    '1. <strong>Set up your channels</strong> — Settings → Channels',
    '2. <strong>Import your contacts</strong> — Contacts → Import',
    '3. <strong>Configure your AI Chatbot</strong> — AI Chatbot in the sidebar',
  ];
  var stepsArray = ws.welcome_email_steps
    ? ws.welcome_email_steps.split('\n').filter(function(s) { return s.trim(); })
    : defaultSteps;
  var stepsHtml = stepsArray.map(function(s) {
    return '<div style="padding:12px 16px;background:#f8fafc;border-radius:8px;margin-bottom:8px;font-size:14px;color:#1e293b;line-height:1.5;">' + s.trim() + '</div>';
  }).join('');

  var aiHtml = aiMessage
    ? aiMessage.split('\n\n').filter(function(p) { return p.trim(); }).map(function(p) {
        return '<p style="margin:0 0 14px;font-size:15px;color:#1e293b;line-height:1.7;">' + p.trim() + '</p>';
      }).join('')
    : '';

  var welcomeHtml =
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">' +
    '<div style="max-width:600px;margin:0 auto;padding:32px 16px;">' +
    '<div style="background:linear-gradient(135deg,' + brandColor + ',#E040FB);border-radius:14px;padding:36px 32px;text-align:center;margin-bottom:24px;">' +
    '<div style="color:#fff;font-weight:900;font-size:24px;">' + senderName + '</div>' +
    '<div style="color:#fff;font-size:28px;font-weight:800;margin:16px 0 6px;">Welcome! 🎉</div>' +
    '<div style="color:rgba(255,255,255,0.9);font-size:15px;">Your account is live and ready to go.</div>' +
    '</div>' +
    (aiHtml ? '<div style="background:#fff;border-radius:12px;padding:24px 28px;margin-bottom:20px;border-left:4px solid ' + brandColor + ';">' + aiHtml + '</div>' : '') +
    '<div style="background:#fff;border-radius:12px;padding:24px 28px;margin-bottom:20px;">' +
    '<div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px;">Your Login Details</div>' +
    '<table style="width:100%;border-collapse:collapse;">' +
    '<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 0;color:#64748b;font-size:13px;width:100px;">Portal</td><td style="padding:10px 0;"><a href="https://portal.engwx.com" style="color:' + brandColor + ';font-weight:700;">portal.engwx.com</a></td></tr>' +
    '<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 0;color:#64748b;font-size:13px;">Email</td><td style="padding:10px 0;color:#1e293b;font-weight:600;">' + email + '</td></tr>' +
    '<tr><td style="padding:10px 0;color:#64748b;font-size:13px;">Plan</td><td style="padding:10px 0;color:#1e293b;">' + planLabel + '</td></tr>' +
    '</table>' +
    '<div style="margin-top:20px;text-align:center;"><a href="https://portal.engwx.com" style="display:inline-block;background:linear-gradient(135deg,' + brandColor + ',#E040FB);color:#000;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:800;">Log In to Your Portal →</a></div>' +
    '</div>' +
    '<div style="background:#fff;border-radius:12px;padding:24px 28px;margin-bottom:20px;">' +
    '<div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px;">3 Things to Do First</div>' +
    stepsHtml +
    '</div>' +
    '<div style="background:#fff;border-radius:12px;padding:24px 28px;margin-bottom:24px;text-align:center;">' +
    '<div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:8px;">📅 Want a quick walkthrough?</div>' +
    '<div style="color:#64748b;font-size:14px;margin-bottom:16px;">Book a free 30-minute onboarding call — no prep needed.</div>' +
    '<a href="' + calendlyUrl + '" style="display:inline-block;border:2px solid ' + brandColor + ';color:' + brandColor + ';padding:12px 32px;border-radius:10px;text-decoration:none;font-weight:700;">Book Onboarding Call →</a>' +
    '</div>' +
    '<div style="text-align:center;padding:8px 0 24px;">' +
    '<div style="font-weight:700;color:#1e293b;">' + senderName + '</div>' +
    '<div style="color:#94a3b8;font-size:12px;margin-top:4px;">SMS · WhatsApp · Email · Voice · RCS</div>' +
    '</div>' +
    '</div></body></html>';

  var emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: senderName + ' <' + senderEmail + '>',
      to: [email],
      subject: 'Welcome to ' + senderName + ' — your account is live 🎉',
      html: welcomeHtml,
    }),
  });

  if (!emailRes.ok) {
    var errBody;
    try { errBody = await emailRes.json(); } catch (_) { errBody = {}; }
    var errMsg = (errBody.message || errBody.error || 'HTTP ' + emailRes.status);
    console.error('[CSP] Welcome email FAILED:', errMsg);
    return { success: false, error: errMsg };
  }

  console.log('[CSP] Welcome email sent to', email);
  return { success: true };
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
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
      if (result.error) return res.status(500).json({ error: result.error.message });
      return res.status(200).json({ csp_tenant_id: cspTenantId, tenants: result.data || [], count: result.data ? result.data.length : 0 });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ─── CSP DASHBOARD SUMMARY ───────────────────────────────────
  if (action === 'status') {
    var cspTenantId = req.query.csp_tenant_id;
    if (!cspTenantId) return res.status(400).json({ error: 'Missing csp_tenant_id' });
    try {
      var cspResult = await supabase.from('tenants').select('name, plan, status, created_at').eq('id', cspTenantId).maybeSingle();
      if (!cspResult.data) return res.status(404).json({ error: 'CSP tenant not found' });
      var tenantsResult = await supabase.rpc('get_csp_tenants', { p_csp_tenant_id: cspTenantId });
      var tenants = tenantsResult.data || [];
      var planResult = await supabase.from('plan_limits').select('*').eq('plan_name', cspResult.data.plan).maybeSingle();
      var planLimits = planResult.data || { monthly_messages: 0 };
      var totalMessages = 0, totalSms = 0, totalWhatsapp = 0, totalEmail = 0;
      for (var i = 0; i < tenants.length; i++) {
        totalMessages += parseInt(tenants[i].total_messages) || 0;
        totalSms += parseInt(tenants[i].sms_sent) || 0;
        totalWhatsapp += parseInt(tenants[i].whatsapp_sent) || 0;
        totalEmail += parseInt(tenants[i].email_sent) || 0;
      }
      return res.status(200).json({
        csp: { id: cspTenantId, name: cspResult.data.name, plan: cspResult.data.plan, status: cspResult.data.status },
        tenants: { count: tenants.length, limit: planLimits.monthly_messages ? Math.floor(planLimits.monthly_messages / 1000) : 0 },
        usage: { total_messages: totalMessages, sms_sent: totalSms, whatsapp_sent: totalWhatsapp, email_sent: totalEmail, plan_limit: planLimits.monthly_messages || 0, percentage_used: planLimits.monthly_messages > 0 ? Math.round((totalMessages / planLimits.monthly_messages) * 100 * 10) / 10 : 0 },
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ─── TEST WELCOME EMAIL ──────────────────────────────────────
  if (action === 'test_welcome_email' && req.method === 'POST') {
    var cspTenantId = req.body.csp_tenant_id;
    var email = (req.body.email || '').trim();
    var companyName = req.body.company_name || 'Test Company';
    var plan = req.body.plan || 'starter';
    if (!cspTenantId) return res.status(400).json({ error: 'Missing csp_tenant_id' });
    if (!email) return res.status(400).json({ error: 'Missing email' });
    try {
      await sendWelcomeEmail(supabase, cspTenantId, email, companyName, plan);
      return res.status(200).json({ success: true, message: 'Test welcome email sent to ' + email });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ─── CREATE SUB-TENANT UNDER CSP ──────────────────────────────
  if (action === 'create' && req.method === 'POST') {
    var cspTenantId = req.body.csp_tenant_id;
    var email = (req.body.email || '').trim().toLowerCase();
    var fullName = req.body.full_name || '';
    var companyName = req.body.company_name || '';
    var plan = req.body.plan || 'starter';
    var isSandbox = req.body.is_sandbox === true;
    var isDemo = req.body.is_demo === true;
    var customerType = req.body.customer_type || 'direct';
    // Enforce mutual exclusion: sandbox and demo cannot both be true
    if (isSandbox && isDemo) {
      return res.status(400).json({ error: 'A tenant cannot be both sandbox and demo. Choose one.' });
    }

    if (!cspTenantId || !email || !companyName) {
      return res.status(400).json({ error: 'Missing required fields: csp_tenant_id, email, company_name' });
    }

    // Auth: superadmin or an admin of the CSP/agent tenant creating the sub-tenant.
    var cspAuth = await verifyTenantAuth(supabase, req, cspTenantId, { requireAdmin: true });
    if (cspAuth.error) return res.status(cspAuth.status).json({ error: cspAuth.error });

    var cspCheck = await supabase.from('tenants').select('id, name, tenant_type, customer_type').eq('id', cspTenantId).maybeSingle();
    var cspType = (cspCheck.data && (cspCheck.data.customer_type || cspCheck.data.tenant_type)) || '';
    if (!cspCheck.data || !['csp', 'csp_partner', 'sp', 'agent', 'internal'].includes(cspType)) {
      return res.status(403).json({ error: 'Not a valid CSP tenant' });
    }

    try {
      // All core provisioning (auth user + set-password link, tenant row with explicit
      // customer_type/tenant_type + flag XOR, stages/demo seed, member/profile, audit, welcome)
      // goes through the shared primitive — no plaintext password.
      var provision = await createTenant(supabase, {
        email: email,
        fullName: fullName,
        companyName: companyName,
        plan: plan,
        customerType: customerType,
        isSandbox: isSandbox,
        isDemo: isDemo,
        parentTenantId: cspTenantId,
        creatorTenantId: cspTenantId,
        status: 'active',
        operatorId: cspAuth.user.id,
        extraTenantFields: {
          parent_product_label: req.body.parent_product_label || null,
          display_alias: req.body.display_alias || null,
        },
      });
      if (!provision.ok) return res.status(provision.status || 500).json({ error: provision.error });

      var tenant = provision.tenant;
      var userId = provision.userId;

      // Seed chatbot_configs with brand-aware signature defaults (only if no row exists yet)
      try {
        var brand = (tenant.brand_name || companyName || 'Your Business').trim();
        var existingCfg = await supabase.from('chatbot_configs').select('id, email_from_name, email_team_from_name').eq('tenant_id', tenant.id).maybeSingle();
        var patch = {};
        if (!existingCfg.data) {
          patch = { tenant_id: tenant.id, email_from_name: brand, email_team_from_name: brand + ' Team' };
          await supabase.from('chatbot_configs').insert(patch);
        } else {
          if (!existingCfg.data.email_from_name) patch.email_from_name = brand;
          if (!existingCfg.data.email_team_from_name) patch.email_team_from_name = brand + ' Team';
          if (Object.keys(patch).length > 0) await supabase.from('chatbot_configs').update(patch).eq('tenant_id', tenant.id);
        }
      } catch (seedErr) { console.warn('[CSP] Signature seed failed:', seedErr.message); }

      // Notify CSP parent tenant admins
      try {
        var { notifyTenantAdmins: _notifyCSP } = require('./_lib/notify-tenant-admins');
        await _notifyCSP(supabase, cspTenantId, 'csp_event', { sub_tenant: companyName, email: email, plan: plan }, {
          subject: '🏢 New CSP tenant: ' + companyName + ' (under ' + cspCheck.data.name + ')',
          html: '<h2>New CSP Sub-Tenant Created</h2><p><b>CSP:</b> ' + cspCheck.data.name + '</p><p><b>Tenant:</b> ' + companyName + '</p><p><b>Email:</b> ' + email + '</p><p><b>Plan:</b> ' + plan + '</p>',
        });
      } catch (ne) { console.warn('CSP alert email failed:', ne.message); }

      // Welcome (set-password link) is sent by the shared primitive — single sender per event.
      return res.status(200).json({
        success: true,
        tenant_id: tenant.id,
        tenant_name: companyName,
        slug: tenant.slug,
        plan: plan,
        csp_id: cspTenantId,
        csp_name: cspCheck.data.name,
        user_id: userId,
        email: email,
        customer_type: tenant.customer_type,
        is_sandbox: tenant.is_sandbox,
        is_demo: tenant.is_demo,
        set_password_link: provision.setPasswordLink,
        welcome_email_sent: provision.welcomeEmailSent,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action. Use: check, tenants, status, create, test_welcome_email' });
};
