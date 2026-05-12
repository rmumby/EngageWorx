// api/_lib/tcr-supplier-twilio.js — Twilio TCR supplier adapter (stub)
// Same interface as tcr-supplier-telnyx.js. Used for existing Twilio-based tenants.
//
// Env: TCR_SUPPLIER_MODE = 'live' | 'mock' (default 'mock')
//      TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN — required in live mode

var MODE = process.env.TCR_SUPPLIER_MODE || 'mock';

// TCR use case enum is industry-standard (same for all suppliers)
var USECASE_ENUM = [
  'CUSTOMER_CARE', 'DELIVERY_NOTIFICATION', 'ACCOUNT_NOTIFICATION',
  'MARKETING', '2FA', 'SECURITY_ALERT', 'POLLING_VOTING',
  'CHARITY', 'POLITICAL', 'MIXED', 'LOW_VOLUME', 'SOLE_PROPRIETOR',
  'EMERGENCY', 'AGENTS_FRANCHISES', 'SWEEPSTAKES',
];

var MNO_CARRIERS = ['tmobile', 'att', 'verizon', 'uscc'];

// ── Field mapper: wizard schema → Twilio campaign payload ───────────────────

function mapToProviderCampaign(wizardData, supplierBrandId) {
  var brand = wizardData.brand_data || {};
  var campaign = wizardData.campaign_data || {};
  var useCase = (campaign.use_case || 'MIXED').toUpperCase();
  if (USECASE_ENUM.indexOf(useCase) === -1) useCase = 'MIXED';

  return {
    brandRegistrationSid: supplierBrandId,
    usecase: useCase,
    description: campaign.description || '',
    messageSamples: campaign.sample_messages || [],
    messageFlow: campaign.opt_in_description || '',
    helpMessage: campaign.help_message || 'Reply HELP for help.',
    optInMessage: campaign.optin_confirmation || '',
    optOutMessage: campaign.optout_message || 'You have been unsubscribed. Reply START to resubscribe.',
    hasEmbeddedLinks: campaign.has_embedded_links !== false,
    hasEmbeddedPhone: campaign.has_embedded_phone || false,
    subscriberOptin: true,
    subscriberOptout: true,
    subscriberHelp: true,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

var mockRegistry = {};

function mockId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

function delay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function initialMnoStatus() {
  var s = {};
  MNO_CARRIERS.forEach(function(c) { s[c] = 'PENDING'; });
  return s;
}

// ── Mock implementations ────────────────────────────────────────────────────

async function mockCreateBrand(brandData, ctx) {
  await delay(200);
  var id = mockId('MOCK_TWILIO_BRAND');
  mockRegistry[id] = { created: Date.now(), status: 'PENDING', type: 'brand' };
  console.log('[tcr-supplier-twilio] MOCK createBrand:', id);
  return { supplier_brand_id: id, status: 'PENDING' };
}

async function mockCreateCampaign(supplierBrandId, wizardData, ctx) {
  await delay(200);
  var mapped = mapToProviderCampaign(wizardData, supplierBrandId);
  var id = mockId('MOCK_TWILIO_CAMPAIGN');
  mockRegistry[id] = {
    created: Date.now(), type: 'campaign', brand_id: supplierBrandId,
    campaign_status: 'PENDING', mno_status: initialMnoStatus(), mapped: mapped,
  };
  console.log('[tcr-supplier-twilio] MOCK createCampaign:', id, 'usecase:', mapped.usecase);
  return { supplier_campaign_id: id, campaign_status: 'PENDING', mno_status: initialMnoStatus() };
}

async function mockGetBrandStatus(supplierBrandId, ctx) {
  await delay(100);
  var entry = mockRegistry[supplierBrandId];
  if (!entry) return { status: 'unknown' };
  var elapsed = Date.now() - entry.created;
  if (elapsed > 15000) return { status: 'APPROVED' };
  return { status: 'PENDING' };
}

async function mockGetCampaignStatus(supplierCampaignId, ctx) {
  await delay(100);
  var entry = mockRegistry[supplierCampaignId];
  if (!entry) return { campaign_status: 'unknown', mno_status: {} };
  var elapsed = Date.now() - entry.created;
  var mno = Object.assign({}, entry.mno_status);
  if (elapsed > 5000) mno.tmobile = 'ACTIVE';
  if (elapsed > 15000) MNO_CARRIERS.forEach(function(c) { mno[c] = 'ACTIVE'; });
  entry.mno_status = mno;
  var allActive = MNO_CARRIERS.every(function(c) { return mno[c] === 'ACTIVE'; });
  return { campaign_status: allActive ? 'ACTIVE' : 'PENDING', mno_status: mno };
}

// ── Live stubs (Twilio A2P API — not yet implemented) ───────────────────────

async function liveCreateBrand(brandData, ctx) {
  throw new Error('Twilio TCR adapter not yet implemented — contact platform team if existing-tenant TCR is needed');
}
async function liveCreateCampaign(supplierBrandId, wizardData, ctx) {
  throw new Error('Twilio TCR adapter not yet implemented — contact platform team if existing-tenant TCR is needed');
}
async function liveGetBrandStatus(supplierBrandId, ctx) {
  throw new Error('Twilio TCR adapter not yet implemented — contact platform team if existing-tenant TCR is needed');
}
async function liveGetCampaignStatus(supplierCampaignId, ctx) {
  throw new Error('Twilio TCR adapter not yet implemented — contact platform team if existing-tenant TCR is needed');
}

// ── Exports ─────────────────────────────────────────────────────────────────
// Dispatcher selects mock vs live per-tenant at call time.

module.exports = {
  mockCreateBrand: mockCreateBrand,
  liveCreateBrand: liveCreateBrand,
  mockCreateCampaign: mockCreateCampaign,
  liveCreateCampaign: liveCreateCampaign,
  mockGetBrandStatus: mockGetBrandStatus,
  liveGetBrandStatus: liveGetBrandStatus,
  mockGetCampaignStatus: mockGetCampaignStatus,
  liveGetCampaignStatus: liveGetCampaignStatus,
  mapToProviderCampaign: mapToProviderCampaign,
  USECASE_ENUM: USECASE_ENUM,
  MNO_CARRIERS: MNO_CARRIERS,
  supplierName: 'twilio',
};
