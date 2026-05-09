// api/tcr-verify-url.js — Verify a URL contains required TCR compliance keywords
// POST { url, keywords, tenant_id }
// Returns { ok, status, missing_keywords, error }
// Tenant-scoped: rejects URLs not associated with the tenant.

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var body = req.body || {};
  var url = (body.url || '').trim();
  var keywords = body.keywords || [];
  var tenantId = body.tenant_id;

  if (!url) return res.status(400).json({ ok: false, error: 'url required' });
  if (!tenantId) return res.status(400).json({ ok: false, error: 'tenant_id required' });

  // Validate URL format
  var parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'Invalid URL format' });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ ok: false, error: 'URL must use HTTP or HTTPS' });
  }

  // Tenant-scope: verify the domain is associated with the tenant
  var domain = parsed.hostname.toLowerCase();
  var supabase = getSupabase();
  try {
    var { data: tenant } = await supabase.from('tenants')
      .select('id, name, custom_domain, slug')
      .eq('id', tenantId).maybeSingle();
    if (!tenant) return res.status(403).json({ ok: false, error: 'Tenant not found' });

    // Allow: tenant custom domain, engwx.com subdomains, tenant slug subdomains
    var allowed = ['engwx.com', 'www.engwx.com'];
    if (tenant.custom_domain) allowed.push(tenant.custom_domain.toLowerCase());
    if (tenant.slug) allowed.push(tenant.slug + '.engwx.com');
    var domainOk = allowed.some(function(d) {
      return domain === d || domain.endsWith('.' + d);
    });
    if (!domainOk) {
      return res.status(403).json({ ok: false, error: 'URL domain (' + domain + ') is not associated with this tenant. Use your custom domain or an engwx.com URL.' });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Tenant lookup failed: ' + e.message });
  }

  // Fetch the URL
  var status = 0;
  var pageText = '';
  try {
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 5000);
    var response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'EngageWorx-TCR-Verifier/1.0' },
    });
    clearTimeout(timeout);
    status = response.status;
    if (!response.ok) {
      return res.status(200).json({ ok: false, status: status, missing_keywords: [], error: 'HTTP ' + status });
    }
    pageText = await response.text();
  } catch (e) {
    var errMsg = e.name === 'AbortError' ? 'Request timed out (5s limit)' : e.message;
    return res.status(200).json({ ok: false, status: 0, missing_keywords: [], error: errMsg });
  }

  // Check for required keywords (case-insensitive)
  var lower = pageText.toLowerCase();
  var missing = [];
  for (var i = 0; i < keywords.length; i++) {
    if (lower.indexOf(keywords[i].toLowerCase()) === -1) {
      missing.push(keywords[i]);
    }
  }

  var ok = missing.length === 0;
  console.log('[tcr-verify-url]', url, 'status:', status, 'missing:', missing.length, 'tenant:', tenantId);
  return res.status(200).json({ ok: ok, status: status, missing_keywords: missing, error: null });
};
