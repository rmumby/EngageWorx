// /api/voice-diagnose.js — Diagnostic endpoint for voice channel configuration
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  var tenantId = req.query.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'tenant_id query parameter required' });

  var supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
  );

  try {
    var configResult = await supabase.from('channel_configs').select('config_encrypted, enabled, status, updated_at')
      .eq('tenant_id', tenantId).eq('channel', 'voice').maybeSingle();

    var config = (configResult.data && configResult.data.config_encrypted) || {};

    var requiredFields = [
      'phone_country', 'phone_number', 'during_hours_greeting', 'after_hours_greeting',
      'voicemail_greeting', 'auto_answer', 'tts_voice', 'timezone',
      'business_hours_start', 'business_hours_end', 'recording_enabled',
      'block_after_hours', 'ring_timeout_seconds'
    ];

    var missingFields = requiredFields.filter(function(f) {
      return config[f] === undefined || config[f] === null || config[f] === '';
    });

    var countryMatch = (config.phone_country || '').match(/\+\d+/);
    var countryCode = countryMatch ? countryMatch[0] : null;
    var phoneNumber = (config.phone_number || '').replace(/[\s\-\(\)]/g, '').replace(/^0+/, '');
    var fullNumber = countryCode && phoneNumber ? countryCode + phoneNumber : null;

    var tenantResult = await supabase.from('tenants').select('name, brand_name').eq('id', tenantId).maybeSingle();
    var tenantName = tenantResult.data ? (tenantResult.data.brand_name || tenantResult.data.name) : 'Unknown';

    var chatbotResult = await supabase.from('chatbot_configs').select('bot_name, system_prompt').eq('tenant_id', tenantId).maybeSingle();

    res.status(200).json({
      tenant_id: tenantId,
      tenant_name: tenantName,
      channel_enabled: !!(configResult.data && configResult.data.enabled),
      channel_status: configResult.data ? configResult.data.status : 'not_found',
      last_updated: configResult.data ? configResult.data.updated_at : null,
      config_stored: config,
      missing_fields: missingFields,
      phone_formatted: fullNumber || 'Cannot construct — missing country or number',
      would_match_incoming: fullNumber ? 'yes — matches calls to ' + fullNumber : 'no — phone_country or phone_number missing',
      chatbot: {
        bot_name: chatbotResult.data ? chatbotResult.data.bot_name : null,
        has_system_prompt: !!(chatbotResult.data && chatbotResult.data.system_prompt),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
