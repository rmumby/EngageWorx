// api/ai-config-builder.js — AI Config Builder endpoint
// POST /api/ai-config-builder
// Body: { tenant_id, config_type, messages, system_prompt_slice, schema, session_id? }
// Returns: { response, session_id }
//
// Non-streaming: needs complete response for schema validation.
// Auth: JWT + tenant membership. Rate-limited same as ai-stream.

var { createClient } = require('@supabase/supabase-js');

var CLAUDE_MODEL = 'claude-sonnet-4-20250514';
var MAX_TOKENS = 4096;

// ── Rate limiter (shared shape with ai-stream) ──────────────────────
var RATE_LIMIT_MAX = 30;
var RATE_LIMIT_WINDOW_MS = 60 * 1000;
var rateBuckets = {};

function checkRateLimit(tenantId) {
  var now = Date.now();
  var bucket = rateBuckets[tenantId];
  if (!bucket) { rateBuckets[tenantId] = { count: 1, windowStart: now }; return true; }
  if (now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) { bucket.count = 1; bucket.windowStart = now; return true; }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count++;
  return true;
}
setInterval(function () {
  var now = Date.now();
  Object.keys(rateBuckets).forEach(function (k) {
    if (now - rateBuckets[k].windowStart > RATE_LIMIT_WINDOW_MS * 2) delete rateBuckets[k];
  });
}, RATE_LIMIT_WINDOW_MS * 2);

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ── Shell system prompt ─────────────────────────────────────────────
var SHELL_PROMPT = [
  'You are an AI configuration assistant. You help users build structured configurations through natural conversation.',
  '',
  'CONVERSATION FLOW:',
  '1. Ask clarifying questions to understand what the user wants (type: "question")',
  '2. When you have enough info, propose expanded options (type: "expansion")',
  '3. When the user confirms, propose a final structured config (type: "proposal")',
  '4. When the user approves the proposal, output the final config (type: "final")',
  '',
  'RESPONSE FORMAT — you MUST respond with valid JSON matching this structure:',
  '{',
  '  "type": "question" | "expansion" | "recipient_picker" | "proposal" | "final",',
  '  "text": "Your conversational message to the user",',
  '  "options": ["option1", "option2", ...],  // only for type "expansion"',
  '  "config": { ... },  // structured config — required for "proposal" and "final"',
  '  "examples": [{"input": "...", "will_trigger": true/false, "behavior": "..."}],  // for "proposal" and "final"',
  '  "nl_summary": "One-sentence plain-English summary of what this config does"  // for "final" only',
  '}',
  '',
  'RULES:',
  '- Always respond with ONLY the JSON object, no markdown fences, no extra text.',
  '- For "question" type: just text + type. Ask ONE focused question at a time.',
  '- For "expansion" type: include options array with 3-6 concrete choices.',
  '- For "recipient_picker" type: use when the config needs a notification target (who to notify).',
  '  Just return type + text. The UI will render a team member picker automatically.',
  '  Use this AFTER the user describes what should trigger, BEFORE building the final proposal.',
  '- For "proposal" type: include full config object + examples array (3-5 examples).',
  '- For "final" type: include config, examples, and nl_summary. This is the saved version.',
  '- The config object MUST match the provided schema exactly.',
  '',
  'HANDLING "START OVER" / "CHANGE MY MIND":',
  '- If the user says "start over", "scrap that", "reset", "from scratch", "never mind let me restart", or similar:',
  '  respond with type "question" and a fresh opening question as if the conversation just started.',
  '  Do NOT reference the previous draft. Treat it as a clean slate.',
  '- If the user wants to change ONE aspect of an existing proposal, refine it — don\'t restart.',
  '',
].join('\n');

// ── Validate config against schema (basic structural check) ─────────
function validateConfig(config, schema) {
  if (!config || typeof config !== 'object') return { valid: false, error: 'config is not an object' };
  if (!schema || !schema.properties) return { valid: true }; // no schema to validate against

  var errors = [];
  var required = schema.required || [];
  for (var i = 0; i < required.length; i++) {
    if (config[required[i]] === undefined || config[required[i]] === null) {
      errors.push('missing required field: ' + required[i]);
    }
  }

  var props = Object.keys(schema.properties);
  for (var j = 0; j < props.length; j++) {
    var key = props[j];
    var propSchema = schema.properties[key];
    var val = config[key];
    if (val === undefined) continue;

    if (propSchema.type === 'string' && typeof val !== 'string') errors.push(key + ' must be string');
    if (propSchema.type === 'number' && typeof val !== 'number') errors.push(key + ' must be number');
    if (propSchema.type === 'integer' && (typeof val !== 'number' || val % 1 !== 0)) errors.push(key + ' must be integer');
    if (propSchema.type === 'boolean' && typeof val !== 'boolean') errors.push(key + ' must be boolean');
    if (propSchema.type === 'array' && !Array.isArray(val)) errors.push(key + ' must be array');
    if (propSchema.type === 'object' && (typeof val !== 'object' || Array.isArray(val))) errors.push(key + ' must be object');
    if (propSchema.enum && propSchema.enum.indexOf(val) === -1) errors.push(key + ' must be one of: ' + propSchema.enum.join(', '));
  }

  return errors.length > 0 ? { valid: false, error: errors.join('; ') } : { valid: true };
}

// ── Call Claude (non-streaming) ─────────────────────────────────────
async function callClaude(systemPrompt, messages, apiKey) {
  var res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: messages,
    }),
  });

  if (!res.ok) {
    var errBody;
    try { errBody = await res.json(); } catch (_) { errBody = {}; }
    throw new Error('Claude API error (' + res.status + '): ' + (errBody.error?.message || ''));
  }

  var data = await res.json();
  var text = (data.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('\n')
    .trim();

  return { text: text, usage: data.usage };
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // ── Auth ────────────────────────────────────────────────────────────
  var authHeader = req.headers.authorization || '';
  var jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return res.status(401).json({ error: 'Authorization required' });

  var supabase = getSupabase();
  var { data: userData, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !userData || !userData.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  var userId = userData.user.id;

  // ── Body ────────────────────────────────────────────────────────────
  var body = req.body || {};
  var tenantId = body.tenant_id;
  var configType = body.config_type;
  var messages = body.messages;
  var systemPromptSlice = body.system_prompt_slice || '';
  var schema = body.schema || null;
  var sessionId = body.session_id || null;

  if (!tenantId) return res.status(400).json({ error: 'tenant_id is required' });
  if (!configType) return res.status(400).json({ error: 'config_type is required' });
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  // ── Tenant membership ──────────────────────────────────────────────
  var { data: membership } = await supabase
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership) {
    console.log('[ai-config-builder] tenant access denied', { userId, tenantId });
    return res.status(403).json({ error: 'Access denied' });
  }

  // ── Rate limit ─────────────────────────────────────────────────────
  if (!checkRateLimit(tenantId)) {
    return res.status(429).json({ error: 'Rate limit exceeded — try again in a moment' });
  }

  // ── API key ────────────────────────────────────────────────────────
  var apiKey = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AI service not configured' });

  // ── Build system prompt ────────────────────────────────────────────
  var schemaBlock = schema
    ? '\n\nCONFIG SCHEMA (your config object MUST match this):\n' + JSON.stringify(schema, null, 2)
    : '';
  var fullSystemPrompt = SHELL_PROMPT + '\n' + systemPromptSlice + schemaBlock;

  // ── Log ────────────────────────────────────────────────────────────
  console.log('[ai-config-builder]', {
    tenant_id: tenantId,
    user_id: userId,
    config_type: configType,
    message_count: messages.length,
    session_id: sessionId,
  });

  // ── Call Claude ────────────────────────────────────────────────────
  var claudeMessages = messages.map(function (m) {
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content };
  });

  var result;
  try {
    result = await callClaude(fullSystemPrompt, claudeMessages, apiKey);
  } catch (err) {
    console.error('[ai-config-builder] Claude error', { tenant_id: tenantId, error: err.message });
    return res.status(502).json({ error: 'AI service error' });
  }

  // ── Parse response JSON ────────────────────────────────────────────
  var parsed;
  try {
    // Strip markdown fences if present
    var clean = result.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    parsed = JSON.parse(clean);
  } catch (parseErr) {
    console.error('[ai-config-builder] JSON parse failed', { tenant_id: tenantId, raw: result.text.slice(0, 500) });
    return res.status(200).json({
      response: { type: 'question', text: 'I had trouble formatting my response. Could you rephrase what you want?' },
      session_id: sessionId,
    });
  }

  // ── Validate config against schema (for proposal/final) ────────────
  if ((parsed.type === 'proposal' || parsed.type === 'final') && parsed.config && schema) {
    var validation = validateConfig(parsed.config, schema);
    if (!validation.valid) {
      console.log('[ai-config-builder] schema validation failed, retrying', {
        tenant_id: tenantId, error: validation.error,
      });

      // Retry once with correction instruction
      var retryMessages = claudeMessages.concat([
        { role: 'assistant', content: result.text },
        { role: 'user', content: 'Your config object has schema errors: ' + validation.error + '. Please fix and respond again with valid JSON.' },
      ]);

      try {
        var retryResult = await callClaude(fullSystemPrompt, retryMessages, apiKey);
        var retryClean = retryResult.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        var retryParsed = JSON.parse(retryClean);
        var retryValidation = validateConfig(retryParsed.config, schema);
        if (retryValidation.valid) {
          parsed = retryParsed;
        }
        // If still invalid, return the original parsed (best effort)
      } catch (retryErr) {
        // Return original parsed on retry failure
        console.error('[ai-config-builder] retry failed', { tenant_id: tenantId });
      }
    }
  }

  // ── Log session to ai_config_sessions ──────────────────────────────
  try {
    if (!sessionId) {
      // Create new session
      var { data: newSession } = await supabase
        .from('ai_config_sessions')
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          config_type: configType,
          status: parsed.type === 'final' ? 'completed' : 'in_progress',
          turn_count: messages.length,
          final_config: parsed.type === 'final' ? parsed.config : null,
          nl_summary: parsed.type === 'final' ? parsed.nl_summary : null,
        })
        .select('id')
        .single();
      if (newSession) sessionId = newSession.id;
    } else {
      // Update existing session
      var updatePayload = {
        turn_count: messages.length,
        status: parsed.type === 'final' ? 'completed' : 'in_progress',
      };
      if (parsed.type === 'final') {
        updatePayload.final_config = parsed.config;
        updatePayload.nl_summary = parsed.nl_summary;
      }
      await supabase
        .from('ai_config_sessions')
        .update(updatePayload)
        .eq('id', sessionId);
    }
  } catch (logErr) {
    // Non-fatal — don't fail the request if session logging fails
    console.warn('[ai-config-builder] session log error', { tenant_id: tenantId, error: logErr.message });
  }

  return res.status(200).json({
    response: parsed,
    session_id: sessionId,
    usage: result.usage,
  });
};
