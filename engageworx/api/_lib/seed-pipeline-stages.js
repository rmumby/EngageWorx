// api/_lib/seed-pipeline-stages.js — Seed default pipeline stages for a new tenant
// Called from invite-tenant.js, csp.js, stripe-webhook.js after tenant creation.
// template param defaults to 'saas'; vertical presets plug in here later.
// Failure is non-fatal — logs warning but does not roll back tenant creation.

var TEMPLATES = {
  saas: [
    { stage_key: 'lead',                  display_name: 'Lead',           stage_type: 'lead',        sub_stage: null,             display_order: 1, auto_advance: false },
    { stage_key: 'active_qualified',      display_name: 'Qualified',      stage_type: 'active',      sub_stage: 'qualified',      display_order: 2, auto_advance: false },
    { stage_key: 'active_demo_scheduled', display_name: 'Demo Scheduled', stage_type: 'active',      sub_stage: 'demo_scheduled', display_order: 3, auto_advance: true },
    { stage_key: 'active_pricing_sent',   display_name: 'Pricing Sent',   stage_type: 'active',      sub_stage: 'pricing_sent',   display_order: 4, auto_advance: true },
    { stage_key: 'active_negotiating',    display_name: 'Negotiating',    stage_type: 'active',      sub_stage: 'negotiating',    display_order: 5, auto_advance: false },
    { stage_key: 'closed_won',            display_name: 'Customer',       stage_type: 'closed_won',  sub_stage: null,             display_order: 6, auto_advance: false },
    { stage_key: 'closed_lost',           display_name: 'Closed Lost',    stage_type: 'closed_lost', sub_stage: null,             display_order: 7, auto_advance: false },
  ],
};

async function seedPipelineStages(supabase, tenantId, template) {
  var stages = TEMPLATES[template || 'saas'];
  if (!stages) {
    console.warn('[seedPipelineStages] Unknown template:', template, '— falling back to saas');
    stages = TEMPLATES.saas;
  }

  var rows = stages.map(function(s) {
    return {
      tenant_id: tenantId,
      stage_key: s.stage_key,
      display_name: s.display_name,
      stage_type: s.stage_type,
      sub_stage: s.sub_stage,
      display_order: s.display_order,
      auto_advance: s.auto_advance,
    };
  });

  var { error } = await supabase.from('pipeline_stages')
    .upsert(rows, { onConflict: 'tenant_id,stage_key', ignoreDuplicates: true });

  if (error) {
    console.warn('[seedPipelineStages] Seed failed for tenant', tenantId, ':', error.message);
  } else {
    console.log('[seedPipelineStages] Seeded', rows.length, 'stages for tenant', tenantId, 'template:', template || 'saas');
  }
}

module.exports = { seedPipelineStages: seedPipelineStages, TEMPLATES: TEMPLATES };
