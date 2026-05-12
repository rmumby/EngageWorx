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
  var url = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) console.error('[TCR Wizard] SUPABASE_SERVICE_ROLE_KEY is not set — writes will be blocked by RLS');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
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

// ── AI validation — 9 structured checks ────────────────────────────────────

async function fetchWithTimeout(url, timeoutMs) {
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, timeoutMs);
  try {
    var resp = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': 'EngageWorx-TCR-Validator/1.0' } });
    clearTimeout(timer);
    return resp;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function runAiValidation(session, reference) {
  var brand = session.brand_data || {};
  var campaign = session.campaign_data || {};
  var items = [];
  var pageTexts = {}; // cache fetched page content for reuse across checks

  // Helper: fetch page text with caching
  async function getPageText(url, label) {
    if (!url) return null;
    if (pageTexts[url] !== undefined) return pageTexts[url];
    try {
      var resp = await fetchWithTimeout(url, 10000);
      if (!resp.ok) { pageTexts[url] = null; return null; }
      var text = await resp.text();
      pageTexts[url] = text;
      return text;
    } catch (e) {
      pageTexts[url] = null;
      return null;
    }
  }

  // ── CHECK 1: URL_LIVE_CHECK (4 URLs) ──────────────────────────────────────
  var urlDefs = [
    { key: 'opt_in_url', id: 'URL_LIVE_CHECK_OPTIN', title: 'Opt-in URL is live', field: 'opt_in_url' },
    { key: 'privacy_url', id: 'URL_LIVE_CHECK_PRIVACY', title: 'Privacy Policy URL is live', field: 'privacy_url' },
    { key: 'sms_terms_url', id: 'URL_LIVE_CHECK_SMSTERMS', title: 'SMS Terms URL is live', field: 'sms_terms_url' },
    { key: 'terms_url', id: 'URL_LIVE_CHECK_TERMS', title: 'Terms & Conditions URL is live', field: 'terms_url' },
  ];
  for (var i = 0; i < urlDefs.length; i++) {
    var ud = urlDefs[i];
    var url = campaign[ud.key];
    if (!url) {
      items.push({ id: ud.id, check: 'URL_LIVE_CHECK', status: 'fail', title: ud.title, message: 'URL not provided.', fix: 'Add the URL in Step 4.', step: 3, field: ud.field });
      continue;
    }
    try {
      var resp = await fetchWithTimeout(url, 10000);
      if (resp.ok) {
        // Cache text for later checks
        try { pageTexts[url] = await resp.text(); } catch (_) { pageTexts[url] = ''; }
        items.push({ id: ud.id, check: 'URL_LIVE_CHECK', status: 'pass', title: ud.title, message: 'HTTP ' + resp.status + ' — ' + url, step: 3, field: ud.field });
      } else {
        items.push({ id: ud.id, check: 'URL_LIVE_CHECK', status: 'fail', title: ud.title, message: 'HTTP ' + resp.status + ' — ' + url, fix: 'Ensure the URL returns HTTP 200.', step: 3, field: ud.field });
      }
    } catch (e) {
      var errMsg = e.name === 'AbortError' ? 'URL did not respond within 10s' : e.message;
      items.push({ id: ud.id, check: 'URL_LIVE_CHECK', status: 'fail', title: ud.title, message: errMsg + ' — ' + url, fix: 'Ensure the URL is publicly accessible.', step: 3, field: ud.field });
    }
  }

  // ── CHECK 2: OPTIN_PAGE_LANGUAGE ──────────────────────────────────────────
  var optInText = await getPageText(campaign.opt_in_url, 'opt-in');
  if (optInText !== null) {
    var lower = optInText.toLowerCase();
    var required = [
      { label: 'STOP keyword', test: lower.indexOf('stop') !== -1 },
      { label: 'HELP keyword', test: lower.indexOf('help') !== -1 },
      { label: 'Msg & data rates', test: lower.indexOf('msg & data rates') !== -1 || lower.indexOf('message and data rates') !== -1 },
      { label: 'Brand name', test: brand.displayName ? lower.indexOf(brand.displayName.toLowerCase()) !== -1 : true },
      { label: 'Phone input or reference', test: lower.indexOf('phone') !== -1 || lower.indexOf('mobile') !== -1 || lower.indexOf('tel') !== -1 || optInText.indexOf('type="tel"') !== -1 },
      { label: 'Checkbox / consent language', test: lower.indexOf('checkbox') !== -1 || lower.indexOf('consent') !== -1 || lower.indexOf('agree') !== -1 || lower.indexOf('opt-in') !== -1 || lower.indexOf('opt in') !== -1 },
    ];
    var missing = required.filter(function(r) { return !r.test; });
    if (missing.length === 0) {
      items.push({ id: 'OPTIN_PAGE_LANGUAGE', check: 'OPTIN_PAGE_LANGUAGE', status: 'pass', title: 'Opt-in page has required language', message: 'All required compliance elements found.', step: 3, field: 'opt_in_url' });
    } else if (missing.length <= 3) {
      items.push({ id: 'OPTIN_PAGE_LANGUAGE', check: 'OPTIN_PAGE_LANGUAGE', status: 'warn', title: 'Opt-in page missing some language', message: 'Missing: ' + missing.map(function(m) { return m.label; }).join(', '), fix: 'Add the missing language to your opt-in page.', step: 3, field: 'opt_in_url' });
    } else {
      items.push({ id: 'OPTIN_PAGE_LANGUAGE', check: 'OPTIN_PAGE_LANGUAGE', status: 'fail', title: 'Opt-in page missing required language', message: 'Missing: ' + missing.map(function(m) { return m.label; }).join(', '), fix: 'Your opt-in page needs STOP, HELP, rate disclosure, brand name, and consent language.', step: 3, field: 'opt_in_url' });
    }
  } else if (campaign.opt_in_url) {
    items.push({ id: 'OPTIN_PAGE_LANGUAGE', check: 'OPTIN_PAGE_LANGUAGE', status: 'fail', title: 'Could not scan opt-in page', message: 'Page was not reachable for content scan.', fix: 'Ensure the opt-in URL is live.', step: 3, field: 'opt_in_url' });
  }

  // ── CHECK 3: PRIVACY_POLICY_SMS_SECTION ───────────────────────────────────
  var privacyText = await getPageText(campaign.privacy_url, 'privacy');
  if (privacyText !== null) {
    var pLower = privacyText.toLowerCase();
    var hasSmsRef = pLower.indexOf('sms') !== -1 || pLower.indexOf('text message') !== -1;
    var hasNoShare = pLower.indexOf('not share') !== -1 || pLower.indexOf('not sell') !== -1 || pLower.indexOf('will not') !== -1 || pLower.indexOf('do not share') !== -1 || pLower.indexOf('do not sell') !== -1;
    if (hasSmsRef && hasNoShare) {
      items.push({ id: 'PRIVACY_POLICY_SMS_SECTION', check: 'PRIVACY_POLICY_SMS_SECTION', status: 'pass', title: 'Privacy policy references SMS', message: 'SMS/text messaging section found with data sharing disclosure.', step: 3, field: 'privacy_url' });
    } else if (hasSmsRef || hasNoShare) {
      items.push({ id: 'PRIVACY_POLICY_SMS_SECTION', check: 'PRIVACY_POLICY_SMS_SECTION', status: 'warn', title: 'Privacy policy partially covers SMS', message: (hasSmsRef ? 'SMS referenced' : 'No SMS reference') + '; ' + (hasNoShare ? 'data sharing disclosed' : 'no data sharing statement'), fix: 'Add SMS-specific data handling and a statement that SMS data is not shared for marketing.', step: 3, field: 'privacy_url' });
    } else {
      items.push({ id: 'PRIVACY_POLICY_SMS_SECTION', check: 'PRIVACY_POLICY_SMS_SECTION', status: 'fail', title: 'Privacy policy missing SMS section', message: 'No SMS/text messaging reference or data sharing disclosure found.', fix: 'Add a section covering SMS data collection, usage, and a statement that data is not shared with third parties for marketing.', step: 3, field: 'privacy_url' });
    }
  } else if (campaign.privacy_url) {
    items.push({ id: 'PRIVACY_POLICY_SMS_SECTION', check: 'PRIVACY_POLICY_SMS_SECTION', status: 'fail', title: 'Could not scan privacy policy', message: 'Page was not reachable for content scan.', step: 3, field: 'privacy_url' });
  }

  // ── CHECK 4: SMS_TERMS_HELP_STOP ──────────────────────────────────────────
  var smsTermsText = await getPageText(campaign.sms_terms_url, 'sms-terms');
  if (smsTermsText !== null) {
    var stLower = smsTermsText.toLowerCase();
    var helpFound = stLower.indexOf('help') !== -1;
    var stopFound = stLower.indexOf('stop') !== -1;
    if (helpFound && stopFound) {
      items.push({ id: 'SMS_TERMS_HELP_STOP', check: 'SMS_TERMS_HELP_STOP', status: 'pass', title: 'SMS Terms include HELP & STOP', message: 'Both HELP and STOP keywords found in SMS terms page.', step: 3, field: 'sms_terms_url' });
    } else if (helpFound || stopFound) {
      var kMissing = !helpFound ? 'HELP' : 'STOP';
      items.push({ id: 'SMS_TERMS_HELP_STOP', check: 'SMS_TERMS_HELP_STOP', status: 'warn', title: 'SMS Terms missing ' + kMissing, message: (helpFound ? 'HELP found' : 'HELP not found') + ', ' + (stopFound ? 'STOP found' : 'STOP not found'), fix: 'Add ' + kMissing + ' keyword with explanation to your SMS terms page.', step: 3, field: 'sms_terms_url' });
    } else {
      items.push({ id: 'SMS_TERMS_HELP_STOP', check: 'SMS_TERMS_HELP_STOP', status: 'fail', title: 'SMS Terms missing HELP & STOP', message: 'Neither HELP nor STOP keyword found in SMS terms page.', fix: 'Add HELP and STOP keyword explanations to your SMS terms page.', step: 3, field: 'sms_terms_url' });
    }
  } else if (campaign.sms_terms_url) {
    items.push({ id: 'SMS_TERMS_HELP_STOP', check: 'SMS_TERMS_HELP_STOP', status: 'fail', title: 'Could not scan SMS terms', message: 'Page was not reachable for content scan.', step: 3, field: 'sms_terms_url' });
  }

  // ── CHECK 5: SAMPLE_USECASE_MATCH (AI semantic check) ─────────────────────
  var sampleMessages = (campaign.sample_messages || []).filter(function(m) { return m && m.trim(); });
  var declaredUseCase = (campaign.use_case || '').toUpperCase();
  if (declaredUseCase && sampleMessages.length > 0) {
    var apiKey = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        var aiPrompt = 'You are a TCR compliance reviewer. The declared use_case is "' + declaredUseCase + '".\n\n' +
          'Sample messages:\n' + sampleMessages.map(function(m, j) { return (j + 1) + '. ' + m; }).join('\n') + '\n\n' +
          'Do these sample messages match the declared use_case? Return ONLY this JSON (no markdown):\n' +
          '{ "match_confidence": <0.0 to 1.0>, "reasoning": "<one sentence>" }';
        var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 300, messages: [{ role: 'user', content: aiPrompt }] }),
        });
        var aiData = await aiRes.json();
        var aiText = (aiData.content || []).find(function(b) { return b.type === 'text'; });
        var raw = aiText ? aiText.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim() : '{}';
        var result = JSON.parse(raw);
        var conf = result.match_confidence || 0;
        if (conf > 0.8) {
          items.push({ id: 'SAMPLE_USECASE_MATCH', check: 'SAMPLE_USECASE_MATCH', status: 'pass', title: 'Samples match use case', message: 'Confidence: ' + Math.round(conf * 100) + '%. ' + (result.reasoning || ''), step: 2, field: 'sample_messages' });
        } else if (conf >= 0.5) {
          items.push({ id: 'SAMPLE_USECASE_MATCH', check: 'SAMPLE_USECASE_MATCH', status: 'warn', title: 'Samples partially match use case', message: 'Confidence: ' + Math.round(conf * 100) + '%. ' + (result.reasoning || ''), fix: 'Adjust sample messages to better reflect the ' + declaredUseCase + ' use case.', step: 2, field: 'sample_messages' });
        } else {
          items.push({ id: 'SAMPLE_USECASE_MATCH', check: 'SAMPLE_USECASE_MATCH', status: 'fail', title: 'Samples do not match use case', message: 'Confidence: ' + Math.round(conf * 100) + '%. ' + (result.reasoning || ''), fix: 'Rewrite sample messages to specifically match the ' + declaredUseCase + ' use case.', step: 2, field: 'sample_messages' });
        }
      } catch (e) {
        items.push({ id: 'SAMPLE_USECASE_MATCH', check: 'SAMPLE_USECASE_MATCH', status: 'warn', title: 'Could not run AI use case check', message: 'Manual review recommended. Error: ' + e.message, step: 2, field: 'sample_messages' });
      }
    } else {
      items.push({ id: 'SAMPLE_USECASE_MATCH', check: 'SAMPLE_USECASE_MATCH', status: 'warn', title: 'AI check unavailable', message: 'ANTHROPIC_API_KEY not configured. Manual review recommended.', step: 2, field: 'sample_messages' });
    }
  } else if (!declaredUseCase) {
    items.push({ id: 'SAMPLE_USECASE_MATCH', check: 'SAMPLE_USECASE_MATCH', status: 'fail', title: 'No use case selected', message: 'A use case is required for carrier review.', fix: 'Select a use case in Step 3.', step: 2, field: 'use_case' });
  }

  // ── CHECK 6: SAMPLE_STOP_PRESENT ──────────────────────────────────────────
  var hasStop = sampleMessages.some(function(m) { return /\bSTOP\b/i.test(m); });
  if (hasStop) {
    items.push({ id: 'SAMPLE_STOP_PRESENT', check: 'SAMPLE_STOP_PRESENT', status: 'pass', title: 'Sample includes STOP keyword', message: 'At least one sample message contains opt-out language.', step: 2, field: 'sample_messages' });
  } else {
    items.push({ id: 'SAMPLE_STOP_PRESENT', check: 'SAMPLE_STOP_PRESENT', status: 'fail', title: 'No STOP keyword in samples', message: 'At least one sample message must include "Reply STOP to opt out" or similar.', fix: 'Add STOP opt-out language to at least one sample message.', step: 2, field: 'sample_messages' });
  }

  // ── CHECK 7: CONFIRMATION_HELP_STOP ───────────────────────────────────────
  var confMsg = (campaign.confirmation_message || '').toLowerCase();
  var confHelp = confMsg.indexOf('help') !== -1;
  var confStop = confMsg.indexOf('stop') !== -1;
  if (confHelp && confStop) {
    items.push({ id: 'CONFIRMATION_HELP_STOP', check: 'CONFIRMATION_HELP_STOP', status: 'pass', title: 'Confirmation includes HELP & STOP', message: 'Confirmation message contains both required keywords.', step: 3, field: 'confirmation_message' });
  } else if (confHelp || confStop) {
    var cmMissing = !confHelp ? 'HELP' : 'STOP';
    items.push({ id: 'CONFIRMATION_HELP_STOP', check: 'CONFIRMATION_HELP_STOP', status: 'warn', title: 'Confirmation missing ' + cmMissing, message: 'Should include both HELP and STOP instructions.', fix: 'Add ' + cmMissing + ' keyword to the confirmation message.', step: 3, field: 'confirmation_message' });
  } else if (confMsg) {
    items.push({ id: 'CONFIRMATION_HELP_STOP', check: 'CONFIRMATION_HELP_STOP', status: 'fail', title: 'Confirmation missing HELP & STOP', message: 'Confirmation message must include both HELP and STOP instructions.', fix: 'Add "Reply HELP for help or STOP to opt out" to the confirmation message.', step: 3, field: 'confirmation_message' });
  } else {
    items.push({ id: 'CONFIRMATION_HELP_STOP', check: 'CONFIRMATION_HELP_STOP', status: 'fail', title: 'No confirmation message', message: 'A confirmation message is required.', fix: 'Add a confirmation message in Step 4.', step: 3, field: 'confirmation_message' });
  }

  // ── CHECK 8: BRAND_NAME_CONSISTENCY ───────────────────────────────────────
  if (brand.displayName && campaign.opt_in_url) {
    var optText = await getPageText(campaign.opt_in_url, 'opt-in');
    if (optText !== null) {
      var brandLower = brand.displayName.toLowerCase();
      var pageLower = optText.toLowerCase();
      if (pageLower.indexOf(brandLower) !== -1) {
        items.push({ id: 'BRAND_NAME_CONSISTENCY', check: 'BRAND_NAME_CONSISTENCY', status: 'pass', title: 'Brand name found on opt-in page', message: '"' + brand.displayName + '" appears on the page.', step: 0, field: 'displayName' });
      } else {
        // Check for partial match (first word of brand name)
        var firstWord = brandLower.split(/\s+/)[0];
        if (firstWord.length >= 3 && pageLower.indexOf(firstWord) !== -1) {
          items.push({ id: 'BRAND_NAME_CONSISTENCY', check: 'BRAND_NAME_CONSISTENCY', status: 'warn', title: 'Partial brand name match', message: '"' + firstWord + '" found but not the full brand name "' + brand.displayName + '".', fix: 'Ensure your exact brand name appears on the opt-in page.', step: 0, field: 'displayName' });
        } else {
          items.push({ id: 'BRAND_NAME_CONSISTENCY', check: 'BRAND_NAME_CONSISTENCY', status: 'fail', title: 'Brand name not found on opt-in page', message: '"' + brand.displayName + '" does not appear on the opt-in page.', fix: 'Add your brand name to the opt-in page so carriers can verify brand ownership.', step: 0, field: 'displayName' });
        }
      }
    }
  }

  // ── CHECK 9: EIN_FORMAT ───────────────────────────────────────────────────
  var ein = (brand.ein || '').trim();
  if (/^\d{2}-?\d{7}$/.test(ein)) {
    items.push({ id: 'EIN_FORMAT', check: 'EIN_FORMAT', status: 'pass', title: 'EIN format valid', message: ein.indexOf('-') !== -1 ? ein : ein.substring(0, 2) + '-' + ein.substring(2), step: 0, field: 'ein' });
  } else if (ein) {
    items.push({ id: 'EIN_FORMAT', check: 'EIN_FORMAT', status: 'fail', title: 'Invalid EIN format', message: '"' + ein + '" — expected format: XX-XXXXXXX (9 digits).', fix: 'Enter your EIN in the format 12-3456789.', step: 0, field: 'ein' });
  } else {
    items.push({ id: 'EIN_FORMAT', check: 'EIN_FORMAT', status: 'fail', title: 'EIN missing', message: 'Employer Identification Number is required for brand registration.', fix: 'Enter your EIN in Step 1.', step: 0, field: 'ein' });
  }

  return items;
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

      console.log('[save_step] session_id:', sessionId, 'step:', step, 'data_keys:', Object.keys(data), 'key_role:', supabase.supabaseKey === process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : 'anon/other');

      var { data: rows, error: updateErr } = await supabase.from('tcr_wizard_sessions')
        .update(update).eq('id', sessionId).select();
      if (updateErr) {
        console.error('[save_step] UPDATE ERROR:', updateErr.message);
        return res.status(500).json({ error: updateErr.message });
      }
      if (!rows || rows.length === 0) {
        console.error('[save_step] UPDATE returned 0 rows — likely RLS block. session_id:', sessionId);
        return res.status(500).json({ error: 'Save failed — update returned 0 rows. Session may be blocked by a database policy.' });
      }

      var updated = rows[0];
      console.log('[save_step] saved OK, brand_data keys:', Object.keys((updated.brand_data) || {}), 'campaign_data keys:', Object.keys((updated.campaign_data) || {}));
      return res.status(200).json({ success: true, session: updated });
    }

    // ── AI_VALIDATE ─────────────────────────────────────────────────────────
    if (action === 'ai_validate') {
      var sessionId = req.body.session_id;
      if (!sessionId) return res.status(400).json({ error: 'session_id required' });

      var { data: session } = await supabase.from('tcr_wizard_sessions').select('*').eq('id', sessionId).maybeSingle();
      if (!session) return res.status(404).json({ error: 'Session not found' });

      console.log('[ai_validate] session_id:', sessionId, 'brand_data keys:', Object.keys(session.brand_data || {}), 'campaign_data keys:', Object.keys(session.campaign_data || {}), 'ein:', (session.brand_data || {}).ein, 'use_case:', (session.campaign_data || {}).use_case, 'opt_in_url:', (session.campaign_data || {}).opt_in_url);

      var userId = await verifyTenantMember(supabase, jwt, session.tenant_id);
      if (!userId) return res.status(403).json({ error: 'Not authorized' });

      var reference = await loadReference(supabase);
      var validatedAt = new Date().toISOString();
      var validationItems = await runAiValidation(session, reference);

      var summary = { pass: 0, warn: 0, fail: 0 };
      validationItems.forEach(function(item) {
        if (item.status === 'pass') summary.pass++;
        else if (item.status === 'warn') summary.warn++;
        else summary.fail++;
      });

      var { error: valSaveErr } = await supabase.from('tcr_wizard_sessions').update({
        ai_validations: { items: validationItems, summary: summary, validated_at: validatedAt },
        updated_at: validatedAt,
      }).eq('id', sessionId);
      if (valSaveErr) console.warn('[ai_validate] Failed to persist validation results:', valSaveErr.message);

      return res.status(200).json({
        items: validationItems,
        summary: summary,
        canSubmit: summary.fail === 0,
        validated_at: validatedAt,
      });
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
      var valItems = validations.items || validations.checks || [];
      var failChecks = valItems.filter(function(c) { return c.status === 'fail'; });
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
      var { data: submitRows, error: submitErr } = await supabase.from('tcr_wizard_sessions').update({
        status: 'submitted',
        supplier_brand_id: brandResult.supplier_brand_id,
        supplier_campaign_id: campaignResult.supplier_campaign_id,
        campaign_status: campaignResult.campaign_status || 'PENDING',
        mno_status: campaignResult.mno_status || {},
        fee_amount_cents: totalCents,
        stripe_charge_id: 'STUB_' + Date.now(),
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', sessionId).select();
      var submitted = submitRows && submitRows[0];

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

          var { error: statusSaveErr } = await supabase.from('tcr_wizard_sessions').update(statusUpdate).eq('id', sessionId);
          if (statusSaveErr) console.warn('[status] Failed to persist status update:', statusSaveErr.message);
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

    // ── DELETE ────────────────────────────────────────────────────────────
    if (action === 'delete') {
      var sessionId = req.body.session_id;
      if (!sessionId) return res.status(400).json({ error: 'session_id required' });

      var { data: session } = await supabase.from('tcr_wizard_sessions').select('id, tenant_id, status').eq('id', sessionId).maybeSingle();
      if (!session) return res.status(404).json({ error: 'Session not found' });

      var userId = await verifyTenantMember(supabase, jwt, session.tenant_id);
      if (!userId) return res.status(403).json({ error: 'Not authorized' });

      if (['in_progress', 'draft'].indexOf(session.status) === -1) {
        return res.status(400).json({ error: 'Cannot delete a ' + session.status + ' registration. Contact support to archive.' });
      }

      var { error: delErr } = await supabase.from('tcr_wizard_sessions').delete().eq('id', sessionId);
      if (delErr) return res.status(500).json({ error: delErr.message });

      console.log('[TCR Wizard] Deleted session', sessionId, 'status:', session.status);
      return res.status(200).json({ success: true, deleted_id: sessionId });
    }

    return res.status(400).json({ error: 'Unknown action: ' + action });
  } catch (err) {
    console.error('[TCR Wizard] Error:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
};
