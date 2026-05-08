// api/_lib/tcr-supplier.js — Tenant-aware TCR supplier dispatcher
// Routes to telnyx or twilio adapter based on tenants.phone_supplier column.
//
// Usage:
//   var supplier = await loadSupplier(supabase, tenantId);
//   var result = await supplier.createBrand(brandData);
//
// The TCR use case enum is industry-standard and shared across all suppliers.

var telnyxAdapter = require('./tcr-supplier-telnyx');
var twilioAdapter = require('./tcr-supplier-twilio');

var ADAPTERS = {
  telnyx: telnyxAdapter,
  twilio: twilioAdapter,
};

// Per-request cache to avoid repeated DB lookups within a single handler call
var _cache = {};

async function loadSupplier(supabase, tenantId) {
  if (!tenantId) throw new Error('[tcr-supplier] tenantId required for supplier routing');

  // Check cache (keyed by tenantId, cleared per cold start)
  if (_cache[tenantId]) return _cache[tenantId];

  var { data: tenant, error } = await supabase
    .from('tenants')
    .select('phone_supplier')
    .eq('id', tenantId)
    .maybeSingle();

  if (error) throw new Error('[tcr-supplier] Tenant lookup failed: ' + error.message);
  if (!tenant) throw new Error('[tcr-supplier] Tenant not found: ' + tenantId);

  var supplierKey = tenant.phone_supplier || 'twilio';
  var adapter = ADAPTERS[supplierKey];
  if (!adapter) throw new Error('[tcr-supplier] Unrecognized supplier: ' + supplierKey + ' for tenant ' + tenantId);

  console.log('[tcr-supplier] Loaded adapter:', supplierKey, 'for tenant:', tenantId);
  _cache[tenantId] = adapter;
  return adapter;
}

// Re-export the standard enum (same for all suppliers)
var USECASE_ENUM = telnyxAdapter.USECASE_ENUM;
var MNO_CARRIERS = telnyxAdapter.MNO_CARRIERS;

module.exports = {
  loadSupplier: loadSupplier,
  USECASE_ENUM: USECASE_ENUM,
  MNO_CARRIERS: MNO_CARRIERS,
};
