// api/_lib/verify-tenant-auth.js
// Shared caller-authorization gate for tenant-scoped endpoints. A caller is authorized if they
// are a platform superadmin, or an active member of the tenant (optionally requiring admin/owner).
// Mirrors the inline checks in ai-config.js and resend-welcome.js.
//
// Returns { user } on success, or { error, status } on failure — the caller returns the status.
// Pass tenantId = null to require a superadmin (e.g. creating a top-level tenant with no parent).

async function verifyTenantAuth(supabase, req, tenantId, opts) {
  var requireAdmin = opts && opts.requireAdmin;
  var authHeader = req.headers.authorization || '';
  var token = authHeader.replace('Bearer ', '');
  if (!token) return { error: 'Authorization required', status: 401 };

  var { data: { user: user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return { error: 'Invalid or expired token', status: 401 };

  var profRes = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  var role = profRes.data && profRes.data.role;
  var isSA = role === 'superadmin' || role === 'super_admin' || role === 'sp_admin';
  if (isSA) return { user: user };

  // Non-SA: must be an active member of the tenant (admin/owner/manager if requireAdmin).
  if (!tenantId) return { error: 'Not authorized', status: 403 };
  var memRes = await supabase.from('tenant_members')
    .select('role').eq('tenant_id', tenantId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
  if (!memRes.data) return { error: 'Not authorized', status: 403 };
  if (requireAdmin && ['admin', 'owner', 'manager'].indexOf(memRes.data.role) === -1) {
    return { error: 'Admin access required', status: 403 };
  }
  return { user: user };
}

module.exports = { verifyTenantAuth: verifyTenantAuth };
