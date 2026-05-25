// api/escalation-rules/index.js — CRUD for escalation rules
// GET  /api/escalation-rules?tenant_id=xxx — list rules
// POST /api/escalation-rules              — create rule
// Auth: superadmin OR tenant admin/owner

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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
    if (!mem) return { error: 'Not authorized for this tenant', status: 403 };
    if (mem.role && mem.role !== 'admin' && mem.role !== 'owner' && mem.role !== 'coordinator') {
      return { error: 'Admin role required', status: 403 };
    }
  }
  return { user: user };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var supabase = getSupabase();

  // ── GET: list rules ──
  if (req.method === 'GET') {
    var tenantId = req.query.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });

    var auth = await verifyAuth(supabase, req, tenantId);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    var { data, error } = await supabase.from('escalation_rules')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('priority', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ rules: data || [] });
  }

  // ── POST: create rule ──
  if (req.method === 'POST') {
    var body = req.body || {};
    var tenantId2 = body.tenant_id;
    if (!tenantId2) return res.status(400).json({ error: 'tenant_id required' });
    if (!body.rule_name) return res.status(400).json({ error: 'rule_name required' });
    if (!body.trigger_type) return res.status(400).json({ error: 'trigger_type required' });

    var auth2 = await verifyAuth(supabase, req, tenantId2);
    if (auth2.error) return res.status(auth2.status).json({ error: auth2.error });

    var actions = body.actions || [];
    if (!Array.isArray(actions) || actions.length === 0) {
      return res.status(400).json({ error: 'At least one action is required' });
    }

    var { data: rule, error: insertErr } = await supabase.from('escalation_rules').insert({
      tenant_id: tenantId2,
      rule_name: body.rule_name,
      description: body.description || null,
      trigger_type: body.trigger_type,
      trigger_config: body.trigger_config || {},
      action_type: actions[0] ? actions[0].type : 'notify',
      action_config: actions[0] ? actions[0].config || {} : {},
      actions: actions,
      priority: body.priority || 10,
      active: body.active !== false,
    }).select('*').single();

    if (insertErr) return res.status(500).json({ error: insertErr.message });

    console.log('[escalation-rules] Created:', { id: rule.id, name: rule.rule_name, tenant: tenantId2 });
    return res.status(200).json({ rule: rule });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
