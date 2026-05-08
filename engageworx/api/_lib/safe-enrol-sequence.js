// api/_lib/safe-enrol-sequence.js — Safe sequence enrollment that respects sticky statuses
// Replaces raw lead_sequences.upsert() calls across the codebase.
//
// RULE: only 'active' is safe to overwrite. Every other status means
// "something already happened to this enrollment — leave it alone."
// This prevents cancelled/completed/paused/error rows from being
// resurrected by a re-enrollment call.

// Statuses that are safe to overwrite (enrollment is still in-flight)
var OVERWRITABLE_STATUSES = ['active'];

async function safeEnrolSequence(supabase, opts) {
  var tenantId = opts.tenant_id;
  var leadId = opts.lead_id;
  var sequenceId = opts.sequence_id;
  var nextStepAt = opts.next_step_at;

  if (!tenantId || !leadId || !sequenceId) {
    console.warn('[safeEnrol] Missing required field:', { tenant_id: tenantId, lead_id: leadId, sequence_id: sequenceId });
    return { enrolled: false, reason: 'missing_field' };
  }

  // Check for existing enrollment
  var existing = await supabase.from('lead_sequences')
    .select('id, status')
    .eq('lead_id', leadId)
    .eq('sequence_id', sequenceId)
    .maybeSingle();

  if (existing.data && OVERWRITABLE_STATUSES.indexOf(existing.data.status) === -1) {
    console.log('[safeEnrol] Skipped — existing enrollment in non-overwritable state:', {
      lead_id: leadId, sequence_id: sequenceId, status: existing.data.status,
    });
    return { enrolled: false, reason: 'sticky_status', existing_status: existing.data.status };
  }

  // Safe to upsert — either no existing row, or existing row is active (in-flight)
  var result = await supabase.from('lead_sequences').upsert({
    tenant_id: tenantId,
    lead_id: leadId,
    sequence_id: sequenceId,
    current_step: 0,
    status: 'active',
    enrolled_at: new Date().toISOString(),
    next_step_at: nextStepAt || new Date().toISOString(),
    processing_started_at: null,
  }, { onConflict: 'lead_id,sequence_id' });

  if (result.error) {
    console.warn('[safeEnrol] Upsert error:', result.error.message);
    return { enrolled: false, reason: 'upsert_error', error: result.error.message };
  }

  return { enrolled: true };
}

module.exports = { safeEnrolSequence: safeEnrolSequence };
