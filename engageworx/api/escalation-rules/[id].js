// api/escalation-rules/[id].js — Update, delete, test individual rules
// PUT    /api/escalation-rules/:id       — update rule
// DELETE /api/escalation-rules/:id       — delete rule
// POST   /api/escalation-rules/:id?action=test — test rule against message

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

var EXPLICIT_ASK_PATTERNS = [
  /speak\s+(to|with)\s+(a|an|the|someone|a\s+person|a\s+human|the\s+team|the\s+manager|a\s+coordinator)/i,
  /want\s+to\s+talk\s+to\s+(someone|a\s+person|a\s+human|the\s+team|the\s+manager)/i,
  /can\s+(i|we)\s+talk\s+to/i,
  /need\s+a\s+human/i,
  /need\s+to\s+speak/i,
];

function evaluateRule(rule, messageText) {
  var text = (messageText || '').toLowerCase();
  if (!text) return { matched: false, reason: 'Empty message' };

  if (rule.trigger_type === 'keyword') {
    var config = rule.trigger_config || {};
    var keywords = config.keywords || [];
    if (keywords.length === 0) return { matched: false, reason: 'No keywords configured' };
    var matchMode = config.match || 'any';
    var matched = [];
    for (var i = 0; i < keywords.length; i++) {
      if (text.indexOf(keywords[i].toLowerCase()) !== -1) matched.push(keywords[i]);
    }
    if (matchMode === 'all') {
      return matched.length === keywords.length
        ? { matched: true, keywords_matched: matched }
        : { matched: false, reason: 'Match mode "all": only ' + matched.length + '/' + keywords.length + ' keywords found', keywords_matched: matched };
    }
    return matched.length > 0
      ? { matched: true, keywords_matched: matched }
      : { matched: false, reason: 'No keywords found in message' };
  }

  if (rule.trigger_type === 'explicit_ask') {
    for (var j = 0; j < EXPLICIT_ASK_PATTERNS.length; j++) {
      var m = messageText.match(EXPLICIT_ASK_PATTERNS[j]);
      if (m) return { matched: true, pattern_matched: m[0] };
    }
    return { matched: false, reason: 'No explicit-ask phrases detected' };
  }

  return { matched: false, reason: 'Unknown trigger type: ' + rule.trigger_type };
}

async function verifyAuth(supabase, req, tenantId) {
  var authHeader = req.headers.authorization || '';
  var token = authHeader.replace('Bearer ', '');
  if (!token) return { error: 'Missing auth token', status: 401 };
  var { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return { error: 'Invalid auth token', status: 401 };

  var { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  var isSA = profile && (profile.role === 'superadmin' || profile.role === 'super_admin' || profile.role === 'sp_admin');
  if (!isSA) {
    var { data: mem } = await supabase.from('tenant_members')
      .select('id, role').eq('tenant_id', tenantId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (!mem) return { error: 'Not authorized', status: 403 };
  }
  return { user: user };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, DELETE, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var supabase = getSupabase();
  var ruleId = req.query.id;
  if (!ruleId) return res.status(400).json({ error: 'Rule ID required' });

  // Load rule to get tenant_id for auth
  var { data: rule, error: ruleErr } = await supabase.from('escalation_rules')
    .select('*').eq('id', ruleId).maybeSingle();
  if (ruleErr || !rule) return res.status(404).json({ error: 'Rule not found' });

  var auth = await verifyAuth(supabase, req, rule.tenant_id);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  // ── POST with action=test ──
  if (req.method === 'POST' && req.query.action === 'test') {
    var testText = (req.body || {}).message || '';
    var result = evaluateRule(rule, testText);
    return res.status(200).json({ rule_name: rule.rule_name, trigger_type: rule.trigger_type, result: result });
  }

  // ── PUT: update ──
  if (req.method === 'PUT') {
    var body = req.body || {};
    var updates = {};
    if (body.rule_name !== undefined) updates.rule_name = body.rule_name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.trigger_type !== undefined) updates.trigger_type = body.trigger_type;
    if (body.trigger_config !== undefined) updates.trigger_config = body.trigger_config;
    if (body.actions !== undefined) {
      updates.actions = body.actions;
      if (Array.isArray(body.actions) && body.actions.length > 0) {
        updates.action_type = body.actions[0].type || 'notify';
        updates.action_config = body.actions[0].config || {};
      }
    }
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.active !== undefined) updates.active = body.active;
    updates.updated_at = new Date().toISOString();

    var { data: updated, error: updateErr } = await supabase.from('escalation_rules')
      .update(updates).eq('id', ruleId).select('*').single();
    if (updateErr) return res.status(500).json({ error: updateErr.message });

    console.log('[escalation-rules] Updated:', ruleId, updates.rule_name || rule.rule_name);
    return res.status(200).json({ rule: updated });
  }

  // ── DELETE ──
  if (req.method === 'DELETE') {
    var { error: delErr } = await supabase.from('escalation_rules').delete().eq('id', ruleId);
    if (delErr) return res.status(500).json({ error: delErr.message });
    console.log('[escalation-rules] Deleted:', ruleId, rule.rule_name);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

// Export evaluateRule for use by concierge handler
module.exports.evaluateRule = evaluateRule;
module.exports.EXPLICIT_ASK_PATTERNS = EXPLICIT_ASK_PATTERNS;
