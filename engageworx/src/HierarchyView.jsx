import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

var TIER_STYLE = {
  super_admin:  { label: 'SUPER ADMIN',  bg: '#00C9FF22', color: '#00C9FF', border: '#00C9FF44', icon: '⚡' },
  master_agent: { label: 'MASTER AGENT', bg: '#E040FB22', color: '#E040FB', border: '#E040FB44', icon: '👑' },
  agent:        { label: 'AGENT',        bg: '#FF6B3522', color: '#FF6B35', border: '#FF6B3544', icon: '🤝' },
  csp:          { label: 'CSP',          bg: '#7C4DFF22', color: '#7C4DFF', border: '#7C4DFF44', icon: '🏢' },
  tenant:       { label: 'TENANT',       bg: '#6B8BAE22', color: '#6B8BAE', border: '#6B8BAE44', icon: '📇' },
};

export default function HierarchyView({ C, onDrillDown }) {
  var colors = C || { bg: '#080d1a', surface: '#0d1425', border: '#182440', text: '#E8F4FD', muted: '#6B8BAE' };
  var [allTenants, setAllTenants] = useState([]);
  var [loading, setLoading] = useState(true);
  var [expanded, setExpanded] = useState({});

  useEffect(function() { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      var res = await supabase.from('tenants').select('id, name, entity_tier, tenant_type, parent_entity_id, referred_by, plan, status').order('name');
      setAllTenants(res.data || []);
      // auto-expand top levels
      var initExpanded = {};
      (res.data || []).filter(function(t) { return t.entity_tier === 'super_admin' || t.entity_tier === 'master_agent'; }).forEach(function(t) { initExpanded[t.id] = true; });
      setExpanded(initExpanded);
    } catch (e) { console.error('[Hierarchy] Load error:', e.message); }
    setLoading(false);
  }

  function childrenOf(parentId) {
    return allTenants.filter(function(t) { return t.parent_entity_id === parentId; });
  }

  function toggle(id) {
    setExpanded(function(prev) { var n = Object.assign({}, prev); n[id] = !prev[id]; return n; });
  }

  function renderNode(t, depth) {
    var kids = childrenOf(t.id);
    var isOpen = expanded[t.id];
    var style = TIER_STYLE[t.entity_tier] || TIER_STYLE.tenant;
    return (
      <div key={t.id}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginLeft: depth * 28, marginBottom: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: '3px solid ' + style.color, borderRadius: 8 }}>
          <div onClick={function() { if (kids.length > 0) toggle(t.id); }} style={{ cursor: kids.length > 0 ? 'pointer' : 'default', color: colors.muted, fontSize: 14, width: 16, textAlign: 'center' }}>
            {kids.length > 0 ? (isOpen ? '▼' : '▶') : '·'}
          </div>
          <span style={{ fontSize: 18 }}>{style.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{t.name}</div>
            <div style={{ color: colors.muted, fontSize: 11, marginTop: 1 }}>{t.plan || 'no plan'} · {t.status || 'inactive'}{kids.length > 0 ? ' · ' + kids.length + ' descendant(s)' : ''}</div>
          </div>
          <span style={{ background: style.bg, color: style.color, border: '1px solid ' + style.border, borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>{style.label}</span>
          {onDrillDown && t.entity_tier !== 'super_admin' && (
            <button onClick={function(ev) { ev.stopPropagation(); onDrillDown(t.id); }} style={{ background: 'rgba(0,201,255,0.12)', border: '1px solid rgba(0,201,255,0.35)', borderRadius: 6, padding: '4px 10px', color: '#00C9FF', fontSize: 11, fontWeight: 700, cursor: 'pointer', marginLeft: 8, whiteSpace: 'nowrap' }}>View Portal →</button>
          )}
        </div>
        {isOpen && kids.map(function(k) { return renderNode(k, depth + 1); })}
      </div>
    );
  }

  // Roots = tenants with no parent_entity_id. Typically super_admin + any top-level master agents.
  var roots = allTenants.filter(function(t) { return !t.parent_entity_id; });
  var counts = {};
  allTenants.forEach(function(t) { var tier = t.entity_tier || 'tenant'; counts[tier] = (counts[tier] || 0) + 1; });

  return (
    <div style={{ padding: '32px 40px', minHeight: '100vh', background: colors.bg, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>🌳 Hierarchy</h1>
          <p style={{ color: colors.muted, marginTop: 4, fontSize: 14 }}>Visual tree of the entity hierarchy — {allTenants.length} tenant(s) total</p>
        </div>
        <button onClick={load} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 16px', color: '#fff', cursor: 'pointer', fontSize: 12 }}>🔄 Refresh</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {['super_admin', 'master_agent', 'agent', 'csp', 'tenant'].map(function(tier) {
          var s = TIER_STYLE[tier];
          return (
            <div key={tier} style={{ background: s.bg, border: '1px solid ' + s.border, borderRadius: 12, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ color: s.color, fontSize: 22, fontWeight: 800 }}>{counts[tier] || 0}</div>
              <div style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>{s.label}</div>
            </div>
          );
        })}
      </div>

      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: colors.muted }}>Loading hierarchy...</div>
        ) : roots.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: colors.muted }}>No root entities found. Tenants without parent_entity_id will show here.</div>
        ) : (
          roots.map(function(r) { return renderNode(r, 0); })
        )}
      </div>

      <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 14, color: colors.muted, fontSize: 12, lineHeight: 1.6 }}>
        <b>How this works:</b> Each node's children are tenants whose <code>parent_entity_id</code> points to that node. Set parent in the tenant detail panel. Referrals are tracked separately via <code>referred_by</code> (commercial credit, not necessarily the same as hierarchy position).
      </div>
    </div>
  );
}
