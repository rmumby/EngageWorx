// api/_lib/get-tenant-sender.js — Resolve tenant's outbound sender address
// Used by frontend (via platform-config endpoint) and backend callers.
//
// Priority order:
//   1. user_profiles.sender_email for the specific user (if userId provided)
//   2. chatbot_configs.email_from_name + computed from address
//   3. tenants.primary_contact_email
//   4. Platform fallback: PLATFORM_FROM_EMAIL env var (hello@engwx.com)
//
// NEVER returns rob@engwx.com as default.

async function getTenantSender(supabase, tenantId, userId) {
  var fromEmail = null;
  var fromName = null;

  // 1. Per-user sender_email override
  if (userId) {
    try {
      var ur = await supabase.from('user_profiles').select('sender_email, full_name, email').eq('id', userId).maybeSingle();
      if (ur.data) {
        if (ur.data.sender_email) fromEmail = ur.data.sender_email;
        fromName = ur.data.full_name || null;
        if (!fromEmail) fromEmail = ur.data.email;
      }
    } catch (e) {}
  }

  // 2. Tenant chatbot config
  if (!fromEmail && tenantId) {
    try {
      var cr = await supabase.from('chatbot_configs').select('email_from_name').eq('tenant_id', tenantId).maybeSingle();
      if (cr.data && cr.data.email_from_name) fromName = cr.data.email_from_name;
    } catch (e) {}
  }

  // 3. Tenant primary contact
  if (!fromEmail && tenantId) {
    try {
      var tr = await supabase.from('tenants').select('primary_contact_email, name').eq('id', tenantId).maybeSingle();
      if (tr.data) {
        if (tr.data.primary_contact_email) fromEmail = tr.data.primary_contact_email;
        if (!fromName && tr.data.name) fromName = tr.data.name;
      }
    } catch (e) {}
  }

  // 4. Platform fallback (never rob@engwx.com)
  if (!fromEmail) fromEmail = process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com';
  if (!fromName) fromName = process.env.PLATFORM_NAME || 'EngageWorx';

  return { from: fromEmail, name: fromName };
}

module.exports = { getTenantSender: getTenantSender };
