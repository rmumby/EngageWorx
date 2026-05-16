// src/lib/pipelineStages.js — Pipeline stage constants + resolver (ESM)
// Single source of truth for stage_key values. Used by frontend components.

export const STAGE_KEYS = {
  LEAD: 'lead',
  QUALIFIED: 'active_qualified',
  DEMO_SCHEDULED: 'active_demo_scheduled',
  PRICING_SENT: 'active_pricing_sent',
  NEGOTIATING: 'active_negotiating',
  WON: 'closed_won',
  LOST: 'closed_lost',
  // SP-only extras
  SANDBOX_SHARED: 'active_sandbox_shared',
  DEMO_SHARED: 'active_demo_shared',
};

// In-memory cache: key = `${tenantId}:${stageKey}` → UUID
var stageIdCache = {};

export async function getPipelineStageId(supabase, tenantId, stageKey) {
  if (!tenantId || !stageKey) throw new Error('getPipelineStageId: tenantId and stageKey are required');

  var cacheKey = tenantId + ':' + stageKey;
  if (stageIdCache[cacheKey]) return stageIdCache[cacheKey];

  var { data, error } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('stage_key', stageKey)
    .maybeSingle();

  if (error) throw new Error('getPipelineStageId: query failed — ' + error.message);
  if (!data) throw new Error('getPipelineStageId: no stage found for tenant=' + tenantId + ' key=' + stageKey);

  stageIdCache[cacheKey] = data.id;
  return data.id;
}
