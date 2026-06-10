// api/_lib/booking-integration.js — Read a tenant's booking-integration config at runtime.
//
// Stored as a nested object at channel_configs.config_encrypted->'booking_integration' on the
// tenant's channel='email' row (same direct-jsonb access pattern as other config_encrypted reads,
// e.g. fire-escalation.js). It lives under the email row deliberately: the channel_configs.channel
// CHECK constraint only allows sms/email/whatsapp/rcs/mms/voice, so a channel='booking' row can
// never exist — no migration, no new channel. The value is loaded out-of-band, per tenant. No
// tenant data is hardcoded here.
//
// Expected shape (loaded per tenant; absent fields are simply unused):
//   {
//     "active_path": "path_a_link" | "path_b_api",
//     "booking_url": "https://...",                       // Path A: link the assistant shares
//     "path_b_api": { "status": "blocked_pending_partner_access", ... }   // Path B: API (parked)
//   }
//
// Returns the booking_integration object, or null when the tenant has no email config / no
// booking_integration key.
async function getBookingIntegration(supabase, tenantId) {
  if (!supabase || !tenantId) return null;
  try {
    var r = await supabase.from('channel_configs')
      .select('config_encrypted')
      .eq('tenant_id', tenantId)
      .eq('channel', 'email')
      .maybeSingle();
    if (!r || !r.data || !r.data.config_encrypted) return null;
    var bi = r.data.config_encrypted.booking_integration;
    return (bi && typeof bi === 'object') ? bi : null;
  } catch (e) {
    console.warn('[BookingIntegration] read error for tenant ' + tenantId + ': ' + e.message);
    return null;
  }
}

module.exports = { getBookingIntegration: getBookingIntegration };
