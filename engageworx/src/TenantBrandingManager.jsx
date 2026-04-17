import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import BrandingEditor from './BrandingEditor';
import AutoDetectBrandBar from './AutoDetectBrandBar';

export default function TenantBrandingManager({ parentTenantId, C }) {
  var colors = C || { primary: '#00C9FF', muted: '#6B8BAE' };
  var [tenants, setTenants] = useState([]);
  var [loading, setLoading] = useState(true);
  var [expanded, setExpanded] = useState(null);

  useEffect(function() {
    if (!parentTenantId) return;
    (async function() {
      setLoading(true);
      try {
        var { data } = await supabase.from('tenants').select('id, name, brand_name, brand_primary, brand_secondary, brand_logo_url, plan, status')
          .or('parent_tenant_id.eq.' + parentTenantId + ',parent_entity_id.eq.' + parentTenantId)
          .neq('id', parentTenantId)
          .order('name');
        setTenants(data || []);
      } catch (e) {}
      setLoading(false);
    })();
  }, [parentTenantId]);

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14, marginBottom: 10 };

  if (loading) return <div style={{ color: colors.muted, fontSize: 13, padding: 20 }}>Loading tenants…</div>;
  if (tenants.length === 0) return <div style={{ color: colors.muted, fontSize: 13, padding: 20 }}>No tenants under this account yet.</div>;

  return (
    <div>
      {tenants.map(function(t) {
        var isOpen = expanded === t.id;
        return (
          <div key={t.id} style={card}>
            <div onClick={function() { setExpanded(isOpen ? null : t.id); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{t.brand_name || t.name}</div>
                <div style={{ color: colors.muted, fontSize: 11, marginTop: 2, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span>{t.plan || 'Trial'} · {t.status || 'active'}</span>
                  {t.brand_primary && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: t.brand_primary, display: 'inline-block' }} /> {t.brand_primary}</span>}
                  {t.brand_secondary && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: t.brand_secondary, display: 'inline-block' }} /> {t.brand_secondary}</span>}
                  {!t.brand_primary && <span style={{ color: '#d97706' }}>⚠ No brand colors set</span>}
                </div>
              </div>
              <span style={{ color: colors.muted, fontSize: 14 }}>{isOpen ? '▼' : '▶'}</span>
            </div>
            {isOpen && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <AutoDetectBrandBar tenantId={t.id} C={C} />
                <BrandingEditor entityId={t.id} actor={{ tenantId: parentTenantId, entityTier: 'csp', isSuperAdmin: false, mspEnabled: true, loaOnFile: true }} C={C} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
