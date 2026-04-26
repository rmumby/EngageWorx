// api/whatsapp-provisioning.js — WhatsApp provisioning status tracker
// GET  ?tenant_id=X → list all stages for tenant
// POST { tenant_id, stage, status, meta_error_code?, meta_error_message?, details? } → upsert stage

var { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (req.method === 'GET') {
    var tenantId = req.query.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
    try {
      var r = await supabase.from('whatsapp_provisioning').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: true });
      return res.status(200).json({ stages: r.data || [] });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (req.method === 'POST') {
    var body = req.body || {};
    if (!body.tenant_id || !body.stage || !body.status) {
      return res.status(400).json({ error: 'tenant_id, stage, status required' });
    }
    try {
      var payload = {
        tenant_id: body.tenant_id,
        stage: body.stage,
        status: body.status,
        meta_error_code: body.meta_error_code || null,
        meta_error_message: body.meta_error_message || null,
        details: body.details || null,
        updated_at: new Date().toISOString(),
      };
      var r = await supabase.from('whatsapp_provisioning').upsert(payload, { onConflict: 'tenant_id,stage' });
      if (r.error) return res.status(500).json({ error: r.error.message });
      console.log('[WA Provisioning] Stage updated:', body.tenant_id, body.stage, '→', body.status);
      return res.status(200).json({ success: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(405).json({ error: 'GET or POST only' });
};
