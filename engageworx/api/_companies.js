// api/_companies.js
// Auto-create companies from email domains. Skips public email domains so we
// don't end up with a "gmail.com" company in the portal.

var PUBLIC_DOMAINS = new Set([
  'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','hotmail.com','outlook.com','live.com',
  'icloud.com','me.com','mac.com','aol.com','protonmail.com','proton.me','msn.com','ymail.com',
  'rocketmail.com','comcast.net','verizon.net','att.net','sbcglobal.net','bellsouth.net','mail.com'
]);

function extractDomain(email) {
  if (!email) return null;
  var at = email.indexOf('@');
  if (at < 0) return null;
  var d = email.substring(at + 1).toLowerCase().trim();
  return d || null;
}

function isPersonalDomain(domain) {
  if (!domain) return true;
  return PUBLIC_DOMAINS.has(domain);
}

function companyNameFromDomain(domain) {
  if (!domain) return null;
  var core = domain.split('.')[0];
  if (!core) return null;
  return core.charAt(0).toUpperCase() + core.slice(1);
}

async function ensureCompanyForContact(supabase, tenantId, email) {
  if (!supabase || !tenantId || !email) return null;
  var domain = extractDomain(email);
  if (!domain || isPersonalDomain(domain)) return null;
  try {
    var hit = await supabase.from('companies').select('id').eq('tenant_id', tenantId).eq('domain', domain).limit(1).maybeSingle();
    if (hit.data && hit.data.id) return hit.data.id;
    var ins = await supabase.from('companies').insert({
      tenant_id: tenantId,
      name: companyNameFromDomain(domain),
      domain: domain,
      website_url: 'https://' + domain,
    }).select('id').single();
    return ins.data ? ins.data.id : null;
  } catch (e) { console.warn('[companies] ensure error:', e.message); return null; }
}

module.exports = {
  extractDomain: extractDomain,
  isPersonalDomain: isPersonalDomain,
  companyNameFromDomain: companyNameFromDomain,
  ensureCompanyForContact: ensureCompanyForContact,
};
