// api/whatsapp-verify.js — Verify WhatsApp credentials against Meta Graph API
// POST { tenant_id }
// Reads phone_number_id + access_token from channel_configs, calls Meta Graph API,
// updates channel_configs.status based on result.

var { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var body = req.body || {};
  var tenantId = body.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });

  var supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    var cfgRes = await supabase.from('channel_configs').select('id, config_encrypted')
      .eq('tenant_id', tenantId).eq('channel', 'whatsapp').maybeSingle();

    if (!cfgRes.data) return res.status(404).json({ error: 'No WhatsApp channel config found for this tenant' });

    var cfg = cfgRes.data.config_encrypted || {};
    var phoneNumberId = cfg.phone_number_id;
    var accessToken = cfg.access_token;

    if (!phoneNumberId || !accessToken) {
      await supabase.from('channel_configs').update({ status: 'error', updated_at: new Date().toISOString() }).eq('id', cfgRes.data.id);
      return res.status(200).json({ verified: false, status: 'error', message: 'Phone Number ID and Access Token are both required' });
    }

    var metaUrl = 'https://graph.facebook.com/v18.0/' + phoneNumberId + '?access_token=' + encodeURIComponent(accessToken);
    console.log('[WhatsApp Verify] Calling Meta API for tenant:', tenantId, 'phone_number_id:', phoneNumberId);

    var metaRes = await fetch(metaUrl);
    var metaData = await metaRes.json().catch(function() { return null; });

    if (metaRes.ok && metaData && metaData.display_phone_number) {
      // Success — connected
      var displayNumber = metaData.display_phone_number;
      var verifiedName = metaData.verified_name || null;
      await supabase.from('channel_configs').update({
        status: 'connected',
        config_encrypted: Object.assign({}, cfg, {
          phone_number_display: displayNumber,
          verified_name: verifiedName,
          last_verified_at: new Date().toISOString(),
        }),
        updated_at: new Date().toISOString(),
      }).eq('id', cfgRes.data.id);

      // Update provisioning stages for manual credential path
      try {
        var manualStages = ['meta_business_manager', 'waba_application', 'phone_number_registration', 'webhook_configured'];
        for (var ms = 0; ms < manualStages.length; ms++) {
          await supabase.from('whatsapp_provisioning').upsert({
            tenant_id: tenantId, stage: manualStages[ms], status: 'done', updated_at: new Date().toISOString(),
          }, { onConflict: 'tenant_id,stage' });
        }
      } catch (e) { console.warn('[WhatsApp Verify] Provisioning stage update error:', e.message); }

      console.log('[WhatsApp Verify] Connected:', displayNumber, verifiedName);
      return res.status(200).json({
        verified: true,
        status: 'connected',
        display_phone_number: displayNumber,
        verified_name: verifiedName,
      });
    }

    // Error handling
    var errorMsg = 'Verification failed';
    var metaError = metaData && metaData.error;
    if (metaError) {
      if (metaRes.status === 401 || metaRes.status === 403 || metaError.code === 190) {
        errorMsg = 'Access token is invalid or expired. Generate a new token in Meta Business Manager.';
      } else if (metaRes.status === 404) {
        errorMsg = 'Phone Number ID not found. Check the value in Meta Business Manager → WhatsApp → Phone Numbers.';
      } else {
        errorMsg = metaError.message || 'Meta API error (code ' + (metaError.code || metaRes.status) + ')';
      }
    } else if (metaRes.status === 401 || metaRes.status === 403) {
      errorMsg = 'Access token is invalid or expired.';
    } else if (metaRes.status === 404) {
      errorMsg = 'Phone Number ID not found.';
    }

    await supabase.from('channel_configs').update({
      status: 'error',
      updated_at: new Date().toISOString(),
    }).eq('id', cfgRes.data.id);

    console.log('[WhatsApp Verify] Failed:', metaRes.status, errorMsg);
    return res.status(200).json({ verified: false, status: 'error', message: errorMsg });

  } catch (e) {
    console.error('[WhatsApp Verify] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
