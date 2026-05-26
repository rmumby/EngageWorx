import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

var SURFACES = [
  { id: 'concierge', label: 'Concierge' },
  { id: 'enquiry', label: 'Enquiry' },
  { id: 'supplier', label: 'Supplier' },
];

function sourceLabel(article) {
  if (article.source && article.source.filename) return 'From: ' + article.source.filename;
  if (article.source_document_id) return 'From: uploaded document';
  return 'Created in portal';
}

export default function KBArticleEditor({ tenantId, C }) {
  var colors = C || { bg: '#0f172a', surface: '#1e293b', border: '#334155', text: '#f1f5f9', muted: '#94a3b8', primary: '#6366f1' };
  var [articles, setArticles] = useState([]);
  var [loading, setLoading] = useState(true);
  var [editId, setEditId] = useState(null);
  var [editTitle, setEditTitle] = useState('');
  var [editContent, setEditContent] = useState('');
  var [editSurface, setEditSurface] = useState('concierge');
  var [editPublished, setEditPublished] = useState(true);
  var [saving, setSaving] = useState(false);
  var [error, setError] = useState('');
  var [filterSurface, setFilterSurface] = useState('all');
  var [filterSource, setFilterSource] = useState('all');
  var [showCreate, setShowCreate] = useState(false);

  var loadArticles = useCallback(async function() {
    if (!tenantId) return;
    try {
      var session = await supabase.auth.getSession();
      var token = session.data?.session?.access_token || '';
      var url = '/api/kb-articles?tenant_id=' + tenantId;
      if (filterSurface !== 'all') url += '&surface=' + filterSurface;
      if (filterSource !== 'all') url += '&source_document_id=' + filterSource;
      var resp = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
      var data = await resp.json();
      setArticles(data.articles || []);
    } catch (e) { console.warn('[KBArticleEditor] Load error:', e.message); }
    setLoading(false);
  }, [tenantId, filterSurface, filterSource]);

  useEffect(function() { loadArticles(); }, [loadArticles]);

  var sources = [];
  var sourceMap = {};
  articles.forEach(function(a) {
    if (a.source && a.source.id && !sourceMap[a.source.id]) {
      sourceMap[a.source.id] = true;
      sources.push({ id: a.source.id, label: a.source.filename });
    }
  });

  function startEdit(article) { setEditId(article.id); setEditTitle(article.title); setEditContent(article.content); setEditSurface(article.surface); setEditPublished(article.is_published); setShowCreate(false); setError(''); }
  function startCreate() { setEditId('_new'); setEditTitle(''); setEditContent(''); setEditSurface('concierge'); setEditPublished(true); setShowCreate(true); setError(''); }
  function cancelEdit() { setEditId(null); setShowCreate(false); setError(''); }

  async function getToken() { var s = await supabase.auth.getSession(); return s.data?.session?.access_token || ''; }

  async function handleSave() {
    if (!editTitle.trim()) { setError('Title is required'); return; }
    if (!editContent.trim()) { setError('Content is required'); return; }
    setError(''); setSaving(true);
    try {
      var token = await getToken();
      var isNew = editId === '_new';
      var payload = isNew ? { tenant_id: tenantId, title: editTitle, content: editContent, surface: editSurface, is_published: editPublished } : { id: editId, title: editTitle, content: editContent, surface: editSurface, is_published: editPublished };
      var resp = await fetch('/api/kb-articles', { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(payload) });
      var data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Save failed');
      cancelEdit(); setTimeout(loadArticles, 200);
    } catch (e) { setError(e.message); }
    setSaving(false);
  }

  async function handleDelete(article) {
    if (!window.confirm('Delete "' + article.title + '"? This cannot be undone.')) return;
    try {
      var token = await getToken();
      var resp = await fetch('/api/kb-articles', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ id: article.id }) });
      if (!resp.ok) { var d = await resp.json(); throw new Error(d.error || 'Delete failed'); }
      setArticles(function(prev) { return prev.filter(function(a) { return a.id !== article.id; }); });
      if (editId === article.id) cancelEdit();
    } catch (e) { alert('Delete failed: ' + e.message); }
  }

  async function handleBulkDeleteSource(sourceId, sourceName) {
    var count = articles.filter(function(a) { return a.source_document_id === sourceId; }).length;
    if (!window.confirm('Delete all ' + count + ' articles from "' + sourceName + '"?')) return;
    try {
      var token = await getToken();
      var resp = await fetch('/api/kb-articles', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ source_document_id: sourceId }) });
      if (!resp.ok) { var d = await resp.json(); throw new Error(d.error || 'Bulk delete failed'); }
      setFilterSource('all'); setTimeout(loadArticles, 200);
    } catch (e) { alert('Bulk delete failed: ' + e.message); }
  }

  var card = { background: colors.surface, border: '1px solid ' + colors.border, borderRadius: 12, padding: 16 };
  var inputStyle = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', color: colors.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };
  var labelStyle = { color: colors.muted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 };
  var btnSec = { background: 'transparent', border: '1px solid ' + colors.border, borderRadius: 6, padding: '5px 10px', color: colors.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ color: colors.text, fontSize: 16, fontWeight: 700, margin: 0 }}>Knowledge Base Articles</h3>
          <p style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Articles the AI concierge uses to answer questions. Click to edit inline.</p>
        </div>
        <button onClick={startCreate} style={{ background: 'linear-gradient(135deg, ' + colors.primary + ', ' + (colors.accent || colors.primary) + ')', color: '#000', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>+ New Article</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {[{ id: 'all', label: 'All surfaces' }].concat(SURFACES).map(function(s) {
          var active = filterSurface === s.id;
          return <button key={s.id} onClick={function() { setFilterSurface(s.id); }} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: active ? colors.primary + '20' : 'transparent', color: active ? colors.primary : colors.muted, border: '1px solid ' + (active ? colors.primary + '55' : colors.border) }}>{s.label}</button>;
        })}
        {sources.length > 0 && (
          <select value={filterSource} onChange={function(e) { setFilterSource(e.target.value); }} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '5px 10px', color: colors.muted, fontSize: 11, fontFamily: 'inherit', outline: 'none', marginLeft: 8 }}>
            <option value="all">All sources</option>
            {sources.map(function(s) { return <option key={s.id} value={s.id}>{s.label}</option>; })}
          </select>
        )}
        {filterSource !== 'all' && (
          <button onClick={function() { var src = sources.find(function(s) { return s.id === filterSource; }); if (src) handleBulkDeleteSource(filterSource, src.label); }} style={Object.assign({}, btnSec, { color: '#ef4444', borderColor: '#ef444444', marginLeft: 4 })}>Delete all from this source</button>
        )}
        <div style={{ marginLeft: 'auto', color: colors.muted, fontSize: 12 }}>{articles.length} article{articles.length !== 1 ? 's' : ''}</div>
      </div>

      {showCreate && (
        <div style={Object.assign({}, card, { marginBottom: 12, border: '1px solid ' + colors.primary + '44' })}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: colors.primary, fontSize: 13, fontWeight: 700 }}>New Article</span>
            <button onClick={cancelEdit} style={btnSec}>Cancel</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 10, marginBottom: 10 }}>
            <div><label style={labelStyle}>Title *</label><input value={editTitle} onChange={function(e) { setEditTitle(e.target.value); }} placeholder="e.g. Bar & Drinks Service" style={inputStyle} /></div>
            <div><label style={labelStyle}>Surface</label><select value={editSurface} onChange={function(e) { setEditSurface(e.target.value); }} style={inputStyle}>{SURFACES.map(function(s) { return <option key={s.id} value={s.id}>{s.label}</option>; })}</select></div>
          </div>
          <div style={{ marginBottom: 10 }}><label style={labelStyle}>Content *</label><textarea value={editContent} onChange={function(e) { setEditContent(e.target.value); }} rows={8} placeholder="Article content the AI will use to answer questions..." style={Object.assign({}, inputStyle, { resize: 'vertical', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 })} /></div>
          {error && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <button onClick={handleSave} disabled={saving} style={{ background: colors.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving...' : 'Create Article'}</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: colors.muted }}>Loading...</div>
      ) : articles.length === 0 ? (
        <div style={Object.assign({}, card, { textAlign: 'center', padding: 40 })}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
          <div style={{ color: colors.text, fontWeight: 600, marginBottom: 4 }}>No articles yet</div>
          <div style={{ color: colors.muted, fontSize: 12 }}>Click "+ New Article" to add knowledge for the AI concierge.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {articles.map(function(article) {
            var isEditing = editId === article.id;
            return (
              <div key={article.id} style={Object.assign({}, card, isEditing ? { border: '1px solid ' + colors.primary + '44' } : {})}>
                {isEditing ? (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 10, marginBottom: 10 }}>
                      <div><label style={labelStyle}>Title</label><input value={editTitle} onChange={function(e) { setEditTitle(e.target.value); }} style={inputStyle} /></div>
                      <div><label style={labelStyle}>Surface</label><select value={editSurface} onChange={function(e) { setEditSurface(e.target.value); }} style={inputStyle}>{SURFACES.map(function(s) { return <option key={s.id} value={s.id}>{s.label}</option>; })}</select></div>
                    </div>
                    <div style={{ marginBottom: 10 }}><label style={labelStyle}>Content</label><textarea value={editContent} onChange={function(e) { setEditContent(e.target.value); }} rows={10} style={Object.assign({}, inputStyle, { resize: 'vertical', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 })} /></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: colors.text, fontSize: 12, cursor: 'pointer' }}><input type="checkbox" checked={editPublished} onChange={function() { setEditPublished(!editPublished); }} /> Published</label>
                      <span style={{ color: colors.muted, fontSize: 11 }}>{editContent.length} chars</span>
                    </div>
                    {error && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{error}</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleSave} disabled={saving} style={{ background: colors.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
                      <button onClick={cancelEdit} style={btnSec}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={function() { startEdit(article); }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ color: colors.text, fontWeight: 600, fontSize: 13 }}>{article.title}</span>
                        <span style={{ padding: '1px 6px', borderRadius: 4, background: colors.primary + '15', color: colors.primary, fontSize: 9, fontWeight: 600 }}>{article.surface}</span>
                        {!article.is_published && <span style={{ padding: '1px 6px', borderRadius: 4, background: '#f59e0b20', color: '#f59e0b', fontSize: 9, fontWeight: 600 }}>Draft</span>}
                      </div>
                      <div style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>
                        {article.content.length} chars · {sourceLabel(article)} · Updated {new Date(article.updated_at || article.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={function() { startEdit(article); }} style={btnSec}>Edit</button>
                      <button onClick={function() { handleDelete(article); }} style={Object.assign({}, btnSec, { color: '#ef4444', borderColor: '#ef444444' })}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
