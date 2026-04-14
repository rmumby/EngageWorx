// api/fetch-logs.js
// Query Vercel for recent function error logs. Used by support-triage when a
// ticket is classified as CODE_BUG. Returns a short JSON array of log lines.

// To obtain VERCEL_API_TOKEN:
//  1. Visit https://vercel.com/account/tokens
//  2. Create a new token scoped to the EngageWorx project ("Read only" is enough)
//  3. Add it on Vercel → EngageWorx → Settings → Environment Variables as VERCEL_API_TOKEN
//  4. Also set VERCEL_PROJECT_ID (from the project Settings page URL) and optionally VERCEL_TEAM_ID

async function fetchRecentLogs(opts) {
  var token = process.env.VERCEL_API_TOKEN;
  var projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return { error: 'VERCEL_API_TOKEN or VERCEL_PROJECT_ID not set', logs: [] };
  try {
    var since = Date.now() - (opts.hoursBack || 24) * 3600000;
    var qs = new URLSearchParams({
      projectId: projectId,
      since: String(since),
      limit: String(opts.limit || 50),
    });
    if (process.env.VERCEL_TEAM_ID) qs.set('teamId', process.env.VERCEL_TEAM_ID);

    // Vercel deployments endpoint → most recent → fetch runtime logs
    var depRes = await fetch('https://api.vercel.com/v6/deployments?' + qs.toString(), {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if (!depRes.ok) return { error: 'deployments list failed ' + depRes.status, logs: [] };
    var depData = await depRes.json();
    var latest = (depData.deployments || [])[0];
    if (!latest) return { error: 'no deployments found', logs: [] };

    var logParams = new URLSearchParams({ limit: String(opts.limit || 50), direction: 'backward' });
    if (process.env.VERCEL_TEAM_ID) logParams.set('teamId', process.env.VERCEL_TEAM_ID);
    var logRes = await fetch('https://api.vercel.com/v2/deployments/' + latest.uid + '/events?' + logParams.toString(), {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if (!logRes.ok) return { error: 'logs fetch failed ' + logRes.status, logs: [] };
    var entries = await logRes.json();
    var filtered = (entries || []).filter(function(e) {
      var text = (e.payload && (e.payload.text || e.text)) || '';
      if (opts.match && text.indexOf(opts.match) === -1) return false;
      if (opts.errorOnly && !/error|fail|exception|throw|❌/i.test(text)) return false;
      return true;
    }).slice(0, opts.limit || 10);
    return { logs: filtered.map(function(e) { return (e.payload && (e.payload.text || e.text)) || JSON.stringify(e); }) };
  } catch (err) {
    return { error: err.message, logs: [] };
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var body = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  var out = await fetchRecentLogs({
    hoursBack: parseInt(body.hoursBack, 10) || 24,
    limit: parseInt(body.limit, 10) || 10,
    match: body.match || null,
    errorOnly: body.errorOnly !== false,
  });
  return res.status(200).json(out);
};

module.exports.fetchRecentLogs = fetchRecentLogs;
