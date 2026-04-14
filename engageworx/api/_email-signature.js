// api/_email-signature.js
// Resolve the correct signature for an outbound email based on:
//   - tenantId (per-tenant custom signatures)
//   - fromEmail (personal vs team address — hello@ / notifications@ = team)
//   - isFirstTouch (true for first outreach / step 1, false for replies & step 2+)
// Returns { fromName, signatureHtml, closingLine }.

function isTeamAddress(fromEmail) {
  var e = String(fromEmail || '').toLowerCase();
  if (!e) return true;
  if (e.indexOf('hello@') === 0) return true;
  if (e.indexOf('notifications@') === 0) return true;
  if (e.indexOf('support@') === 0) return true;
  if (e.indexOf('team@') === 0) return true;
  if (e.indexOf('info@') === 0) return true;
  return false;
}

function defaultClosing(kind, firstName) {
  // kind: 'first' | 'reply' | 'followup'
  if (kind === 'first') return 'Looking forward to connecting!';
  if (kind === 'followup') return 'Just checking in —';
  // reply
  return firstName ? ('Best! ' + firstName) : 'Best,';
}

async function getSignature(supabase, params) {
  // params: { tenantId, fromEmail, isFirstTouch, closingKind, closingOverride }
  var tenantId = params.tenantId;
  var fromEmail = params.fromEmail || '';
  var isFirstTouch = !!params.isFirstTouch;
  var team = isTeamAddress(fromEmail);

  var result = {
    fromName: team ? 'The EngageWorx Team' : 'Rob Mumby',
    signatureHtml: '',
    closingLine: '',
  };

  if (!supabase || !tenantId) {
    result.closingLine = params.closingOverride || defaultClosing(params.closingKind || (isFirstTouch ? 'first' : 'reply'), team ? null : 'Rob');
    return result;
  }

  try {
    var r = await supabase.from('chatbot_configs').select('email_from_name, email_team_from_name, email_signature_first, email_signature_reply, email_team_signature_first, email_team_signature_reply').eq('tenant_id', tenantId).limit(1).maybeSingle();
    var cfg = r.data || {};
    // Brand-aware fallback: pull tenant.brand_name / business_name / name when signature fields are empty
    var brandName = null;
    try {
      var tr = await supabase.from('tenants').select('name, brand_name, business_name').eq('id', tenantId).maybeSingle();
      if (tr.data) brandName = (tr.data.brand_name || tr.data.business_name || tr.data.name || '').trim() || null;
    } catch (be) {}
    if (team) {
      result.fromName = (cfg.email_team_from_name || '').trim() || (brandName ? brandName + ' Team' : result.fromName);
      result.signatureHtml = (isFirstTouch ? cfg.email_team_signature_first : cfg.email_team_signature_reply) || cfg.email_team_signature_first || '';
    } else {
      result.fromName = (cfg.email_from_name || '').trim() || brandName || result.fromName;
      result.signatureHtml = (isFirstTouch ? cfg.email_signature_first : cfg.email_signature_reply) || cfg.email_signature_first || '';
    }
  } catch (e) {}

  var nameForClose = null;
  if (!team && result.fromName) {
    var parts = result.fromName.split(' ');
    nameForClose = parts[0] || null;
  }
  result.closingLine = params.closingOverride || defaultClosing(params.closingKind || (isFirstTouch ? 'first' : 'reply'), nameForClose);
  return result;
}

function composeHtmlBody(bodyHtml, closingLine, signatureHtml) {
  var parts = [];
  if (bodyHtml) parts.push(bodyHtml);
  if (closingLine) parts.push('<p style="margin:0 0 14px;font-family:Arial,sans-serif;font-size:14px;color:#333;">' + closingLine + '</p>');
  if (signatureHtml) parts.push(signatureHtml);
  return parts.join('\n');
}

function composeTextBody(bodyText, closingLine, fromName) {
  var parts = [];
  if (bodyText) parts.push(bodyText.trim());
  if (closingLine) parts.push(closingLine);
  if (fromName) parts.push('— ' + fromName);
  return parts.join('\n\n');
}

module.exports = {
  getSignature: getSignature,
  composeHtmlBody: composeHtmlBody,
  composeTextBody: composeTextBody,
  isTeamAddress: isTeamAddress,
};
