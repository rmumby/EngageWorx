// api/whatsapp-templates.js
// WhatsApp template management. Actions:
//   POST { action: 'list',      tenant_id }            → list local + Meta templates
//   POST { action: 'ai_draft',  tenant_id, use_case, brand } → Claude returns 3 template options
//   POST { action: 'submit',    tenant_id, template }   → persist draft + submit to Meta
//   POST { action: 'sync',      tenant_id }             → pull status for pending templates

var { createClient } = require('@supabase/supabase-js');

var META_VERSION = 'v18.0';
var META_BASE = 'https://graph.facebook.com/' + META_VERSION;

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function getWaConfig(supabase, tenantId) {
  var r = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', tenantId).eq('channel', 'whatsapp').maybeSingle();
  if (!r.data) return null;
  var cfg = r.data.config_encrypted || {};
  if (!cfg.waba_id || !cfg.access_token) return null;
  return cfg;
}

async function aiDraft(useCase, brand) {
  if (!process.env.ANTHROPIC_API_KEY) return { templates: [] };
  var system = 'You are a WhatsApp Business template copywriter. Generate 3 distinct template options for the requested use case. Each template MUST follow Meta''s rules: no promotional content outside MARKETING category; use placeholders {{1}}, {{2}} etc.; include clear opt-out guidance; be under 1024 chars.' +
    '\n\nReturn STRICT JSON: { "templates": [ { "name": "snake_case_name", "category": "UTILITY|MARKETING|AUTHENTICATION", "body_text": "string with {{1}} placeholders", "variables": ["description of {{1}}", "description of {{2}}"], "approval_score": 0-100, "approval_reasoning": "1 sentence" } ] }';
  var prompt = 'Business: ' + (brand || 'Generic business') + '\nUse case: ' + useCase + '\n\nGenerate 3 template variations with different tones (formal, friendly, concise). Score each for Meta approval likelihood.';
  try {
    var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1600, system: system, messages: [{ role: 'user', content: prompt }] }),
    });
    var data = await aiRes.json();
    var txt = (data.content || []).find(function(b) { return b.type === 'text'; });
    var match = txt ? txt.text.match(/\{[\s\S]*\}/) : null;
    return match ? JSON.parse(match[0]) : { templates: [] };
  } catch (e) { console.warn('[WA tpl] AI error:', e.message); return { templates: [] }; }
}

async function submitToMeta(cfg, template) {
  var body = {
    name: template.name,
    language: template.language || 'en_US',
    category: template.category || 'UTILITY',
    components: [{ type: 'BODY', text: template.body_text }],
  };
  if (template.header_text) body.components.unshift({ type: 'HEADER', format: 'TEXT', text: template.header_text });
  if (template.footer_text) body.components.push({ type: 'FOOTER', text: template.footer_text });
  if (template.buttons && template.buttons.length) body.components.push({ type: 'BUTTONS', buttons: template.buttons });
  var r = await fetch(META_BASE + '/' + cfg.waba_id + '/message_templates', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + cfg.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  var d = await r.json();
  if (!r.ok) throw new Error('Meta submit failed: ' + JSON.stringify(d));
  return d; // { id, status, category }
}

async function listFromMeta(cfg) {
  try {
    var r = await fetch(META_BASE + '/' + cfg.waba_id + '/message_templates?limit=100', {
      headers: { 'Authorization': 'Bearer ' + cfg.access_token },
    });
    var d = await r.json();
    return d.data || [];
  } catch (e) { return []; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var body = req.body || {};
  var action = body.action;
  var tenantId = body.tenant_id;
  if (!action || !tenantId) return res.status(400).json({ error: 'action and tenant_id required' });
  var supabase = getSupabase();

  try {
    if (action === 'list') {
      var local = await supabase.from('whatsapp_templates').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false });
      var cfg = await getWaConfig(supabase, tenantId);
      var metaList = cfg ? await listFromMeta(cfg) : [];
      return res.status(200).json({ local: local.data || [], meta: metaList, connected: !!cfg });
    }

    if (action === 'ai_draft') {
      var tenant = await supabase.from('tenants').select('name, brand_name').eq('id', tenantId).maybeSingle();
      var brand = (tenant.data && (tenant.data.brand_name || tenant.data.name)) || 'your business';
      var drafts = await aiDraft(body.use_case || 'Customer Support', brand);
      return res.status(200).json(drafts);
    }

    if (action === 'submit') {
      var t = body.template;
      if (!t || !t.name || !t.body_text) return res.status(400).json({ error: 'template.name and body_text required' });
      var cfg2 = await getWaConfig(supabase, tenantId);
      if (!cfg2) return res.status(400).json({ error: 'WhatsApp not connected for this tenant — run Embedded Signup first' });

      // Persist draft row
      var ins = await supabase.from('whatsapp_templates').insert({
        tenant_id: tenantId,
        name: t.name,
        category: t.category || 'UTILITY',
        language: t.language || 'en_US',
        body_text: t.body_text,
        header_text: t.header_text || null,
        footer_text: t.footer_text || null,
        buttons: t.buttons || null,
        variables: t.variables || null,
        status: 'pending',
        submitted_at: new Date().toISOString(),
      }).select('id').single();

      var meta = null;
      try {
        meta = await submitToMeta(cfg2, t);
        await supabase.from('whatsapp_templates').update({ meta_template_id: meta.id, status: (meta.status || 'pending').toLowerCase() }).eq('id', ins.data.id);
      } catch (mErr) {
        await supabase.from('whatsapp_templates').update({ status: 'rejected', rejection_reason: mErr.message }).eq('id', ins.data.id);
        return res.status(400).json({ error: mErr.message, local_id: ins.data.id });
      }

      return res.status(200).json({ success: true, local_id: ins.data.id, meta: meta });
    }

    if (action === 'sync') {
      var cfg3 = await getWaConfig(supabase, tenantId);
      if (!cfg3) return res.status(400).json({ error: 'WhatsApp not connected' });
      var metaTpls = await listFromMeta(cfg3);
      var updated = 0;
      for (var i = 0; i < metaTpls.length; i++) {
        var mt = metaTpls[i];
        try {
          await supabase.from('whatsapp_templates').update({
            status: (mt.status || '').toLowerCase(),
            approved_at: mt.status === 'APPROVED' ? new Date().toISOString() : null,
            rejection_reason: mt.rejected_reason || null,
          }).eq('tenant_id', tenantId).eq('meta_template_id', mt.id);
          updated++;
        } catch (e) {}
      }
      return res.status(200).json({ success: true, synced: updated });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (err) {
    console.error('[WA templates] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
