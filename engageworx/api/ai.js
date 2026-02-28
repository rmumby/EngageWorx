// /api/ai.js — Single Vercel Serverless Function for AI operations
// POST /api/ai?action=respond   → Generate AI response to inbound message
// POST /api/ai?action=classify  → Classify intent of a message
// POST /api/ai?action=test      → Test AI is working

const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const action = req.query.action || 'respond';

  // ─── Call Claude API ──────────────────────────────────────────────
  async function callClaude(systemPrompt, userMessage, maxTokens = 500) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { ok: false, status: response.status, error: data.error?.message || 'Claude API error' };
    }

    const text = data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    return {
      ok: true,
      text,
      model: data.model,
      usage: data.usage,
    };
  }

  // ─── TEST ─────────────────────────────────────────────────────────
  if (action === 'test') {
    const result = await callClaude(
      'You are a helpful assistant. Respond in one short sentence.',
      'Say "EngageWorx AI is online!" and nothing else.'
    );

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(200).json({
      success: true,
      message: result.text,
      model: result.model,
      usage: result.usage,
    });
  }

  // ─── CLASSIFY INTENT ──────────────────────────────────────────────
  if (action === 'classify') {
    const { message, tenantContext } = req.body;
    if (!message) return res.status(400).json({ error: 'Missing "message"' });

    const systemPrompt = `You are an intent classifier for a business messaging platform. Classify the customer's message into exactly ONE of these intents:

- order_status: Asking about an order, shipment, delivery, or tracking
- appointment: Scheduling, rescheduling, or canceling an appointment
- billing: Payment, invoice, refund, or pricing questions
- support: Technical help, troubleshooting, or product issues
- complaint: Expressing dissatisfaction or filing a complaint
- info_request: General questions about products, services, or hours
- greeting: Hello, hi, good morning, etc.
- thank_you: Expressing gratitude
- escalate: Requesting to speak with a human/manager
- other: Doesn't fit any category above

Respond with ONLY a JSON object, no markdown:
{"intent": "the_intent", "confidence": 0.0-1.0, "summary": "brief 5-word summary"}`;

    const result = await callClaude(systemPrompt, message, 100);

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    try {
      const parsed = JSON.parse(result.text.replace(/```json\n?|```/g, '').trim());
      return res.status(200).json({ success: true, ...parsed, usage: result.usage });
    } catch (e) {
      return res.status(200).json({ success: true, intent: 'other', confidence: 0.5, raw: result.text });
    }
  }

  // ─── RESPOND TO MESSAGE ───────────────────────────────────────────
  if (action === 'respond') {
    const {
      message,
      conversationHistory,
      tenantConfig,
      contactInfo,
    } = req.body;

    if (!message) return res.status(400).json({ error: 'Missing "message"' });

    // Build tenant-specific system prompt
    const config = tenantConfig || {};
    const businessName = config.businessName || 'our business';
    const personality = config.personality || 'friendly and professional';
    const industry = config.industry || 'general business';
    const knowledgeBase = config.knowledgeBase || '';
    const escalationRules = config.escalationRules || 'Escalate if the customer explicitly asks for a human, is very upset, or if you cannot answer their question.';
    const maxResponseLength = config.maxResponseLength || 160;

    const systemPrompt = `You are an AI customer service agent for ${businessName}. You communicate via SMS.

PERSONALITY: ${personality}
INDUSTRY: ${industry}

RULES:
- Keep responses under ${maxResponseLength} characters (SMS limit)
- Be concise but warm
- Never make up information you don't have
- If you can't help, say so honestly
- Do NOT include "Reply STOP to opt out" — the system adds that automatically
- Use plain text only, no markdown or formatting
- If the customer seems upset or asks for a human, set escalate to true

${knowledgeBase ? `KNOWLEDGE BASE:\n${knowledgeBase}\n` : ''}
ESCALATION RULES: ${escalationRules}

${contactInfo ? `CUSTOMER INFO: Name: ${contactInfo.name || 'Unknown'}, Previous interactions: ${contactInfo.previousInteractions || 0}` : ''}

Respond with ONLY a JSON object, no markdown:
{"response": "your SMS response text", "intent": "detected_intent", "escalate": false, "sentiment": "positive|neutral|negative"}`;

    // Build messages array with conversation history
    const messages = [];
    if (conversationHistory && Array.isArray(conversationHistory)) {
      conversationHistory.slice(-10).forEach(msg => {
        messages.push({
          role: msg.direction === 'inbound' ? 'user' : 'assistant',
          content: msg.body || msg.content || '',
        });
      });
    }
    messages.push({ role: 'user', content: message });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 300,
        system: systemPrompt,
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Claude API error' });
    }

    const text = data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    try {
      const parsed = JSON.parse(text.replace(/```json\n?|```/g, '').trim());
      return res.status(200).json({
        success: true,
        response: parsed.response,
        intent: parsed.intent,
        escalate: parsed.escalate || false,
        sentiment: parsed.sentiment || 'neutral',
        model: data.model,
        usage: data.usage,
      });
    } catch (e) {
      // If JSON parse fails, return raw text as response
      return res.status(200).json({
        success: true,
        response: text.slice(0, maxResponseLength),
        intent: 'unknown',
        escalate: false,
        sentiment: 'neutral',
        model: data.model,
        usage: data.usage,
      });
    }
  }

  return res.status(400).json({ error: 'Invalid action. Use ?action=respond|classify|test' });
};
