// /api/_aiReply.js — Shared Claude AI reply helper
// Used by sms.js, whatsapp webhook, email-inbound.js

async function getAIReply(message, systemPrompt, maxTokens) {
  var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) throw new Error('No Anthropic API key configured');

  var response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: maxTokens || 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    }),
  });

  if (!response.ok) {
    var errData = await response.json();
    throw new Error('Claude API error: ' + (errData.error?.message || response.status));
  }

  var data = await response.json();
  return data.content && data.content[0] && data.content[0].text
    ? data.content[0].text.trim()
    : null;
}

async function getTenantAIConfig(supabase, tenantId) {
  try {
    var tenantResult = await supabase
      .from('tenants')
      .select('name, industry')
      .eq('id', tenantId)
      .single();

    var chatbotResult = await supabase
      .from('chatbot_configs')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    var tenant = tenantResult.data;
    var chatbot = chatbotResult.data;

    return {
      businessName: tenant?.name || 'EngageWorx',
      industry: tenant?.industry || 'communications',
      systemPrompt: chatbot?.system_prompt || ('You are ' + (chatbot?.agent_name || 'Aria') + ', the AI assistant for ' + (tenant?.name || 'EngageWorx') + '. Be helpful and concise.'),
      personality: chatbot?.personality_preset || 'friendly and professional',
      fallbackMessage: chatbot?.fallback_message || 'Thanks for reaching out! Our team will be in touch shortly.',
      channelsActive: chatbot?.channels_active || ['sms', 'whatsapp', 'email'],
      maxTokens: 160, // SMS safe default
    };
  } catch (e) {
    console.warn('[AI] Tenant config lookup failed:', e.message);
    return {
      businessName: 'EngageWorx',
      systemPrompt: 'You are Aria, the AI assistant for EngageWorx. Keep replies under 160 characters. Be helpful and concise. Plans: Starter $99/mo, Growth $249/mo, Pro $499/mo. Website: engwx.com. Phone: +1 (786) 982-7800.',
      fallbackMessage: 'Thanks for reaching out! Visit engwx.com or call +1 (786) 982-7800.',
      channelsActive: ['sms', 'whatsapp', 'email'],
      maxTokens: 160,
    };
  }
}

module.exports = { getAIReply, getTenantAIConfig };
