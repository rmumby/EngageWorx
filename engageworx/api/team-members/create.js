// api/team-members/create.js — Create a notification-only team member
// POST /api/team-members/create
// Body: { tenant_id, full_name, email?, phone_number?, notify_channels: ["email","sms"] }
// Returns: { member } — the newly created tenant_member record
//
// Creates a tenant_members row with role='notification_only'.
// Does NOT create a Supabase auth user — these members can't log in.
// Tenant-scoped, JWT-gated.

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // ── Auth ────────────────────────────────────────────────────────────
  var authHeader = req.headers.authorization || '';
  var jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return res.status(401).json({ error: 'Authorization required' });

  var supabase = getSupabase();
  var { data: userData, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !userData || !userData.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  var callerUserId = userData.user.id;

  // ── Body ────────────────────────────────────────────────────────────
  var body = req.body || {};
  var tenantId = body.tenant_id;
  var fullName = (body.full_name || '').trim();
  var email = (body.email || '').trim().toLowerCase();
  var phoneNumber = (body.phone_number || '').trim();
  var notifyChannels = body.notify_channels || [];

  if (!tenantId) return res.status(400).json({ error: 'tenant_id is required' });
  if (!fullName) return res.status(400).json({ error: 'full_name is required' });
  if (!email && !phoneNumber) return res.status(400).json({ error: 'At least one contact method (email or phone_number) is required' });

  // ── Caller must be an active admin/manager of this tenant ──────────
  var { data: callerMembership } = await supabase
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', callerUserId)
    .eq('status', 'active')
    .maybeSingle();

  if (!callerMembership || (callerMembership.role !== 'admin' && callerMembership.role !== 'manager' && callerMembership.role !== 'owner')) {
    console.log('[team-members/create] access denied', { callerUserId, tenantId, role: callerMembership?.role });
    return res.status(403).json({ error: 'Only admins and managers can add team members' });
  }

  // ── Check for existing member with same email in this tenant ───────
  if (email) {
    var { data: existingByEmail } = await supabase
      .from('tenant_members')
      .select('id, role')
      .eq('tenant_id', tenantId)
      .eq('notify_email', email)
      .maybeSingle();

    if (existingByEmail) {
      return res.status(409).json({ error: 'A team member with this email already exists in this tenant', existing: existingByEmail });
    }
  }

  // ── Generate a placeholder user_id ─────────────────────────────────
  // notification_only members don't have Supabase auth accounts.
  // We use a deterministic UUID-like ID based on tenant + email/phone
  // so they can be referenced in escalation rules.
  var crypto = require('crypto');
  var seedString = tenantId + ':' + (email || phoneNumber);
  var placeholderUserId = crypto.createHash('md5').update(seedString).digest('hex');
  // Format as UUID: 8-4-4-4-12
  placeholderUserId = [
    placeholderUserId.slice(0, 8),
    placeholderUserId.slice(8, 12),
    placeholderUserId.slice(12, 16),
    placeholderUserId.slice(16, 20),
    placeholderUserId.slice(20, 32),
  ].join('-');

  // ── Insert tenant_member ──────────────────────────────────────────
  var insertPayload = {
    user_id: placeholderUserId,
    tenant_id: tenantId,
    role: 'notification_only',
    status: 'active',
    notify_email: email || null,
    notify_on_escalation: notifyChannels.indexOf('email') >= 0 || notifyChannels.indexOf('sms') >= 0,
  };

  try {
    var { data: newMember, error: insertError } = await supabase
      .from('tenant_members')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError) {
      console.error('[team-members/create] insert error', { tenant_id: tenantId, error: insertError.message });
      return res.status(500).json({ error: insertError.message });
    }

    // Also insert a user_profiles row so the member appears in team lookups
    try {
      await supabase.from('user_profiles').upsert({
        id: placeholderUserId,
        full_name: fullName,
        email: email || null,
        phone_number: phoneNumber || null,
        tenant_id: tenantId,
        role: 'notification_only',
      }, { onConflict: 'id' });
    } catch (profileErr) {
      console.warn('[team-members/create] user_profiles upsert warning', { error: profileErr.message });
      // Non-fatal — the member was already created
    }

    console.log('[team-members/create] created', {
      tenant_id: tenantId,
      member_id: newMember.id,
      role: 'notification_only',
      full_name: fullName,
    });

    return res.status(200).json({
      member: {
        id: placeholderUserId,
        member_record_id: newMember.id,
        full_name: fullName,
        email: email,
        phone_number: phoneNumber,
        role: 'notification_only',
      },
    });
  } catch (err) {
    console.error('[team-members/create] error', { tenant_id: tenantId, error: err.message });
    return res.status(500).json({ error: err.message });
  }
};
