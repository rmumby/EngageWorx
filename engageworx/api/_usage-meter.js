// api/_usage-meter.js
// Small helpers to (a) increment per-tenant usage counters and (b) log AI token/cost events.

// Rough per-million-token pricing (USD). Adjust when Anthropic changes rates.
var AI_PRICING = {
  'claude-opus-4-7':          { input: 15.0,  output: 75.0 },
  'claude-opus-4-6':          { input: 15.0,  output: 75.0 },
  'claude-sonnet-4-6':        { input: 3.0,   output: 15.0 },
  'claude-haiku-4-5':         { input: 0.80,  output: 4.0 },
};

function computeCost(model, inputTokens, outputTokens) {
  var p = AI_PRICING[model] || { input: 3.0, output: 15.0 };
  var cost = (Number(inputTokens || 0) / 1e6) * p.input + (Number(outputTokens || 0) / 1e6) * p.output;
  return Math.round(cost * 1e6) / 1e6; // 6dp
}

async function logAiUsage(supabase, params) {
  if (!supabase || !params || !params.model) return;
  try {
    var inTok = Number(params.input_tokens || 0);
    var outTok = Number(params.output_tokens || 0);
    var cost = computeCost(params.model, inTok, outTok);
    await supabase.from('ai_usage_log').insert({
      tenant_id: params.tenant_id || null,
      model: params.model,
      input_tokens: inTok,
      output_tokens: outTok,
      cost_usd: cost,
      feature: params.feature || null,
    });
    if (params.tenant_id) {
      await supabase.rpc('increment_tenant_counter', { p_tenant_id: params.tenant_id, p_column: 'ai_interactions_used', p_amount: 1 }).catch(function() {
        // Fallback if RPC not present: fetch-and-update
        incrementTenantCounter(supabase, params.tenant_id, 'ai_interactions_used', 1);
      });
    }
  } catch (e) { console.warn('[usage] logAiUsage error:', e.message); }
}

async function incrementTenantCounter(supabase, tenantId, column, amount) {
  if (!supabase || !tenantId || !column) return;
  var delta = Number(amount || 1);
  try {
    var r = await supabase.from('tenants').select(column).eq('id', tenantId).maybeSingle();
    var current = (r.data && typeof r.data[column] === 'number') ? r.data[column] : 0;
    var patch = {};
    patch[column] = current + delta;
    await supabase.from('tenants').update(patch).eq('id', tenantId);
  } catch (e) { console.warn('[usage] increment error:', column, e.message); }
}

module.exports = {
  computeCost: computeCost,
  logAiUsage: logAiUsage,
  incrementTenantCounter: incrementTenantCounter,
};
