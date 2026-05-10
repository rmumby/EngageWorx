// api/tcr-wizard.js — Self-service TCR registration wizard
// Tenant-facing. No Rob in the loop. Supplier-aware (Telnyx or Twilio per tenant).
//
// Brand naming convention for AI generation:
// - tenants.name = platform internal label, NOT for customer-facing content
// - brand_data.displayName = customer-facing brand (carriers, opt-in pages, sample messages)
// - brand_data.companyName = legal entity (EIN paperwork, privacy policy, vetting)
// AI prompts must use displayName/companyName from session, NEVER tenants.name.
//
// Actions: start, save_step, ai_validate, ai_pre_fill, submit, interpret_rejection, status
//
// Per CLAUDE.md: no personal escalation emails. Status surfaces via wizard UI.
// Per single-sender principle: only this endpoint creates wizard sessions.

var { createClient } = require('@supabase/supabase-js');
var { loadSupplier, USECASE_ENUM } = require('./_lib/tcr-supplier');

var SP_TENANT_ID = process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387';

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ── Auth: verify caller is tenant_member of the given tenant ────────────────

async function verifyTenantMember(supabase, jwt, tenantId) {
  if (!jwt) return null;
  var { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data || !data.user) return null;
  var userId = data.user.id;
  // Check direct tenant membership first
  var { data: member } = await supabase.from('tenant_members')
    .select('id').eq('user_id', userId).eq('tenant_id', tenantId).eq('status', 'active').maybeSingle();
  if (member) return userId;
  // Fallback: allow SP admin cross-tenant access (View Portal flow)
  var { data: profile } = await supabase.from('user_profiles')
    .select('role').eq('id', userId).maybeSingle();
  if (profile && ['superadmin', 'super_admin', 'sp_admin'].indexOf(profile.role) !== -1) return userId;
  return null;
}

// ── Load reference data (EngageWorx known-good campaign) ────────────────────

async function loadReference(supabase) {
  var ref = {};
  try {
    var { data } = await supabase.from('tcr_submissions')
      .select('use_case, use_case_description, sample_messages, opt_in_description, opt_in_method')
      .eq('tenant_id', SP_TENANT_ID)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (data) ref = data;
  } catch (e) {}
  return ref;
}

// ── AI validation ───────────────────────────────────────────────────────────

async function runAiValidation(session, reference) {
  var apiKey = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
  if (!apiKey) return [{ check: 'ai_available', status: 'fail', message: 'ANTHROPIC_API_KEY not configured' }];

  var brand = session.brand_data || {};
  var campaign = session.campaign_data || {};
  var checks = [];

  // URL checks — fetch opt-in, privacy, sms-terms
  var urls = [
    { label: 'Opt-in page', url: campaign.opt_in_url },
    { label: 'Privacy policy', url: campaign.privacy_url },
    { label: 'SMS terms', url: campaign.sms_terms_url },
  ];
  for (var i = 0; i < urls.length; i++) {
    var u = urls[i];
    if (!u.url) {
      checks.push({ check: u.label, status: 'fail', message: u.label + ' URL is missing', fix: 'Add the ' + u.label + ' URL in the Campaign step' });
      continue;
    }
    try {
      var resp = await fetch(u.url, { method: 'GET', redirect: 'follow' });
      if (!resp.ok) {
        checks.push({ check: u.label, status: 'fail', message: u.label + ' returned HTTP ' + resp.status, fix: 'Verify the URL is publicly accessible: ' + u.url });
      } else {
        checks.push({ check: u.label, status: 'pass', message: u.label + ' accessible (HTTP ' + resp.status + ')' });
      }
    } catch (e) {
      checks.push({ check: u.label, status: 'fail', message: 'Could not reach ' + u.label + ': ' + e.message, fix: 'Verify the URL is correct and publicly accessible' });
    }
  }

  // AI content validation via Claude — TCR use case enum applies to all suppliers
  var sampleMessages = campaign.sample_messages || [];
  var declaredUseCase = (campaign.use_case || 'MIXED').toUpperCase();
  var prompt = 'You are a TCR (The Campaign Registry) compliance reviewer for A2P 10DLC SMS campaigns.\n\n' +
    'TCR USE CASE ENUM (standard across all suppliers): ' + USECASE_ENUM.join(', ') + '\n\n' +
    'DECLARED USE CASE: ' + declaredUseCase + '\n\n' +
    'BRAND:\n' + JSON.stringify(brand, null, 2) + '\n\n' +
    'CAMPAIGN:\n' + JSON.stringify(campaign, null, 2) + '\n\n' +
    'REFERENCE (known-good approved campaign):\n' + JSON.stringify(reference, null, 2) + '\n\n' +
    'Validate the following and return STRICT JSON array of checks:\n' +
    '[\n' +
    '  { "check": "use_case_valid", "status": "pass|fail", "message": "...", "fix": "..." },\n' +
    '  { "check": "samples_match_use_case", "status": "pass|warn|fail", "message": "...", "fix": "..." },\n' +
    '  { "check": "samples_reference_brand", "status": "pass|warn|fail", "message": "...", "fix": "..." },\n' +
    '  { "check": "samples_realistic_brand", "status": "pass|warn|fail", "message": "...", "fix": "..." },\n' +
    '  { "check": "opt_out_language", "status": "pass|fail", "message": "...", "fix": "..." },\n' +
    '  { "check": "help_stop_keywords", "status": "pass|warn|fail", "message": "...", "fix": "..." },\n' +
    '  { "check": "description_quality", "status": "pass|warn|fail", "message": "...", "fix": "..." },\n' +
    '  { "check": "opt_in_description_quality", "status": "pass|warn|fail", "message": "...", "fix": "..." },\n' +
    '  { "check": "sample_count", "status": "pass|warn|fail", "message": "...", "fix": "..." }\n' +
    ']\n\n' +
    'Rules:\n' +
    '- use_case MUST be one of the Telnyx enum values listed above\n' +
    '- Sample messages MUST specifically match the declared use_case (e.g. DELIVERY_NOTIFICATION samples about deliveries, not marketing)\n' +
    '- Sample messages MUST reference a realistic brand name (not "test", "example", "company")\n' +
    '- At least one sample must include opt-out language (STOP keyword)\n' +
    '- At least one sample must include HELP keyword\n' +
    '- Telnyx requires minimum 2 samples, recommends 3+, max 5\n' +
    '- Campaign description must clearly explain what messages will be sent\n' +
    '- Opt-in description must explain how users consent\n' +
    '- Compare against the reference campaign for quality benchmarks\n\n' +
    'Return ONLY the JSON array. No markdown fences.';

  try {
    var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
    });
    var aiData = await aiRes.json();
    var text = (aiData.content || []).find(function(b) { return b.type === 'text'; });
    var raw = text ? text.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim() : '[]';
    var aiChecks = JSON.parse(raw);
    checks = checks.concat(aiChecks);
  } catch (e) {
    checks.push({ check: 'ai_review', status: 'warn', message: 'AI review error: ' + e.message });
  }

  return checks;
}

// ── AI pre-fill ─────────────────────────────────────────────────────────────

async function runAiPreFill(session, field, reference, tenantInfo) {
  var apiKey = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
  if (!apiKey) return { suggestion: null, reasoning: 'ANTHROPIC_API_KEY not configured' };

  var brand = session.brand_data || {};
  var campaign = session.campaign_data || {};

  // Brand naming: use displayName for customer-facing, companyName for legal. Never tenants.name.
  var displayName = brand.displayName || '';
  var companyName = brand.companyName || displayName;
  if (!displayName && field === 'sample_messages') return { suggestion: null, reasoning: 'Please fill Display Name in Step 1 first.' };
  if (!campaign.use_case && field === 'sample_messages') return { suggestion: null, reasoning: 'Please select Use Case first.' };
  if (!campaign.description && field === 'use_case') return { suggestion: null, reasoning: 'Fill campaign description first to get a use case suggestion.' };

  var _UC = USECASE_ENUM;
  var useCase = (campaign.use_case || 'MIXED').toUpperCase();
  var promptMap = {
    display_name: 'Suggest a TCR-compliant Display Name for a business.\nIndustry: ' + (brand.vertical || 'technology') + '\nCompany name (if known): ' + (companyName || 'not provided') + '\n\nThe Display Name must be suitable for carrier registration and match what appears on the business website and opt-in page. Examples: "Acme Health Services", "Riverside Auto Parts", "Metro Dental Group".\n\nReturn ONLY the suggested display name as a plain string. No quotes, no explanation.',
    brand_description: 'Write a 1-2 sentence brand description for TCR registration.\nBrand name: ' + (displayName || companyName || 'Unknown') + '\nIndustry: ' + (brand.vertical || 'technology') + '\nKeep it factual, professional, under 100 words. Reference the brand name explicitly. Never use "EngageWorx" or generic placeholders.',
    use_case: 'Suggest a use_case category for this TCR campaign.\n\n' +
      'Brand: ' + (displayName || '') + '\n' +
      'Campaign description: ' + (campaign.description || '') + '\n' +
      'Industry: ' + (brand.vertical || '') + '\n\n' +
      'VALID VALUES: ' + _UC.join(', ') + '\n\n' +
      'Return STRICT JSON: {"suggestion":"ENUM_VALUE","confidence":0.0-1.0,"reasoning":"why this use case fits"}\nNo markdown fences.',
    sample_messages: 'Generate exactly 3 sample SMS messages for a TCR campaign registration.\n\n' +
      'Brand name (use this EXACT name in messages): ' + displayName + '\n' +
      'Use case: ' + useCase + '\n' +
      'Description: ' + (campaign.description || '') + '\n\n' +
      'Reference (approved messages from similar campaign):\n' + JSON.stringify(reference.sample_messages || [], null, 2) + '\n\n' +
      'CRITICAL RULES:\n' +
      '- Each message under 160 chars\n' +
      '- Messages MUST specifically match use_case "' + useCase + '":\n' +
      '  DELIVERY_NOTIFICATION = only delivery/shipping content\n' +
      '  ACCOUNT_NOTIFICATION = only billing/security/service alerts\n' +
      '  CUSTOMER_CARE = only support/ticket/service updates\n' +
      '  2FA = only verification codes\n' +
      '  MARKETING = only promotional content\n' +
      '  Mismatched samples cause carrier rejection.\n' +
      '- Use brand name "' + displayName + '" (NOT "test", "example", "EngageWorx", "Acme")\n' +
      '- At least one message must include "Reply HELP for help or STOP to opt out"\n' +
      (campaign.embeddedLink ? '- At least one sample must include a URL/link (embeddedLink is enabled)\n' : '') +
      (campaign.embeddedPhone ? '- At least one sample must include a phone number (embeddedPhone is enabled)\n' : '') +
      (campaign.ageGated ? '- Messages must reference age verification (age-gated content)\n' : '') +
      (campaign.directLending ? '- Messages must comply with direct lending disclosure requirements\n' : '') +
      '- Professional tone matching the reference\n\n' +
      'Return STRICT JSON array of 3 strings. No markdown fences.',
  };

  var prompt = promptMap[field];
  if (!prompt) return { suggestion: null, reasoning: 'Unknown field: ' + field };

  try {
    var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
    });
    var aiData = await aiRes.json();
    var text = (aiData.content || []).find(function(b) { return b.type === 'text'; });
    var raw = text ? text.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim() : '';

    if (field === 'sample_messages') {
      return { suggestion: JSON.parse(raw), reasoning: 'Generated messages matching ' + useCase + ' use case' };
    }
    if (field === 'use_case') {
      try {
        var parsed = JSON.parse(raw);
        if (parsed.confidence && parsed.confidence < 0.7) return { suggestion: null, reasoning: 'Could not determine use case with confidence — please select manually. AI reasoning: ' + (parsed.reasoning || '') };
        return { suggestion: parsed.suggestion || raw, reasoning: parsed.reasoning || 'AI-suggested' };
      } catch (e) { return { suggestion: raw.trim(), reasoning: 'AI-suggested' }; }
    }
    return { suggestion: raw, reasoning: 'AI-suggested based on brand profile' };
  } catch (e) {
    return { suggestion: null, reasoning: 'AI error: ' + e.message };
  }
}

// ── AI rejection interpreter ────────────────────────────────────────────────

async function interpretRejection(session, rejectionText) {
  var apiKey = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
  if (!apiKey) return { explanation: 'AI unavailable', fix: null, step: null };

  var prompt = 'You are a TCR compliance expert. A 10DLC campaign registration was rejected.\n\n' +
    'Rejection text from the carrier:\n"' + rejectionText + '"\n\n' +
    'Current brand data:\n' + JSON.stringify(session.brand_data || {}, null, 2) + '\n\n' +
    'Current campaign data:\n' + JSON.stringify(session.campaign_data || {}, null, 2) + '\n\n' +
    'Return STRICT JSON:\n' +
    '{\n' +
    '  "explanation": "Plain-English explanation of why it was rejected (2-3 sentences)",\n' +
    '  "fix": "Specific action to fix it (1-2 sentences)",\n' +
    '  "step": "brand|campaign|consent — which wizard step needs updating"\n' +
    '}\n\nReturn ONLY the JSON.';

  try {
    var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
    });
    var aiData = await aiRes.json();
    var text = (aiData.content || []).find(function(b) { return b.type === 'text'; });
    var raw = text ? text.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim() : '{}';
    return JSON.parse(raw);
  } catch (e) {
    return { explanation: 'Could not interpret: ' + e.message, fix: null, step: null };
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var supabase = getSupabase();
  var action = req.method === 'GET' ? req.query.action : (req.body && req.body.action) || req.query.action;
  var jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;

  try {
    // ── START ───────────────────────────────────────────────────────────────
    if (action === 'start') {
      var tenantId = req.body.tenant_id;
      if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
      var userId = await verifyTenantMember(supabase, jwt, tenantId);
      if (!userId) return res.status(403).json({ error: 'Not a member of this tenant' });

      // Check for existing in-progress session
      var { data: existing } = await supabase.from('tcr_wizard_sessions')
        .select('id, current_step, status')
        .eq('tenant_id', tenantId).eq('status', 'in_progress')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (existing) {
        return res.status(200).json({ session_id: existing.id, current_step: existing.current_step || 'brand', resumed: true });
      }

      var { data: session, error: insertErr } = await supabase.from('tcr_wizard_sessions')
        .insert({ tenant_id: tenantId, user_id: userId, status: 'in_progress', current_step: 'brand' })
        .select().single();
      if (insertErr) return res.status(500).json({ error: insertErr.message });

      console.log('[TCR Wizard] Started session', session.id, 'for tenant', tenantId);
      return res.status(200).json({ session_id: session.id, current_step: 'brand', resumed: false });
    }

    // ── SAVE_STEP ───────────────────────────────────────────────────────────
    if (action === 'save_step') {
      var sessionId = req.body.session_id;
      var step = req.body.step;
      var data = req.body.data || {};
      if (!sessionId || !step) return res.status(400).json({ error: 'session_id and step required' });

      var { data: session } = await supabase.from('tcr_wizard_sessions').select('*').eq('id', sessionId).maybeSingle();
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.status !== 'in_progress') return res.status(400).json({ error: 'Session is ' + session.status + ', not editable' });

      var userId = await verifyTenantMember(supabase, jwt, session.tenant_id);
      if (!userId) return res.status(403).json({ error: 'Not authorized' });

      var update = { current_step: step, updated_at: new Date().toISOString() };
      if (step === 'brand') {
        update.brand_data = Object.assign({}, session.brand_data || {}, data);
      } else if (step === 'campaign') {
        update.campaign_data = Object.assign({}, session.campaign_data || {}, data);
      } else if (step === 'consent') {
        update.campaign_data = Object.assign({}, session.campaign_data || {}, data);
      }

      var { data: updated, error: updateErr } = await supabase.from('tcr_wizard_sessions')
        .update(update).eq('id', sessionId).select().single();
      if (updateErr) return res.status(500).json({ error: updateErr.message });

      return res.status(200).json({ success: true, session: updated });
    }

    // ── AI_VALIDATE ─────────────────────────────────────────────────────────
    if (action === 'ai_validate') {
      var sessionId = req.body.session_id;
      if (!sessionId) return res.status(400).json({ error: 'session_id required' });

      var { data: session } = await supabase.from('tcr_wizard_sessions').select('*').eq('id', sessionId).maybeSingle();
      if (!session) return res.status(404).json({ error: 'Session not found' });

      var userId = await verifyTenantMember(supabase, jwt, session.tenant_id);
      if (!userId) return res.status(403).json({ error: 'Not authorized' });

      var reference = await loadReference(supabase);
      var checks = await runAiValidation(session, reference);

      await supabase.from('tcr_wizard_sessions').update({
        ai_validations: { checks: checks, validated_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      }).eq('id', sessionId);

      return res.status(200).json({ checks: checks });
    }

    // ── AI_PRE_FILL ─────────────────────────────────────────────────────────
    if (action === 'ai_pre_fill') {
      var sessionId = req.body.session_id;
      var field = req.body.field;
      if (!sessionId || !field) return res.status(400).json({ error: 'session_id and field required' });

      var { data: session } = await supabase.from('tcr_wizard_sessions').select('*').eq('id', sessionId).maybeSingle();
      if (!session) return res.status(404).json({ error: 'Session not found' });

      var userId = await verifyTenantMember(supabase, jwt, session.tenant_id);
      if (!userId) return res.status(403).json({ error: 'Not authorized' });

      var reference = await loadReference(supabase);
      var { data: tenantInfo } = await supabase.from('tenants').select('name, plan').eq('id', session.tenant_id).maybeSingle();

      var result = await runAiPreFill(session, field, reference, tenantInfo || {});
      return res.status(200).json(result);
    }

    // ── SUBMIT ──────────────────────────────────────────────────────────────
    if (action === 'submit') {
      var sessionId = req.body.session_id;
      if (!sessionId) return res.status(400).json({ error: 'session_id required' });

      var { data: session } = await supabase.from('tcr_wizard_sessions').select('*').eq('id', sessionId).maybeSingle();
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.status !== 'in_progress') return res.status(400).json({ error: 'Session is ' + session.status });

      var userId = await verifyTenantMember(supabase, jwt, session.tenant_id);
      if (!userId) return res.status(403).json({ error: 'Not authorized' });

      // Check AI validation — no FAIL items allowed
      var validations = session.ai_validations || {};
      var failChecks = (validations.checks || []).filter(function(c) { return c.status === 'fail'; });
      if (failChecks.length > 0) {
        return res.status(400).json({
          error: 'Validation has ' + failChecks.length + ' failing check(s). Fix before submitting.',
          failing_checks: failChecks,
        });
      }

      // Calculate fee
      var brandType = (session.brand_data.entity_type === 'sole_proprietor') ? 'sole_proprietor' : 'standard';
      var { data: brandFee } = await supabase.from('tcr_fee_schedule')
        .select('amount_cents').eq('fee_type', 'brand_registration').eq('use_case', brandType).maybeSingle();
      var { data: campaignFee } = await supabase.from('tcr_fee_schedule')
        .select('amount_cents').eq('fee_type', 'campaign_registration').eq('use_case', 'standard').maybeSingle();
      var totalCents = ((brandFee && brandFee.amount_cents) || 5000) + ((campaignFee && campaignFee.amount_cents) || 1500);

      // Submit to supplier (routed by tenant.phone_supplier)
      var supplier = await loadSupplier(supabase, session.tenant_id);
      var brandResult = await supplier.createBrand(session.brand_data);
      var campaignResult = await supplier.createCampaign(brandResult.supplier_brand_id, session);

      // Update session
      var { data: submitted, error: submitErr } = await supabase.from('tcr_wizard_sessions').update({
        status: 'submitted',
        supplier_brand_id: brandResult.supplier_brand_id,
        supplier_campaign_id: campaignResult.supplier_campaign_id,
        campaign_status: campaignResult.campaign_status || 'PENDING',
        mno_status: campaignResult.mno_status || {},
        fee_amount_cents: totalCents,
        stripe_charge_id: 'STUB_' + Date.now(),
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', sessionId).select().single();

      if (submitErr) return res.status(500).json({ error: submitErr.message });

      console.log('[TCR Wizard] Submitted session', sessionId, 'supplier:', supplier.supplierName, 'brand:', brandResult.supplier_brand_id, 'campaign:', campaignResult.supplier_campaign_id, 'mode:', supplier.getMode());
      return res.status(200).json({
        success: true,
        session: submitted,
        supplier_brand_id: brandResult.supplier_brand_id,
        supplier_campaign_id: campaignResult.supplier_campaign_id,
        fee_cents: totalCents,
        supplier_name: supplier.supplierName,
        supplier_mode: supplier.getMode(),
      });
    }

    // ── INTERPRET_REJECTION ─────────────────────────────────────────────────
    if (action === 'interpret_rejection') {
      var sessionId = req.body.session_id;
      var rejectionText = req.body.rejection_text;
      if (!sessionId || !rejectionText) return res.status(400).json({ error: 'session_id and rejection_text required' });

      var { data: session } = await supabase.from('tcr_wizard_sessions').select('*').eq('id', sessionId).maybeSingle();
      if (!session) return res.status(404).json({ error: 'Session not found' });

      var userId = await verifyTenantMember(supabase, jwt, session.tenant_id);
      if (!userId) return res.status(403).json({ error: 'Not authorized' });

      var interpretation = await interpretRejection(session, rejectionText);

      // Append to rejection_history
      var history = Array.isArray(session.rejection_history) ? session.rejection_history : [];
      history.push({
        rejection_text: rejectionText,
        interpretation: interpretation,
        created_at: new Date().toISOString(),
      });

      await supabase.from('tcr_wizard_sessions').update({
        rejection_history: history,
        status: 'in_progress',
        updated_at: new Date().toISOString(),
      }).eq('id', sessionId);

      return res.status(200).json(interpretation);
    }

    // ── STATUS ──────────────────────────────────────────────────────────────
    if (action === 'status') {
      var sessionId = req.query.session_id;
      if (!sessionId) return res.status(400).json({ error: 'session_id required' });

      var { data: session } = await supabase.from('tcr_wizard_sessions').select('*').eq('id', sessionId).maybeSingle();
      if (!session) return res.status(404).json({ error: 'Session not found' });

      // If submitted, poll supplier for latest status
      if (session.status === 'submitted' && session.supplier_brand_id) {
        try {
          var supplier = await loadSupplier(supabase, session.tenant_id);
          var brandStatus = await supplier.getBrandStatus(session.supplier_brand_id);
          var campaignStatus = session.supplier_campaign_id ? await supplier.getCampaignStatus(session.supplier_campaign_id) : { campaign_status: 'PENDING', mno_status: {} };

          // Persist latest MNO + campaign status
          var statusUpdate = {
            campaign_status: campaignStatus.campaign_status || session.campaign_status,
            mno_status: campaignStatus.mno_status || session.mno_status,
            updated_at: new Date().toISOString(),
          };

          if (brandStatus.status === 'APPROVED' && campaignStatus.campaign_status === 'ACTIVE') {
            statusUpdate.status = 'approved';
            statusUpdate.approved_at = new Date().toISOString();
            session.status = 'approved';
          } else if (brandStatus.status === 'REJECTED' || campaignStatus.campaign_status === 'REJECTED') {
            statusUpdate.status = 'rejected';
            statusUpdate.rejected_at = new Date().toISOString();
            session.status = 'rejected';
          }

          await supabase.from('tcr_wizard_sessions').update(statusUpdate).eq('id', sessionId);
          session.campaign_status = statusUpdate.campaign_status;
          session.mno_status = statusUpdate.mno_status;
          session._supplier_status = { brand: brandStatus, campaign: campaignStatus };
        } catch (e) {
          session._supplier_status = { error: e.message };
        }
      }

      return res.status(200).json({ session: session });
    }

    // ── GENERATE_BUNDLE ───────────────────────────────────────────────────
    if (action === 'generate_bundle') {
      var tenantId = req.body.tenant_id;
      if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
      var userId = await verifyTenantMember(supabase, jwt, tenantId);
      if (!userId) return res.status(403).json({ error: 'Not authorized' });

      // Load tenant context + session brand_data if available
      var { data: tenantInfo } = await supabase.from('tenants')
        .select('name, plan, industry, website_url').eq('id', tenantId).maybeSingle();
      var tn = tenantInfo || { name: 'Your Business', plan: 'starter' };
      // Prefer brand_data.displayName over tenants.name for customer-facing content
      var sessionBrand = {};
      if (req.body.session_id) {
        var { data: sess } = await supabase.from('tcr_wizard_sessions').select('brand_data').eq('id', req.body.session_id).maybeSingle();
        if (sess && sess.brand_data) sessionBrand = sess.brand_data;
      }
      var bundleBusinessName = sessionBrand.displayName || sessionBrand.companyName || tn.name || 'Your Business';

      // Load EngageWorx reference campaign (approved, most recent)
      var reference = {};
      try {
        var { data: refSession } = await supabase.from('tcr_wizard_sessions')
          .select('brand_data, campaign_data')
          .eq('tenant_id', SP_TENANT_ID).eq('status', 'approved')
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (refSession) reference = refSession;
      } catch (e) {}
      // Fallback if no approved reference exists
      if (!reference.brand_data) {
        var refFromSubmissions = await loadReference(supabase);
        reference = { brand_data: {}, campaign_data: refFromSubmissions };
      }

      var apiKey = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'AI service unavailable' });

      // AI generates COMPLIANCE CONTENT only — no factual data (EIN, address, phone).
      // Factual data must be entered by the tenant from their business records.
      var bundlePrompt = 'Generate TCR-compliant compliance content for business "' + bundleBusinessName + '" in the ' + (tn.industry || 'technology') + ' industry.\n\n' +
        'Generate ONLY compliance content templates. Do NOT generate factual data (EIN, address, phone, stock symbol).\n\n' +
        'Return STRICT JSON (no markdown fences):\n' +
        '{\n' +
        '  "brand_description": "1-2 sentence brand description for TCR registration referencing ' + bundleBusinessName + '",\n' +
        '  "campaign_description": "what messages ' + bundleBusinessName + ' will send to customers",\n' +
        '  "sample_messages": ["msg1","msg2","msg3","msg4","msg5"],\n' +
        '  "help_message": "HELP response message",\n' +
        '  "stop_message": "STOP response message",\n' +
        '  "opt_in_description": "how users opt in to receive messages",\n' +
        '  "confirmation_message": "opt-in confirmation under 160 chars",\n' +
        '  "privacy_policy_section": "paragraph(s) for privacy policy covering SMS data handling, STOP/HELP, frequency, data rates",\n' +
        '  "sms_terms_page_html": "clean HTML for /sms-terms page with HELP, STOP, frequency, fees, opt-out",\n' +
        '  "optin_form_html": "HTML consent form with unchecked checkbox, disclosure text, links to privacy and terms",\n' +
        '  "implementation_checklist": ["publish SMS terms page","add privacy policy SMS section","deploy opt-in form","verify all URLs return 200"]\n' +
        '}\n\n' +
        'RULES:\n' +
        '- Use "' + bundleBusinessName + '" as the brand name in ALL content. Never use "EngageWorx" or generic placeholders.\n' +
        '- Each sample message under 160 chars. At least one must include "Reply HELP for help or STOP to opt out".\n' +
        '- Privacy section must mention SMS specifically.\n' +
        '- All HTML clean, no scripts, no external resources.\n' +
        '- confirmation_message under 160 characters.';

      try {
        var controller = new AbortController();
        var timeout = setTimeout(function() { controller.abort(); }, 45000);
        var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 3000, messages: [{ role: 'user', content: bundlePrompt }] }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!aiRes.ok) {
          var errBody = await aiRes.text().catch(function() { return ''; });
          console.error('[TCR Wizard] generate_bundle API error:', aiRes.status, errBody.substring(0, 200));
          return res.status(500).json({ error: 'AI service returned error ' + aiRes.status + '. Please try again.' });
        }
        var aiData = await aiRes.json();
        var text = (aiData.content || []).find(function(b) { return b.type === 'text'; });
        var raw = text ? text.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim() : '{}';
        var bundle = JSON.parse(raw);
        console.log('[TCR Wizard] Generated compliance bundle for tenant', tenantId);
        return res.status(200).json(bundle);
      } catch (e) {
        var errMsg = e.name === 'AbortError' ? 'AI generation timed out (45s). Try again — the service may be busy.' : e.message;
        console.error('[TCR Wizard] generate_bundle error:', errMsg);
        return res.status(500).json({ error: errMsg });
      }
    }

    return res.status(400).json({ error: 'Unknown action: ' + action });
  } catch (err) {
    console.error('[TCR Wizard] Error:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
};
