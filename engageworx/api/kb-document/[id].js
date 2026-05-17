// api/kb-document/[id].js — Manage a single knowledge document
// DELETE /api/kb-document/:id          → soft-archive (status='archived')
// DELETE /api/kb-document/:id?hard=true → hard delete doc + articles
// GET    /api/kb-document/:id/articles → list linked articles
// POST   /api/kb-document/:id/reprocess → delete articles, reprocess

var { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  var supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  var documentId = req.query.id;
  if (!documentId) return res.status(400).json({ error: 'Document ID required' });

  // Auth
  var authHeader = req.headers.authorization || '';
  var token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  var { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid auth token' });

  // Load document + verify tenant membership
  var { data: doc } = await supabase
    .from('tenant_knowledge_documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (!doc) return res.status(404).json({ error: 'Document not found' });

  var { data: membership } = await supabase
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', doc.tenant_id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership) return res.status(403).json({ error: 'Access denied' });

  var action = req.query.action || null;

  // GET — list articles for this document
  if (req.method === 'GET' || action === 'articles') {
    var { data: articles, error: artErr } = await supabase
      .from('wedding_kb_articles')
      .select('id, title, content, surface, is_published, created_at')
      .eq('source_document_id', documentId)
      .order('created_at', { ascending: true });

    if (artErr) return res.status(500).json({ error: 'Failed to load articles' });
    return res.status(200).json({ articles: articles || [] });
  }

  // POST — reprocess
  if (req.method === 'POST' || action === 'reprocess') {
    // Delete existing articles for this document
    await supabase.from('wedding_kb_articles').delete().eq('source_document_id', documentId);

    // Reset status
    await supabase.from('tenant_knowledge_documents').update({
      status: 'processing',
      article_count: 0,
      error_message: null,
      processed_at: null,
    }).eq('id', documentId);

    // Trigger processing
    var processUrl = (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000') + '/api/kb-process';
    fetch(processUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (process.env.SUPABASE_SERVICE_ROLE_KEY || '') },
      body: JSON.stringify({ document_id: documentId }),
    }).catch(function(e) { console.warn('[kb-document] Reprocess trigger failed:', e.message); });

    console.log('[kb-document] Reprocess triggered:', documentId);
    return res.status(200).json({ success: true, status: 'processing' });
  }

  // DELETE — archive or hard delete
  if (req.method === 'DELETE') {
    var hard = req.query.hard === 'true';

    if (hard) {
      // Hard delete: remove articles, storage file, and document row
      await supabase.from('wedding_kb_articles').delete().eq('source_document_id', documentId);
      await supabase.storage.from('tenant-kb-docs').remove([doc.file_path]);
      await supabase.from('tenant_knowledge_documents').delete().eq('id', documentId);
      console.log('[kb-document] Hard deleted:', documentId);
      return res.status(200).json({ success: true, deleted: true });
    } else {
      // Soft archive: keep articles live, just mark document as archived
      await supabase.from('tenant_knowledge_documents').update({ status: 'archived' }).eq('id', documentId);
      console.log('[kb-document] Archived:', documentId);
      return res.status(200).json({ success: true, archived: true });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
