// api/_lib/tcr-supplier-telnyx.js — Telnyx TCR supplier adapter
// Aligned to Telnyx /v2/10dlc/campaignBuilder contract.
//
// Env: TCR_SUPPLIER_MODE = 'live' | 'mock' (default 'mock')
//      TELNYX_API_KEY — required in live mode
//      TELNYX_API_BASE — override for testing (default https://api.telnyx.com)

var MODE = process.env.TCR_SUPPLIER_MODE || 'mock';
var TELNYX_BASE = process.env.TELNYX_API_BASE || 'https://api.telnyx.com';

// ── Telnyx use case enum (all 15 values) ────────────────────────────────────

var USECASE_ENUM = [
  'ACCOUNT_NOTIFICATION', 'CHARITY', 'CUSTOMER_CARE', 'DELIVERY_NOTIFICATION',
  'EMERGENCY', 'HIGHER_EDUCATION', 'LOW_VOLUME', 'MARKETING', 'MIXED',
  'POLITICAL', 'POLLING_VOTING', 'PUBLIC_SERVICE_ANNOUNCEMENT',
  'SECURITY_ALERT', 'SOCIAL', 'TWO_FACTOR_AUTHENTICATION',
];

var MNO_CARRIERS = ['tmobile', 'att', 'verizon', 'uscc'];

// ── Error code mapping ──────────────────────────────────────────────────────

var TELNYX_ERROR_MAP = {
  '40001': 'Invalid brand data — check business name, EIN, and address fields.',
  '40002': 'A brand registration for this EIN already exists in TCR.',
  '40003': 'Brand not found — it may have been deleted or the ID is incorrect.',
  '40004': 'Invalid use case — the selected use case is not supported.',
  '40005': 'Sample messages do not match the declared use case.',
  '40300': 'Rate limit exceeded — please try again in a few minutes.',
  '40100': 'Authentication failed — carrier API key may be invalid.',
  '40400': 'Resource not found.',
  '42200': 'Invalid request parameters.',
};

function mapTelnyxError(response) {
  var code = '';
  var message = '';
  if (response.errors && response.errors.length > 0) {
    code = String(response.errors[0].code || '');
    message = response.errors[0].detail || response.errors[0].title || '';
  } else if (response.error) {
    code = String(response.error.code || '');
    message = response.error.message || response.error.detail || '';
  }
  var mapped = TELNYX_ERROR_MAP[code];
  if (mapped) return mapped;
  return message || 'Telnyx error ' + (code || 'unknown');
}

// ── Field mapper: wizard schema → Telnyx brand payload ─────────────────────

function mapToTelnyxBrand(brandData) {
  var mapped = {};
  // Only include fields Telnyx expects — drop extras like phoneCountry
  if (brandData.entityType) mapped.entityType = brandData.entityType;
  if (brandData.displayName) mapped.displayName = brandData.displayName;
  if (brandData.companyName) mapped.companyName = brandData.companyName;
  if (brandData.ein) mapped.ein = brandData.ein;
  if (brandData.street) mapped.street = brandData.street;
  if (brandData.city) mapped.city = brandData.city;
  if (brandData.state) mapped.state = brandData.state;
  if (brandData.postalCode) mapped.postalCode = brandData.postalCode;
  if (brandData.country) mapped.country = brandData.country;
  if (brandData.phone) mapped.phone = brandData.phone;
  if (brandData.email) mapped.email = brandData.email;
  if (brandData.website) mapped.website = brandData.website;
  if (brandData.vertical) mapped.vertical = brandData.vertical;
  if (brandData.stockSymbol) mapped.stockSymbol = brandData.stockSymbol;
  if (brandData.stockExchange) mapped.stockExchange = brandData.stockExchange;
  return mapped;
}

// ── Field mapper: wizard schema → Telnyx campaignBuilder payload ────────────

function mapToTelnyxCampaign(wizardData, supplierBrandId) {
  var brand = wizardData.brand_data || {};
  var campaign = wizardData.campaign_data || {};
  var useCase = (campaign.use_case || 'MIXED').toUpperCase();
  if (USECASE_ENUM.indexOf(useCase) === -1) useCase = 'MIXED';

  return {
    brandId: supplierBrandId,
    usecase: useCase,
    description: campaign.description || '',
    sample1: (campaign.sample_messages && campaign.sample_messages[0]) || '',
    sample2: (campaign.sample_messages && campaign.sample_messages[1]) || '',
    sample3: (campaign.sample_messages && campaign.sample_messages[2]) || undefined,
    sample4: (campaign.sample_messages && campaign.sample_messages[3]) || undefined,
    sample5: (campaign.sample_messages && campaign.sample_messages[4]) || undefined,
    messageFlow: campaign.opt_in_description || '',
    helpMessage: campaign.help_message || 'Reply HELP for help. Contact support at ' + (brand.website || 'our website') + '.',
    optinMessage: campaign.optin_confirmation || '',
    optoutMessage: campaign.optout_message || 'You have been unsubscribed. Reply START to resubscribe.',
    embeddedLink: campaign.has_embedded_links !== false,
    embeddedPhone: campaign.has_embedded_phone || false,
    numberPool: false,
    ageGated: campaign.has_age_gated || false,
    directLending: false,
    subscriberOptin: true,
    subscriberOptout: true,
    subscriberHelp: true,
    termsAndConditions: true,
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

// ── Exponential backoff for Telnyx 429 rate limits ──────────────────────────

async function fetchWithRetry(url, options, maxRetries) {
  maxRetries = maxRetries || 3;
  var baseDelay = 1000;
  var TIMEOUT_MS = 15000;
  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    var controller = new AbortController();
    var timer = setTimeout(function() { controller.abort(); }, TIMEOUT_MS);
    try {
      var res = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
      clearTimeout(timer);
      if (res.status !== 429 || attempt === maxRetries) return res;
      var waitMs = baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
      console.warn('[tcr-supplier] 429 rate limited, retry', attempt + 1, 'in', waitMs + 'ms');
      await delay(waitMs);
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error('Telnyx API request timed out after ' + (TIMEOUT_MS / 1000) + 's');
      throw e;
    }
  }
}

function telnyxHeaders() {
  var key = process.env.TELNYX_API_KEY;
  if (!key) throw new Error('Live Telnyx not yet configured — set TELNYX_API_KEY');
  return {
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json',
  };
}

// ── Mock implementations ────────────────────────────────────────────────────

async function mockCreateBrand(brandData, ctx) {
  await delay(200);
  var id = mockId('MOCK_BRAND');
  mockRegistry[id] = { created: Date.now(), status: 'PENDING', type: 'brand' };
  console.log('[tcr-supplier] MOCK createBrand:', id);
  return { supplier_brand_id: id, status: 'PENDING' };
}

async function mockCreateCampaign(supplierBrandId, wizardData, ctx) {
  await delay(200);
  var mapped = mapToTelnyxCampaign(wizardData, supplierBrandId);
  var id = mockId('MOCK_CAMPAIGN');
  mockRegistry[id] = {
    created: Date.now(),
    type: 'campaign',
    brand_id: supplierBrandId,
    campaign_status: 'PENDING',
    mno_status: initialMnoStatus(),
    mapped: mapped,
  };
  console.log('[tcr-supplier] MOCK createCampaign:', id, 'usecase:', mapped.usecase);
  return {
    supplier_campaign_id: id,
    campaign_status: 'PENDING',
    mno_status: initialMnoStatus(),
  };
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

  // Simulate per-carrier progression
  var mno = Object.assign({}, entry.mno_status);
  if (elapsed > 5000) mno.tmobile = 'ACTIVE';
  if (elapsed > 15000) {
    MNO_CARRIERS.forEach(function(c) { mno[c] = 'ACTIVE'; });
  }
  entry.mno_status = mno;

  // Campaign status transitions when all MNOs active
  var allActive = MNO_CARRIERS.every(function(c) { return mno[c] === 'ACTIVE'; });
  var campaignStatus = allActive ? 'ACTIVE' : 'PENDING';
  entry.campaign_status = campaignStatus;

  return { campaign_status: campaignStatus, mno_status: mno };
}

// ── Live implementations (Telnyx /v2/10dlc/campaignBuilder) ─────────────────

async function liveCreateBrand(brandData, ctx) {
  var headers = telnyxHeaders();
  var payload = mapToTelnyxBrand(brandData);
  console.log('[tcr-supplier-telnyx] liveCreateBrand payload keys:', Object.keys(payload));
  var res = await fetchWithRetry(TELNYX_BASE + '/v2/10dlc/brand', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    var err = await res.json().catch(function() { return {}; });
    throw new Error(mapTelnyxError(err));
  }
  var data = await res.json();
  var brand = data.data || data;
  return { supplier_brand_id: brand.brandId || brand.id, status: brand.identityStatus || 'PENDING' };
}

async function liveCreateCampaign(supplierBrandId, wizardData, ctx) {
  var headers = telnyxHeaders();
  var payload = mapToTelnyxCampaign(wizardData, supplierBrandId);
  var res = await fetchWithRetry(TELNYX_BASE + '/v2/10dlc/campaignBuilder', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    var err = await res.json().catch(function() { return {}; });
    throw new Error(mapTelnyxError(err));
  }
  var data = await res.json();
  var campaign = data.data || data;
  var mno = {};
  if (campaign.mnoMetadata) {
    Object.keys(campaign.mnoMetadata).forEach(function(k) {
      mno[k.toLowerCase()] = campaign.mnoMetadata[k].qualify ? 'ACTIVE' : 'PENDING';
    });
  }
  return {
    supplier_campaign_id: campaign.campaignId || campaign.id,
    campaign_status: campaign.status || 'PENDING',
    mno_status: mno,
  };
}

async function liveGetBrandStatus(supplierBrandId, ctx) {
  var headers = telnyxHeaders();
  var res = await fetchWithRetry(TELNYX_BASE + '/v2/10dlc/brand/' + supplierBrandId, {
    method: 'GET',
    headers: headers,
  });
  if (!res.ok) {
    var err = await res.json().catch(function() { return {}; });
    throw new Error('Telnyx getBrandStatus failed: HTTP ' + res.status);
  }
  var data = await res.json();
  var brand = data.data || data;
  return {
    status: brand.identityStatus || brand.status || 'unknown',
    rejection_reason: brand.failureReason || null,
  };
}

async function liveGetCampaignStatus(supplierCampaignId, ctx) {
  var headers = telnyxHeaders();
  var res = await fetchWithRetry(TELNYX_BASE + '/v2/10dlc/campaignBuilder/' + supplierCampaignId, {
    method: 'GET',
    headers: headers,
  });
  if (!res.ok) {
    var err = await res.json().catch(function() { return {}; });
    throw new Error('Telnyx getCampaignStatus failed: HTTP ' + res.status);
  }
  var data = await res.json();
  var campaign = data.data || data;
  var mno = {};
  if (campaign.mnoMetadata) {
    Object.keys(campaign.mnoMetadata).forEach(function(k) {
      mno[k.toLowerCase()] = campaign.mnoMetadata[k].qualify ? 'ACTIVE' : 'PENDING';
    });
  }
  return {
    campaign_status: campaign.status || 'unknown',
    mno_status: mno,
    rejection_reason: campaign.failureReason || null,
  };
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
  mapToTelnyxCampaign: mapToTelnyxCampaign,
  USECASE_ENUM: USECASE_ENUM,
  MNO_CARRIERS: MNO_CARRIERS,
  supplierName: 'telnyx',
};
