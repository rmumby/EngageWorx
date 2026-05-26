// api/_lib/pipelineStages.js — Pipeline stage constants + resolver (CommonJS)
// Single source of truth for stage_key values. Used by API/cron handlers.
//
// Uses a service-role client for the stage lookup. Stages are config (not
// customer data), the query is tenant-scoped by the tenantId parameter, and
// the alternative — relaxing RLS on pipeline_stages to allow SP admins
// cross-tenant reads — is a much wider blast radius. This approach keeps
// RLS tight while allowing SP admin operations like cross-tenant contact
// conversion to resolve the correct pipeline_stage_id.

var { createClient } = require('@supabase/supabase-js');

var serviceClient = createClient(
  process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STAGE_KEYS = {
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

async function getPipelineStageId(_supabase, tenantId, stageKey) {
  if (!tenantId || !stageKey) throw new Error('getPipelineStageId: tenantId and stageKey are required');

  var cacheKey = tenantId + ':' + stageKey;
  if (stageIdCache[cacheKey]) return stageIdCache[cacheKey];

  var { data, error } = await serviceClient
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

module.exports = { STAGE_KEYS, getPipelineStageId };
