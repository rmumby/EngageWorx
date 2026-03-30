// api/cron-sequences.js — Daily cron to process due sequence steps
// Configured in vercel.json as a cron job

module.exports = async function handler(req, res) {
  // Verify this is a legitimate cron call
  var authHeader = req.headers['authorization'];
  var cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[Cron] Sequence processing started:', new Date().toISOString());

  try {
    var baseUrl = 'https://portal.engwx.com';
    var resp = await fetch(baseUrl + '/api/sequences?action=process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    var data = await resp.json();
    console.log('[Cron] Sequence processing complete:', data);
    return res.status(200).json({ success: true, ...data });
  } catch (err) {
    console.error('[Cron] Sequence processing error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
