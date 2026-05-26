// api/kb-articles.js — CRUD for wedding_kb_articles
// GET    ?tenant_id=xxx&surface=yyy — list articles (with source document info)
// POST   body: { tenant_id, surface, title, content } — create article
// PUT    body: { id, title, content, is_published } — update article
// DELETE body: { id } — delete article
// DELETE body: { source_document_id } — bulk delete all articles from a source
// Auth: superadmin OR tenant admin/owner

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function verifyAuth(supabase, req, tenantId, opts) {
  var requireAdmin = opts && opts.requireAdmin;
  var authHeader = req.headers.authorization || '';
  var token = authHeader.replace('Bearer ', '');
  if (!token) return { error: 'Missing auth token', status: 401 };
  var { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return { error: 'Invalid auth token', status: 401 };
  var { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  var isSA = profile && (profile.role === 'superadmin' || profile.role === 'super_admin' || profile.role === 'sp_admin');
  if (isSA) return { user: user };
  var { data: mem } = await supabase.from('tenant_members')
    .select('id, role').eq('tenant_id', tenantId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
  if (!mem) return { error: 'Not authorized', status: 403 };
  if (requireAdmin && mem.role !== 'admin' && mem.role !== 'owner') {
    return { error: 'Admin or owner role required', status: 403 };
  }
  return { user: user };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var supabase = getSupabase();
  var body = req.body || {};

  if (req.method === 'GET') {
    var tenantId = req.query.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
    var auth = await verifyAuth(supabase, req, tenantId);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    var query = supabase.from('wedding_kb_articles')
      .select('id, title, content, surface, is_published, source_document_id, created_at, updated_at, source:source_document_id(id, filename, status)')
      .eq('tenant_id', tenantId).order('created_at', { ascending: false });
    if (req.query.surface) query = query.eq('surface', req.query.surface);
    if (req.query.source_document_id) query = query.eq('source_document_id', req.query.source_document_id);
    var { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ articles: data || [] });
  }

  if (req.method === 'POST') {
    var tenantId2 = body.tenant_id;
    if (!tenantId2) return res.status(400).json({ error: 'tenant_id required' });
    if (!body.title) return res.status(400).json({ error: 'title required' });
    if (!body.content) return res.status(400).json({ error: 'content required' });
    var auth2 = await verifyAuth(supabase, req, tenantId2, { requireAdmin: true });
    if (auth2.error) return res.status(auth2.status).json({ error: auth2.error });
    var { data: article, error: insertErr } = await supabase.from('wedding_kb_articles').insert({
      tenant_id: tenantId2, title: body.title.trim(), content: body.content.trim(),
      surface: body.surface || 'concierge', is_published: body.is_published !== false, source_document_id: null,
    }).select('*').single();
    if (insertErr) return res.status(500).json({ error: insertErr.message });
    console.log('[kb-articles] Created:', { id: article.id, title: article.title, tenant: tenantId2 });
    return res.status(200).json({ article: article });
  }

  if (req.method === 'PUT') {
    var articleId = body.id;
    if (!articleId) return res.status(400).json({ error: 'id required' });
    var { data: existing, error: findErr } = await supabase.from('wedding_kb_articles')
      .select('id, tenant_id').eq('id', articleId).maybeSingle();
    if (findErr || !existing) return res.status(404).json({ error: 'Article not found' });
    var authPut = await verifyAuth(supabase, req, existing.tenant_id, { requireAdmin: true });
    if (authPut.error) return res.status(authPut.status).json({ error: authPut.error });
    var updates = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.content !== undefined) updates.content = body.content.trim();
    if (body.is_published !== undefined) updates.is_published = body.is_published;
    if (body.surface !== undefined) updates.surface = body.surface;
    var { data: updated, error: updateErr } = await supabase.from('wedding_kb_articles')
      .update(updates).eq('id', articleId).select('*').single();
    if (updateErr) return res.status(500).json({ error: updateErr.message });
    console.log('[kb-articles] Updated:', articleId);
    return res.status(200).json({ article: updated });
  }

  if (req.method === 'DELETE') {
    if (body.source_document_id) {
      var { data: sampleArticle } = await supabase.from('wedding_kb_articles')
        .select('tenant_id').eq('source_document_id', body.source_document_id).limit(1).maybeSingle();
      if (!sampleArticle) return res.status(404).json({ error: 'No articles for this source' });
      var authBulk = await verifyAuth(supabase, req, sampleArticle.tenant_id, { requireAdmin: true });
      if (authBulk.error) return res.status(authBulk.status).json({ error: authBulk.error });
      var { error: bulkErr } = await supabase.from('wedding_kb_articles')
        .delete().eq('source_document_id', body.source_document_id);
      if (bulkErr) return res.status(500).json({ error: bulkErr.message });
      console.log('[kb-articles] Bulk deleted articles from source:', body.source_document_id);
      return res.status(200).json({ success: true });
    }
    var delId = body.id;
    if (!delId) return res.status(400).json({ error: 'id or source_document_id required' });
    var { data: delArticle, error: delFindErr } = await supabase.from('wedding_kb_articles')
      .select('id, tenant_id, title').eq('id', delId).maybeSingle();
    if (delFindErr || !delArticle) return res.status(404).json({ error: 'Article not found' });
    var authDel = await verifyAuth(supabase, req, delArticle.tenant_id, { requireAdmin: true });
    if (authDel.error) return res.status(authDel.status).json({ error: authDel.error });
    var { error: delErr } = await supabase.from('wedding_kb_articles').delete().eq('id', delId);
    if (delErr) return res.status(500).json({ error: delErr.message });
    console.log('[kb-articles] Deleted:', delId, delArticle.title);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
