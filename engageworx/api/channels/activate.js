// api/channels/activate.js — self-service channel activation (§3 v1, slice 1).
// USER-JWT ONLY. The whole point of this endpoint: call activate_channel through a JWT-scoped client
// so auth.uid() is populated and the RPC's F1/F2 authorization fires. It is NEVER called service-role
// (that would null auth.uid() and silently bypass the gate). Provider/runner work AFTER the RPC says
// 'activating' runs service-role (post-authz) — provider secrets never touch the client.
//
// Flow: verify caller -> activate_channel(tenant, channel) via user-JWT client -> relay the jsonb
// outcome. already_pending/already_connected/payment_required/managed_setup/coming_soon are relayed
// straight back (activate_channel signals replay via already_* — there is NO idempotency_keys/23505
// catch here; that belongs to the provisioning endpoint). On 'activating', dispatch the channel's
// external-step runner.

var { createClient } = require('@supabase/supabase-js');

var SUPA_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
var SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
var ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authorization required' });

  var body = req.body || {};
  var tenantId = body.tenant_id;
  var channel = body.channel;
  if (!tenantId || !channel) return res.status(400).json({ error: 'tenant_id and channel required' });

  // Verify the caller's token (service-role getUser — read-only identity check).
  var svc = createClient(SUPA_URL, SERVICE_KEY);
  var auth = await svc.auth.getUser(token);
  if (auth.error || !auth.data || !auth.data.user) return res.status(401).json({ error: 'Invalid token' });

  // CRITICAL: activate_channel runs through a USER-JWT-scoped client so auth.uid() = the caller and
  // the RPC's F1/F2 authz fires. Do NOT swap this for the service-role client.
  var userClient = createClient(SUPA_URL, ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  var rpc = await userClient.rpc('activate_channel', { p_tenant_id: tenantId, p_channel: channel });
  if (rpc.error) {
    var code = rpc.error.code;
    var http = code === '42501' ? 403 : code === '23503' ? 404 : 400; // authz / not-found / bad input
    return res.status(http).json({ error: rpc.error.message, code: code || null });
  }

  var result = rpc.data || {};
  // Relay terminal/no-op outcomes verbatim (replay + gate results).
  if (result.outcome !== 'activating') {
    return res.status(200).json(result);
  }

  // 'activating' (status now 'pending') — run the external step server-side (service-role, post-authz).
  var next_step = await runChannel(svc, tenantId, channel);
  return res.status(200).json(Object.assign({}, result, { next_step: next_step }));
};

// Per-channel external-step dispatch. Slice 1 implements EMAIL; the others are pend-only until their
// runner slice lands (flagged, per the sequencing note).
async function runChannel(svc, tenantId, channel) {
  if (channel === 'email') {
    // Email's external step is the existing Resend domain flow: /api/email-setup create-domain -> DNS ->
    // check-verification -> save-config flips channel_configs(email) to 'connected'. The channel stays
    // 'pending' until the tenant completes DNS verification. (No new provider call needed here.)
    return {
      type: 'email_domain',
      endpoint: '/api/email-setup',
      action: 'create-domain',
      message: 'Add your sending domain and its DNS records to verify email; the channel stays pending until verified.',
    };
  }
  if (channel === 'sms') {
    // SMS external step = A2P 10DLC registration via the TCR wizard (/api/tcr-wizard) AND a number bound
    // to a messaging service. The channel reaches 'connected' (and sms_enabled flips true — via the
    // TCR-approved hook in tcr-wizard.js + the 081 number-ready trigger, both feeding the scoped
    // recompute_sms_enabled) only when BOTH land. Number provisioning is out-of-band in v1 (Telnyx
    // auto-purchase is its own build); the wizard drives registration.
    return {
      type: 'sms_registration',
      endpoint: '/api/tcr-wizard',
      action: 'start',
      number_provisioning: 'out_of_band',
      message: 'Complete A2P 10DLC registration in the TCR wizard. Number assignment is handled by your account team in v1. SMS sending unlocks when the campaign is approved and the number is bound.',
    };
  }
  // whatsapp / voice / mms runners ship in later slice-2 steps. The channel is now 'pending' and cannot
  // reach 'connected' until its runner + provider callback are wired.
  return {
    type: 'runner_pending',
    channel: channel,
    message: 'Activation initiated (pending). The provider step for this channel is not wired yet (later slice-2 step).',
  };
}
