// api/vip-followup.js
// POST { contact_id, contact_name, company, tenant_id }
// → { email_body, subject, from_email, calendly_cta, email_signature }
// Loads original outreach from messages table, generates a short
// follow-up using claude-haiku-4-5.

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
  var contactId = b.contact_id;
  var contactName = b.contact_name || 'there';
  var company = b.company || '';
  var tenantId = b.tenant_id || null;

  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  if (!contactId) return res.status(400).json({ error: 'contact_id required' });

  var supabase = getSupabase();

  // Load tenant info
  var tenantName = '';
  var calendlyUrl = '';
  var signatureFirst = '';
  var signatureReply = '';
  var PLACEHOLDER_NAMES = ['my business', 'your business', 'company name', 'business name', 'your company', ''];
  if (tenantId) {
    try {
      var t = await supabase.from('tenants').select('name, brand_name, calendly_url').eq('id', tenantId).maybeSingle();
      if (t.data) {
        var bn = (t.data.brand_name || '').trim();
        var tn = (t.data.name || '').trim();
        tenantName = (bn && PLACEHOLDER_NAMES.indexOf(bn.toLowerCase()) === -1) ? bn : (tn && PLACEHOLDER_NAMES.indexOf(tn.toLowerCase()) === -1) ? tn : 'EngageWorx';
        calendlyUrl = t.data.calendly_url || '';
      }
    } catch (e) {}
    try {
      var sig = await supabase.from('chatbot_configs').select('email_signature_first, email_signature_reply').eq('tenant_id', tenantId).limit(1).maybeSingle();
      if (sig.data) { signatureFirst = sig.data.email_signature_first || ''; signatureReply = sig.data.email_signature_reply || ''; }
    } catch (e) {}
  }

  // Load original outbound message to this contact
  var originalBody = '';
  var originalSubject = '';
  var originalFromEmail = 'rob@engwx.com';
  try {
    var msgQ = supabase.from('messages').select('body, metadata')
      .eq('contact_id', contactId).eq('direction', 'outbound')
      .order('created_at', { ascending: false }).limit(1);
    if (tenantId) msgQ = msgQ.eq('tenant_id', tenantId);
    var msgR = await msgQ.maybeSingle();
    if (msgR.data) {
      originalBody = msgR.data.body || '';
      if (msgR.data.metadata && msgR.data.metadata.from_email) {
        originalFromEmail = msgR.data.metadata.from_email;
      }
    }
  } catch (e) { console.warn('[vip-followup] message load error:', e.message); }

  // Load original conversation subject
  try {
    var convQ = supabase.from('conversations').select('subject')
      .eq('contact_id', contactId).order('created_at', { ascending: false }).limit(1);
    if (tenantId) convQ = convQ.eq('tenant_id', tenantId);
    var convR = await convQ.maybeSingle();
    if (convR.data && convR.data.subject) {
      originalSubject = convR.data.subject.replace(/^(VIP Outreach: |New: )/, '');
    }
  } catch (e) {}

  var brandName = tenantName || 'EngageWorx';
  var model = 'claude-haiku-4-5';

  var system = 'You write short follow-up emails. You are Rob from ' + brandName + '.\n\n' +
    'RULES:\n' +
    '- 2-3 sentences max. Casual, not pushy.\n' +
    '- Reference the original email naturally ("I wanted to follow up on my note from last week...")\n' +
    '- NEVER repeat the full pitch or restate what ' + brandName + ' does.\n' +
    '- End with a simple question or next step.\n' +
    '- Do NOT include a Calendly link or email signature — these are appended automatically.\n' +
    '- Do NOT use placeholder brackets.\n' +
    '- Return ONLY the email body text, nothing else.';

  var userPrompt = 'Write a follow-up email to ' + contactName + (company ? ' at ' + company : '') + '.\n\n' +
    'Original email I sent:\n---\n' + (originalBody.slice(0, 500) || '(no original found)') + '\n---\n\n' +
    'They haven\'t replied yet. Write a brief, friendly follow-up.';

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
        max_tokens: 300,
        system: system,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    var data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || JSON.stringify(data));

    var emailBody = '';
    if (data.content) {
      for (var i = 0; i < data.content.length; i++) {
        if (data.content[i].type === 'text') emailBody += data.content[i].text;
      }
    }
    emailBody = emailBody.trim();

    var subject = originalSubject ? 'Re: ' + originalSubject : 'Following up';
    var calendlyCta = calendlyUrl ? 'Book a quick call: ' + calendlyUrl : '';

    logAiUsage(supabase, {
      tenant_id: tenantId, model: model,
      input_tokens: (data.usage && data.usage.input_tokens) || 0,
      output_tokens: (data.usage && data.usage.output_tokens) || 0,
      feature: 'vip_followup',
    });

    return res.status(200).json({
      email_body: emailBody,
      subject: subject,
      from_email: originalFromEmail,
      calendly_cta: calendlyCta,
      signature_first: signatureFirst,
      signature_reply: signatureReply,
    });
  } catch (e) {
    console.error('[vip-followup] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
