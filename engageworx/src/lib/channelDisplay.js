// src/lib/channelDisplay.js
// Single source of truth for a tenant's *display* channels (RC3a of the data-wiring cluster).
//
// "Active channels" = channel_configs rows with enabled=true AND configured credentials. This is
// the ONLY place this derivation lives — the SP dashboard (useLiveData) and the TenantManagement
// list both call it, so the two can't drift. NEVER read tenants.channels_enabled for display:
// that column is creation-time intent only (drifted on ~20/21 live tenants, both directions).
//
// Visibility is gated on tenant intent (enabled=true), NOT on health. channel_configs.status
// (connected|disconnected) is a HEALTH signal, surfaced separately — gating display on
// status='connected' would silently hide enabled-but-disconnected channels, which is exactly when
// a tenant needs the warning. Callers that want the health badge use buildChannelHealthMap.

export const CHANNEL_LABELS = { sms: 'SMS', email: 'Email', whatsapp: 'WhatsApp', voice: 'Voice', rcs: 'RCS', mms: 'MMS' };

// True when a channel_configs row carries the credentials that make the channel actually usable.
export function hasChannelCredentials(channel, cfg) {
  if (!cfg) return false;
  if (channel === 'sms' || channel === 'voice') return !!(cfg.phone_number || cfg.account_sid);
  if (channel === 'email') return !!(cfg.api_key || cfg.from_email || cfg.domain);
  if (channel === 'whatsapp') return !!(cfg.access_token || cfg.phone_number_id);
  if (channel === 'rcs') return !!(cfg.agent_id);
  return true; // unknown channels: trust the enabled flag
}

// Build { [tenant_id]: ['SMS','Email',...] } from channel_configs rows (+ optional poland carrier
// rows). Pass channelRows ALREADY filtered to enabled=true. Mirrors the original useLiveData
// derivation verbatim so behavior is unchanged — only de-duplicated.
export function buildChannelLabelMap(channelRows, polandRows) {
  const map = {};
  (channelRows || []).forEach(function (r) {
    if (!r.tenant_id || !r.channel) return;
    if (!hasChannelCredentials(r.channel, r.config_encrypted)) return;
    if (!map[r.tenant_id]) map[r.tenant_id] = [];
    const label = CHANNEL_LABELS[String(r.channel).toLowerCase()] || String(r.channel).toUpperCase();
    if (map[r.tenant_id].indexOf(label) === -1) map[r.tenant_id].push(label);
  });
  (polandRows || []).forEach(function (r) {
    if (!r.tenant_id) return;
    if (!map[r.tenant_id]) map[r.tenant_id] = [];
    if (map[r.tenant_id].indexOf('🇵🇱 Poland') === -1) map[r.tenant_id].push('🇵🇱 Poland');
  });
  return map;
}

// Fetch enabled channel_configs (+ poland carrier) and return the label map. One round trip the
// SP dashboard and tenant list share. Pass the resolved supabase client.
export async function fetchChannelLabelMap(supabase) {
  const { data: chRows } = await supabase
    .from('channel_configs')
    .select('tenant_id, channel, enabled, config_encrypted')
    .eq('enabled', true);
  let plRows = [];
  try {
    const { data } = await supabase.from('poland_carrier_configs').select('tenant_id').eq('enabled', true);
    plRows = data || [];
  } catch (e) { /* poland carrier table optional */ }
  return buildChannelLabelMap(chRows, plRows);
}
