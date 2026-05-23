import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';

var SURFACES = [
  { id: 'concierge', label: 'Concierge' },
  { id: 'enquiry', label: 'Enquiry' },
  { id: 'supplier', label: 'Supplier' },
];

var STATUS_COLORS = {
  uploaded: { bg: '#6b728020', color: '#6b7280', label: 'Uploaded' },
  processing: { bg: '#f59e0b20', color: '#f59e0b', label: 'Processing…' },
  processed: { bg: '#10b98120', color: '#10b981', label: 'Processed' },
  failed: { bg: '#ef444420', color: '#ef4444', label: 'Failed' },
  archived: { bg: '#9ca3af20', color: '#9ca3af', label: 'Archived' },
};

export default function TenantKnowledgeDocuments({ tenantId, C }) {
  var colors = C || { bg: '#0f172a', surface: '#1e293b', border: '#334155', text: '#f1f5f9', muted: '#94a3b8', primary: '#6366f1' };
  var [documents, setDocuments] = useState([]);
  var [loading, setLoading] = useState(true);
  var [showUpload, setShowUpload] = useState(false);
  var [viewArticles, setViewArticles] = useState(null);
  var [articles, setArticles] = useState([]);
  var pollRef = useRef(null);

  var loadDocuments = useCallback(async function() {
    if (!tenantId) return;
    var { data } = await supabase
      .from('tenant_knowledge_documents')
      .select('*')
      .eq('tenant_id', tenantId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false });
    setDocuments(data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(function() { loadDocuments(); }, [loadDocuments]);

  // Poll while any document is processing
  useEffect(function() {
    var hasProcessing = documents.some(function(d) { return d.status === 'processing'; });
    if (hasProcessing && !pollRef.current) {
      pollRef.current = setInterval(loadDocuments, 4000);
    } else if (!hasProcessing && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return function() { if (pollRef.current) clearInterval(pollRef.current); };
  }, [documents, loadDocuments]);

  async function handleViewArticles(doc) {
    setViewArticles(doc);
    var { data } = await supabase
      .from('wedding_kb_articles')
      .select('id, title, content, surface, is_published, created_at')
      .eq('source_document_id', doc.id)
      .order('created_at');
    setArticles(data || []);
  }

  async function handleReprocess(doc) {
    if (!window.confirm('Reprocess "' + doc.filename + '"? Existing articles from this document will be replaced.')) return;
    var session = await supabase.auth.getSession();
    var token = session.data?.session?.access_token;
    await fetch('/api/kb-document/' + doc.id + '?action=reprocess', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
    });
    loadDocuments();
  }

  async function handleArchive(doc) {
    if (!window.confirm('Archive "' + doc.filename + '"? Articles will remain live.')) return;
    var session = await supabase.auth.getSession();
    var token = session.data?.session?.access_token;
    await fetch('/api/kb-document/' + doc.id, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token },
    });
    loadDocuments();
  }

  async function handleDelete(doc) {
    if (!window.confirm('Permanently delete "' + doc.filename + '" AND all its articles? This cannot be undone.')) return;
    var session = await supabase.auth.getSession();
    var token = session.data?.session?.access_token;
    await fetch('/api/kb-document/' + doc.id + '?hard=true', {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token },
    });
    loadDocuments();
  }

  var cardStyle = { background: colors.surface, border: '1px solid ' + colors.border, borderRadius: 12, padding: 20 };
  var btnPrimary = { background: colors.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };
  var btnSec = { background: 'transparent', color: colors.text, border: '1px solid ' + colors.border, borderRadius: 8, padding: '6px 12px', fontWeight: 600, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h3 style={{ color: colors.text, fontSize: 16, fontWeight: 700, margin: 0 }}>Uploaded Documents</h3>
          <p style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Documents are processed by AI into structured articles your concierge can reference.</p>
        </div>
        <button onClick={function() { setShowUpload(true); }} style={btnPrimary}>+ Upload Document</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: colors.muted }}>Loading…</div>
      ) : documents.length === 0 ? (
        <div style={Object.assign({}, cardStyle, { textAlign: 'center', padding: 60 })}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <div style={{ color: colors.text, fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No documents yet</div>
          <div style={{ color: colors.muted, fontSize: 13 }}>Upload a PDF, DOCX, or text file to get started.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {documents.map(function(doc) {
            var st = STATUS_COLORS[doc.status] || STATUS_COLORS.uploaded;
            return (
              <div key={doc.id} style={Object.assign({}, cardStyle, { display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' })}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: colors.text, fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</div>
                  <div style={{ color: colors.muted, fontSize: 11, marginTop: 3 }}>
                    {(doc.surfaces || []).join(', ')} · {Math.round(doc.file_size / 1024)}KB · {new Date(doc.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span>
                {doc.status === 'processed' && <span style={{ color: colors.muted, fontSize: 11 }}>{doc.article_count} articles</span>}
                <div style={{ display: 'flex', gap: 6 }}>
                  {doc.status === 'processed' && <button onClick={function() { handleViewArticles(doc); }} style={btnSec}>View</button>}
                  {(doc.status === 'processed' || doc.status === 'failed') && <button onClick={function() { handleReprocess(doc); }} style={btnSec}>Reprocess</button>}
                  <button onClick={function() { handleArchive(doc); }} style={btnSec}>Archive</button>
                  <button onClick={function() { handleDelete(doc); }} style={Object.assign({}, btnSec, { color: '#ef4444', borderColor: '#ef444444' })}>Delete</button>
                </div>
                {doc.status === 'failed' && doc.error_message && (
                  <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4, gridColumn: '1 / -1' }} title={doc.error_message}>Error: {doc.error_message.substring(0, 80)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && <UploadModal colors={colors} tenantId={tenantId} onClose={function() { setShowUpload(false); loadDocuments(); }} />}

      {/* Articles Modal */}
      {viewArticles && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={function() { setViewArticles(null); }}>
          <div style={{ background: colors.surface, border: '1px solid ' + colors.border, borderRadius: 16, padding: 28, width: 700, maxHeight: '80vh', overflowY: 'auto' }} onClick={function(e) { e.stopPropagation(); }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ color: colors.text, margin: 0, fontSize: 18, fontWeight: 700 }}>Articles from "{viewArticles.filename}"</h2>
              <button onClick={function() { setViewArticles(null); }} style={btnSec}>Close</button>
            </div>
            {articles.length === 0 ? (
              <div style={{ color: colors.muted, padding: 20, textAlign: 'center' }}>No articles found.</div>
            ) : articles.map(function(a) {
              return (
                <div key={a.id} style={{ padding: '12px 0', borderBottom: '1px solid ' + colors.border }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ color: colors.text, fontWeight: 700, fontSize: 13 }}>{a.title}</div>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: colors.primary + '20', color: colors.primary }}>{a.surface}</span>
                  </div>
                  <div style={{ color: colors.muted, fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{a.content.substring(0, 300)}{a.content.length > 300 ? '…' : ''}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function UploadModal({ colors, tenantId, onClose }) {
  var [file, setFile] = useState(null);
  var [surfaces, setSurfaces] = useState(['concierge']);
  var [uploading, setUploading] = useState(false);
  var [error, setError] = useState('');
  var [dragOver, setDragOver] = useState(false);
  var inputRef = useRef(null);

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    var dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  function toggleSurface(id) {
    setSurfaces(function(prev) {
      if (prev.includes(id)) return prev.filter(function(s) { return s !== id; });
      return prev.concat(id);
    });
  }

  async function handleUpload() {
    if (!file) { setError('Select a file'); return; }
    if (surfaces.length === 0) { setError('Select at least one surface'); return; }
    setError('');
    setUploading(true);

    try {
      var session = await supabase.auth.getSession();
      var token = session.data?.session?.access_token;

      var formData = new FormData();
      formData.append('file', file);
      formData.append('surfaces', JSON.stringify(surfaces));

      var resp = await fetch('/api/kb-upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: formData,
      });

      var data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Upload failed');

      onClose();
    } catch (e) {
      setError(e.message);
    }
    setUploading(false);
  }

  var cardStyle = { background: colors.surface, border: '1px solid ' + colors.border, borderRadius: 16, padding: 28, width: 480 };
  var btnPrimary = { background: colors.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: uploading ? 0.6 : 1 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={cardStyle} onClick={function(e) { e.stopPropagation(); }}>
        <h2 style={{ color: colors.text, margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>Upload Knowledge Document</h2>

        {/* Drop zone */}
        <div
          onDragOver={function(e) { e.preventDefault(); setDragOver(true); }}
          onDragLeave={function() { setDragOver(false); }}
          onDrop={handleDrop}
          onClick={function() { inputRef.current?.click(); }}
          style={{ border: '2px dashed ' + (dragOver ? colors.primary : colors.border), borderRadius: 12, padding: 32, textAlign: 'center', cursor: 'pointer', background: dragOver ? colors.primary + '08' : 'transparent', marginBottom: 16, transition: 'all 0.2s' }}
        >
          <input ref={inputRef} type="file" accept=".pdf,.docx,.txt,.md,.html,.eml" style={{ display: 'none' }} onChange={function(e) { if (e.target.files[0]) setFile(e.target.files[0]); }} />
          {file ? (
            <div>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📄</div>
              <div style={{ color: colors.text, fontWeight: 700, fontSize: 14 }}>{file.name}</div>
              <div style={{ color: colors.muted, fontSize: 11 }}>{Math.round(file.size / 1024)}KB</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📤</div>
              <div style={{ color: colors.text, fontWeight: 600, fontSize: 13 }}>Drop file here or click to browse</div>
              <div style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>PDF, DOCX, TXT, MD, HTML, EML — max 25MB</div>
            </div>
          )}
        </div>

        {/* Surface checkboxes */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: colors.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Target surfaces</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {SURFACES.map(function(s) {
              var active = surfaces.includes(s.id);
              return (
                <button key={s.id} onClick={function() { toggleSurface(s.id); }} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: active ? colors.primary + '20' : 'transparent', color: active ? colors.primary : colors.muted, border: '1px solid ' + (active ? colors.primary + '55' : colors.border) }}>
                  {active ? '✓ ' : ''}{s.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'transparent', color: colors.muted, border: '1px solid ' + colors.border, borderRadius: 8, padding: '10px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={handleUpload} disabled={uploading} style={btnPrimary}>{uploading ? 'Uploading…' : 'Upload & Process'}</button>
        </div>
      </div>
    </div>
  );
}
