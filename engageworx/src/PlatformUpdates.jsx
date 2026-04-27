import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

var AUDIENCES = [
  { id: 'all',          label: 'Everyone' },
  { id: 'sp',           label: 'SP Admin only' },
  { id: 'csp',          label: 'CSP partners' },
  { id: 'master_agent', label: 'Master Agents' },
  { id: 'agent',        label: 'Agents' },
  { id: 'tenant',       label: 'Tenants (direct)' },
];

export default function PlatformUpdates({ C }) {
  var colors = C || { primary: '#00C9FF', accent: '#E040FB', muted: '#6B8BAE', text: '#fff' };
  var [updates, setUpdates] = useState([]);
  var [loading, setLoading] = useState(true);
  var [editing, setEditing] = useState(null); // {id, title, body, target_audience} or null
  var [title, setTitle] = useState('');
  var [body, setBody] = useState('');
  var [audience, setAudience] = useState('all');
  var [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      var r = await supabase.from('platform_updates').select('*').order('created_at', { ascending: false });
      setUpdates(r.data || []);
    } catch (e) { console.warn('[Updates] load:', e.message); }
    setLoading(false);
  }
  useEffect(function() { load(); }, []);

  function resetForm() { setEditing(null); setTitle(''); setBody(''); setAudience('all'); }
  function startEdit(u) { setEditing(u); setTitle(u.title || ''); setBody(u.body || ''); setAudience(u.target_audience || 'all'); }

  async function save(doPublish) {
    if (!title.trim()) { alert('Title is required.'); return; }
    setSaving(true);
    try {
      var payload = {
        title: title.trim(),
        body: body,
        target_audience: audience,
        published_at: doPublish ? new Date().toISOString() : (editing ? editing.published_at : null),
        status: doPublish ? 'published' : (editing && editing.status === 'draft_pending_review' ? 'draft_pending_review' : 'draft'),
      };
      if (editing && editing.id) {
        await supabase.from('platform_updates').update(payload).eq('id', editing.id);
      } else {
        await supabase.from('platform_updates').insert(payload);
      }
      resetForm();
      await load();
    } catch (e) { alert('Save failed: ' + e.message); }
    setSaving(false);
  }

  async function remove(id) {
    if (!window.confirm('Delete this update?')) return;
    try {
      await supabase.from('platform_updates').delete().eq('id', id);
      await load();
      if (editing && editing.id === id) resetForm();
    } catch (e) { alert('Delete failed: ' + e.message); }
  }

  async function togglePublish(u) {
    try {
      var next = u.published_at ? null : new Date().toISOString();
      await supabase.from('platform_updates').update({ published_at: next }).eq('id', u.id);
      await load();
    } catch (e) { alert('Error: ' + e.message); }
  }

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 };
  var inputStyle = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };
  var btnPrimary = { background: 'linear-gradient(135deg,#00C9FF,#E040FB)', border: 'none', borderRadius: 8, padding: '10px 18px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13 };
  var btnSec = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 };

  return (
    <div style={{ padding: '32px 40px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>📢 Platform Updates</h1>
        <p style={{ color: colors.muted, marginTop: 4, fontSize: 14 }}>Write release notes and announcements. Publish to target audiences — they appear in the in-portal notification bell.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Composer */}
        <div style={card}>
          <h3 style={{ color: '#fff', margin: '0 0 14px', fontSize: 15 }}>{editing ? 'Edit update' : 'New update'}</h3>
          <label style={{ color: colors.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 4 }}>Title</label>
          <input value={title} onChange={function(e) { setTitle(e.target.value); }} placeholder="What's new in this release?" style={inputStyle} />
          <label style={{ color: colors.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 4, marginTop: 12 }}>Body (markdown or plain text)</label>
          <textarea value={body} onChange={function(e) { setBody(e.target.value); }} rows={8} style={Object.assign({}, inputStyle, { resize: 'vertical' })} placeholder={"- New feature X\n- Bug fixes\n- Performance improvements"} />
          <label style={{ color: colors.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 4, marginTop: 12 }}>Audience</label>
          <select value={audience} onChange={function(e) { setAudience(e.target.value); }} style={inputStyle}>
            {AUDIENCES.map(function(a) { return <option key={a.id} value={a.id}>{a.label}</option>; })}
          </select>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={function() { save(false); }} disabled={saving} style={btnSec}>{saving ? 'Saving…' : 'Save Draft'}</button>
            <button onClick={function() { save(true); }} disabled={saving} style={btnPrimary}>{saving ? '…' : (editing && editing.published_at ? 'Update & Re-publish' : 'Publish Now')}</button>
            {editing && <button onClick={resetForm} style={btnSec}>Cancel</button>}
          </div>
        </div>

        {/* List */}
        <div style={card}>
          <h3 style={{ color: '#fff', margin: '0 0 14px', fontSize: 15 }}>All updates</h3>
          {loading ? (
            <div style={{ color: colors.muted, fontSize: 13, padding: 20, textAlign: 'center' }}>Loading…</div>
          ) : updates.length === 0 ? (
            <div style={{ color: colors.muted, fontSize: 13, padding: 20, textAlign: 'center' }}>No updates yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {updates.map(function(u) {
                return (
                  <div key={u.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{u.title}</div>
                        <div style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                          {(AUDIENCES.find(function(a) { return a.id === u.target_audience; }) || { label: u.target_audience }).label} ·
                          {u.published_at ? ' Published ' + new Date(u.published_at).toLocaleDateString() : ' Draft'}
                        </div>
                      </div>
                      <span style={{ background: u.published_at ? 'rgba(16,185,129,0.15)' : u.status === 'draft_pending_review' ? 'rgba(245,158,11,0.15)' : 'rgba(217,119,6,0.15)', color: u.published_at ? '#10b981' : u.status === 'draft_pending_review' ? '#f59e0b' : '#d97706', border: '1px solid ' + (u.published_at ? 'rgba(16,185,129,0.4)' : u.status === 'draft_pending_review' ? 'rgba(245,158,11,0.4)' : 'rgba(217,119,6,0.4)'), borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>{u.published_at ? '● Live' : u.status === 'draft_pending_review' ? '⏳ Pending Review' : u.status === 'rejected' ? '✕ Rejected' : '○ Draft'}</span>
                    </div>
                    {u.body && <div style={{ color: colors.muted, fontSize: 12, marginTop: 8, whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>{u.body}</div>}
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <button onClick={function() { startEdit(u); }} style={Object.assign({}, btnSec, { padding: '4px 10px', fontSize: 11 })}>Edit</button>
                      <button onClick={function() { togglePublish(u); }} style={Object.assign({}, btnSec, { padding: '4px 10px', fontSize: 11 })}>{u.published_at ? 'Unpublish' : 'Publish'}</button>
                      <button onClick={function() { remove(u.id); }} style={Object.assign({}, btnSec, { padding: '4px 10px', fontSize: 11, color: '#FF3B30', borderColor: 'rgba(255,59,48,0.35)' })}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
