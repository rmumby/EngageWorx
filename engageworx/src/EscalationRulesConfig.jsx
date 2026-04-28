import AIConfigBuilder from './components/AIConfigBuilder';

/**
 * EscalationRulesConfig — AI-driven escalation rule builder.
 * Wraps AIConfigBuilder with escalation-specific schema, prompt, and save handler.
 */

var ESCALATION_SCHEMA = {
  type: 'object',
  required: ['rule_name', 'trigger_type', 'action_type'],
  properties: {
    rule_name: { type: 'string', description: 'Human-readable rule name' },
    description: { type: 'string', description: 'What this rule does' },
    trigger_type: {
      type: 'string',
      enum: ['keyword', 'sentiment', 'vip_match', 'custom'],
      description: 'Type of trigger',
    },
    trigger_config: {
      type: 'object',
      description: 'Trigger-specific config (e.g. { keywords: ["refund", "cancel"] } for keyword type)',
    },
    action_type: {
      type: 'string',
      enum: ['notify_admin', 'escalate_human', 'tag_conversation', 'create_ticket'],
      description: 'What happens when triggered',
    },
    action_config: {
      type: 'object',
      description: 'Action-specific config (e.g. { channels: ["email", "sms"] })',
    },
    priority: {
      type: 'integer',
      description: 'Priority 1-99 (1=highest). Default 10.',
    },
    active: { type: 'boolean', description: 'Whether the rule is enabled' },
  },
};

var SYSTEM_PROMPT_SLICE = [
  'FEATURE CONTEXT: Escalation Rules for an AI chatbot.',
  'These rules define when an AI chatbot should hand off a conversation to a human agent.',
  '',
  'TRIGGER TYPES:',
  '- keyword: triggers when specific words/phrases appear in customer messages',
  '- sentiment: triggers on negative customer sentiment',
  '- vip_match: triggers when the customer is tagged as VIP',
  '- custom: triggers on custom conditions (describe as a string)',
  '',
  'ACTION TYPES:',
  '- notify_admin: send notification to admin via email/SMS',
  '- escalate_human: transfer conversation to a live human agent',
  '- tag_conversation: tag the conversation for follow-up',
  '- create_ticket: create a support ticket',
  '',
  'trigger_config for keyword type should have: { keywords: ["word1", "word2"] }',
  'action_config can have: { channels: ["email", "sms"], include_conversation_link: true }',
  'priority defaults to 10 (1=highest urgency, 99=lowest).',
  'active defaults to true.',
  '',
  'GOOD ESCALATION RULES:',
  '- Are specific (not vague triggers that fire on everything)',
  '- Have sensible priority ordering (billing/legal higher than general)',
  '- Combine trigger type with useful action config',
  '',
  'When the user describes what they want, ask about:',
  '1. What situation should trigger escalation',
  '2. How urgent it is (helps set priority)',
  '3. What should happen — notify, transfer, ticket, or tag',
  '4. WHO should be notified — use type "recipient_picker" to let the user select team members.',
  '   Always use recipient_picker for notification routing. Never ask for names/emails as free text.',
].join('\n');

function escalationExampleGenerator(config) {
  var examples = [];
  if (config.trigger_type === 'keyword' && config.trigger_config && config.trigger_config.keywords) {
    var kw = config.trigger_config.keywords;
    if (kw.length > 0) {
      examples.push({ input: 'I want to ' + kw[0] + ' my account', will_trigger: true, behavior: config.action_type.replace(/_/g, ' ') });
      examples.push({ input: 'Thanks, that solved my problem!', will_trigger: false, behavior: 'Normal AI response' });
    }
    if (kw.length > 1) {
      examples.push({ input: 'This is about ' + kw[1], will_trigger: true, behavior: config.action_type.replace(/_/g, ' ') });
    }
  } else if (config.trigger_type === 'sentiment') {
    examples.push({ input: 'This is the worst service I have ever experienced!', will_trigger: true, behavior: config.action_type.replace(/_/g, ' ') });
    examples.push({ input: 'Can you help me update my address?', will_trigger: false, behavior: 'Normal AI response' });
  } else if (config.trigger_type === 'vip_match') {
    examples.push({ input: '(VIP customer) I need help with my account', will_trigger: true, behavior: config.action_type.replace(/_/g, ' ') });
    examples.push({ input: '(Regular customer) Same question', will_trigger: false, behavior: 'Normal AI response' });
  }
  if (examples.length === 0) {
    examples.push({ input: 'Example customer message', will_trigger: true, behavior: config.action_type ? config.action_type.replace(/_/g, ' ') : 'escalate' });
  }
  return examples;
}

export default function EscalationRulesConfig({
  tenantId,
  colors,
  initialConfig,
  initialNLDescription,
  onSave,
  onCancel,
}) {
  async function handleSave(nlSummary, structuredConfig) {
    if (onSave) {
      await onSave(nlSummary, structuredConfig);
    }
  }

  return (
    <AIConfigBuilder
      configType="escalation_rules"
      schema={ESCALATION_SCHEMA}
      systemPromptSlice={SYSTEM_PROMPT_SLICE}
      initialConfig={initialConfig || null}
      initialNLDescription={initialNLDescription || null}
      exampleGenerator={escalationExampleGenerator}
      onSave={handleSave}
      onCancel={onCancel}
      tenantId={tenantId}
      colors={colors}
    />
  );
}
