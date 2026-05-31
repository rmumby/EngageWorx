// api/platform-issues.js — SA-only issue capture and triage
// GET    — list issues (filters: status, category, severity)
// POST   — create issue (reporter_user_id from JWT, not client)
// PUT    — update issue (status, severity, notes)

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function verifySA(supabase, req) {
  var authHeader = req.headers.authorization || '';
  var token = authHeader.replace('Bearer ', '');
  if (!token) return { error: 'Missing auth token', status: 401 };
  var { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return { error: 'Invalid auth token', status: 401 };
  var { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  var isSA = profile && (profile.role === 'superadmin' || profile.role === 'super_admin' || profile.role === 'sp_admin');
  if (!isSA) return { error: 'SA role required', status: 403 };
  return { user: user };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var supabase = getSupabase();

  if (req.method === 'GET') {
    var auth = await verifySA(supabase, req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    var query = supabase.from('platform_issues')
      .select('*')
      .order('created_at', { ascending: false });
    if (req.query.status) query = query.eq('status', req.query.status);
    if (req.query.category) query = query.eq('category', req.query.category);
    if (req.query.severity) query = query.eq('severity', req.query.severity);
    if (req.query.exclude_closed !== 'false') {
      query = query.not('status', 'in', '("fixed","wontfix","duplicate")');
    }
    var { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ issues: data || [] });
  }

  if (req.method === 'POST') {
    var auth2 = await verifySA(supabase, req);
    if (auth2.error) return res.status(auth2.status).json({ error: auth2.error });
    var body = req.body || {};
    if (!body.description || body.description.trim().length === 0) return res.status(400).json({ error: 'description required' });
    if (body.description.trim().length > 500) return res.status(400).json({ error: 'description max 500 chars' });
    var VALID_CATEGORIES = ['visual', 'functional', 'data', 'copy', 'accessibility', 'architecture', 'other'];
    if (body.category && VALID_CATEGORIES.indexOf(body.category) === -1) return res.status(400).json({ error: 'Invalid category' });
    var row = {
      reporter_user_id: auth2.user.id,
      description: body.description.trim(),
      tenant_context_id: body.tenant_context_id || null,
      url_context: body.url_context || null,
      screen_label: body.screen_label || null,
      category: body.category || null,
      notes: body.notes || null,
    };
    var { data: issue, error: insertErr } = await supabase.from('platform_issues').insert(row).select('*').single();
    if (insertErr) return res.status(500).json({ error: insertErr.message });
    console.log('[platform-issues] Created:', issue.id, '—', issue.description.substring(0, 60));
    return res.status(200).json({ issue: issue });
  }

  if (req.method === 'PUT') {
    var auth3 = await verifySA(supabase, req);
    if (auth3.error) return res.status(auth3.status).json({ error: auth3.error });
    var body2 = req.body || {};
    if (!body2.id) return res.status(400).json({ error: 'id required' });
    var VALID_STATUSES = ['new', 'triaged', 'in_progress', 'fixed', 'wontfix', 'duplicate'];
    var VALID_SEVERITIES = ['P1', 'P2', 'P3'];
    var updates = { updated_at: new Date().toISOString() };
    if (body2.status !== undefined) {
      if (VALID_STATUSES.indexOf(body2.status) === -1) return res.status(400).json({ error: 'Invalid status' });
      updates.status = body2.status;
    }
    if (body2.severity !== undefined) {
      if (body2.severity !== null && VALID_SEVERITIES.indexOf(body2.severity) === -1) return res.status(400).json({ error: 'Invalid severity' });
      updates.severity = body2.severity;
    }
    if (body2.category !== undefined) {
      var VALID_CATEGORIES_PUT = ['visual', 'functional', 'data', 'copy', 'accessibility', 'architecture', 'other'];
      if (body2.category !== null && VALID_CATEGORIES_PUT.indexOf(body2.category) === -1) return res.status(400).json({ error: 'Invalid category' });
      updates.category = body2.category;
    }
    if (body2.notes !== undefined) updates.notes = body2.notes;
    var { data: updated, error: updateErr } = await supabase.from('platform_issues').update(updates).eq('id', body2.id).select('*').single();
    if (updateErr) return res.status(500).json({ error: updateErr.message });
    console.log('[platform-issues] Updated:', body2.id, updates);
    return res.status(200).json({ issue: updated });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
