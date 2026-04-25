// api/platform-config.js — GET/PATCH platform_config with optional tenant_id for CSP overrides
var { createClient } = require('@supabase/supabase-js');
var { getPlatformConfig, _bustCache } = require('./_lib/platform-config');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var tenantId = req.query.tenant_id || null;

  if (req.method === 'GET') {
    try {
      var pc = await getPlatformConfig(tenantId);
      if (req.query.full === '1') {
        return res.status(200).json(pc);
      }
      return res.status(200).json({
        platform_name: pc.platform_name,
        portal_url: pc.portal_url,
        support_email: pc.support_email,
        plans: pc.plans || [],
        industries: pc.industries || [],
        customer_type_options: pc.customer_type_options || [],
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'PATCH') {
    var supabase = createClient(
      process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    var body = req.body || {};
    var patch = {};
    var allowedFields = ['platform_name', 'support_email', 'support_phone', 'portal_url', 'calendar_url', 'onboarding_guide_url', 'headquarters', 'welcome_email_subject_template', 'welcome_email_html_template', 'default_escalation_rules', 'plans', 'industries', 'welcome_contact_source', 'welcome_contact_tags', 'customer_type_options'];
    allowedFields.forEach(function(f) { if (body[f] !== undefined) patch[f] = body[f]; });
    // Prevent double-encoded JSON: if a JSONB field arrives as a string, parse it
    var jsonbFields = ['default_escalation_rules', 'plans', 'industries', 'welcome_contact_tags', 'customer_type_options'];
    jsonbFields.forEach(function(f) {
      if (patch[f] && typeof patch[f] === 'string') {
        try { patch[f] = JSON.parse(patch[f]); } catch (e) {}
      }
    });
    patch.updated_at = new Date().toISOString();

    try {
      if (tenantId) {
        // Tenant-scoped: upsert
        var existing = await supabase.from('platform_config').select('id').eq('tenant_id', tenantId).limit(1).maybeSingle();
        if (existing.data) {
          var upd = await supabase.from('platform_config').update(patch).eq('id', existing.data.id);
          if (upd.error) return res.status(500).json({ error: upd.error.message });
        } else {
          patch.tenant_id = tenantId;
          patch.scope = 'tenant';
          var ins = await supabase.from('platform_config').insert(patch);
          if (ins.error) return res.status(500).json({ error: ins.error.message });
        }
      } else {
        // SP-level
        var spRow = await supabase.from('platform_config').select('id').is('tenant_id', null).limit(1).maybeSingle();
        if (!spRow.data) return res.status(404).json({ error: 'No platform_config row found' });
        var updSp = await supabase.from('platform_config').update(patch).eq('id', spRow.data.id);
        if (updSp.error) return res.status(500).json({ error: updSp.error.message });
      }
      _bustCache();
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'GET or PATCH only' });
};
