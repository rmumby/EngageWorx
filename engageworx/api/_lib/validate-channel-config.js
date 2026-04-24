// api/_lib/validate-channel-config.js — Config validation for all channels

function validateChannelConfig(channel, config) {
  var errors = [];
  var warnings = [];
  var c = config || {};

  if (channel === 'voice') {
    if (!c.phone_number) errors.push({ field: 'phone_number', message: 'Phone number required' });
    if (c.auto_answer !== 'Enabled' && !c.forward_to && c.phone_number) {
      // Only warn if they have a number but no forward — they might use voicemail
    }
    if (c.forward_to && c.phone_number && c.forward_to === c.phone_number) {
      errors.push({ field: 'forward_to', message: 'Forward-to cannot match the Twilio DID (routing loop)' });
    }
    var timeout = parseInt(c.ring_timeout_seconds, 10);
    if (c.ring_timeout_seconds && !isNaN(timeout) && (timeout < 5 || timeout > 60)) {
      errors.push({ field: 'ring_timeout_seconds', message: 'Ring timeout must be 5-60 seconds' });
    }
    var open = parseFloat(c.business_hours_start);
    var close = parseFloat(c.business_hours_end);
    if (!isNaN(open) && !isNaN(close) && open >= close) {
      errors.push({ field: 'business_hours_start', message: 'Business hours: open must be before close' });
    }
    if (!c.voicemail_email && !c.voicemail_greeting) {
      warnings.push({ field: 'voicemail', message: 'No voicemail email or greeting configured — callers may hear silence after ring timeout' });
    }
  }

  if (channel === 'email') {
    if (!c.from_email) errors.push({ field: 'from_email', message: 'From email address required' });
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.from_email)) errors.push({ field: 'from_email', message: 'Invalid email format' });
    if (!c.domain) warnings.push({ field: 'domain', message: 'No email domain configured — may affect deliverability' });
  }

  if (channel === 'sms') {
    if (!c.phone_number) errors.push({ field: 'phone_number', message: 'Phone number required for SMS' });
  }

  if (channel === 'whatsapp') {
    if (!c.phone_number_id) errors.push({ field: 'phone_number_id', message: 'WhatsApp Phone Number ID required' });
    if (!c.waba_id && !c.business_account_id) errors.push({ field: 'waba_id', message: 'WhatsApp Business Account ID (WABA) required' });
  }

  return { valid: errors.length === 0, errors: errors, warnings: warnings };
}

module.exports = { validateChannelConfig: validateChannelConfig };
