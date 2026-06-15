// api/_lib/create-tenant.js
// Shared tenant-creation primitive — the ONE place that:
//   - writes customer_type explicitly (validated against the canonical set) and mirrors it to
//     tenant_type, so no path ever leans on the DB 'direct'/'business' defaults;
//   - enforces the sandbox/demo flag XOR (never both true — respects tenants_sandbox_xor_demo);
//   - provisions the admin via a single-use set-password link (no password on the wire);
//   - creates the tenant + binds the admin profile + membership ATOMICALLY via the
//     provision_tenant_and_bind RPC (no half-state; slug self-heal built in), then sets the
//     columns the RPC doesn't cover (is_demo, plan, tenant_type, onboarding_completed, extras);
//   - seeds pipeline stages (+ demo fixtures when is_demo), writes an audit row;
//   - sends the branded welcome carrying the set-password link, anchored to the creator's
//     verified domain (#97 sendPlatformEmail owner_tenant_id).
//
// create-sandbox.js and csp.js(create) both call this so the onboarding spec cannot drift between
// paths (that drift is what produced a demo tenant with the wrong flag, wrong tier, and no login).
//
// AUTH IS THE CALLER'S RESPONSIBILITY: handlers must verifyTenantAuth before calling this. This
// function assumes an already-authorized caller and focuses on correct, consistent provisioning.

var { ensureUserWithSetPasswordLink, setPasswordEmailHtml } = require('./set-password-link');
var { sendPlatformEmail } = require('./send-platform-email');
var { getPlatformConfig } = require('./platform-config');
var { seedPipelineStages } = require('./seed-pipeline-stages');

var CANONICAL_CUSTOMER_TYPES = ['internal', 'master_agent', 'agent', 'csp_partner', 'direct'];
var SP_TENANT_ID = process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387';

function slugify(name) {
  return (name || 'tenant').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// opts:
//   email, fullName, companyName, plan
//   customerType            — validated; mirrored to tenant_type. Default 'direct' (written, never the DB default).
//   isSandbox, isDemo       — XOR enforced (never both true)
//   parentTenantId          — tenants.parent_tenant_id (null for top-level)
//   creatorTenantId         — welcome sender anchor (parent CSP or SP). Default SP.
//   status                  — 'trial' | 'active'. Default 'trial'.
//   role                    — member role. Default 'admin'.
//   seedDemo                — default = isDemo
//   sendWelcome             — default true
//   operatorId              — audit actor
//   extraTenantFields       — merged into the tenants insert (website_url, display_alias, parent_product_label, brand_*, ...)
// returns { ok, tenant, userId, setPasswordLink, welcomeEmailSent, error, status }
async function createTenant(supabase, opts) {
  var email = (opts.email || '').trim().toLowerCase();
  var companyName = (opts.companyName || '').trim();
  var fullName = (opts.fullName || '').trim();
  if (!email || !companyName) return { ok: false, status: 400, error: 'email and companyName are required' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, status: 400, error: 'Invalid email format' };

  var isSandbox = opts.isSandbox === true;
  var isDemo = opts.isDemo === true;
  if (isSandbox && isDemo) return { ok: false, status: 400, error: 'A tenant cannot be both sandbox and demo. Choose one.' };

  var customerType = opts.customerType || 'direct';
  if (CANONICAL_CUSTOMER_TYPES.indexOf(customerType) === -1) {
    return { ok: false, status: 400, error: 'Invalid customer_type "' + customerType + '". Allowed: ' + CANONICAL_CUSTOMER_TYPES.join(', ') };
  }

  var creatorTenantId = opts.creatorTenantId || SP_TENANT_ID;
  var status = opts.status || 'trial';
  var role = opts.role || 'admin';
  var seedDemo = opts.seedDemo !== undefined ? opts.seedDemo : isDemo;
  var sendWelcome = opts.sendWelcome !== false;

  var pc = await getPlatformConfig(creatorTenantId, supabase);

  // 1. Provision the admin auth user + a single-use set-password link (no password on the wire).
  var linkRes = await ensureUserWithSetPasswordLink(supabase, {
    email: email,
    portal_url: pc.portal_url,
    user_metadata: { full_name: fullName, company_name: companyName, role: role },
  });
  if (linkRes.error || !linkRes.user_id) {
    return { ok: false, status: 400, error: 'Could not provision login: ' + (linkRes.error || 'unknown error') };
  }
  var userId = linkRes.user_id;
  var setPasswordLink = linkRes.action_link;

  // 2. Atomic: create the tenant + bind user_profiles.tenant_id + tenant_members(admin) in one
  //    service-role transaction (provision_tenant_and_bind). Slug self-heal is built into the RPC.
  var ENTITY_TIER = { direct: 'tenant', csp_partner: 'csp', agent: 'agent', master_agent: 'master_agent' };
  var slug = slugify(companyName) + '-' + Date.now().toString(36);
  var prov = await supabase.rpc('provision_tenant_and_bind', {
    p_user_id: userId,
    p_name: companyName,
    p_slug: slug,
    p_customer_type: customerType,
    p_entity_tier: ENTITY_TIER[customerType] || 'tenant',
    p_status: status,
    p_parent_tenant_id: opts.parentTenantId || null,
    p_referred_by: null,
    p_is_sandbox: isSandbox,
    p_event_id: null,
  });
  if (prov.error) {
    // Roll back the just-created auth user so a failed provision leaves no orphan.
    if (linkRes.created) { try { await supabase.auth.admin.deleteUser(userId); } catch (e) { console.warn('[createTenant] rollback auth delete:', e.message); } }
    return { ok: false, status: 500, error: 'Tenant provisioning failed: ' + prov.error.message };
  }
  var newTenantId = prov.data;

  // 2b. Columns the RPC doesn't set — tenant_type mirror, is_demo, plan, onboarding_completed, and
  //     any caller extras (website_url, display_alias, parent_product_label, brand_*). Non-fatal.
  var detailRow = Object.assign({
    tenant_type: customerType,
    is_demo: isDemo,
    plan: opts.plan || 'growth',
    onboarding_completed: isDemo ? true : false,
  }, opts.extraTenantFields || {});
  var tDetail = await supabase.from('tenants').update(detailRow).eq('id', newTenantId);
  if (tDetail.error) console.warn('[createTenant] tenant detail update (non-fatal):', tDetail.error.message);

  // Profile display fields (the RPC already set tenant_id + tenant_type).
  try { await supabase.from('user_profiles').update({ company_name: companyName, full_name: fullName, role: role }).eq('id', userId); } catch (e) { console.warn('[createTenant] profile detail (non-fatal):', e.message); }

  // Fetch the final tenant row to return (reflects is_sandbox/is_demo/slug/customer_type for callers).
  var tenantSel = await supabase.from('tenants').select().eq('id', newTenantId).maybeSingle();
  var tenant = tenantSel.data || { id: newTenantId, slug: slug, customer_type: customerType, is_sandbox: isSandbox, is_demo: isDemo };

  // 3. Seed pipeline stages (non-fatal) + demo fixtures (non-fatal).
  try { await seedPipelineStages(supabase, newTenantId); } catch (e) { console.warn('[createTenant] stage seed:', e.message); }
  if (seedDemo) {
    try { var { seedDemoTenant } = require('./seed-demo-tenant'); await seedDemoTenant(newTenantId, supabase); } catch (e) { console.warn('[createTenant] demo seed:', e.message); }
  }

  // 5. Audit.
  try {
    await supabase.rpc('log_audit_event', {
      p_action: 'member.added', p_resource_type: 'tenant_members', p_tenant_id: tenant.id,
      p_user_id: opts.operatorId || null, p_resource_id: userId,
      p_details: { role: role, email: email, via: isDemo ? 'demo' : (isSandbox ? 'sandbox' : 'create'), customer_type: customerType },
      p_ip_address: null, p_user_agent: null,
    });
  } catch (e) { console.warn('[createTenant] audit:', e.message); }

  // 6. Branded welcome carrying the set-password link, anchored to the creator's verified domain.
  var welcomeEmailSent = false;
  if (sendWelcome && setPasswordLink) {
    try {
      var emailVars = {
        first_name: (fullName.split(' ')[0] || 'there'), full_name: fullName, tenant_name: companyName,
        platform_name: pc.platform_name || 'Platform', portal_url: pc.portal_url || 'https://portal.engwx.com',
        email: email, role: role, set_password_link: setPasswordLink,
      };
      var subject = isDemo ? ('Your ' + companyName + ' demo is ready') : ('Welcome to ' + companyName);
      var result = await sendPlatformEmail(supabase, {
        recipient_tenant_id: tenant.id,
        owner_tenant_id: creatorTenantId,
        to: email,
        from_name: pc.platform_name || companyName,
        subject: subject,
        html: setPasswordEmailHtml(emailVars),
      });
      welcomeEmailSent = result.success;
      if (!result.success) console.warn('[createTenant] welcome FAILED:', result.error);
    } catch (e) { console.warn('[createTenant] welcome error:', e.message); }
  }

  return { ok: true, tenant: tenant, userId: userId, setPasswordLink: setPasswordLink, welcomeEmailSent: welcomeEmailSent };
}

module.exports = { createTenant: createTenant, CANONICAL_CUSTOMER_TYPES: CANONICAL_CUSTOMER_TYPES };
