// api/_lib/validate-pipeline-stages.js — Pure validation for pipeline stage arrays
// Gate that ALL stage mutations pass through. No DB writes.
// Returns { valid: bool, errors: [], normalized: [...] }

var VALID_STAGE_TYPES = ['lead', 'active', 'closed_won', 'closed_lost'];

function validatePipelineStages(stages) {
  var errors = [];

  if (!Array.isArray(stages) || stages.length === 0) {
    return { valid: false, errors: ['At least one stage is required'], normalized: [] };
  }

  // Check each stage has required fields + valid stage_type
  for (var i = 0; i < stages.length; i++) {
    var s = stages[i];
    if (!s.stage_key || !s.stage_key.trim()) {
      errors.push('Stage ' + (i + 1) + ': stage_key is required');
    }
    if (!s.display_name || !s.display_name.trim()) {
      errors.push('Stage ' + (i + 1) + ' (' + (s.stage_key || '?') + '): display_name is required');
    }
    if (!s.stage_type || VALID_STAGE_TYPES.indexOf(s.stage_type) === -1) {
      errors.push('Stage ' + (i + 1) + ' (' + (s.stage_key || '?') + '): invalid stage_type "' + (s.stage_type || '') + '". Must be one of: ' + VALID_STAGE_TYPES.join(', '));
    }
  }

  // Check stage_key uniqueness within the set
  var keysSeen = {};
  for (var j = 0; j < stages.length; j++) {
    var key = (stages[j].stage_key || '').trim().toLowerCase();
    if (keysSeen[key]) {
      errors.push('Duplicate stage_key: "' + stages[j].stage_key + '"');
    }
    keysSeen[key] = true;
  }

  // Structural type counts
  var leadCount = 0, wonCount = 0, lostCount = 0;
  for (var k = 0; k < stages.length; k++) {
    if (stages[k].stage_type === 'lead') leadCount++;
    if (stages[k].stage_type === 'closed_won') wonCount++;
    if (stages[k].stage_type === 'closed_lost') lostCount++;
  }

  if (leadCount !== 1) {
    errors.push('Exactly one stage with stage_type "lead" is required (found ' + leadCount + ')');
  }
  if (wonCount < 1) {
    errors.push('At least one stage with stage_type "closed_won" is required (found ' + wonCount + ')');
  }
  if (lostCount < 1) {
    errors.push('At least one stage with stage_type "closed_lost" is required (found ' + lostCount + ')');
  }

  if (errors.length > 0) {
    return { valid: false, errors: errors, normalized: [] };
  }

  // Normalize: clean display_order to 1..N, trim strings
  var normalized = stages.map(function(s, idx) {
    return {
      stage_key: s.stage_key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      display_name: s.display_name.trim(),
      stage_type: s.stage_type,
      sub_stage: s.sub_stage || null,
      display_order: idx + 1,
      auto_advance: !!s.auto_advance,
    };
  });

  return { valid: true, errors: [], normalized: normalized };
}

module.exports = { validatePipelineStages: validatePipelineStages };
