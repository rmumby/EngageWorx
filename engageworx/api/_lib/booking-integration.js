// api/_lib/booking-integration.js — Read a tenant's booking-integration config at runtime.
//
// Stored as plain jsonb in channel_configs.config_encrypted on the channel='booking' row
// for the tenant (same direct-jsonb access pattern as the email channel's config_encrypted,
// e.g. fire-escalation.js). There is NO dedicated column and no migration — the value is
// loaded out-of-band, per tenant. No tenant data is hardcoded here.
//
// Expected shape (loaded per tenant; absent fields are simply unused):
//   {
//     "active_path": "path_a_link" | "path_b_api",
//     "self_booking_url": "https://...",                 // Path A: link the assistant shares
//     "path_b_api": { "status": "blocked_pending_partner_access", ... }   // Path B: API (parked)
//   }
//
// Returns the booking config object, or null when the tenant has no booking row / no config.
async function getBookingIntegration(supabase, tenantId) {
  if (!supabase || !tenantId) return null;
  try {
    var r = await supabase.from('channel_configs')
      .select('config_encrypted, enabled, status')
      .eq('tenant_id', tenantId)
      .eq('channel', 'booking')
      .maybeSingle();
    if (!r || !r.data || !r.data.config_encrypted) return null;
    var cfg = r.data.config_encrypted;
    if (!cfg || typeof cfg !== 'object') return null;
    // Tolerate the booking config living directly in config_encrypted, or nested
    // under a `booking_integration` key — return whichever carries the fields.
    return (cfg.booking_integration && typeof cfg.booking_integration === 'object')
      ? cfg.booking_integration
      : cfg;
  } catch (e) {
    console.warn('[BookingIntegration] read error for tenant ' + tenantId + ': ' + e.message);
    return null;
  }
}

module.exports = { getBookingIntegration: getBookingIntegration };
