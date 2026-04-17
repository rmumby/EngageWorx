import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function AutoDetectBrandBar({ tenantId, C }) {
  var [url, setUrl] = useState('');
  var [busy, setBusy] = useState(false);
  var [result, setResult] = useState(null);

  useEffect(function() {
    if (!tenantId) return;
    (async function() {
      try {
        var r = await supabase.from('tenants').select('website_url').eq('id', tenantId).maybeSingle();
        if (r.data && r.data.website_url) setUrl(r.data.website_url);
      } catch (e) {}
    })();
  }, [tenantId]);

  async function detect() {
    var u = url.trim();
    if (!u) { alert('Enter a website URL first.'); return; }
    var fullUrl = u.indexOf('http') === 0 ? u : 'https://' + u;
    setBusy(true);
    setResult(null);
    try {
      await supabase.from('tenants').update({ website_url: fullUrl }).eq('id', tenantId);
      var r = await fetch('/api/detect-branding?url=' + encodeURIComponent(fullUrl));
      var d = await r.json();
      var patch = {};
      if (d.primary_color) patch.brand_primary = d.primary_color;
      if (d.secondary_color) patch.brand_secondary = d.secondary_color;
      if (d.logo_url) patch.logo_url = d.logo_url;
      if (d.site_name) patch.brand_name = d.site_name;
      if (Object.keys(patch).length > 0) await supabase.from('tenants').update(patch).eq('id', tenantId);
      setResult(d);
    } catch (e) { alert('Detection failed: ' + e.message); }
    setBusy(false);
  }

  var muted = (C && C.muted) || '#6B8BAE';
  return (
    <div style={{ marginBottom: 18, padding: 14, background: 'rgba(0,201,255,0.04)', border: '1px solid rgba(0,201,255,0.2)', borderRadius: 10 }}>
      <div style={{ color: muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>🔍 Auto-detect from website</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input value={url} onChange={function(e) { setUrl(e.target.value); }} placeholder="https://yourwebsite.com" style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
        <button onClick={detect} disabled={busy} style={{ background: 'linear-gradient(135deg,#00C9FF,#E040FB)', border: 'none', borderRadius: 8, padding: '10px 18px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap', opacity: busy ? 0.5 : 1 }}>{busy ? '⏳ Detecting…' : '🔍 Auto-detect brand'}</button>
      </div>
      {result && (
        <div style={{ marginTop: 10, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', color: '#cbd5e1', fontSize: 12 }}>
          <span style={{ color: '#10b981', fontWeight: 700 }}>✅ Applied:</span>
          {result.site_name && <span>Name: <strong style={{ color: '#fff' }}>{result.site_name}</strong></span>}
          {result.primary_color && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 14, borderRadius: 3, background: result.primary_color, display: 'inline-block', border: '1px solid rgba(255,255,255,0.2)' }} /> {result.primary_color}</span>}
          {result.secondary_color && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 14, borderRadius: 3, background: result.secondary_color, display: 'inline-block', border: '1px solid rgba(255,255,255,0.2)' }} /> {result.secondary_color}</span>}
          {result.logo_url && <span>Logo ✓</span>}
          <span style={{ color: muted, fontSize: 11 }}>Refresh BrandingEditor to see changes.</span>
        </div>
      )}
    </div>
  );
}
