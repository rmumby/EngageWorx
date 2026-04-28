// api/escalation-rules.js — CRUD for tenant escalation rules
// GET    ?tenantId=<id>          → list active rules for tenant
// POST   body: { tenant_id, ... } → create rule
// PATCH  body: { id, ... }        → update rule
// DELETE body: { id, tenant_id }  → delete rule

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var supabase = getSupabase();

  // GET — list rules
  if (req.method === 'GET') {
    var tenantId = req.query.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
    try {
      var r = await supabase.from('escalation_rules').select('*').eq('tenant_id', tenantId).order('priority', { ascending: true }).order('created_at', { ascending: true });
      if (r.error) return res.status(500).json({ error: r.error.message });
      return res.status(200).json({ rules: r.data || [] });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  var body = req.body || {};

  // POST — create rule
  if (req.method === 'POST') {
    if (!body.tenant_id || !body.rule_name || !body.trigger_type || !body.action_type) {
      return res.status(400).json({ error: 'tenant_id, rule_name, trigger_type, action_type required' });
    }
    try {
      var ins = await supabase.from('escalation_rules').insert({
        tenant_id: body.tenant_id,
        rule_name: body.rule_name,
        description: body.description || null,
        trigger_type: body.trigger_type,
        trigger_config: body.trigger_config || {},
        action_type: body.action_type,
        action_config: body.action_config || {},
        priority: body.priority !== undefined ? body.priority : 10,
        active: body.active !== undefined ? body.active : true,
        nl_description: body.nl_description || null,
        rule_config: body.rule_config || null,
      }).select('*').single();
      if (ins.error) return res.status(500).json({ error: ins.error.message });
      console.log('📝 Escalation rule saved:', { tenant: body.tenant_id, ruleId: ins.data.id, action: 'create' });
      return res.status(200).json({ rule: ins.data });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // PATCH — update rule
  if (req.method === 'PATCH') {
    if (!body.id) return res.status(400).json({ error: 'id required' });
    var patch = {};
    if (body.rule_name !== undefined) patch.rule_name = body.rule_name;
    if (body.description !== undefined) patch.description = body.description;
    if (body.trigger_type !== undefined) patch.trigger_type = body.trigger_type;
    if (body.trigger_config !== undefined) patch.trigger_config = body.trigger_config;
    if (body.action_type !== undefined) patch.action_type = body.action_type;
    if (body.action_config !== undefined) patch.action_config = body.action_config;
    if (body.priority !== undefined) patch.priority = body.priority;
    if (body.active !== undefined) patch.active = body.active;
    if (body.nl_description !== undefined) patch.nl_description = body.nl_description;
    if (body.rule_config !== undefined) patch.rule_config = body.rule_config;
    patch.updated_at = new Date().toISOString();
    try {
      var upd = await supabase.from('escalation_rules').update(patch).eq('id', body.id);
      if (body.tenant_id) upd = await supabase.from('escalation_rules').update(patch).eq('id', body.id).eq('tenant_id', body.tenant_id);
      if (upd.error) return res.status(500).json({ error: upd.error.message });
      console.log('📝 Escalation rule saved:', { ruleId: body.id, action: 'update', fields: Object.keys(patch) });
      return res.status(200).json({ success: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // DELETE
  if (req.method === 'DELETE') {
    if (!body.id) return res.status(400).json({ error: 'id required' });
    try {
      var del = body.tenant_id
        ? await supabase.from('escalation_rules').delete().eq('id', body.id).eq('tenant_id', body.tenant_id)
        : await supabase.from('escalation_rules').delete().eq('id', body.id);
      if (del.error) return res.status(500).json({ error: del.error.message });
      console.log('📝 Escalation rule saved:', { ruleId: body.id, action: 'delete' });
      return res.status(200).json({ success: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
