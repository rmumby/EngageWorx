// api/_lib/safe-enrol-sequence.js — Safe sequence enrollment that respects sticky statuses
// Replaces raw lead_sequences.upsert() calls across the codebase.
// If an existing enrollment is in a sticky state (error, paused_emergency, paused,
// cancelled_invalid_lead, completed), the enrollment is skipped — not overwritten.

var STICKY_STATUSES = ['error', 'paused_emergency', 'paused', 'cancelled_invalid_lead', 'completed'];

async function safeEnrolSequence(supabase, opts) {
  var tenantId = opts.tenant_id;
  var leadId = opts.lead_id;
  var sequenceId = opts.sequence_id;
  var nextStepAt = opts.next_step_at;

  if (!tenantId || !leadId || !sequenceId) {
    console.warn('[safeEnrol] Missing required field:', { tenant_id: tenantId, lead_id: leadId, sequence_id: sequenceId });
    return { enrolled: false, reason: 'missing_field' };
  }

  // Check for existing enrollment in a sticky state
  var existing = await supabase.from('lead_sequences')
    .select('id, status')
    .eq('lead_id', leadId)
    .eq('sequence_id', sequenceId)
    .maybeSingle();

  if (existing.data && STICKY_STATUSES.indexOf(existing.data.status) !== -1) {
    console.log('[safeEnrol] Skipped — existing enrollment in sticky state:', {
      lead_id: leadId, sequence_id: sequenceId, status: existing.data.status,
    });
    return { enrolled: false, reason: 'sticky_status', existing_status: existing.data.status };
  }

  // Safe to upsert — either no existing row, or existing row is in a non-sticky state (active, replied, etc.)
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
