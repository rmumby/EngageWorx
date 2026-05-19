// api/cron-sequences.js — Cron to process due sequence steps
// Configured in vercel.json as a cron job (every 4 hours)
// Calls processDueSteps directly (no HTTP round-trip) to avoid
// Vercel function timeout on the inner /api/sequences call.

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Import processDueSteps from sequences.js
var { processDueSteps } = require('./sequences');

module.exports = async function handler(req, res) {
  // Verify this is a legitimate cron call
  var authHeader = req.headers['authorization'];
  var cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[Cron] Sequence processing started:', new Date().toISOString());

  try {
    var supabase = getSupabase();
    var result = await processDueSteps(supabase);
    console.log('[Cron] Sequence processing complete:', result);
    return res.status(200).json({ success: true, processed: result.processed, errors: result.errors, stuck_leads_fixed: result.stuck_leads_fixed || 0 });
  } catch (err) {
    console.error('[Cron] Sequence processing error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
