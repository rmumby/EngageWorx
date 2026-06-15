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

  // Guard: skip if a human already reached out to this lead's contact
  try {
    var leadContact = await supabase.from('contacts').select('id').eq('pipeline_lead_id', leadId).limit(1).maybeSingle();
    if (leadContact.data) {
      var humanOutreach = await supabase.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', leadContact.data.id)
        .eq('direction', 'outbound')
        .eq('sender_type', 'agent')
        .not('metadata->>source', 'eq', 'sequence');
      if (humanOutreach.count && humanOutreach.count > 0) {
        console.log('[safeEnrol] Skipped — human already reached out:', { lead_id: leadId, contact_id: leadContact.data.id, outbound_count: humanOutreach.count });
        return { enrolled: false, reason: 'human_already_reached_out' };
      }
    }
  } catch (guardErr) { console.warn('[safeEnrol] Human outreach guard error (non-fatal):', guardErr.message); }

  // Check for existing enrollment in THIS sequence
  var existing = await supabase.from('lead_sequences')
    .select('id, status')
    .eq('lead_id', leadId)
    .eq('sequence_id', sequenceId)
    .maybeSingle();

  if (existing.data) {
    // Sticky (non-active) → never resurrect a cancelled/completed/paused/failed row.
    if (OVERWRITABLE_STATUSES.indexOf(existing.data.status) === -1) {
      console.log('[safeEnrol] Skipped — existing enrollment in non-overwritable state:', {
        lead_id: leadId, sequence_id: sequenceId, status: existing.data.status,
      });
      return { enrolled: false, reason: 'sticky_status', existing_status: existing.data.status };
    }
    // Already ACTIVE in this same sequence → skip. Re-upserting would reset current_step to 0
    // and re-send step 1 (the orphan-sweep double-send). Enrollment is idempotent per sequence.
    console.log('[safeEnrol] Skipped — already active in this sequence:', { lead_id: leadId, sequence_id: sequenceId });
    return { enrolled: false, reason: 'already_active_same_sequence' };
  }

  // One active OUTREACH sequence per lead: if the target is an outreach sequence and the lead
  // already has an active enrollment in a DIFFERENT outreach sequence, skip. Callers that must
  // take precedence (e.g. abandoned-checkout recovery) cancel the existing outreach enrolment
  // FIRST, then enrol — so this guard never blocks an intended cancel-and-replace.
  try {
    var seqTypeRes = await supabase.from('sequences').select('type').eq('id', sequenceId).maybeSingle();
    if (seqTypeRes.data && seqTypeRes.data.type === 'outreach') {
      var activeRows = await supabase.from('lead_sequences')
        .select('sequence_id, sequences(type)')
        .eq('lead_id', leadId)
        .eq('status', 'active');
      var competing = (activeRows.data || []).some(function(r) {
        return r.sequence_id !== sequenceId && r.sequences && r.sequences.type === 'outreach';
      });
      if (competing) {
        console.log('[safeEnrol] Skipped — lead already in an active outreach sequence (one at a time):', { lead_id: leadId, sequence_id: sequenceId });
        return { enrolled: false, reason: 'active_outreach_exists' };
      }
    }
  } catch (typeErr) { console.warn('[safeEnrol] outreach-guard check error (non-fatal):', typeErr.message); }

  // Safe to insert — no existing row in this sequence, and no competing active outreach.
  // enrolled_by (optional): the user who initiated this enrollment, so [Your Name]
  // resolves deterministically at send time. Null for system/cron/inbound enrollments
  // (those fall back to the admin proxy in sendStep).
  var result = await supabase.from('lead_sequences').upsert({
    tenant_id: tenantId,
    lead_id: leadId,
    sequence_id: sequenceId,
    current_step: 0,
    status: 'active',
    enrolled_at: new Date().toISOString(),
    enrolled_by: opts.enrolled_by || null,
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
