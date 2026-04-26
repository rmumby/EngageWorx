// api/whatsapp-signup.js
// Meta WhatsApp Embedded Signup — code exchange + WABA/phone discovery + webhook subscribe.
// POST { code, tenant_id }
//
// Required env vars (one-time setup on Vercel → Settings → Environment Variables):
//   FACEBOOK_APP_ID     — from developers.facebook.com → Your App → Settings → Basic → App ID
//   FACEBOOK_APP_SECRET — from developers.facebook.com → Your App → Settings → Basic → App Secret
//                          (click "Show", confirm with password)
//
// Also: in the Meta app config, add this callback URL to "Valid OAuth Redirect URIs":
//   https://portal.engwx.com/api/whatsapp-signup
// And subscribe the app to: whatsapp_business_management, whatsapp_business_messaging, business_management.

var { createClient } = require('@supabase/supabase-js');

var META_VERSION = 'v18.0';
var META_BASE = 'https://graph.facebook.com/' + META_VERSION;

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function exchangeCode(code, redirectUri) {
  var appId = process.env.FACEBOOK_APP_ID;
  var secret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !secret) throw new Error('FACEBOOK_APP_ID / FACEBOOK_APP_SECRET not set on Vercel');
  var url = META_BASE + '/oauth/access_token?client_id=' + encodeURIComponent(appId) +
    '&client_secret=' + encodeURIComponent(secret) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&code=' + encodeURIComponent(code);
  var r = await fetch(url);
  var d = await r.json();
  if (!r.ok || !d.access_token) throw new Error('Meta code exchange failed: ' + JSON.stringify(d));
  return d.access_token;
}

async function fetchWaba(accessToken) {
  var r = await fetch(META_BASE + '/me/whatsapp_business_accounts?access_token=' + encodeURIComponent(accessToken));
  var d = await r.json();
  if (!r.ok || !d.data || d.data.length === 0) throw new Error('No WhatsApp Business Account on this Meta user: ' + JSON.stringify(d));
  return d.data[0]; // pick the first — customers with multiple WABAs are rare at this stage
}

async function fetchPhoneNumber(wabaId, accessToken) {
  var r = await fetch(META_BASE + '/' + wabaId + '/phone_numbers?access_token=' + encodeURIComponent(accessToken));
  var d = await r.json();
  if (!r.ok || !d.data || d.data.length === 0) throw new Error('No phone number on WABA: ' + JSON.stringify(d));
  return d.data[0];
}

async function subscribeWebhook(wabaId, accessToken) {
  try {
    var r = await fetch(META_BASE + '/' + wabaId + '/subscribed_apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken },
    });
    var d = await r.json();
    return d.success === true;
  } catch (e) { console.warn('[WA signup] subscribe error:', e.message); return false; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var body = req.body || {};
  var code = body.code;
  var tenantId = body.tenant_id;
  if (!code || !tenantId) return res.status(400).json({ error: 'code and tenant_id required' });

  var portalBase = process.env.PORTAL_URL || 'https://portal.engwx.com';
  var redirectUri = portalBase + '/api/whatsapp-signup';
  var supabase = getSupabase();

  try {
    var token = await exchangeCode(code, redirectUri);
    var waba = await fetchWaba(token);
    var phone = await fetchPhoneNumber(waba.id, token);
    var subscribed = await subscribeWebhook(waba.id, token);

    // Upsert channel_configs row — strict tenant scope
    var existing = await supabase.from('channel_configs').select('id, config_encrypted').eq('tenant_id', tenantId).eq('channel', 'whatsapp').maybeSingle();
    var existingCfg = (existing.data && existing.data.config_encrypted) || {};
    var newCfg = Object.assign({}, existingCfg, {
      phone_number_id: phone.id,
      waba_id: waba.id,
      business_account_id: waba.id,
      access_token: token,
      phone_number_display: phone.display_phone_number || phone.verified_name || null,
      verified_name: phone.verified_name || null,
      connected_via: 'embedded_signup',
      connected_at: new Date().toISOString(),
      webhook_subscribed: subscribed,
    });
    var payload = {
      tenant_id: tenantId, channel: 'whatsapp',
      enabled: true, status: 'connected',
      config_encrypted: newCfg,
      updated_at: new Date().toISOString(),
    };
    if (existing.data && existing.data.id) {
      await supabase.from('channel_configs').update(payload).eq('id', existing.data.id).eq('tenant_id', tenantId);
    } else {
      await supabase.from('channel_configs').insert(payload);
    }

    // Update provisioning stages
    var stages = [
      { stage: 'meta_business_manager', status: 'done' },
      { stage: 'waba_application', status: 'done' },
      { stage: 'phone_number_registration', status: 'done' },
      { stage: 'webhook_configured', status: subscribed ? 'done' : 'in_progress' },
    ];
    for (var si = 0; si < stages.length; si++) {
      var stg = stages[si];
      var stgIns = await supabase.from('whatsapp_provisioning').upsert({
        tenant_id: tenantId, stage: stg.stage, status: stg.status, updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,stage' });
      if (stgIns.error) console.warn('[WA signup] Stage update error:', stg.stage, stgIns.error.message);
    }
    console.log('[WA signup] Provisioning stages updated for tenant:', tenantId);

    return res.status(200).json({
      success: true,
      phone_number: phone.display_phone_number || phone.verified_name,
      waba_id: waba.id,
      webhook_subscribed: subscribed,
    });
  } catch (err) {
    console.error('[WA signup] error:', err.message);
    // Track failed stage
    try {
      await supabase.from('whatsapp_provisioning').upsert({
        tenant_id: tenantId, stage: 'waba_application', status: 'rejected',
        meta_error_message: err.message, updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,stage' });
    } catch (e) {}
    return res.status(500).json({ error: err.message });
  }
};
