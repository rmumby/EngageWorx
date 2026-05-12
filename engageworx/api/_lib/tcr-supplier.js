// api/_lib/tcr-supplier.js — Tenant-aware TCR supplier dispatcher
// Routes to telnyx or twilio adapter based on tenants.phone_supplier column.
// Resolves mock vs live mode per-tenant via tenants.tcr_mode_override.
//
// Usage:
//   var supplier = await loadSupplier(supabase, tenantId);
//   var result = await supplier.createBrand(brandData, ctx);
//
// The TCR use case enum is industry-standard and shared across all suppliers.

var telnyxAdapter = require('./tcr-supplier-telnyx');
var twilioAdapter = require('./tcr-supplier-twilio');

var ADAPTERS = {
  telnyx: telnyxAdapter,
  twilio: twilioAdapter,
};

async function loadSupplier(supabase, tenantId) {
  if (!tenantId) throw new Error('[tcr-supplier] tenantId required for supplier routing');

  var { data: tenant, error } = await supabase
    .from('tenants')
    .select('phone_supplier, tcr_mode_override')
    .eq('id', tenantId)
    .maybeSingle();

  if (error) throw new Error('[tcr-supplier] Tenant lookup failed: ' + error.message);
  if (!tenant) throw new Error('[tcr-supplier] Tenant not found: ' + tenantId);

  var supplierKey = tenant.phone_supplier || 'twilio';
  var adapter = ADAPTERS[supplierKey];
  if (!adapter) throw new Error('[tcr-supplier] Unrecognized supplier: ' + supplierKey + ' for tenant ' + tenantId);

  // Resolve mode: tenant override → env var → 'mock'
  var mode = tenant.tcr_mode_override || process.env.TCR_SUPPLIER_MODE || 'mock';

  console.log('[tcr-supplier] Loaded adapter:', supplierKey, 'mode:', mode, 'for tenant:', tenantId);

  return {
    createBrand: mode === 'live' ? adapter.liveCreateBrand : adapter.mockCreateBrand,
    createCampaign: mode === 'live' ? adapter.liveCreateCampaign : adapter.mockCreateCampaign,
    getBrandStatus: mode === 'live' ? adapter.liveGetBrandStatus : adapter.mockGetBrandStatus,
    getCampaignStatus: mode === 'live' ? adapter.liveGetCampaignStatus : adapter.mockGetCampaignStatus,
    getMode: function() { return mode; },
    supplierName: adapter.supplierName,
  };
}

// Re-export the standard enum (same for all suppliers)
var USECASE_ENUM = telnyxAdapter.USECASE_ENUM;
var MNO_CARRIERS = telnyxAdapter.MNO_CARRIERS;

module.exports = {
  loadSupplier: loadSupplier,
  USECASE_ENUM: USECASE_ENUM,
  MNO_CARRIERS: MNO_CARRIERS,
};
