import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabaseClient';

var CATEGORY_ICONS = { release_note: '🚀', alert: '⚠️', announcement: '📢' };

// Notification bell for the in-portal Platform Updates / changelog.
// Opening the dropdown does NOT auto-mark read. User must click each item or "Mark all read".
// Requires: user_update_reads table (migration 20260501-notification-bell-migration.sql)
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
        var rr = await supabase.from('user_update_reads').select('update_id').eq('user_id', userId);
        setReadIds(new Set((rr.data || []).map(function(x) { return x.update_id; })));
      }
    } catch (e) { console.warn('[Bell] load:', e.message); }
  }
  useEffect(function() { load(); }, [userId, audience]);

  var unreadCount = updates.filter(function(u) { return !readIds.has(u.id); }).length;

  async function markOneRead(updateId) {
    if (!userId || readIds.has(updateId)) return;
    try {
      await supabase.from('user_update_reads').upsert(
        { user_id: userId, update_id: updateId },
        { onConflict: 'user_id,update_id' }
      );
      var next = new Set(readIds);
      next.add(updateId);
      setReadIds(next);
    } catch (e) {}
  }

  async function markAllRead() {
    if (!userId) return;
    try {
      var unread = updates.filter(function(u) { return !readIds.has(u.id); });
      if (unread.length === 0) return;
      var rows = unread.map(function(u) { return { user_id: userId, update_id: u.id }; });
      await supabase.from('user_update_reads').upsert(rows, { onConflict: 'user_id,update_id' });
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
    }
    setOpen(willOpen);
  }

  var allRead = updates.length > 0 && unreadCount === 0;
  var empty = updates.length === 0;

  var panel = open ? createPortal(
    <>
      <div onClick={function() { setOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
      <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: 400, maxWidth: 'calc(100vw - 40px)', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto', background: '#0d1425', border: '1px solid rgba(224,64,251,0.35)', borderRadius: 12, zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', padding: 14, fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 8 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>📢 What's new</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: '#E040FB', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '2px 6px' }}>Mark all read</button>
            )}
            <button onClick={function() { setOpen(false); }} style={{ background: 'none', border: 'none', color: '#6B8BAE', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
        </div>
        {(empty || allRead) ? (
          <div style={{ color: '#6B8BAE', fontSize: 12, textAlign: 'center', padding: '28px 10px' }}>You're all caught up.</div>
        ) : null}
        {!empty && (
          <div style={{ display: 'grid', gap: 10 }}>
            {updates.map(function(u) {
              var isUnread = !readIds.has(u.id);
              var icon = CATEGORY_ICONS[u.category] || '📢';
              return (
                <div
                  key={u.id}
                  onClick={function() { markOneRead(u.id); }}
                  style={{
                    padding: 12, borderRadius: 8, cursor: isUnread ? 'pointer' : 'default',
                    background: isUnread ? 'rgba(224,64,251,0.08)' : 'rgba(255,255,255,0.02)',
                    border: '1px solid ' + (isUnread ? 'rgba(224,64,251,0.3)' : 'rgba(255,255,255,0.06)'),
                    transition: 'background 0.2s, border-color 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isUnread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E040FB', flexShrink: 0 }} />}
                    <span style={{ fontSize: 12 }}>{icon}</span>
                    <div style={{ color: '#fff', fontSize: 13, fontWeight: isUnread ? 700 : 500, flex: 1, opacity: isUnread ? 1 : 0.7 }}>{u.title}</div>
                  </div>
                  <div style={{ color: '#6B8BAE', fontSize: 10, marginTop: 2, marginLeft: isUnread ? 18 : 22 }}>{u.published_at ? new Date(u.published_at).toLocaleDateString() : ''}</div>
                  {u.body && <div style={{ color: isUnread ? '#cbd5e1' : '#6B8BAE', fontSize: 12, marginTop: 6, marginLeft: isUnread ? 18 : 22, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{u.body}</div>}
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
