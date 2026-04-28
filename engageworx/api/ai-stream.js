// api/ai-stream.js — Streaming Claude AI endpoint (SSE)
// POST /api/ai-stream
// Body: { tenant_id, messages: [{ role, content }], system?, max_tokens? }
// Returns: Server-Sent Events stream
//
// Auth: requires Authorization header with Supabase JWT
// Tenant isolation: every request must include tenant_id, verified against JWT

var { createClient } = require('@supabase/supabase-js');

var CLAUDE_MODEL = 'claude-sonnet-4-20250514';
var MAX_TOKENS_DEFAULT = 1024;
var MAX_TOKENS_LIMIT = 4096;

// ── In-memory rate limiter (30 requests / 60s per tenant) ─────────────
var RATE_LIMIT_MAX = 30;
var RATE_LIMIT_WINDOW_MS = 60 * 1000;
var rateBuckets = {};

function checkRateLimit(tenantId) {
  var now = Date.now();
  var bucket = rateBuckets[tenantId];
  if (!bucket) {
    rateBuckets[tenantId] = { count: 1, windowStart: now };
    return true;
  }
  if (now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    // Window expired — reset
    bucket.count = 1;
    bucket.windowStart = now;
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    return false;
  }
  bucket.count++;
  return true;
}

// Periodically prune stale buckets to prevent memory leak
setInterval(function () {
  var now = Date.now();
  var keys = Object.keys(rateBuckets);
  for (var i = 0; i < keys.length; i++) {
    if (now - rateBuckets[keys[i]].windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      delete rateBuckets[keys[i]];
    }
  }
}, RATE_LIMIT_WINDOW_MS * 2);

function getServiceSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function getUserSupabase(jwt) {
  var client = createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  );
  // Override the auth header with the user's JWT
  client.auth.getSession = async function () {
    return { data: { session: { access_token: jwt } }, error: null };
  };
  return client;
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // ── Auth check ──────────────────────────────────────────────────────
  var authHeader = req.headers.authorization || '';
  var jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  // Verify JWT and get user
  var supabase = getServiceSupabase();
  var { data: userData, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !userData || !userData.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  var userId = userData.user.id;

  // ── Validate request body ──────────────────────────────────────────
  var body = req.body || {};
  var tenantId = body.tenant_id;
  var messages = body.messages;
  var systemPrompt = body.system || '';
  var maxTokens = Math.min(body.max_tokens || MAX_TOKENS_DEFAULT, MAX_TOKENS_LIMIT);

  if (!tenantId) {
    return res.status(400).json({ error: 'tenant_id is required' });
  }
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required and must not be empty' });
  }

  // ── Tenant ownership check ─────────────────────────────────────────
  var { data: membership, error: memberError } = await supabase
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (memberError || !membership) {
    console.log('[ai-stream] tenant access denied', { userId, tenantId });
    return res.status(403).json({ error: 'Access denied — not a member of this tenant' });
  }

  // ── Rate limit (30 req/min per tenant) ─────────────────────────────
  if (!checkRateLimit(tenantId)) {
    console.log('[ai-stream] rate limited', { tenant_id: tenantId, user_id: userId });
    return res.status(429).json({ error: 'Rate limit exceeded — max ' + RATE_LIMIT_MAX + ' requests per minute. Try again shortly.' });
  }

  // ── Anthropic API key ──────────────────────────────────────────────
  var apiKey = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[ai-stream] ANTHROPIC_API_KEY not configured');
    return res.status(500).json({ error: 'AI service not configured' });
  }

  // ── Log the request (per CLAUDE.md — log tenant_id on every call) ──
  console.log('[ai-stream]', {
    tenant_id: tenantId,
    user_id: userId,
    message_count: messages.length,
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
  });

  // ── Call Anthropic streaming API ───────────────────────────────────
  var anthropicBody = {
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    stream: true,
    messages: messages.map(function (m) {
      return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content };
    }),
  };
  if (systemPrompt) {
    anthropicBody.system = systemPrompt;
  }

  var anthropicRes;
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(anthropicBody),
    });
  } catch (fetchErr) {
    console.error('[ai-stream] fetch error', { tenant_id: tenantId, error: fetchErr.message });
    return res.status(502).json({ error: 'Failed to connect to AI service' });
  }

  if (!anthropicRes.ok) {
    var errBody;
    try { errBody = await anthropicRes.text(); } catch (_) { errBody = ''; }
    console.error('[ai-stream] API error', { tenant_id: tenantId, status: anthropicRes.status, body: errBody });
    return res.status(anthropicRes.status >= 500 ? 502 : anthropicRes.status).json({
      error: 'AI service error (' + anthropicRes.status + ')',
    });
  }

  // ── Stream SSE back to client ─────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  var reader = anthropicRes.body.getReader();
  var decoder = new TextDecoder();
  var buffer = '';

  try {
    while (true) {
      var { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines from buffer
      var lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line in buffer

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.startsWith('data: ')) continue;
        var payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;

        try {
          var event = JSON.parse(payload);

          if (event.type === 'content_block_delta' && event.delta && event.delta.type === 'text_delta') {
            // Forward text deltas to client
            res.write('data: ' + JSON.stringify({ type: 'delta', text: event.delta.text }) + '\n\n');
          } else if (event.type === 'message_stop') {
            res.write('data: ' + JSON.stringify({ type: 'done' }) + '\n\n');
          } else if (event.type === 'error') {
            res.write('data: ' + JSON.stringify({ type: 'error', error: event.error?.message || 'Stream error' }) + '\n\n');
          }
          // Ignore other event types (message_start, content_block_start, etc.)
        } catch (parseErr) {
          // Skip unparseable lines
        }
      }
    }
  } catch (streamErr) {
    console.error('[ai-stream] stream error', { tenant_id: tenantId, error: streamErr.message });
    try {
      res.write('data: ' + JSON.stringify({ type: 'error', error: 'Stream interrupted' }) + '\n\n');
    } catch (_) {}
  }

  res.end();
};
