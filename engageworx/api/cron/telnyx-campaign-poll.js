// api/cron/telnyx-campaign-poll.js
// Supplier-aware wizard-campaign monitor (scheduled */15). Polls non-terminal wizard sessions and:
//   • PROMOTES submitted -> approved (+approved_at) and calls recompute_sms_enabled(tenant_id) when the
//     carrier reports brand APPROVED AND campaign ACTIVE. There is NO approved-trigger, so this explicit
//     recompute call is the linchpin that flips tenants.sms_enabled true. Mirrors tcr-wizard.js:812 — both
//     conditions required; never promote on campaign-active-but-brand-pending.
//   • KILLS via record_campaign_status on a carrier rejected/suspended status (its trg_tcr_wizard_sms_disable
//     trigger handles recompute) — do NOT double-call recompute on the kill side.
// Read-only against the carrier (getBrandStatus/getCampaignStatus only — never submits/mutates). Supplier
// resolved per tenant via loadSupplier (mock/live per tenants.tcr_mode_override), so new suppliers slot in
// and it's mock-testable. Fail-open: any carrier/parse error skips that session, never writes on failure.
// Idempotent: already-approved sessions no-op on the positive side (only a kill transition acts on them).
// CommonJS to match api/ (repo has no "type":"module").

var { createClient } = require('@supabase/supabase-js');
var { loadSupplier } = require('../_lib/tcr-supplier');

function svc() {
  return createClient(
    process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

// Process one wizard session. Tenant-scoped. Never throws (fail-open). Returns an outcome string.
// Exported for mock round-trip testing (drives the real loadSupplier dispatch + DB writes).
async function processSession(supabase, s) {
  try {
    var supplier = await loadSupplier(supabase, s.tenant_id);
    var ctx = { supabase: supabase, tenantId: s.tenant_id };
    var brand = await supplier.getBrandStatus(s.supplier_brand_id, ctx);
    var campaign = await supplier.getCampaignStatus(s.supplier_campaign_id, ctx);
    var brandStatus = brand && brand.status;
    var campaignStatus = campaign && campaign.campaign_status;

    // POSITIVE — both required. Promote submitted -> approved, then recompute (the only path that
    // flips sms_enabled true for a wizard tenant). Idempotent: skip if already approved.
    if (brandStatus === 'APPROVED' && campaignStatus === 'ACTIVE') {
      if (s.status === 'approved') {
        console.log('[campaign-poll] tenant=' + s.tenant_id + ' session=' + s.id + ' already approved (noop)');
        return 'noop:already_approved';
      }
      var upd = await supabase.from('tcr_wizard_sessions')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', s.id);
      if (upd.error) {
        console.error('[campaign-poll] tenant=' + s.tenant_id + ' promote update failed:', upd.error.message);
        return 'error:promote_update';
      }
      var rc = await supabase.rpc('recompute_sms_enabled', { p_tenant_id: s.tenant_id });
      if (rc.error) {
        console.error('[campaign-poll] tenant=' + s.tenant_id + ' recompute_sms_enabled failed:', rc.error.message);
        return 'error:recompute';
      }
      console.log('[campaign-poll] tenant=' + s.tenant_id + ' session=' + s.id + ' PROMOTED -> approved + recompute_sms_enabled');
      return 'promoted:approved';
    }

    // KILL-or-NOOP — hand the carrier campaign status to record_campaign_status, the single source of
    // kill-mapping truth (rejected/suspended -> writes status, its trigger recomputes; healthy/unknown
    // -> no-op). No double recompute here.
    var kr = await supabase.rpc('record_campaign_status', {
      p_supplier_campaign_id: s.supplier_campaign_id,
      p_provider_status: campaignStatus || '',
      p_raw: { brand_status: brandStatus, campaign: campaign },
    });
    if (kr.error) {
      console.error('[campaign-poll] tenant=' + s.tenant_id + ' record_campaign_status failed:', kr.error.message);
      return 'error:record';
    }
    console.log('[campaign-poll] tenant=' + s.tenant_id + ' session=' + s.id + ' brand=' + brandStatus + ' campaign=' + campaignStatus + ' -> ' + kr.data);
    return 'status:' + kr.data;
  } catch (e) {
    console.error('[campaign-poll] tenant=' + s.tenant_id + ' exception (fail-open):', e.message);
    return 'error:exception';
  }
}

async function handler(req, res) {
  if (req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  var supabase = svc();
  var sessionsRes = await supabase
    .from('tcr_wizard_sessions')
    .select('id, tenant_id, status, supplier_campaign_id, supplier_brand_id')
    .in('status', ['submitted', 'approved'])
    .not('supplier_campaign_id', 'is', null)
    .not('supplier_brand_id', 'is', null);
  if (sessionsRes.error) {
    console.error('[campaign-poll] session query failed:', sessionsRes.error.message);
    return res.status(500).json({ error: 'session_query_failed' });
  }

  var sessions = sessionsRes.data || [];
  var results = [];
  for (var i = 0; i < sessions.length; i++) {
    var outcome = await processSession(supabase, sessions[i]);
    results.push({ tenant_id: sessions[i].tenant_id, session_id: sessions[i].id, outcome: outcome });
  }
  return res.status(200).json({ checked: sessions.length, results: results });
}

module.exports = handler;
module.exports.processSession = processSession;
