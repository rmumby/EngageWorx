import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';

var TIER_STYLE = {
  super_admin:  { label: 'SUPER ADMIN',  bg: '#00C9FF22', color: '#00C9FF', border: '#00C9FF44', icon: '⚡' },
  internal:     { label: 'INTERNAL',     bg: '#00C9FF22', color: '#00C9FF', border: '#00C9FF44', icon: '⚡' },
  master_agent: { label: 'MASTER AGENT', bg: '#E040FB22', color: '#E040FB', border: '#E040FB44', icon: '👑' },
  agent:        { label: 'AGENT',        bg: '#FF6B3522', color: '#FF6B35', border: '#FF6B3544', icon: '🤝' },
  csp:          { label: 'CSP',          bg: '#7C4DFF22', color: '#7C4DFF', border: '#7C4DFF44', icon: '🏢' },
  csp_partner:  { label: 'CSP PARTNER',  bg: '#7C4DFF22', color: '#7C4DFF', border: '#7C4DFF44', icon: '🏢' },
  direct:       { label: 'DIRECT',       bg: '#10b98122', color: '#10b981', border: '#10b98144', icon: '🏪' },
  tenant:       { label: 'TENANT',       bg: '#6B8BAE22', color: '#6B8BAE', border: '#6B8BAE44', icon: '📇' },
};

// Plan → MRR (matches Customer Success Dashboard)
var PLAN_MRR = { Starter: 99, starter: 99, Growth: 249, growth: 249, Pro: 499, pro: 499, Silver: 499, silver: 499, Gold: 1499, gold: 1499, Platinum: 3999, platinum: 3999, Diamond: 7999, diamond: 7999, Enterprise: 0, enterprise: 0 };

export default function HierarchyView({ C, onDrillDown }) {
  var colors = C || { bg: '#080d1a', surface: '#0d1425', border: '#182440', text: '#E8F4FD', muted: '#6B8BAE' };
  var [allTenants, setAllTenants] = useState([]);
  var [loading, setLoading] = useState(true);
  var [expanded, setExpanded] = useState({});
  var [drillPath, setDrillPath] = useState([]); // breadcrumb: [{id, name}]
  var [searchQuery, setSearchQuery] = useState('');
  var [moveModal, setMoveModal] = useState(null); // { id, name, currentParent }
  var [moveTarget, setMoveTarget] = useState('');
  var [moving, setMoving] = useState(false);

  useEffect(function() { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      var res = await supabase.from('tenants').select('id, name, entity_tier, tenant_type, customer_type, parent_entity_id, parent_tenant_id, referred_by, plan, status').order('name');
      // Normalize: use parent_tenant_id (preferred) or parent_entity_id as the canonical parent
      var normalized = (res.data || []).map(function(t) {
        return Object.assign({}, t, { _parent: t.parent_tenant_id || t._parent || null, _type: t.customer_type || t.tenant_type || t.entity_tier || 'tenant' });
      });
      setAllTenants(normalized);
    } catch (e) { console.error('[Hierarchy] Load error:', e.message); }
    setLoading(false);
  }

  // Build a parent→children index once
  var byParent = useMemo(function() {
    var idx = {};
    allTenants.forEach(function(t) {
      var key = t._parent || '_root';
      if (!idx[key]) idx[key] = [];
      idx[key].push(t);
    });
    return idx;
  }, [allTenants]);

  // Recursively count descendants and sum MRR
  var rollups = useMemo(function() {
    var out = {};
    function walk(id) {
      if (out[id]) return out[id];
      var kids = byParent[id] || [];
      var count = 0;
      var mrr = 0;
      kids.forEach(function(k) {
        var sub = walk(k.id);
        count += 1 + sub.count;
        mrr += (PLAN_MRR[k.plan] || 0) + sub.mrr;
      });
      out[id] = { count: count, mrr: mrr };
      return out[id];
    }
    allTenants.forEach(function(t) { walk(t.id); });
    return out;
  }, [allTenants, byParent]);

  function toggle(id) {
    setExpanded(function(prev) { var n = Object.assign({}, prev); n[id] = !prev[id]; return n; });
  }

  // ── Search: find matching tenants and auto-expand the path to each ───────
  var matchingIds = useMemo(function() {
    if (!searchQuery.trim()) return null;
    var q = searchQuery.toLowerCase().trim();
    var matches = allTenants.filter(function(t) { return (t.name || '').toLowerCase().includes(q); });
    var ids = {};
    var byId = {};
    allTenants.forEach(function(t) { byId[t.id] = t; });
    matches.forEach(function(m) {
      ids[m.id] = true;
      // Walk up to root, marking each ancestor as needing expansion
      var cur = m;
      while (cur && cur.parent_entity_id) {
        ids[cur.parent_entity_id] = 'ancestor';
        cur = byId[cur.parent_entity_id];
      }
    });
    return ids;
  }, [searchQuery, allTenants]);

  useEffect(function() {
    if (!matchingIds) return;
    setExpanded(function(prev) {
      var next = Object.assign({}, prev);
      Object.keys(matchingIds).forEach(function(id) { if (matchingIds[id] === 'ancestor') next[id] = true; });
      return next;
    });
  }, [matchingIds]);

  // ── Counts for header chips ──────────────────────────────────────────────
  var counts = {};
  allTenants.forEach(function(t) { var tier = t.entity_tier || 'tenant'; counts[tier] = (counts[tier] || 0) + 1; });

  // ── Determine the visible "roots" given the current drill-down path ──────
  var rootParentId = drillPath.length > 0 ? drillPath[drillPath.length - 1].id : '_root';
  var visibleRoots = byParent[rootParentId] || (drillPath.length === 0 ? allTenants.filter(function(t) { return !t._parent; }) : []);

  function drillInto(t) {
    setDrillPath(drillPath.concat([{ id: t.id, name: t.name }]));
    setExpanded({});
  }
  function popTo(idx) {
    setDrillPath(drillPath.slice(0, idx));
  }

  // Check if targetId is a descendant of sourceId (would create cycle)
  function isDescendant(sourceId, targetId) {
    var kids = byParent[sourceId] || [];
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].id === targetId) return true;
      if (isDescendant(kids[i].id, targetId)) return true;
    }
    return false;
  }

  async function handleMove() {
    if (!moveModal) return;
    var targetId = moveTarget || null; // empty = move to root
    if (targetId === moveModal.id) { alert('Cannot move a tenant under itself.'); return; }
    if (targetId && isDescendant(moveModal.id, targetId)) { alert('Cannot move under a descendant — would create a hierarchy loop.'); return; }
    if (!window.confirm('Move "' + moveModal.name + '" under ' + (targetId ? allTenants.find(function(t) { return t.id === targetId; })?.name || targetId : 'root (no parent)') + '?')) return;
    setMoving(true);
    try {
      var upd = await supabase.from('tenants').update({ parent_tenant_id: targetId, parent_entity_id: targetId }).eq('id', moveModal.id);
      if (upd.error) throw upd.error;
      setMoveModal(null); setMoveTarget('');
      await load();
    } catch (e) { alert('Move failed: ' + e.message); }
    setMoving(false);
  }

  function renderNode(t, depth) {
    var kids = byParent[t.id] || [];
    var roll = rollups[t.id] || { count: 0, mrr: 0 };
    var isOpen = !!expanded[t.id];
    var style = TIER_STYLE[t._type] || TIER_STYLE[t.entity_tier] || TIER_STYLE.tenant;
    var matched = matchingIds && matchingIds[t.id] === true;
    var ownMrr = PLAN_MRR[t.plan] || 0;
    return (
      <div key={t.id}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
          marginLeft: depth * 24, marginBottom: 6,
          background: matched ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.03)',
          border: '1px solid ' + (matched ? 'rgba(255,215,0,0.45)' : 'rgba(255,255,255,0.06)'),
          borderLeft: '3px solid ' + style.color,
          borderRadius: 8,
        }}>
          <div onClick={function() { if (kids.length > 0) toggle(t.id); }} style={{ cursor: kids.length > 0 ? 'pointer' : 'default', color: colors.muted, fontSize: 14, width: 16, textAlign: 'center', userSelect: 'none' }} title={kids.length > 0 ? (isOpen ? 'Collapse' : 'Expand') : ''}>
            {kids.length > 0 ? (isOpen ? '▼' : '▶') : '·'}
          </div>
          <span style={{ fontSize: 18 }}>{style.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
            <div style={{ color: colors.muted, fontSize: 11, marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span>{t.plan || 'no plan'} · {t.status || 'inactive'}</span>
              {ownMrr > 0 && <span style={{ color: '#10b981' }}>${ownMrr}/mo</span>}
              {kids.length > 0 && !isOpen && <span style={{ color: '#a5b4fc' }}>📁 {roll.count} underneath</span>}
              {roll.mrr > 0 && <span style={{ color: '#10b981' }}>+ ${roll.mrr.toLocaleString()} rollup MRR</span>}
            </div>
          </div>
          <span style={{ background: style.bg, color: style.color, border: '1px solid ' + style.border, borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{style.label}</span>
          {kids.length > 0 && (
            <button onClick={function() { drillInto(t); }} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 10px', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }} title="Drill into this entity">⤵ Focus</button>
          )}
          <button onClick={function(ev) { ev.stopPropagation(); setMoveModal({ id: t.id, name: t.name, currentParent: t._parent }); setMoveTarget(t._parent || ''); }} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 10px', color: colors.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }} title="Change parent">↕ Move</button>
          {onDrillDown && t.entity_tier !== 'super_admin' && (
            <button onClick={function(ev) { ev.stopPropagation(); onDrillDown(t.id); }} style={{ background: 'rgba(0,201,255,0.12)', border: '1px solid rgba(0,201,255,0.35)', borderRadius: 6, padding: '4px 10px', color: '#00C9FF', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>View Portal →</button>
          )}
        </div>
        {isOpen && kids.map(function(k) { return renderNode(k, depth + 1); })}
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 40px', minHeight: '100vh', background: colors.bg, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>🌳 Hierarchy</h1>
          <p style={{ color: colors.muted, marginTop: 4, fontSize: 14 }}>Drill-down view — {allTenants.length} tenant(s) total. Click ▶ to expand or <strong>Focus</strong> to scope.</p>
        </div>
        <button onClick={load} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 16px', color: '#fff', cursor: 'pointer', fontSize: 12 }}>🔄 Refresh</button>
      </div>

      {/* Tier counts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 18 }}>
        {['super_admin', 'master_agent', 'agent', 'csp', 'tenant'].map(function(tier) {
          var s = TIER_STYLE[tier];
          return (
            <div key={tier} style={{ background: s.bg, border: '1px solid ' + s.border, borderRadius: 12, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 20, marginBottom: 2 }}>{s.icon}</div>
              <div style={{ color: s.color, fontSize: 22, fontWeight: 800 }}>{counts[tier] || 0}</div>
              <div style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* Breadcrumb + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span onClick={function() { setDrillPath([]); }} style={{ cursor: 'pointer', color: drillPath.length === 0 ? '#fff' : '#7C4DFF', fontWeight: 600, fontSize: 13 }}>🌳 All</span>
          {drillPath.map(function(p, idx) {
            var isLast = idx === drillPath.length - 1;
            return (
              <span key={p.id + ':' + idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#445566' }}>›</span>
                <span onClick={isLast ? undefined : function() { popTo(idx + 1); }} style={{ cursor: isLast ? 'default' : 'pointer', color: isLast ? '#fff' : '#7C4DFF', fontWeight: 600, fontSize: 13 }}>{p.name}</span>
              </span>
            );
          })}
        </div>
        <input value={searchQuery} onChange={function(e) { setSearchQuery(e.target.value); }} placeholder="🔍 Search any tenant…" style={{ marginLeft: 'auto', minWidth: 240, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
      </div>

      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: colors.muted }}>Loading hierarchy...</div>
        ) : visibleRoots.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: colors.muted }}>{drillPath.length > 0 ? 'No children under this entity.' : 'No root entities found. Tenants without parent_entity_id will show here.'}</div>
        ) : (
          visibleRoots.map(function(r) { return renderNode(r, 0); })
        )}
      </div>

      <div style={{ marginTop: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 12, color: colors.muted, fontSize: 11, lineHeight: 1.6 }}>
        <b>How this works:</b> Each node's children are tenants whose <code>parent_tenant_id</code> points to that node. Click ▶ to expand, <strong>Focus</strong> to scope the view to one branch, breadcrumb to navigate back. Search highlights matches in gold and auto-expands ancestors. Click <strong>↕ Move</strong> to re-parent a tenant.
      </div>

      {/* Move Modal */}
      {moveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={function() { if (!moving) setMoveModal(null); }}>
          <div onClick={function(e) { e.stopPropagation(); }} style={{ background: '#0d1425', border: '1px solid rgba(124,77,255,0.35)', borderRadius: 14, padding: 24, width: 440, maxHeight: '70vh', overflowY: 'auto' }}>
            <h3 style={{ color: '#fff', margin: '0 0 12px', fontSize: 16 }}>↕ Move "{moveModal.name}"</h3>
            <p style={{ color: colors.muted, fontSize: 12, marginBottom: 16 }}>Select a new parent. The tenant and all its children will move under the selected parent. Cycle detection prevents loops.</p>
            <label style={{ color: colors.muted, fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>New Parent</label>
            <select value={moveTarget} onChange={function(e) { setMoveTarget(e.target.value); }} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 16 }}>
              <option value="">— Root (no parent) —</option>
              {allTenants.filter(function(t) { return t.id !== moveModal.id && !isDescendant(moveModal.id, t.id); }).sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); }).map(function(t) {
                var s = TIER_STYLE[t._type] || TIER_STYLE[t.entity_tier] || TIER_STYLE.tenant;
                return <option key={t.id} value={t.id}>{s.icon} {t.name} ({s.label})</option>;
              })}
            </select>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={function() { setMoveModal(null); }} disabled={moving} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 16px', color: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={handleMove} disabled={moving} style={{ background: 'linear-gradient(135deg,#7C4DFF,#E040FB)', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, opacity: moving ? 0.6 : 1 }}>{moving ? 'Moving...' : 'Move Tenant'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
