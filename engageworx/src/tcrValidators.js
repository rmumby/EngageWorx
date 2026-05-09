// src/tcrValidators.js — Pre-submit validation for TCR wizard
// Runs client-side before submit. Server re-validates in api/tcr-submit-telnyx.js.

export function validateBrand(brand) {
  var errors = [];
  if (!brand.legal_name || brand.legal_name.trim().length < 2) errors.push({ field: 'legal_name', msg: 'Legal business name is required.' });
  if (!brand.ein || !/^\d{2}-?\d{7}$/.test(brand.ein.replace(/\s/g, ''))) errors.push({ field: 'ein', msg: 'Valid EIN required (XX-XXXXXXX format).' });
  if (!brand.vertical) errors.push({ field: 'vertical', msg: 'Select a business vertical.' });
  if (!brand.entity_type) errors.push({ field: 'entity_type', msg: 'Select an entity type.' });
  if (!brand.street) errors.push({ field: 'street', msg: 'Business street address required.' });
  if (!brand.city) errors.push({ field: 'city', msg: 'City required.' });
  if (!brand.state) errors.push({ field: 'state', msg: 'State required.' });
  if (!brand.zip) errors.push({ field: 'zip', msg: 'ZIP code required.' });
  if (!brand.phone) errors.push({ field: 'phone', msg: 'Business phone required.' });
  if (!brand.email || !/\S+@\S+\.\S+/.test(brand.email)) errors.push({ field: 'email', msg: 'Valid business email required.' });
  if (brand.sole_proprietor) errors.push({ field: 'sole_proprietor', msg: 'Sole proprietor registrations are not supported in this wizard at this time.' });
  return errors;
}

export function validateCampaign(campaign, brandName) {
  var errors = [];
  if (!campaign.use_case) errors.push({ field: 'use_case', msg: 'Select a use case.' });
  var msgs = campaign.sample_messages || [];
  if (msgs.filter(function(m) { return m && m.trim(); }).length < 2) errors.push({ field: 'sample_messages', msg: 'At least 2 sample messages required (5 recommended).' });
  var hasHelpStop = msgs.some(function(m) { return m && /HELP/i.test(m) && /STOP/i.test(m); });
  if (!hasHelpStop) errors.push({ field: 'sample_messages', msg: 'At least one sample message must include HELP and STOP keywords.' });
  if (!campaign.optin_confirmation || campaign.optin_confirmation.trim().length < 20) errors.push({ field: 'optin_confirmation', msg: 'Opt-in confirmation message required (minimum 20 characters).' });
  if (!campaign.help_message) errors.push({ field: 'help_message', msg: 'HELP response message required.' });
  if (!campaign.stop_message) errors.push({ field: 'stop_message', msg: 'STOP response message required.' });
  // Check for unfilled placeholders
  var allText = msgs.join(' ') + ' ' + (campaign.optin_confirmation || '') + ' ' + (campaign.help_message || '');
  if (/\[Your Business\]|\[Business Name\]|\{businessName\}/i.test(allText)) {
    errors.push({ field: 'sample_messages', msg: 'Replace all placeholder tokens with your actual business name.' });
  }
  return errors;
}

export function validateUrls(urlResults) {
  var errors = [];
  var fields = ['consent', 'privacy', 'smsTerms', 'terms'];
  for (var i = 0; i < fields.length; i++) {
    var r = urlResults[fields[i]];
    if (!r) { errors.push({ field: fields[i], msg: fields[i] + ' URL not verified yet.' }); continue; }
    if (!r.ok) errors.push({ field: fields[i], msg: fields[i] + ' URL verification failed: ' + (r.error || 'unknown error') });
    if (r.missing_keywords && r.missing_keywords.length > 0) {
      errors.push({ field: fields[i], msg: fields[i] + ' page missing required keywords: ' + r.missing_keywords.join(', ') });
    }
  }
  return errors;
}

export function validateAll(brand, campaign, urlResults) {
  return {
    brand: validateBrand(brand),
    campaign: validateCampaign(campaign, brand.legal_name),
    urls: validateUrls(urlResults),
  };
}
