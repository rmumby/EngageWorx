// api/_lib/platform-config.js — Load platform_config singleton with 60s in-memory cache

var { createClient } = require('@supabase/supabase-js');

var _cache = null;
var _cacheTime = 0;
var CACHE_TTL = 60000;

async function getPlatformConfig(supabase) {
  var now = Date.now();
  if (_cache && (now - _cacheTime) < CACHE_TTL) return _cache;

  var sb = supabase || createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    var r = await sb.from('platform_config').select('*').limit(1).maybeSingle();
    if (r.data) {
      _cache = r.data;
      _cacheTime = now;
      return _cache;
    }
  } catch (e) {
    console.warn('[getPlatformConfig] Error:', e.message);
  }

  // Fallback if table doesn't exist yet or is empty
  return {
    platform_name: process.env.PLATFORM_NAME || 'Platform',
    support_email: process.env.PLATFORM_FROM_EMAIL || 'support@example.com',
    portal_url: process.env.PORTAL_URL || 'https://portal.example.com',
    plans: [],
    industries: [],
    default_escalation_rules: [],
  };
}

module.exports = { getPlatformConfig: getPlatformConfig };
