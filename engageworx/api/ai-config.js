// api/ai-config.js — Read/update structured AI persona config
// GET  ?tenant_id=xxx&surface=yyy — read config
// PUT  body: { tenant_id, surface, ...fields } — update config
// Auth: superadmin OR tenant admin/owner

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

var EDITABLE_FIELDS = [
  'ai_persona', 'ai_voice', 'ai_scope', 'ai_escalation_instructions',
  'ai_custom_instructions', 'coordinator_names', 'bot_name',
  'personality_preset', 'language', 'temperature',
];

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var supabase = getSupabase();

  // GET: read config
  if (req.method === 'GET') {
    var tenantId = req.query.tenant_id;
    var surface = req.query.surface || 'wedding_concierge';
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });

    var auth = await verifyAuth(supabase, req, tenantId);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    var { data, error } = await supabase.from('chatbot_configs')
      .select('bot_name, system_prompt, ai_persona, ai_voice, ai_scope, ai_escalation_instructions, ai_custom_instructions, coordinator_names, personality_preset, language, temperature, tenant_business_context')
      .eq('tenant_id', tenantId)
      .eq('surface', surface)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ config: data || {} });
  }

  // PUT: update config
  if (req.method === 'PUT') {
    var body = req.body || {};
    var tenantId2 = body.tenant_id;
    var surface2 = body.surface || 'wedding_concierge';
    if (!tenantId2) return res.status(400).json({ error: 'tenant_id required' });

    var auth2 = await verifyAuth(supabase, req, tenantId2);
    if (auth2.error) return res.status(auth2.status).json({ error: auth2.error });

    var updates = {};
    for (var i = 0; i < EDITABLE_FIELDS.length; i++) {
      var field = EDITABLE_FIELDS[i];
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No editable fields provided' });
    }

    var { data, error } = await supabase.from('chatbot_configs')
      .update(updates)
      .eq('tenant_id', tenantId2)
      .eq('surface', surface2)
      .select('*')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    console.log('[ai-config] Updated:', { tenant: tenantId2, surface: surface2, fields: Object.keys(updates) });
    return res.status(200).json({ config: data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
