// api/_lib/platform-config.js — Load platform_config with CSP-scoped override support
// getPlatformConfig(tenantId) merges SP defaults with tenant-level overrides

var { createClient } = require('@supabase/supabase-js');

var _platformCache = null;
var _platformCacheTime = 0;
var _tenantCache = {};
var _tenantCacheTime = {};
var CACHE_TTL = 60000;

function getSupabase(sb) {
  return sb || createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

var FALLBACK = {
  platform_name: process.env.PLATFORM_NAME || 'Platform',
  support_email: process.env.PLATFORM_FROM_EMAIL || 'support@example.com',
  portal_url: process.env.PORTAL_URL || 'https://portal.example.com',
  plans: [], industries: [], default_escalation_rules: [],
};

async function getPlatformConfig(tenantIdOrSupabase, supabaseArg) {
  // Support both getPlatformConfig(supabase) and getPlatformConfig(tenantId, supabase)
  var tenantId = null;
  var supabase = null;
  if (typeof tenantIdOrSupabase === 'string' && tenantIdOrSupabase.length > 10) {
    tenantId = tenantIdOrSupabase;
    supabase = supabaseArg;
  } else if (tenantIdOrSupabase && typeof tenantIdOrSupabase === 'object') {
    supabase = tenantIdOrSupabase;
  }

  var sb = getSupabase(supabase);
  var now = Date.now();

  // Load SP-level platform config (cached)
  var platform = _platformCache;
  if (!platform || (now - _platformCacheTime) >= CACHE_TTL) {
    try {
      var pRes = await sb.from('platform_config').select('*').eq('scope', 'platform').is('tenant_id', null).limit(1).maybeSingle();
      platform = pRes.data || null;
      // Backward compat: if no scope='platform' row, try any row without tenant_id
      if (!platform) {
        var pRes2 = await sb.from('platform_config').select('*').is('tenant_id', null).limit(1).maybeSingle();
        platform = pRes2.data || null;
      }
    } catch (e) { console.warn('[getPlatformConfig] SP load error:', e.message); }
    if (platform) { _platformCache = platform; _platformCacheTime = now; }
  }

  if (!platform) return FALLBACK;

  // If no tenantId, return SP-level config
  if (!tenantId) return platform;

  // Load tenant-level override (cached per tenantId)
  var tenantConfig = _tenantCache[tenantId];
  if (!tenantConfig || (now - (_tenantCacheTime[tenantId] || 0)) >= CACHE_TTL) {
    try {
      var tRes = await sb.from('platform_config').select('*').eq('tenant_id', tenantId).limit(1).maybeSingle();
      tenantConfig = tRes.data || null;
    } catch (e) {}
    _tenantCache[tenantId] = tenantConfig;
    _tenantCacheTime[tenantId] = now;
  }

  if (!tenantConfig) return platform;

  // Merge: tenant overrides SP for non-null/non-empty fields
  var merged = Object.assign({}, platform);
  Object.keys(tenantConfig).forEach(function(key) {
    if (key === 'id' || key === 'scope' || key === 'tenant_id' || key === 'updated_at') return;
    var val = tenantConfig[key];
    if (val !== null && val !== undefined && val !== '') {
      if (Array.isArray(val) && val.length === 0) return;
      merged[key] = val;
    }
  });
  merged._tenant_override_id = tenantConfig.id;
  return merged;
}

function _bustCache() {
  _platformCache = null; _platformCacheTime = 0;
  _tenantCache = {}; _tenantCacheTime = {};
}

module.exports = { getPlatformConfig: getPlatformConfig, _bustCache: _bustCache };
