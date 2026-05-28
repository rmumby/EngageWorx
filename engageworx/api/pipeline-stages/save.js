// api/pipeline-stages/save.js — Full-array replace for a tenant's pipeline stages
// POST { tenant_id, stages: [...] }
// Validates via validate-pipeline-stages, checks delete-safety (no orphaned leads),
// enforces structural-type protection, then upserts the full set.
// Auth: superadmin OR admin/owner of the tenant.

var { createClient } = require('@supabase/supabase-js');
var { validatePipelineStages } = require('../_lib/validate-pipeline-stages');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var supabase = getSupabase();
  var body = req.body || {};
  var tenantId = body.tenant_id;
  var stages = body.stages;

  if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
  if (!Array.isArray(stages)) return res.status(400).json({ error: 'stages array required' });

  // Auth: JWT + admin/owner check
  var authHeader = req.headers.authorization || '';
  var jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return res.status(401).json({ error: 'Authorization required' });

  var { data: userData } = await supabase.auth.getUser(jwt);
  if (!userData || !userData.user) return res.status(401).json({ error: 'Invalid token' });
  var callerId = userData.user.id;

  var { data: callerProfile } = await supabase.from('user_profiles')
    .select('role').eq('id', callerId).maybeSingle();
  var isSuperAdmin = callerProfile && (callerProfile.role === 'superadmin' || callerProfile.role === 'super_admin' || callerProfile.role === 'sp_admin');

  if (!isSuperAdmin) {
    var { data: callerMember } = await supabase.from('tenant_members')
      .select('id, role').eq('tenant_id', tenantId).eq('user_id', callerId).eq('status', 'active').maybeSingle();
    if (!callerMember) return res.status(403).json({ error: 'Not a member of this tenant' });
    if (callerMember.role !== 'admin' && callerMember.role !== 'owner') {
      return res.status(403).json({ error: 'Admin or owner role required' });
    }
  }

  // 1. Validate the proposed stage set
  var validation = validatePipelineStages(stages);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
  }
  var normalized = validation.normalized;

  // 2. Load current stages for this tenant
  var { data: currentStages, error: loadErr } = await supabase.from('pipeline_stages')
    .select('id, stage_key, stage_type').eq('tenant_id', tenantId);
  if (loadErr) return res.status(500).json({ error: loadErr.message });

  var currentKeys = {};
  (currentStages || []).forEach(function(s) { currentKeys[s.stage_key] = s; });

  var newKeys = {};
  normalized.forEach(function(s) { newKeys[s.stage_key] = true; });

  // 3. Identify stages being removed (in current but not in new)
  var removedStages = (currentStages || []).filter(function(s) { return !newKeys[s.stage_key]; });

  // 4. Delete-safety: check for leads in each removed stage
  var deleteErrors = [];
  for (var i = 0; i < removedStages.length; i++) {
    var removed = removedStages[i];
    var { count, error: countErr } = await supabase.from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('pipeline_stage_id', removed.id)
      .eq('tenant_id', tenantId);
    if (countErr) {
      deleteErrors.push({ stage_key: removed.stage_key, error: countErr.message });
      continue;
    }
    if (count > 0) {
      deleteErrors.push({
        stage_key: removed.stage_key,
        stage_id: removed.id,
        lead_count: count,
        message: 'Stage "' + removed.stage_key + '" has ' + count + ' lead' + (count !== 1 ? 's' : '') + '. Reassign leads before removing this stage.',
      });
    }
  }

  if (deleteErrors.length > 0) {
    return res.status(409).json({
      error: 'Cannot remove stages with leads',
      blocked_stages: deleteErrors,
    });
  }

  // 5. Structural-type protection on removal: cannot remove the last of any structural type
  // (Already guaranteed by validation — new set has 1 lead, >=1 won, >=1 lost.
  //  But belt-and-braces: verify no structural type is being entirely removed.)
  var removedTypes = {};
  removedStages.forEach(function(s) {
    removedTypes[s.stage_type] = (removedTypes[s.stage_type] || 0) + 1;
  });
  // The new set passed validation so it has the required types. No extra check needed.

  // 6. Execute: atomically delete removed stages (only if empty), then upsert the new set
  try {
    // Delete removed stages via RPC (atomic: won't delete if leads exist, even under race)
    for (var d = 0; d < removedStages.length; d++) {
      var { data: rpcResult, error: rpcErr } = await supabase.rpc('delete_pipeline_stage_if_empty', {
        p_tenant_id: tenantId,
        p_stage_id: removedStages[d].id,
      });
      if (rpcErr) {
        return res.status(500).json({ error: 'Delete RPC failed for stage ' + removedStages[d].stage_key + ': ' + rpcErr.message });
      }
      if (rpcResult === 0) {
        // Race: leads appeared after the count check. Block the entire save.
        return res.status(409).json({
          error: 'Cannot remove stage with leads',
          blocked_stages: [{
            stage_key: removedStages[d].stage_key,
            stage_id: removedStages[d].id,
            message: 'Stage "' + removedStages[d].stage_key + '" has leads that appeared during save. Reassign leads and try again.',
          }],
        });
      }
    }

    // Upsert new/updated stages
    var rows = normalized.map(function(s) {
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

    var { error: upsertErr } = await supabase.from('pipeline_stages')
      .upsert(rows, { onConflict: 'tenant_id,stage_key', ignoreDuplicates: false });

    if (upsertErr) return res.status(500).json({ error: upsertErr.message });

    console.log('[pipeline-stages/save] Saved', rows.length, 'stages for tenant', tenantId, '(removed', removedStages.length, ')');

    // Return the saved stages
    var { data: savedStages } = await supabase.from('pipeline_stages')
      .select('*').eq('tenant_id', tenantId).order('display_order', { ascending: true });

    return res.status(200).json({ success: true, stages: savedStages || [] });
  } catch (err) {
    console.error('[pipeline-stages/save] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
