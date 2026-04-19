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
  var context = b.context || '';
  var tenantId = b.tenant_id || null;

  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  if (!company && !email) return res.status(400).json({ error: 'Company or email required for research' });

  var supabase = getSupabase();

  var tenantName = '';
  var calendlyUrl = '';
  var emailSignature = '';
  if (tenantId) {
    try {
      var t = await supabase.from('tenants').select('name, brand_name, calendly_url').eq('id', tenantId).maybeSingle();
      if (t.data) {
        tenantName = t.data.brand_name || t.data.name || '';
        calendlyUrl = t.data.calendly_url || '';
      }
    } catch (e) {}
    try {
      var sig = await supabase.from('chatbot_configs').select('email_signature_first').eq('tenant_id', tenantId).limit(1).maybeSingle();
      console.log('[vip-research] signature query result:', sig.data ? 'found' : 'null', sig.error ? 'err:' + sig.error.message : 'no-err');
      if (sig.data && sig.data.email_signature_first) {
        emailSignature = sig.data.email_signature_first;
      }
    } catch (e) { console.warn('[vip-research] signature load error:', e.message); }
  }

  var model = 'claude-sonnet-4-6';
  var searchQuery = company || (email ? email.split('@')[1] : '');

  var brandName = tenantName || 'EngageWorx';
  var system = 'You are a sales outreach specialist for ' + brandName + ', an AI-powered multi-channel communications platform.\n' +
    'You are writing on behalf of ' + brandName + '. Always refer to the company as "' + brandName + '", never as "My Business", "our company", or any placeholder text.\n\n' +
    'Your task has two parts:\n' +
    '1. RESEARCH: Use the web_search tool to find information about the contact\'s company. Look for what they do, their industry, recent news, size, and anything relevant.\n' +
    '2. WRITE: Based on the research, write a hyper-personalized outreach email AND a 160-character SMS version.\n\n' +
    'TONE RULES:\n' +
    '- Warm, specific, non-generic. Reference something REAL about their company.\n' +
    '- No "I hope this finds you well" or generic filler.\n' +
    '- Show you understand their business and why ' + brandName + ' is relevant to them.\n' +
    '- Keep email to 3-4 short paragraphs max.\n' +
    '- End with a clear next step (e.g. suggest a quick call).\n' +
    '- NEVER use placeholder brackets like [Your Name], [Calendly Link], [Company], etc.\n' +
    '- Write as Rob from ' + brandName + '.\n' +
    '- Do NOT include a Calendly link, booking URL, or email signature — these are appended automatically after your output.\n\n' +
    'Return your response in this exact format:\n' +
    'RESEARCH:\n[2-3 sentence summary of what you found about the company]\n\n' +
    'SUBJECT:\n[email subject line]\n\n' +
    'EMAIL:\n[full email body — no signature, no booking link]\n\n' +
    'SMS:\n[160 char max SMS version]';

  var userPrompt = 'Research and write personalized outreach to:\n' +
    '- Name: ' + contactName + '\n' +
    (title ? '- Title: ' + title + '\n' : '') +
    '- Company: ' + (company || 'unknown') + '\n' +
    (email ? '- Email: ' + email + '\n' : '') +
    (notes ? '- Notes: ' + notes + '\n' : '') +
    (context ? '\nAdditional context from Rob: ' + context + '\n' : '') +
    '\nFirst search for information about "' + searchQuery + '", then write the outreach.';

  try {
    var apiBody = {
      model: model,
      max_tokens: 4096,
      system: system,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{ role: 'user', content: userPrompt }],
    };

    console.log('[vip-research] calling Claude with web_search for:', searchQuery);

    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(apiBody),
    });

    var data = await r.json();
    console.log('[vip-research] status:', r.status, 'stop_reason:', data.stop_reason, 'content_blocks:', (data.content || []).length);

    if (!r.ok) {
      console.error('[vip-research] API error:', JSON.stringify(data));
      throw new Error(data.error?.message || JSON.stringify(data));
    }

    // Extract ALL text from content blocks (skip tool_use, web_search_tool_result, etc.)
    var fullText = '';
    var totalInput = (data.usage && data.usage.input_tokens) || 0;
    var totalOutput = (data.usage && data.usage.output_tokens) || 0;

    if (data.content && data.content.length > 0) {
      for (var i = 0; i < data.content.length; i++) {
        var block = data.content[i];
        console.log('[vip-research] block[' + i + '] type=' + block.type + (block.type === 'text' ? ' len=' + (block.text || '').length : ''));
        if (block.type === 'text' && block.text) {
          fullText += block.text + '\n';
        }
      }
    }

    fullText = fullText.trim();
    console.log('[vip-research] fullText length:', fullText.length, 'preview:', fullText.slice(0, 200));

    // Parse the structured response
    var research = '';
    var subject = '';
    var emailBody = '';
    var smsBody = '';

    // Try multiple regex patterns — Claude sometimes uses ** markdown or slightly different formatting
    var researchMatch = fullText.match(/RESEARCH:\s*\n?([\s\S]*?)(?=\n\s*SUBJECT:)/i)
      || fullText.match(/\*\*RESEARCH:?\*\*\s*\n?([\s\S]*?)(?=\n\s*\*?\*?SUBJECT)/i);
    if (researchMatch) research = researchMatch[1].trim();

    var subjectMatch = fullText.match(/SUBJECT:\s*\n?([\s\S]*?)(?=\n\s*EMAIL:)/i)
      || fullText.match(/\*\*SUBJECT:?\*\*\s*\n?([\s\S]*?)(?=\n\s*\*?\*?EMAIL)/i);
    if (subjectMatch) subject = subjectMatch[1].trim();

    var emailMatch = fullText.match(/EMAIL:\s*\n?([\s\S]*?)(?=\n\s*SMS:)/i)
      || fullText.match(/\*\*EMAIL:?\*\*\s*\n?([\s\S]*?)(?=\n\s*\*?\*?SMS)/i);
    if (emailMatch) emailBody = emailMatch[1].trim();

    var smsMatch = fullText.match(/SMS:\s*\n?([\s\S]*?)$/i)
      || fullText.match(/\*\*SMS:?\*\*\s*\n?([\s\S]*?)$/i);
    if (smsMatch) smsBody = smsMatch[1].trim();

    console.log('[vip-research] parsed: research=' + research.length + ' subject=' + subject.length + ' email=' + emailBody.length + ' sms=' + smsBody.length);

    // Fallback: if parsing failed, use the whole text
    if (!emailBody && fullText.length > 0) {
      console.log('[vip-research] section parsing failed, using raw text as fallback');
      // Try to at least split research from the rest
      var firstParagraph = fullText.split('\n\n')[0] || '';
      research = research || firstParagraph;
      emailBody = fullText;
      subject = subject || ('Intro from ' + (tenantName || 'EngageWorx'));
      smsBody = smsBody || fullText.replace(/\n/g, ' ').slice(0, 160);
    }

    if (!emailBody && fullText.length === 0) {
      console.warn('[vip-research] no text content in response at all');
      return res.status(200).json({
        research: 'Research completed but no content was generated. Try again.',
        subject: '',
        email_body: '',
        sms_body: '',
        _debug: { stop_reason: data.stop_reason, block_count: (data.content || []).length, block_types: (data.content || []).map(function(b) { return b.type; }) },
      });
    }

    // Build Calendly CTA line (plain text)
    var calendlyCta = calendlyUrl ? 'Book a quick call: ' + calendlyUrl : '';

    logAiUsage(supabase, {
      tenant_id: tenantId, model: model,
      input_tokens: totalInput, output_tokens: totalOutput,
      feature: 'vip_research',
    });

    console.log('[vip-research] returning: email=' + emailBody.length + ' calendly=' + calendlyCta.length + ' sig=' + emailSignature.length);

    return res.status(200).json({
      research: research,
      subject: subject,
      email_body: emailBody,
      sms_body: smsBody,
      calendly_cta: calendlyCta,
      email_signature: emailSignature,
    });
  } catch (e) {
    console.error('[vip-research] error:', e.message, e.stack);
    return res.status(500).json({ error: e.message });
  }
};
