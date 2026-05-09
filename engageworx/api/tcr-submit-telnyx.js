// TODO: Wire real Telnyx TCR API call here. See May 2026 supplier strategy update.
// api/tcr-submit-telnyx.js — Stubbed TCR submission endpoint
// Validates payload server-side, returns mocked brand_id and campaign_id.
// Real supplier API wiring is a follow-up session.

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function randomId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var supabase = getSupabase();
  var body = req.body || {};

  // Auth: verify JWT
  var jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return res.status(401).json({ error: 'Authorization required' });
  var { data: userData, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !userData || !userData.user) return res.status(401).json({ error: 'Invalid token' });

  var tenantId = body.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });

  // Verify tenant membership
  var { data: member } = await supabase.from('tenant_members')
    .select('id').eq('user_id', userData.user.id).eq('tenant_id', tenantId).eq('status', 'active').maybeSingle();
  if (!member) return res.status(403).json({ error: 'Not a member of this tenant' });

  // Verify tenant is on platform connectivity
  var { data: tenant } = await supabase.from('tenants')
    .select('phone_supplier, plan, name').eq('id', tenantId).maybeSingle();
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  if (tenant.phone_supplier !== 'telnyx') {
    return res.status(400).json({ error: 'TCR wizard submission requires platform connectivity. Contact support for assistance.' });
  }

  // Validate brand data
  var brand = body.brand || {};
  var errors = [];
  if (!brand.legal_name || brand.legal_name.trim().length < 2) errors.push('legal_name required');
  if (!brand.ein) errors.push('EIN required');
  if (!brand.vertical) errors.push('vertical required');
  if (!brand.entity_type) errors.push('entity_type required');
  if (!brand.email) errors.push('email required');

  // Validate campaign data
  var campaign = body.campaign || {};
  if (!campaign.use_case) errors.push('use_case required');
  var msgs = campaign.sample_messages || [];
  if (msgs.filter(function(m) { return m && m.trim(); }).length < 2) errors.push('At least 2 sample messages required');
  if (!campaign.optin_confirmation) errors.push('optin_confirmation required');
  if (!campaign.help_message) errors.push('help_message required');
  if (!campaign.stop_message) errors.push('stop_message required');

  // Validate URLs
  var urls = body.urls || {};
  if (!urls.consent) errors.push('consent URL required');
  if (!urls.privacy) errors.push('privacy URL required');
  if (!urls.smsTerms) errors.push('SMS terms URL required');
  if (!urls.terms) errors.push('terms URL required');

  if (errors.length > 0) return res.status(400).json({ error: 'Validation failed', errors: errors });

  // TODO: Wire real Telnyx API call here. For now, return mocked IDs.
  var brandId = 'mock-brand-' + randomId();
  var campaignId = 'mock-campaign-' + randomId();

  // Save to tcr_wizard_sessions
  try {
    await supabase.from('tcr_wizard_sessions').insert({
      tenant_id: tenantId,
      user_id: userData.user.id,
      status: 'submitted',
      current_step: 'submitted',
      brand_data: brand,
      campaign_data: Object.assign({}, campaign, { urls: urls }),
      supplier_brand_id: brandId,
      supplier_campaign_id: campaignId,
      campaign_status: 'PENDING',
      mno_status: { tmobile: 'PENDING', att: 'PENDING', verizon: 'PENDING', uscc: 'PENDING' },
      submitted_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[tcr-submit] Session insert error:', e.message);
  }

  console.log('[tcr-submit] Stubbed submission for tenant', tenantId, 'brand:', brandId, 'campaign:', campaignId);
  return res.status(200).json({
    ok: true,
    brand_id: brandId,
    campaign_id: campaignId,
    status: 'PENDING',
    message: 'Registration submitted. Carrier approval typically takes 1-5 business days.',
  });
};
