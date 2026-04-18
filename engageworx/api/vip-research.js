// api/vip-research.js
// POST { contact_name, title, company, email, notes, tenant_id }
// → { research, email_body, sms_body, subject }
// Uses claude-sonnet-4-6 with web_search tool to research the company,
// then generates hyper-personalized email + SMS.

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
  var title = b.title || '';
  var company = b.company || '';
  var email = b.email || '';
  var notes = b.notes || '';
  var tenantId = b.tenant_id || null;

  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  if (!company && !email) return res.status(400).json({ error: 'Company or email required for research' });

  var supabase = getSupabase();

  var tenantName = '';
  var calendlyUrl = '';
  if (tenantId) {
    try {
      var t = await supabase.from('tenants').select('name, brand_name, calendly_url').eq('id', tenantId).maybeSingle();
      if (t.data) {
        tenantName = t.data.brand_name || t.data.name || '';
        calendlyUrl = t.data.calendly_url || '';
      }
    } catch (e) {}
  }

  var model = 'claude-sonnet-4-6';
  var searchQuery = company || (email ? email.split('@')[1] : '');

  var system = 'You are a sales outreach specialist for ' + (tenantName || 'EngageWorx') + ', an AI-powered multi-channel communications platform.\n\n' +
    'Your task has two parts:\n' +
    '1. RESEARCH: Use the web_search tool to find information about the contact\'s company. Look for what they do, their industry, recent news, size, and anything relevant.\n' +
    '2. WRITE: Based on the research, write a hyper-personalized outreach email AND a 160-character SMS version.\n\n' +
    'TONE RULES:\n' +
    '- Warm, specific, non-generic. Reference something REAL about their company.\n' +
    '- No "I hope this finds you well" or generic filler.\n' +
    '- Show you understand their business and why ' + (tenantName || 'EngageWorx') + ' is relevant to them.\n' +
    '- Keep email to 3-4 short paragraphs max.\n' +
    '- End with a clear next step.\n' +
    (calendlyUrl ? '- If suggesting a meeting, include this link: ' + calendlyUrl + '\n' : '') +
    '- Never use brackets like [Your Name] — write as Rob from ' + (tenantName || 'EngageWorx') + '.\n\n' +
    'Return your response in this exact format:\n' +
    'RESEARCH:\n[2-3 sentence summary of what you found about the company]\n\n' +
    'SUBJECT:\n[email subject line]\n\n' +
    'EMAIL:\n[full email body]\n\n' +
    'SMS:\n[160 char max SMS version]';

  var userPrompt = 'Research and write personalized outreach to:\n' +
    '- Name: ' + contactName + '\n' +
    (title ? '- Title: ' + title + '\n' : '') +
    '- Company: ' + (company || 'unknown') + '\n' +
    (email ? '- Email: ' + email + '\n' : '') +
    (notes ? '- Notes: ' + notes + '\n' : '') +
    '\nFirst search for information about ' + searchQuery + ', then write the outreach.';

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
        max_tokens: 1024,
        system: system,
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 3,
        }],
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    var data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || JSON.stringify(data));

    // Extract text from content blocks
    var fullText = '';
    if (data.content) {
      for (var block of data.content) {
        if (block.type === 'text') fullText += block.text;
      }
    }

    // Parse the structured response
    var research = '';
    var subject = '';
    var emailBody = '';
    var smsBody = '';

    var researchMatch = fullText.match(/RESEARCH:\s*([\s\S]*?)(?=\nSUBJECT:)/i);
    if (researchMatch) research = researchMatch[1].trim();

    var subjectMatch = fullText.match(/SUBJECT:\s*([\s\S]*?)(?=\nEMAIL:)/i);
    if (subjectMatch) subject = subjectMatch[1].trim();

    var emailMatch = fullText.match(/EMAIL:\s*([\s\S]*?)(?=\nSMS:)/i);
    if (emailMatch) emailBody = emailMatch[1].trim();

    var smsMatch = fullText.match(/SMS:\s*([\s\S]*?)$/i);
    if (smsMatch) smsBody = smsMatch[1].trim();

    // Fallback: if parsing failed, use the whole text
    if (!emailBody && !smsBody) {
      emailBody = fullText;
      smsBody = fullText.slice(0, 160);
    }

    logAiUsage(supabase, {
      tenant_id: tenantId, model: model,
      input_tokens: data.usage?.input_tokens || 0,
      output_tokens: data.usage?.output_tokens || 0,
      feature: 'vip_research',
    });

    return res.status(200).json({
      research: research,
      subject: subject,
      email_body: emailBody,
      sms_body: smsBody,
    });
  } catch (e) {
    console.error('[vip-research] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
