import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabaseClient';

// Notification bell for the in-portal Platform Updates / changelog.
export default function PlatformUpdatesBell({ userId, audience }) {
  var [updates, setUpdates] = useState([]);
  var [readIds, setReadIds] = useState(new Set());
  var [open, setOpen] = useState(false);
  var [pos, setPos] = useState({ top: 0, left: 0 });
  var bellRef = useRef(null);

  async function load() {
    try {
      var audiences = ['all'];
      if (audience) audiences.push(audience);
      var r = await supabase.from('platform_updates').select('*').in('target_audience', audiences).not('published_at', 'is', null).order('published_at', { ascending: false }).limit(30);
      setUpdates(r.data || []);
      if (userId) {
        var rr = await supabase.from('read_platform_updates').select('update_id').eq('user_id', userId);
        setReadIds(new Set((rr.data || []).map(function(x) { return x.update_id; })));
      }
    } catch (e) { console.warn('[Bell] load:', e.message); }
  }
  useEffect(function() { load(); }, [userId, audience]);

  var unreadCount = updates.filter(function(u) { return !readIds.has(u.id); }).length;

  async function markAllRead() {
    if (!userId) return;
    try {
      var unread = updates.filter(function(u) { return !readIds.has(u.id); });
      if (unread.length === 0) return;
      var rows = unread.map(function(u) { return { user_id: userId, update_id: u.id }; });
      await supabase.from('read_platform_updates').upsert(rows, { onConflict: 'user_id,update_id' });
      var next = new Set(readIds);
      unread.forEach(function(u) { next.add(u.id); });
      setReadIds(next);
    } catch (e) {}
  }

  function toggle() {
    var willOpen = !open;
    if (willOpen && bellRef.current) {
      var rect = bellRef.current.getBoundingClientRect();
      var panelWidth = 400;
      var leftPos = rect.right + 12;
      if (leftPos + panelWidth > window.innerWidth - 20) {
        leftPos = window.innerWidth - panelWidth - 20;
      }
      if (leftPos < 10) leftPos = 10;
      setPos({ top: rect.top, left: leftPos });
      markAllRead();
    }
    setOpen(willOpen);
  }

  var panel = open ? createPortal(
    <>
      <div onClick={function() { setOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
      <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: 400, maxWidth: 'calc(100vw - 40px)', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto', background: '#0d1425', border: '1px solid rgba(224,64,251,0.35)', borderRadius: 12, zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', padding: 14, fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 8 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>📢 What's new</div>
          <button onClick={function() { setOpen(false); }} style={{ background: 'none', border: 'none', color: '#6B8BAE', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        {updates.length === 0 ? (
          <div style={{ color: '#6B8BAE', fontSize: 12, textAlign: 'center', padding: '28px 10px' }}>You're all caught up.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {updates.map(function(u) {
              var isUnread = !readIds.has(u.id);
              return (
                <div key={u.id} style={{ padding: 12, borderRadius: 8, background: isUnread ? 'rgba(224,64,251,0.08)' : 'rgba(255,255,255,0.02)', border: '1px solid ' + (isUnread ? 'rgba(224,64,251,0.3)' : 'rgba(255,255,255,0.06)') }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isUnread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E040FB', flexShrink: 0 }} />}
                    <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, flex: 1 }}>{u.title}</div>
                  </div>
                  <div style={{ color: '#6B8BAE', fontSize: 10, marginTop: 2 }}>{u.published_at ? new Date(u.published_at).toLocaleDateString() : ''}</div>
                  {u.body && <div style={{ color: '#cbd5e1', fontSize: 12, marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{u.body}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>,
    document.body
  ) : null;

  return (
    <div style={{ display: 'inline-block' }}>
      <button ref={bellRef} onClick={toggle} aria-label="Platform updates" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '6px 10px', color: '#fff', cursor: 'pointer', fontSize: 16, position: 'relative' }}>
        🔔
        {unreadCount > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, background: '#E040FB', color: '#fff', borderRadius: 10, minWidth: 16, height: 16, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: '2px solid #0d1425' }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>
      {panel}
    </div>
  );
}
