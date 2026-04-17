import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

var ITEMS = [
  { id: 'created',   label: 'Portal created',       always: true },
  { id: 'branding',  label: 'Add branding',          page: 'branding',         check: function(t, cc) { return !!(t.brand_primary && t.brand_name); } },
  { id: 'team',      label: 'Add team members',      page: 'settings',         check: function(t, cc, mc) { return mc > 1; } },
  { id: 'email',     label: 'Configure email',       page: 'settings',         check: function(t, cc) { return !!(cc.email); } },
  { id: 'campaign',  label: 'Start first campaign',  page: 'campaigns',        check: function(t, cc, mc, camp) { return camp > 0; } },
];

export default function SetupChecklist({ tenantId, C, onNavigate }) {
  var colors = C || { primary: '#00C9FF', accent: '#E040FB', muted: '#6B8BAE', text: '#fff' };
  var [visible, setVisible] = useState(false);
  var [checks, setChecks] = useState({});
  var [loading, setLoading] = useState(true);

  useEffect(function() {
    if (!tenantId) return;
    (async function() {
      try {
        var t = await supabase.from('tenants').select('is_demo, brand_primary, brand_name, setup_checklist_dismissed').eq('id', tenantId).maybeSingle();
        if (!t.data || !t.data.is_demo || t.data.setup_checklist_dismissed) { setVisible(false); setLoading(false); return; }

        var cc = {};
        try {
          var ccRes = await supabase.from('channel_configs').select('channel').eq('tenant_id', tenantId).eq('enabled', true);
          (ccRes.data || []).forEach(function(r) { cc[r.channel] = true; });
        } catch (e) {}

        var mc = 0;
        try {
          var mcRes = await supabase.from('tenant_members').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active');
          mc = mcRes.count || 0;
        } catch (e) {}

        var camp = 0;
        try {
          var campRes = await supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
          camp = campRes.count || 0;
        } catch (e) {}

        var ch = {};
        ITEMS.forEach(function(item) {
          if (item.always) ch[item.id] = true;
          else if (item.check) ch[item.id] = item.check(t.data, cc, mc, camp);
        });
        setChecks(ch);
        setVisible(true);
      } catch (e) { console.warn('[Checklist] load:', e.message); }
      setLoading(false);
    })();
  }, [tenantId]);

  async function dismiss() {
    setVisible(false);
    try { await supabase.from('tenants').update({ setup_checklist_dismissed: true }).eq('id', tenantId); } catch (e) {}
  }

  if (loading || !visible) return null;

  var done = Object.values(checks).filter(Boolean).length;
  var total = ITEMS.length;

  return (
    <div style={{ background: 'rgba(0,201,255,0.04)', border: '1px solid rgba(0,201,255,0.25)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>🚀 Setup checklist</div>
          <div style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{done} of {total} complete — finish setup to get the most out of your portal.</div>
        </div>
        <button onClick={dismiss} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontSize: 12 }}>Dismiss ✕</button>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ width: Math.round((done / total) * 100) + '%', height: '100%', background: 'linear-gradient(90deg,' + colors.primary + ',' + (colors.accent || '#E040FB') + ')', transition: 'width 0.3s' }} />
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {ITEMS.map(function(item) {
          var isDone = !!checks[item.id];
          return (
            <div key={item.id}
              onClick={!isDone && item.page && onNavigate ? function() { onNavigate(item.page); } : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: isDone ? 'rgba(16,185,129,0.06)' : 'rgba(255,255,255,0.02)', border: '1px solid ' + (isDone ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.06)'), cursor: !isDone && item.page ? 'pointer' : 'default', transition: 'all 0.15s' }}>
              <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{isDone ? '✅' : '⬜'}</span>
              <span style={{ color: isDone ? '#10b981' : '#fff', fontWeight: isDone ? 500 : 600, fontSize: 13, flex: 1, textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.7 : 1 }}>{item.label}</span>
              {!isDone && item.page && <span style={{ color: colors.primary, fontSize: 12, fontWeight: 600 }}>Set up →</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
