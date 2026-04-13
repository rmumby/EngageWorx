import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

var ACTION_STYLE = {
  advance_stage:   { label: 'Advance Stage',  color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  enroll_sequence: { label: 'Enroll Sequence', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  review:          { label: 'Needs Review',    color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  auto_reply:      { label: 'Auto-Reply',      color: '#06b6d4', bg: 'rgba(6,182,212,0.12)' },
  no_action:       { label: 'No Action',       color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
};

export default function EmailDigest({ C, currentTenantId }) {
  var colors = C || { bg: '#080d1a', surface: '#0d1425', border: '#182440', primary: '#00C9FF', accent: '#E040FB', text: '#E8F4FD', muted: '#6B8BAE' };
  var [items, setItems] = useState([]);
  var [loading, setLoading] = useState(true);
  var [filter, setFilter] = useState('pending');
  var [editingId, setEditingId] = useState(null);
  var [editDraft, setEditDraft] = useState('');
  var [sending, setSending] = useState(null);
  var [delayOpenFor, setDelayOpenFor] = useState(null);
  var [customPickerFor, setCustomPickerFor] = useState(null);
  var [customValue, setCustomValue] = useState('');

  useEffect(function() { load(); }, [currentTenantId]);

  async function load() {
    setLoading(true);
    try {
      var cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      var q = supabase.from('email_actions').select('*').gte('created_at', cutoff).order('created_at', { ascending: false });
      if (currentTenantId) q = q.eq('tenant_id', currentTenantId);
      var r = await q;
      setItems(r.data || []);
    } catch (e) { console.error('[Digest] Load error:', e.message); }
    setLoading(false);
  }

  async function markActioned(id) {
    try {
      await supabase.from('email_actions').update({ status: 'actioned', actioned_at: new Date().toISOString() }).eq('id', id);
      load();
    } catch (e) { alert('Error: ' + e.message); }
  }
  async function markDismissed(id) {
    try {
      await supabase.from('email_actions').update({ status: 'dismissed' }).eq('id', id);
      load();
    } catch (e) { alert('Error: ' + e.message); }
  }

  function delayOptions() {
    var now = Date.now();
    var tomorrow9 = new Date(); tomorrow9.setDate(tomorrow9.getDate() + 1); tomorrow9.setHours(9, 0, 0, 0);
    return [
      { id: 'now',  label: 'Send Now',   ts: null },
      { id: '1h',   label: 'In 1 hour',  ts: new Date(now + 1 * 3600000).toISOString() },
      { id: '2h',   label: 'In 2 hours', ts: new Date(now + 2 * 3600000).toISOString() },
      { id: '4h',   label: 'In 4 hours', ts: new Date(now + 4 * 3600000).toISOString() },
      { id: '8h',   label: 'In 8 hours', ts: new Date(now + 8 * 3600000).toISOString() },
      { id: 'tmr',  label: 'Tomorrow 9am', ts: tomorrow9.toISOString() },
      { id: 'custom', label: '📅 Custom date/time…', ts: '__custom__' },
    ];
  }

  function defaultCustomValue() {
    var d = new Date(Date.now() + 60 * 60000);
    var pad = function(n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  async function scheduleAction(a, ts) {
    setSending(a.id);
    try {
      if (!ts) { await executeAction(a); setDelayOpenFor(null); return; }
      // If the user edited the draft, persist it first
      var patch = { scheduled_at: ts };
      if (editingId === a.id && editDraft && editDraft !== a.claude_reply_draft) {
        patch.claude_reply_draft = editDraft;
      }
      await supabase.from('email_actions').update(patch).eq('id', a.id);
      setDelayOpenFor(null);
      setEditingId(null);
      load();
    } catch (e) { alert('Error: ' + e.message); }
    setSending(null);
  }

  async function executeAction(a) {
    setSending(a.id);
    try {
      if (a.claude_action === 'advance_stage' && a.lead_id && a.action_payload?.new_stage) {
        await supabase.from('leads').update({ stage: a.action_payload.new_stage, last_activity_at: new Date().toISOString() }).eq('id', a.lead_id);
        await markActioned(a.id);
      } else if (a.claude_action === 'enroll_sequence' && a.lead_id && a.tenant_id && a.action_payload?.sequence_name) {
        var seq = await supabase.from('sequences').select('id').eq('tenant_id', a.tenant_id).ilike('name', '%' + a.action_payload.sequence_name + '%').limit(1).maybeSingle();
        if (!seq.data) { alert('Sequence "' + a.action_payload.sequence_name + '" not found in tenant.'); setSending(null); return; }
        var fs = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', seq.data.id).eq('step_number', 1).single();
        var nextAt = new Date(Date.now() + ((fs.data && fs.data.delay_days) || 0) * 86400000).toISOString();
        await supabase.from('lead_sequences').upsert({ tenant_id: a.tenant_id, lead_id: a.lead_id, sequence_id: seq.data.id, current_step: 0, status: 'active', enrolled_at: new Date().toISOString(), next_step_at: nextAt }, { onConflict: 'lead_id,sequence_id' });
        await markActioned(a.id);
      } else if (a.claude_action === 'auto_reply' || a.claude_action === 'review') {
        var body = editingId === a.id ? editDraft : (a.claude_reply_draft || '');
        if (!body) { alert('No reply draft available. Click "Edit & Send" to write one.'); setSending(null); return; }
        var resp = await fetch('/api/send-digest-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: a.email_from, subject: (a.email_subject && a.email_subject.startsWith('Re:')) ? a.email_subject : ('Re: ' + (a.email_subject || 'your message')), body: body }),
        });
        var data = await resp.json();
        if (!data.success) throw new Error(data.error || 'send failed');
        await markActioned(a.id);
        setEditingId(null);
      } else {
        await markActioned(a.id);
      }
    } catch (e) { alert('Action error: ' + e.message); }
    setSending(null);
  }

  var today = new Date().toISOString().split('T')[0];
  var todayItems = items.filter(function(i) { return (i.created_at || '').startsWith(today); });
  var filtered = filter === 'all' ? items : items.filter(function(i) { return i.status === filter; });
  // Split by source
  var inboundItems = filtered.filter(function(i) { return i.source !== 'stale_lead'; });
  var staleItems = filtered.filter(function(i) { return i.source === 'stale_lead'; });
  var pendingStale = staleItems.filter(function(i) { return i.status === 'pending'; });

  async function bulkApproveStale() {
    if (pendingStale.length === 0) return;
    if (!window.confirm('Approve and execute ' + pendingStale.length + ' stale lead action(s)?')) return;
    setSending('bulk');
    for (var a of pendingStale) {
      try { await executeAction(a); } catch (e) { console.error('Bulk approve error:', a.id, e); }
    }
    setSending(null);
    load();
  }

  var stats = {
    processed: todayItems.length,
    actioned: items.filter(function(i) { return i.status === 'actioned' && (i.actioned_at || '').startsWith(today); }).length,
    pending: items.filter(function(i) { return i.status === 'pending'; }).length,
    auto: items.filter(function(i) { return i.status === 'actioned' && i.claude_action === 'auto_reply'; }).length,
  };

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 18 };

  return (
    <div style={{ padding: '32px 40px', minHeight: '100vh', background: colors.bg, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>📧 AI Email Digest</h1>
          <p style={{ color: colors.muted, marginTop: 4, fontSize: 14 }}>Claude-analyzed inbound emails with recommended actions</p>
        </div>
        <button onClick={load} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 16px', color: '#fff', cursor: 'pointer', fontSize: 12 }}>🔄 Refresh</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Processed Today',   v: stats.processed, color: '#00C9FF' },
          { label: 'Auto-Resolved',     v: stats.auto,       color: '#10b981' },
          { label: 'Actioned Today',    v: stats.actioned,  color: '#6366f1' },
          { label: 'Pending Review',    v: stats.pending,   color: '#f59e0b' },
        ].map(function(s, i) {
          return <div key={i} style={Object.assign({}, card, { textAlign: 'center' })}>
            <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.v}</div>
            <div style={{ fontSize: 11, color: colors.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
          </div>;
        })}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[
          { id: 'pending',   label: 'Pending ' + items.filter(function(i) { return i.status === 'pending'; }).length },
          { id: 'actioned',  label: 'Actioned' },
          { id: 'dismissed', label: 'Dismissed' },
          { id: 'all',       label: 'All (7d)' },
        ].map(function(tab) {
          var active = filter === tab.id;
          return <button key={tab.id} onClick={function() { setFilter(tab.id); }} style={{
            background: active ? colors.primary + '20' : 'transparent',
            border: '1px solid ' + (active ? colors.primary + '44' : 'rgba(255,255,255,0.1)'),
            borderRadius: 8, padding: '6px 14px', color: active ? colors.primary : colors.muted,
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}>{tab.label}</button>;
        })}
      </div>

      {loading ? (
        <div style={{ color: colors.muted, textAlign: 'center', padding: 40 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>No emails in this view</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {staleItems.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h2 style={{ color: '#fff', margin: 0, fontSize: 18, fontWeight: 800 }}>🔄 Stale Lead Actions <span style={{ color: colors.muted, fontSize: 13, fontWeight: 400 }}>· {staleItems.length}</span></h2>
                {pendingStale.length > 0 && (
                  <button onClick={bulkApproveStale} disabled={sending === 'bulk'} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#000', fontWeight: 800, cursor: 'pointer', fontSize: 12, opacity: sending === 'bulk' ? 0.6 : 1 }}>
                    {sending === 'bulk' ? '⏳ Approving…' : '✅ Approve all ' + pendingStale.length}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {staleItems.map(function(a) { return renderActionCard(a); })}
              </div>
            </div>
          )}
          {inboundItems.length > 0 && (
            <div>
              {staleItems.length > 0 && <h2 style={{ color: '#fff', margin: '0 0 10px', fontSize: 18, fontWeight: 800 }}>📨 Inbound Emails <span style={{ color: colors.muted, fontSize: 13, fontWeight: 400 }}>· {inboundItems.length}</span></h2>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {inboundItems.map(function(a) { return renderActionCard(a); })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  function renderActionCard(a) {
            var style = ACTION_STYLE[a.claude_action] || ACTION_STYLE.no_action;
            var editing = editingId === a.id;
            return (
              <div key={a.id} style={Object.assign({}, card, { borderLeft: '3px solid ' + style.color })}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ background: style.bg, color: style.color, border: '1px solid ' + style.color + '44', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{style.label}</span>
                      <span style={{ color: colors.muted, fontSize: 11 }}>{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</span>
                      {a.status === 'actioned' && <span style={{ color: '#10b981', fontSize: 11, fontWeight: 700 }}>✓ Actioned</span>}
                      {a.status === 'dismissed' && <span style={{ color: colors.muted, fontSize: 11 }}>Dismissed</span>}
                    </div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{a.email_from}</div>
                    <div style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{a.email_subject || '(no subject)'}</div>
                    <div style={{ color: colors.text, fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>{a.email_body_summary || ''}</div>
                    {a.claude_reasoning && <div style={{ color: colors.muted, fontSize: 12, marginTop: 10, fontStyle: 'italic', padding: '8px 12px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 6 }}>🤖 {a.claude_reasoning}</div>}
                    {a.action_payload && (a.action_payload.new_stage || a.action_payload.sequence_name) && (
                      <div style={{ color: colors.muted, fontSize: 11, marginTop: 8 }}>
                        {a.action_payload.new_stage && <span>→ Stage: <code style={{ color: '#00E676' }}>{a.action_payload.new_stage}</code> </span>}
                        {a.action_payload.sequence_name && <span>→ Sequence: <code style={{ color: '#a5b4fc' }}>{a.action_payload.sequence_name}</code></span>}
                      </div>
                    )}
                    {a.claude_reply_draft && !editing && (
                      <div style={{ color: colors.text, fontSize: 12, marginTop: 10, padding: '10px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: 6, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                        <div style={{ color: colors.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, fontWeight: 700 }}>Suggested reply</div>
                        {a.claude_reply_draft}
                      </div>
                    )}
                    {editing && (
                      <div style={{ marginTop: 10 }}>
                        <textarea value={editDraft} onChange={function(e) { setEditDraft(e.target.value); }} style={{ width: '100%', minHeight: 140, background: 'rgba(0,0,0,0.3)', border: '1px solid ' + colors.primary + '44', borderRadius: 6, padding: 10, color: '#fff', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {a.status === 'pending' && (
                      <>
                        <button onClick={function() { executeAction(a); }} disabled={sending === a.id} style={{ background: style.color + '22', border: '1px solid ' + style.color + '66', borderRadius: 8, padding: '8px 12px', color: style.color, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>{sending === a.id ? '...' : '✅ Action It'}</button>
                        {(a.claude_action === 'auto_reply' || a.claude_action === 'review') && (
                          <button onClick={function() { setEditingId(editing ? null : a.id); setEditDraft(a.claude_reply_draft || ''); }} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{editing ? 'Cancel Edit' : '✏️ Edit & Send'}</button>
                        )}
                        <div style={{ position: 'relative' }}>
                          <button onClick={function() { setDelayOpenFor(delayOpenFor === a.id ? null : a.id); }} style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 8, padding: '8px 12px', color: '#a5b4fc', cursor: 'pointer', fontSize: 12, fontWeight: 600, width: '100%' }}>⏱️ Send in…</button>
                          {delayOpenFor === a.id && (
                            <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: '#0f172a', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 8, padding: 4, zIndex: 50, minWidth: 200, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
                              {delayOptions().map(function(opt) {
                                return <button key={opt.id} onClick={function() {
                                  if (opt.ts === '__custom__') {
                                    setCustomPickerFor(a.id);
                                    setCustomValue(defaultCustomValue());
                                  } else {
                                    scheduleAction(a, opt.ts);
                                  }
                                }} style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', padding: '8px 10px', color: '#cbd5e1', cursor: 'pointer', fontSize: 12, textAlign: 'left', borderRadius: 6 }} onMouseEnter={function(e) { e.target.style.background = 'rgba(99,102,241,0.15)'; }} onMouseLeave={function(e) { e.target.style.background = 'transparent'; }}>{opt.label}</button>;
                              })}
                              {customPickerFor === a.id && (
                                <div style={{ borderTop: '1px solid rgba(99,102,241,0.25)', marginTop: 4, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  <input type="datetime-local" value={customValue} onChange={function(e) { setCustomValue(e.target.value); }} style={{ background: '#1e293b', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 6, padding: '6px 8px', color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit' }} />
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={function() {
                                      if (!customValue) return;
                                      var d = new Date(customValue);
                                      if (isNaN(d.getTime())) { alert('Invalid date/time.'); return; }
                                      if (d.getTime() <= Date.now()) { alert('Pick a future date/time.'); return; }
                                      setCustomPickerFor(null);
                                      scheduleAction(a, d.toISOString());
                                    }} style={{ flex: 1, background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.55)', borderRadius: 6, padding: '6px 10px', color: '#c7d2fe', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Confirm</button>
                                    <button onClick={function() { setCustomPickerFor(null); }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '6px 10px', color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}>Cancel</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <button onClick={function() { markDismissed(a.id); }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px', color: colors.muted, cursor: 'pointer', fontSize: 12 }}>👁️ Dismiss</button>
                      </>
                    )}
                    {a.scheduled_at && a.status === 'pending' && (
                      <div style={{ fontSize: 10, color: '#a5b4fc', marginTop: 4, textAlign: 'right', fontStyle: 'italic' }}>⏱️ Scheduled {new Date(a.scheduled_at).toLocaleString()}</div>
                    )}
                    {(a.contact_id || a.lead_id || a.tenant_id) && (
                      <div style={{ fontSize: 10, color: colors.muted, marginTop: 6, textAlign: 'right' }}>
                        {a.contact_id && <div>👤 Contact</div>}
                        {a.lead_id && <div>📈 Lead</div>}
                        {a.tenant_id && <div>🏢 Tenant</div>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
  }
}
