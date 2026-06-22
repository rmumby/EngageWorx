// api/cron/telnyx-campaign-poll.js
// Reconciles live (approved) wizard-registered campaigns against Telnyx campaign.status.
// Kills flow through record_campaign_status (service-role) -> disable trigger -> recompute.
// Fail-open: on any fetch/parse error, skip and retry next tick — never write on failure.
// CommonJS to match the rest of api/ (repo has no "type":"module"). fetch is global on Node 18+.

var { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  var supabase = createClient(
    process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  var sessionsRes = await supabase
    .from('tcr_wizard_sessions')
    .select('id, tenant_id, supplier_campaign_id')
    .eq('status', 'approved')
    .not('supplier_campaign_id', 'is', null);
  if (sessionsRes.error) {
    console.error('[campaign-poll] session query failed', sessionsRes.error);
    return res.status(500).json({ error: 'session_query_failed' });
  }
  var sessions = sessionsRes.data || [];

  var results = [];
  for (var i = 0; i < sessions.length; i++) {
    var s = sessions[i];
    try {
      var r = await fetch(
        'https://api.telnyx.com/v2/10dlc/campaign/' + encodeURIComponent(s.supplier_campaign_id),
        { headers: { Authorization: 'Bearer ' + process.env.TELNYX_API_KEY, Accept: 'application/json' } }
      );
      if (!r.ok) { // fail-open: transient Telnyx error must never write a kill
        console.warn('[campaign-poll] telnyx ' + r.status + ' tenant=' + s.tenant_id);
        results.push({ tenant_id: s.tenant_id, skipped: 'telnyx_' + r.status });
        continue;
      }
      var body = await r.json();
      // Telnyx v2 wraps in { data: {...} }; tolerate a flat shape too. CONFIRM against live call.
      var status = (body && body.data && body.data.status) || (body && body.status) || null;
      if (!status) { results.push({ tenant_id: s.tenant_id, skipped: 'no_status' }); continue; }

      var rpcRes = await supabase.rpc('record_campaign_status', {
        p_supplier_campaign_id: s.supplier_campaign_id,
        p_provider_status: status,
        p_raw: (body && body.data) || body || {}
      });
      if (rpcRes.error) {
        console.error('[campaign-poll] rpc error tenant=' + s.tenant_id, rpcRes.error);
        results.push({ tenant_id: s.tenant_id, error: 'rpc_failed' });
        continue;
      }
      console.log('[campaign-poll] tenant=' + s.tenant_id + ' status=' + status + ' -> ' + rpcRes.data);
      results.push({ tenant_id: s.tenant_id, status: status, outcome: rpcRes.data });
    } catch (e) {
      console.error('[campaign-poll] exception tenant=' + s.tenant_id, e);
      results.push({ tenant_id: s.tenant_id, error: 'exception' });
    }
  }

  return res.status(200).json({ checked: sessions.length, results: results });
};
