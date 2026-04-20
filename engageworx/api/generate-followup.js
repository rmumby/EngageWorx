// api/generate-followup.js
// POST { contact_name, company, event_tag, notes, channel, tenant_id, existing_draft?, improve? }
// → { draft }
// Uses claude-haiku-4-5 for generation, claude-sonnet-4-6 for improvement.

var { createClient } = require('@supabase/supabase-js');
var { logAiUsage } = require('./_usage-meter');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var b = req.body || {};
  var contactName = b.contact_name || 'there';
  var company = b.company || '';
  var eventTag = b.event_tag || '';
  var notes = b.notes || '';
  var channel = b.channel || 'email';
  var tenantId = b.tenant_id || null;
  var existingDraft = b.existing_draft || '';
  var improve = !!b.improve;

  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  var supabase = getSupabase();

  // Load tenant context for personalization
  var tenantName = 'EngageWorx';
  var calendlyUrl = '';
  var signatureFirst = '';
  var signatureReply = '';
  var PLACEHOLDER_NAMES = ['my business', 'your business', 'company name', 'business name', 'your company', 'untitled', ''];
  if (tenantId) {
    try {
      var t = await supabase.from('tenants').select('name, brand_name, calendly_url').eq('id', tenantId).maybeSingle();
      if (t.data) {
        var bn = (t.data.brand_name || '').trim();
        var tn = (t.data.name || '').trim();
        if (bn && PLACEHOLDER_NAMES.indexOf(bn.toLowerCase()) === -1) tenantName = bn;
        else if (tn && PLACEHOLDER_NAMES.indexOf(tn.toLowerCase()) === -1) tenantName = tn;
        calendlyUrl = t.data.calendly_url || '';
      }
    } catch (e) {}
    try {
      var sig = await supabase.from('chatbot_configs').select('email_signature_first, email_signature_reply').eq('tenant_id', tenantId).limit(1).maybeSingle();
      if (sig.data) { signatureFirst = sig.data.email_signature_first || ''; signatureReply = sig.data.email_signature_reply || ''; }
    } catch (e) {}
  }

  var model = improve ? 'claude-sonnet-4-6' : 'claude-haiku-4-5';

  var brandRule = 'CRITICAL: The company sending this email is called "' + tenantName + '". You MUST use "' + tenantName + '" in every email. NEVER write "My Business", "our company", or any placeholder name under any circumstances.\n\n';

  var system;
  if (improve) {
    system = brandRule + 'You are improving an existing follow-up message for ' + tenantName + '. Make it more personalized, professional, and compelling while preserving the core intent. Keep it concise — under 100 words for SMS, under 200 words for email. Do not add flowery language or generic filler. Write as Rob from ' + tenantName + '.';
  } else {
    system = brandRule + 'You write short, personalized follow-up messages for ' + tenantName + '. Be warm but professional. Reference specific details (event, company, prior conversation topics). Keep it natural — not salesy or generic.\n\n' +
      'Rules:\n' +
      '- SMS: max 160 characters, conversational, no subject line\n' +
      '- Email: 2-3 short paragraphs, include a clear next step (meeting/call)\n' +
      '- Reference the event or context naturally\n' +
      '- NEVER use placeholder brackets like [Your Name], [Company], etc.\n' +
      '- Write as Rob from ' + tenantName + '\n' +
      (calendlyUrl ? '- If suggesting a meeting, include this link: ' + calendlyUrl + '\n' : '') +
      '- Return ONLY the message body, nothing else';
  }

  var userPrompt;
  if (improve) {
    userPrompt = 'Improve this ' + channel + ' follow-up to ' + contactName + (company ? ' at ' + company : '') + ':\n\n' + existingDraft;
  } else {
    userPrompt = 'Write a ' + channel + ' follow-up message to ' + contactName + (company ? ' at ' + company : '') + '.\n';
    if (eventTag) userPrompt += 'Context: We met at ' + eventTag + '.\n';
    if (notes) userPrompt += 'Notes from our conversation: ' + notes + '\n';
    userPrompt += '\nChannel: ' + channel;
  }

  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 400,
        system: system,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    var data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || JSON.stringify(data));

    var draft = (data.content && data.content[0] && data.content[0].text) || '';

    logAiUsage(supabase, {
      tenant_id: tenantId, model: model,
      input_tokens: data.usage?.input_tokens || 0,
      output_tokens: data.usage?.output_tokens || 0,
      feature: improve ? 'followup_improve' : 'followup_generate',
    });

    console.log('[generate-followup] returning: draft=' + draft.trim().length + ' sig_first=' + signatureFirst.length + ' sig_reply=' + signatureReply.length);
    return res.status(200).json({ draft: draft.trim(), signature_first: signatureFirst, signature_reply: signatureReply });
  } catch (e) {
    console.error('[generate-followup] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
