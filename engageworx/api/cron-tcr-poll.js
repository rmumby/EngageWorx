// api/cron-tcr-poll.js — Daily cron to poll Twilio for TCR status updates
// Fallback for the missing webhook URL field in Twilio Console

module.exports = async function handler(req, res) {
  var authHeader = req.headers['authorization'];
  var cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[Cron] TCR polling started:', new Date().toISOString());

  try {
    var baseUrl = 'https://portal.engwx.com';
    var resp = await fetch(baseUrl + '/api/tcr?action=poll-pending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    var data = await resp.json();
    console.log('[Cron] TCR polling complete:', data.checked, 'checked,', data.changed, 'changed');
    return res.status(200).json({ success: true, ...data });
  } catch (err) {
    console.error('[Cron] TCR polling error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
