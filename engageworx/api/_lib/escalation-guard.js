// api/_lib/escalation-guard.js — escalation circuit breaker.
//
// Backstop for the self-referential escalation loop (incident 2026-06-15): even if a loop or a
// misconfigured rule slips past the inbound system-mail drop, a single rule can fire on a single
// conversation at most MAX_ESCALATIONS_PER_HOUR times in any rolling hour. The Delamere
// "Cancellation mentions" rule produced 70 notifications in 10 minutes; this caps that to a handful.
//
// Count source is escalation_log (tenant_id, rule_id, conversation_id, created_at). Both escalation
// engines record there, so the cap is shared across the concierge notify path and the multi-channel
// fire path. Fail-open: a counting error must never suppress a genuine escalation.

var MAX_ESCALATIONS_PER_HOUR = 3; // per rule, per conversation. Tunable; see PR notes.

async function escalationCapReached(supabase, tenantId, ruleId, conversationId) {
  // Can't key the window without a conversation → don't block (the inbound drop is the real fix).
  if (!supabase || !tenantId || !ruleId || !conversationId) return false;
  try {
    var sinceIso = new Date(Date.now() - 3600000).toISOString();
    var res = await supabase.from('escalation_log')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('rule_id', ruleId)
      .eq('conversation_id', conversationId)
      .gte('created_at', sinceIso);
    if (res && typeof res.count === 'number' && res.count >= MAX_ESCALATIONS_PER_HOUR) return true;
  } catch (e) {
    console.warn('[escalation-guard] cap count failed (failing open):', e.message);
  }
  return false;
}

module.exports = {
  escalationCapReached: escalationCapReached,
  MAX_ESCALATIONS_PER_HOUR: MAX_ESCALATIONS_PER_HOUR,
};
