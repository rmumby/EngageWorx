// api/_lib/build-system-prompt.js — Layered system prompt composition
// Composes: platform base → channel rules → bot identity → business context → contact/conversation context → escalation rules

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

var SEPARATOR = '\n\n---\n\n';

async function buildSystemPrompt(opts) {
  var tenantId = opts.tenantId;
  var channel = opts.channel || null;
  var contactContext = opts.contactContext || null;
  var conversationContext = opts.conversationContext || null;

  var supabase = opts.supabase || getSupabase();
  var sections = [];

  // 1. Load platform_ai_config (latest version)
  var platform = null;
  try {
    var pRes = await supabase.from('platform_ai_config').select('*').order('version', { ascending: false }).limit(1).maybeSingle();
    if (pRes.data) platform = pRes.data;
  } catch (e) {
    console.warn('[buildSystemPrompt] platform_ai_config query error:', e.message);
  }

  // 2. Load tenant chatbot_configs
  var tenant = null;
  if (tenantId) {
    try {
      var tRes = await supabase.from('chatbot_configs').select('bot_name, system_prompt, knowledge_base').eq('tenant_id', tenantId).maybeSingle();
      if (tRes.data) tenant = tRes.data;
    } catch (e) {}
  }

  // Fallback: no platform config → use tenant.system_prompt directly
  if (!platform) {
    console.log('\u26a0\ufe0f System prompt fallback to tenant.system_prompt:', { tenantId: tenantId, reason: 'no platform config' });
    return (tenant && tenant.system_prompt) || 'You are Aria, a helpful AI assistant.';
  }

  // 3. Compose layers
  // (a) Platform base prompt
  if (platform.platform_base_prompt) {
    sections.push(platform.platform_base_prompt);
  }

  // (b) Channel-specific rules
  if (channel) {
    var channelKey = 'channel_' + channel + '_rules';
    if (platform[channelKey]) {
      sections.push(platform[channelKey]);
    }
  }

  // (c) Bot identity
  var botName = (tenant && tenant.bot_name) || 'Aria';
  sections.push('BOT IDENTITY: You are ' + botName + '.');

  // (d) Business context
  var businessInfo = tenant && tenant.knowledge_base;
  if (businessInfo) {
    sections.push('BUSINESS CONTEXT:\n' + businessInfo);
  }

  // (e) Contact context
  if (contactContext) {
    sections.push('CONTACT CONTEXT:\n' + contactContext);
  }

  // (f) Conversation context
  if (conversationContext) {
    sections.push('RECENT CONVERSATION:\n' + conversationContext);
  }

  // (g) Platform escalation rules base
  if (platform.escalation_rules_base) {
    sections.push(platform.escalation_rules_base);
  }

  // (h) Tenant-specific escalation rules
  if (tenantId) {
    try {
      var erRes = await supabase.from('escalation_rules').select('rule_name, description, trigger_type, trigger_config, action_type, action_config, priority').eq('tenant_id', tenantId).eq('active', true).order('priority', { ascending: true });
      if (erRes.data && erRes.data.length > 0) {
        var ruleLines = erRes.data.map(function(r) {
          var trigger = r.trigger_type;
          if (r.trigger_type === 'keyword' && r.trigger_config && r.trigger_config.keywords) trigger = 'keywords: ' + r.trigger_config.keywords.join(', ');
          else if (r.trigger_type === 'sentiment') trigger = 'negative sentiment detected';
          else if (r.trigger_type === 'vip_match') trigger = 'contact is a VIP';
          var action = r.action_type.replace(/_/g, ' ');
          return '- ' + r.rule_name + (r.description ? ' (' + r.description + ')' : '') + '. Trigger: ' + trigger + '. Action: ' + action + '.';
        });
        sections.push('TENANT ESCALATION RULES:\nIn addition to platform defaults, this tenant has configured the following escalation rules. When any of these triggers are detected in the conversation, apply the corresponding action and notify appropriately.\n' + ruleLines.join('\n'));
        console.log('\ud83c\udfaf Escalation rules loaded for prompt:', { tenantId: tenantId, ruleCount: erRes.data.length, priorityMin: erRes.data[0].priority });
      }
    } catch (e) { console.warn('[buildSystemPrompt] escalation_rules query error:', e.message); }
  }

  var prompt = sections.join(SEPARATOR);
  console.log('\ud83d\udfe3 System prompt composed:', { tenantId: tenantId, channel: channel, length: prompt.length, sections: sections.length });
  return prompt;
}

module.exports = { buildSystemPrompt: buildSystemPrompt };
