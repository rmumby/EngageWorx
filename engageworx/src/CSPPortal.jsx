import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import AIChatbot from './AIChatbot';
import ContactsModule from './ContactsModule';
import SequenceBuilder from './SequenceBuilder';
import LiveInbox from './components/LiveInboxV2';
import Settings from './Settings';
import PipelineDashboard from './components/PipelineDashboard';

function getCSPColors() {
  return { bg: '#050810', surface: '#0d1220', border: '#1a2540', primary: '#00C9FF', accent: '#E040FB', text: '#E8F4FD', muted: '#6B8BAE' };
}

var DEFAULT_ENABLED_MODULES = ['pipeline', 'helpdesk', 'sequences', 'blog'];

export default function CSPPortal({ cspTenantId, onLogout, onBack, profile }) {
  var [brandColors, setBrandColors] = useState({});
  var C = Object.assign({}, getCSPColors(), brandColors);

  useEffect(function() {
    supabase.from('tenants').select('brand_primary, brand_secondary, brand_name, brand_logo_url, website_url').eq('id', cspTenantId).single().then(function(res) {
      if (res.data) {
        var updates = {};
        if (res.data.brand_primary) updates.primary = res.data.brand_primary;
        if (res.data.brand_secondary) updates.accent = res.data.brand_secondary;
        if (res.data.brand_name) updates.brandName = res.data.brand_name;
        if (res.data.brand_logo_url) updates.logoUrl = res.data.brand_logo_url;
        if (res.data.website_url) updates.websiteUrl = res.data.website_url;
        if (Object.keys(updates).length > 0) setBrandColors(updates);
      }
    });
  }, [cspTenantId]);

  var [page, setPage] = useState('dashboard');
  var [cspInfo, setCspInfo] = useState(null);
  var [tenants, setTenants] = useState([]);
  var [tenantPage, setTenantPage] = useState('tenant_inbox');
  var [loading, setLoading] = useState(true);
  var [drillDown, setDrillDown] = useState(null);
  var [drillDownTenant, setDrillDownTenant] = useState(null);
  var [showCreate, setShowCreate] = useState(false);
  var [createForm, setCreateForm] = useState({ fullName: '', email: '', companyName: '', password: '', plan: 'starter', websiteUrl: '', detecting: false });
  var [createLoading, setCreateLoading] = useState(false);
  var [createResult, setCreateResult] = useState(null);
  var [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  var [showSandbox, setShowSandbox] = useState(false);
  var [showDemoForm, setShowDemoForm] = useState(false);
  var [enabledModules, setEnabledModules] = useState(DEFAULT_ENABLED_MODULES);
  // Sandbox state
  var [sandboxForm, setSandboxForm] = useState({ fullName: '', email: '', companyName: '', password: '' });
  var [sandboxLoading, setSandboxLoading] = useState(false);
  var [sandboxResult, setSandboxResult] = useState(null);
  // Demo state
  var [demoForm, setDemoForm] = useState({ fullName: '', email: '', companyName: '', password: '' });
  var [demoLoading, setDemoLoading] = useState(false);
  var [demoResult, setDemoResult] = useState(null);

  useEffect(() => { if (cspTenantId) loadCSPData(); }, [cspTenantId]);

  async function loadCSPData() {
    setLoading(true);
    try {
      var cspResult = await supabase.from('tenants').select('*').eq('id', cspTenantId).maybeSingle();
      if (cspResult.data) {
        setCspInfo(cspResult.data);
        if (cspResult.data.metadata && cspResult.data.metadata.enabled_modules) {
          setEnabledModules(cspResult.data.metadata.enabled_modules);
        }
      }
      var tenantsResult = await supabase.from('tenants').select('*').eq('parent_tenant_id', cspTenantId).order('name');
      if (tenantsResult.data) setTenants(tenantsResult.data);
      try {
        var periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
        var usageResult = await supabase.from('usage_metering').select('*').in('tenant_id', (tenantsResult.data || []).map(function(t) { return t.id; })).eq('period_start', periodStart);
        if (usageResult.data) {
          var usageMap = {};
          usageResult.data.forEach(function(u) { usageMap[u.tenant_id] = u; });
          setTenants((tenantsResult.data || []).map(function(t) { return Object.assign({}, t, { usage: usageMap[t.id] || null }); }));
        }
      } catch (ue) {}
    } catch (err) { console.error('CSP data load error:', err); }
    setLoading(false);
  }

  function isModuleEnabled(id) { return enabledModules.includes(id); }

  async function saveModules(modules) {
    setEnabledModules(modules);
    try {
      await supabase.from('tenants').update({
        metadata: Object.assign({}, cspInfo?.metadata || {}, { enabled_modules: modules })
      }).eq('id', cspTenantId);
    } catch (e) { console.log('Module save error:', e.message); }
  }

  function generatePassword(company) {
    var base = company.replace(/[^a-zA-Z]/g, '');
    if (base.length < 3) base = 'Tenant';
    return base.charAt(0).toUpperCase() + base.slice(1, 6) + '2026!';
  }

  async function handleCreateTenant() {
    if (!createForm.email || !createForm.companyName || !createForm.password) return;
    setCreateLoading(true);
    setCreateResult(null);
    try {
      var resp = await fetch('/api/csp?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csp_tenant_id: cspTenantId,
          email: createForm.email.trim(),
          password: createForm.password,
          full_name: createForm.fullName.trim(),
          company_name: createForm.companyName.trim(),
          plan: createForm.plan,
          website_url: createForm.websiteUrl || null,
          brand_primary: createForm.detectedBrand ? createForm.detectedBrand.primaryColor : null,
          brand_secondary: createForm.detectedBrand ? createForm.detectedBrand.secondaryColor : null,
          brand_logo_url: createForm.detectedBrand ? createForm.detectedBrand.logoUrl : null,
        }),
      });
      var data = await resp.json();
      if (data.success) { setCreateResult(data); loadCSPData(); }
      else { setCreateResult({ error: data.error || 'Failed to create tenant' }); }
    } catch (e) { setCreateResult({ error: e.message }); }
    setCreateLoading(false);
  }

  async function handleCreateSandbox() {
    if (!sandboxForm.email || !sandboxForm.companyName) return;
    setSandboxLoading(true);
    setSandboxResult(null);
    var password = sandboxForm.password || generatePassword(sandboxForm.companyName) + '_sbx';
    try {
      var resp = await fetch('/api/csp?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csp_tenant_id: cspTenantId,
          email: sandboxForm.email.trim(),
          password: password,
          full_name: sandboxForm.fullName.trim() || 'Sandbox User',
          company_name: sandboxForm.companyName.trim(),
          plan: 'starter',
          is_sandbox: true,
        }),
      });
      var data = await resp.json();
      if (data.success) { setSandboxResult(Object.assign({}, data, { password: password })); loadCSPData(); }
      else { setSandboxResult({ error: data.error || 'Failed to create sandbox' }); }
    } catch (e) { setSandboxResult({ error: e.message }); }
    setSandboxLoading(false);
  }

  async function handleCreateDemo() {
    if (!demoForm.email || !demoForm.companyName) return;
    setDemoLoading(true);
    setDemoResult(null);
    var password = demoForm.password || generatePassword(demoForm.companyName) + '_demo';
    try {
      var resp = await fetch('/api/csp?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csp_tenant_id: cspTenantId,
          email: demoForm.email.trim(),
          password: password,
          full_name: demoForm.fullName.trim() || 'Demo User',
          company_name: demoForm.companyName.trim(),
          plan: 'starter',
          is_demo: true,
        }),
      });
      var data = await resp.json();
      if (data.success) { setDemoResult(Object.assign({}, data, { password: password })); loadCSPData(); }
      else { setDemoResult({ error: data.error || 'Failed to create demo account' }); }
    } catch (e) { setDemoResult({ error: e.message }); }
    setDemoLoading(false);
  }

  async function detectBrand() {
    if (!createForm.websiteUrl) return;
    setCreateForm(function(f) { return Object.assign({}, f, { detecting: true }); });
    try {
      var res = await fetch('/api/detect-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: createForm.websiteUrl })
      });
      var data = await res.json();
      setCreateForm(function(f) {
        return Object.assign({}, f, {
          detecting: false,
          companyName: data.name || f.companyName,
          password: data.name ? generatePassword(data.name) : f.password,
          detectedBrand: data.name ? { name: data.name, primaryColor: data.primaryColor, secondaryColor: data.secondaryColor, logoUrl: data.logoUrl, description: data.description } : null,
        });
      });
    } catch (e) {
      setCreateForm(function(f) { return Object.assign({}, f, { detecting: false }); });
    }
  }

  var allNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '⊞', always: true },
    { id: 'tenants', label: 'Tenant Management', icon: '🏢', always: true },
    { id: 'inbox', label: 'Live Inbox', icon: '💬', always: true },
    { id: 'contacts', label: 'Contacts', icon: '👥', always: true },
    { id: 'campaigns', label: 'Campaigns', icon: '🚀', always: true },
    { id: 'pipeline', label: 'Pipeline', icon: '📈', module: 'pipeline' },
    { id: 'sequences', label: 'Sequences', icon: '📧', module: 'sequences' },
    { id: 'ai-studio', label: 'AI Chatbot', icon: '🤖', always: true },
    { id: 'flow-builder', label: 'Flow Builder', icon: '⚡', always: true },
    { id: 'helpdesk', label: 'Help Desk', icon: '🎫', module: 'helpdesk' },
    { id: 'blog', label: 'Blog Manager', icon: '📝', module: 'blog' },
    { id: 'analytics', label: 'Analytics', icon: '📊', always: true },
    { id: 'registration', label: 'Registration', icon: '📋', always: true },
    { id: 'integrations', label: 'API & Integrations', icon: '🔌', always: true },
    { id: 'settings', label: 'Settings', icon: '⚙️', always: true },
  ];

  var navItems = allNavItems.filter(function(item) {
    return item.always || isModuleEnabled(item.module);
  });

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 22 };
  var inputStyle = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' };
  var btnPrimary = { background: 'linear-gradient(135deg, ' + (brandColors.primary || '#00C9FF') + ', ' + (brandColors.accent || '#E040FB') + ')', border: 'none', borderRadius: 10, padding: '10px 20px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  var btnSec = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 20px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  var labelStyle = { color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'block', fontWeight: 700 };

  var totalMessages = 0; var totalSms = 0; var totalWhatsapp = 0; var totalEmail = 0;
  tenants.forEach(function(t) {
    if (t.usage) {
      totalMessages += t.usage.total_messages || 0;
      totalSms += t.usage.sms_sent || 0;
      totalWhatsapp += t.usage.whatsapp_sent || 0;
      totalEmail += t.usage.email_sent || 0;
    }
  });

  var logoEl = brandColors.logoUrl
    ? <img src={brandColors.logoUrl} alt="logo" style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'contain', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
    : <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, ' + C.primary + ', ' + C.accent + ')', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12, color: '#000', flexShrink: 0 }}>{(cspInfo ? (cspInfo.brand_name || cspInfo.name || 'C') : 'C').charAt(0).toUpperCase()}</div>;

  // ── Tenant drill-down portal ──────────────────────────────────────────────
  if (drillDownTenant) {
    var tenantNavItems = [
      { id: 'tenant_inbox', label: 'Live Inbox', icon: '💬' },
      { id: 'tenant_contacts', label: 'Contacts', icon: '👥' },
      { id: 'tenant_campaigns', label: 'Campaigns', icon: '🚀' },
      { id: 'tenant_ai', label: 'AI Chatbot', icon: '🤖' },
      { id: 'tenant_sequences', label: 'Sequences', icon: '📧' },
      { id: 'tenant_analytics', label: 'Analytics', icon: '📊' },
      { id: 'tenant_settings', label: 'Settings', icon: '⚙️' },
    ];
    var tC = Object.assign({}, C, {
      primary: drillDownTenant.brand_primary || C.primary,
      accent: drillDownTenant.brand_secondary || C.accent,
    });

    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: "'DM Sans', sans-serif", color: C.text }}>
        <div style={{ width: 240, background: C.surface, borderRight: '1px solid ' + C.border, display: 'flex', flexDirection: 'column', padding: '24px 16px', flexShrink: 0, position: 'fixed', height: '100vh', zIndex: 50, overflow: 'hidden' }}>
          <div onClick={function() { setDrillDownTenant(null); setPage('tenants'); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', color: C.primary, fontSize: 12, fontWeight: 600, marginBottom: 12, background: C.primary + '10', border: '1px solid ' + C.primary + '22' }}>
            <span>←</span><span>Back to {cspInfo ? cspInfo.name : 'Portal'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, ' + tC.primary + ', ' + tC.accent + ')', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18, color: '#000', flexShrink: 0 }}>
              {(drillDownTenant.brand_name || drillDownTenant.name || 'T').charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', letterSpacing: -0.5 }}>{drillDownTenant.name}</div>
              <div style={{ fontSize: 10, color: tC.primary, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>{drillDownTenant.plan} · {drillDownTenant.status}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            {tenantNavItems.map(function(item) {
              var active = tenantPage === item.id;
              return (
                <div key={item.id} onClick={function() { setTenantPage(item.id); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', background: active ? tC.primary + '15' : 'transparent', color: active ? tC.primary : C.muted, fontWeight: active ? 700 : 500, fontSize: 13, transition: 'all 0.2s' }}>
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 'auto' }}>
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 11, color: C.muted }}>
              <div style={{ color: '#fff', fontWeight: 600, marginBottom: 2 }}>Managing as</div>
              <div>{cspInfo ? cspInfo.name : 'Partner'}</div>
            </div>
          </div>
        </div>
        <div style={{ marginLeft: 240, flex: 1, overflow: 'hidden' }}>
          {tenantPage === 'tenant_inbox' && (
            <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + C.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.surface }}>
                <h2 style={{ color: '#fff', margin: 0, fontSize: 16, fontWeight: 700 }}>💬 Live Inbox — {drillDownTenant.name}</h2>
              </div>
              <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
                <LiveInbox C={tC} tenants={[]} viewLevel="tenant" currentTenantId={drillDownTenant.id} demoMode={false} supabase={supabase} />
              </div>
            </div>
          )}
          {tenantPage === 'tenant_contacts' && (
            <div style={{ padding: '32px 40px' }}>
              <ContactsModule C={tC} tenants={[]} viewLevel="tenant" currentTenantId={drillDownTenant.id} demoMode={false} />
            </div>
          )}
          {tenantPage === 'tenant_ai' && (
            <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
              <AIChatbot C={tC} viewLevel="tenant" currentTenantId={drillDownTenant.id} demoMode={false} />
            </div>
          )}
          {tenantPage === 'tenant_sequences' && (
            <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
              <SequenceBuilder C={tC} currentTenantId={drillDownTenant.id} />
            </div>
          )}
          {tenantPage === 'tenant_settings' && (
            <div style={{ padding: '32px 40px' }}>
              <Settings C={tC} currentTenantId={drillDownTenant.id} viewLevel="tenant" demoMode={false} defaultTab="channels" allowedTabs={["channels", "team", "notifications", "security"]} />
            </div>
          )}
          {(tenantPage === 'tenant_campaigns' || tenantPage === 'tenant_analytics') && (
            <div style={{ padding: '32px 40px' }}>
              <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
                {tenantPage === 'tenant_campaigns' ? '🚀 Campaigns' : '📊 Analytics'} — {drillDownTenant.name}
              </h1>
              <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>{tenantPage === 'tenant_campaigns' ? '🚀' : '📊'}</div>
                <div style={{ color: C.muted, fontSize: 14 }}>Coming in next update for tenant management view.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Full-screen pages ─────────────────────────────────────────────────────
  var topBar = function(label, icon) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 48, background: C.surface, borderBottom: '1px solid ' + C.border, flexShrink: 0, zIndex: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {logoEl}
          <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{cspInfo ? cspInfo.name : 'Partner Portal'}</div>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)' }} />
          <span style={{ color: C.primary, fontSize: 12, fontWeight: 600 }}>{icon} {label}</span>
        </div>
        <span onClick={function() { setPage('dashboard'); }} style={{ background: C.primary + '20', border: '1px solid ' + C.primary + '44', borderRadius: 8, padding: '5px 12px', color: C.primary, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>← Back to Portal</span>
      </div>
    );
  };

  if (page === 'ai-studio') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: "'DM Sans', sans-serif" }}>
        {topBar('AI Chatbot Studio', '🤖')}
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <AIChatbot C={C} viewLevel="tenant" currentTenantId={cspTenantId} demoMode={false} />
        </div>
      </div>
    );
  }

  if (page === 'sequences') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: "'DM Sans', sans-serif" }}>
        {topBar('Sequences', '📧')}
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <SequenceBuilder C={C} currentTenantId={cspTenantId} />
        </div>
      </div>
    );
  }

  if (page === 'flow-builder') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: "'DM Sans', sans-serif" }}>
        {topBar('Flow Builder', '⚡')}
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <AIChatbot C={C} viewLevel="tenant" currentTenantId={cspTenantId} demoMode={false} defaultTab="flows" />
        </div>
      </div>
    );
  }

  if (page === 'inbox') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 48, background: C.surface, borderBottom: '1px solid ' + C.border, flexShrink: 0, zIndex: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {logoEl}
            <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{cspInfo ? cspInfo.name : 'Partner Portal'}</div>
            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)' }} />
            <span style={{ color: C.primary, fontSize: 12, fontWeight: 600 }}>💬 Live Inbox</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span onClick={function() { setPage('dashboard'); }} style={{ background: C.primary + '20', border: '1px solid ' + C.primary + '44', borderRadius: 8, padding: '5px 12px', color: C.primary, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>← Back to Portal</span>
            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)' }} />
            <span onClick={function() { supabase.auth.signOut().then(function() { if (onLogout) onLogout(); window.location.href = '/'; }).catch(function() { window.location.href = '/'; }); }} style={{ color: '#FF5252', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>⏻ Sign Out</span>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <LiveInbox C={C} tenants={[]} viewLevel="tenant" currentTenantId={cspTenantId} demoMode={false} supabase={supabase} />
        </div>
      </div>
    );
  }

  // ── Main layout ───────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: "'DM Sans', sans-serif", color: C.text }}>

      {/* Sidebar */}
      <div style={{ width: sidebarCollapsed ? 64 : 240, background: C.surface, borderRight: '1px solid ' + C.border, display: 'flex', flexDirection: 'column', padding: sidebarCollapsed ? '24px 8px' : '24px 16px', flexShrink: 0, position: 'fixed', height: '100vh', zIndex: 50, transition: 'all 0.25s ease', overflow: 'hidden' }}>
        {onBack && (
          <div onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', color: C.primary, fontSize: 12, fontWeight: 600, marginBottom: 12, background: C.primary + '10', border: '1px solid ' + C.primary + '22' }}>
            <span>←</span>
            {!sidebarCollapsed && <span>Back to Platform</span>}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          {brandColors.logoUrl
            ? <img src={brandColors.logoUrl} alt="logo" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'contain', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
            : <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, ' + C.primary + ', ' + C.accent + ')', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18, color: '#000', flexShrink: 0 }}>{(cspInfo ? (cspInfo.brand_name || cspInfo.name || 'C') : 'C').charAt(0).toUpperCase()}</div>
          }
          {!sidebarCollapsed && (
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', letterSpacing: -0.5 }}>{cspInfo ? cspInfo.name : 'CSP Portal'}</div>
              <div style={{ fontSize: 10, color: C.primary, fontWeight: 600, letterSpacing: 0.5 }}>PARTNER PORTAL</div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, overflowY: 'auto' }}>
          {navItems.map(function(item) {
            var active = page === item.id;
            return (
              <div key={item.id} onClick={function() { setPage(item.id); setDrillDown(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: sidebarCollapsed ? '10px 8px' : '10px 14px', borderRadius: 10, cursor: 'pointer', background: active ? C.primary + '15' : 'transparent', color: active ? C.primary : C.muted, fontWeight: active ? 700 : 500, fontSize: 13, transition: 'all 0.2s', justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                {!sidebarCollapsed && <span>{item.label}</span>}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div onClick={function() { setSidebarCollapsed(!sidebarCollapsed); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', color: C.muted, fontSize: 13, justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}>
            <span>{sidebarCollapsed ? '»' : '«'}</span>
            {!sidebarCollapsed && <span>Collapse</span>}
          </div>
          <div onClick={function() { supabase.auth.signOut().then(function() { if (onLogout) onLogout(); window.location.href = '/'; }).catch(function() { window.location.href = '/'; }); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, cursor: 'pointer', color: '#FF5252', fontSize: 13, background: 'rgba(255,82,82,0.06)', justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}>
            <span>⏻</span>
            {!sidebarCollapsed && <span style={{ fontWeight: 600 }}>Sign Out</span>}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ marginLeft: sidebarCollapsed ? 64 : 240, flex: 1, padding: '32px 40px', transition: 'margin-left 0.25s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginBottom: 8 }}>
          {onBack && <span onClick={onBack} style={{ color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>← Back to Platform</span>}
          <span onClick={function() { supabase.auth.signOut().then(function() { if (onLogout) onLogout(); window.location.href = '/'; }).catch(function() { window.location.href = '/'; }); }} style={{ color: '#FF5252', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>⏻ Sign Out</span>
        </div>

        {page === 'contacts' && <ContactsModule C={C} tenants={[]} viewLevel="tenant" currentTenantId={cspTenantId} demoMode={false} />}

        {page === 'pipeline' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>📈 Pipeline</h1>
            <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📈</div>
              <div style={{ color: C.muted, fontSize: 14 }}>Pipeline coming to CSP portal.</div>
            </div>
          </div>
        )}

        {page === 'helpdesk' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>🎫 Help Desk</h1>
            <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎫</div>
              <div style={{ color: C.muted, fontSize: 14 }}>Help Desk coming to CSP portal in next update.</div>
            </div>
          </div>
        )}

        {page === 'blog' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>📝 Blog Manager</h1>
            <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
              <div style={{ color: C.muted, fontSize: 14 }}>Blog Manager coming to CSP portal in next update.</div>
            </div>
          </div>
        )}

        {page === 'registration' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>📋 Registration</h1>
            <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
              <div style={{ color: C.muted, fontSize: 14 }}>Registration module coming to CSP portal in next update.</div>
            </div>
          </div>
        )}

        {page === 'campaigns' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>🚀 Campaigns</h1>
            <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🚀</div>
              <div style={{ color: C.muted, fontSize: 14 }}>Partner-level campaigns coming in next update.</div>
            </div>
          </div>
        )}

        {page === 'analytics' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>📊 Analytics</h1>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>Usage and performance across all tenants</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 28 }}>
              {[
                { label: 'Total Messages', value: totalMessages.toLocaleString(), color: C.primary, icon: '💬' },
                { label: 'SMS Sent', value: totalSms.toLocaleString(), color: '#00E676', icon: '📱' },
                { label: 'WhatsApp Sent', value: totalWhatsapp.toLocaleString(), color: '#25D366', icon: '📲' },
                { label: 'Email Sent', value: totalEmail.toLocaleString(), color: '#FF6B35', icon: '📧' },
              ].map(function(s, i) {
                return <div key={i} style={Object.assign({}, card, { textAlign: 'center' })}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
                  <div style={{ color: s.color, fontSize: 28, fontWeight: 800 }}>{s.value}</div>
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{s.label}</div>
                </div>;
              })}
            </div>
          </div>
        )}

        {page === 'integrations' && <Settings C={C} currentTenantId={cspTenantId} viewLevel="tenant" demoMode={false} defaultTab="integrations" allowedTabs={["integrations", "api", "webhooks"]} />}

        {page === 'settings' && (
  <Settings
    C={C}
    currentTenantId={cspTenantId}
    viewLevel="tenant"
    demoMode={false}
    defaultTab="channels"
    allowedTabs={["channels", "team", "notifications", "security", "modules"]}
    enabledModules={enabledModules}
    onSaveModules={saveModules}
  />
)}

        {page === 'dashboard' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
              <div>
                <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>{cspInfo ? cspInfo.name : 'Partner'} Dashboard</h1>
                <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>Manage your tenants and monitor usage</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
              {[
                { label: 'Active Tenants', value: tenants.length, icon: '🏢', color: C.primary },
                { label: 'Messages This Month', value: totalMessages.toLocaleString(), icon: '💬', color: '#00E676' },
                { label: 'SMS Sent', value: totalSms.toLocaleString(), icon: '📱', color: '#FFD600' },
                { label: 'WhatsApp Sent', value: totalWhatsapp.toLocaleString(), icon: '📲', color: '#25D366' },
              ].map(function(stat, i) {
                return (
                  <div key={i} style={Object.assign({}, card, { textAlign: 'center' })}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{stat.icon}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{stat.label}</div>
                  </div>
                );
              })}
            </div>
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ color: '#fff', margin: 0, fontSize: 18, fontWeight: 700 }}>Your Tenants</h2>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={function() { setShowSandbox(true); setSandboxResult(null); setSandboxForm({ fullName: '', email: '', companyName: '', password: '' }); }} style={{ background: C.primary + '22', border: '1px solid ' + C.primary + '55', borderRadius: 10, padding: '10px 16px', color: C.primary, fontWeight: 700, cursor: 'pointer', fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>🧪 Sandbox</button>
                  <button onClick={function() { setShowDemoForm(true); setShowCreate(false); setDemoResult(null); setDemoForm({ fullName: '', email: '', companyName: '', password: '' }); }} style={{ background: C.accent + '22', border: '1px solid ' + C.accent + '55', borderRadius: 10, padding: '10px 16px', color: C.accent, fontWeight: 700, cursor: 'pointer', fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>🎮 Demo</button>
                  <button onClick={function() { setShowCreate(true); setShowDemoForm(false); setShowSandbox(false); setCreateResult(null); setCreateForm({ fullName: '', email: '', companyName: '', password: '', plan: 'starter', websiteUrl: '', detecting: false, detectedBrand: null }); }} style={btnPrimary}>+ New Tenant</button>
                </div>
              </div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Loading...</div>
              ) : tenants.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No tenants yet</div>
                  <button onClick={function() { setShowCreate(true); }} style={btnPrimary}>Add Your First Tenant</button>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {tenants.map(function(tenant) {
                    var usage = tenant.usage;
                    var msgs = usage ? usage.total_messages : 0;
                    var limit = usage ? usage.plan_limit : 0;
                    var pct = limit > 0 ? Math.round((msgs / limit) * 100) : 0;
                    return (
                      <div key={tenant.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 150px 120px', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
                        <div>
                          <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{tenant.name}</div>
                          <div style={{ color: C.muted, fontSize: 11 }}>{tenant.plan} · {tenant.status}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{msgs.toLocaleString()}</div>
                          <div style={{ color: C.muted, fontSize: 10 }}>messages</div>
                        </div>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ color: C.muted, fontSize: 10 }}>Usage</span>
                            <span style={{ color: pct > 80 ? '#FF6B35' : '#fff', fontSize: 10, fontWeight: 600 }}>{pct}%</span>
                          </div>
                          <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: Math.min(pct, 100) + '%', background: pct > 90 ? '#FF3B30' : pct > 80 ? '#FF6B35' : C.primary, borderRadius: 2 }} />
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <button onClick={function() { setDrillDownTenant(tenant); setTenantPage('tenant_inbox'); }} style={Object.assign({}, btnPrimary, { padding: '6px 14px', fontSize: 11 })}>Manage →</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {page === 'tenants' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
              <div>
                <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>Tenant Management</h1>
                <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>{tenants.length} tenant{tenants.length !== 1 ? 's' : ''} under {cspInfo ? cspInfo.name : 'your account'}</p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={function() { setShowSandbox(true); setSandboxResult(null); setSandboxForm({ fullName: '', email: '', companyName: '', password: '' }); }} style={{ background: C.primary + '22', border: '1px solid ' + C.primary + '55', borderRadius: 10, padding: '12px 20px', color: C.primary, fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>🧪 Create Sandbox</button>
                <button onClick={function() { setShowDemoForm(true); setShowCreate(false); setDemoResult(null); setDemoForm({ fullName: '', email: '', companyName: '', password: '' }); }} style={{ background: C.accent + '22', border: '1px solid ' + C.accent + '55', borderRadius: 10, padding: '12px 20px', color: C.accent, fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>🎮 Create Demo Account</button>
                <button onClick={function() { setShowCreate(true); setShowDemoForm(false); setShowSandbox(false); setCreateResult(null); setCreateForm({ fullName: '', email: '', companyName: '', password: '', plan: 'starter', websiteUrl: '', detecting: false, detectedBrand: null }); }} style={{ background: 'linear-gradient(135deg, ' + C.primary + ', ' + C.accent + ')', border: 'none', borderRadius: 10, padding: '12px 24px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>+ New Tenant</button>
              </div>
            </div>
            {tenants.length === 0 ? (
              <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🏢</div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 20, marginBottom: 8 }}>No tenants yet</div>
                <button onClick={function() { setShowCreate(true); }} style={btnPrimary}>Add Your First Tenant</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {tenants.map(function(tenant) {
                  var msgs = tenant.usage ? tenant.usage.total_messages : 0;
                  return (
                    <div key={tenant.id} style={Object.assign({}, card, { display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px 120px', alignItems: 'center', gap: 16, borderLeft: '4px solid ' + (tenant.status === 'active' ? '#00E676' : '#FFD600') })}>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{tenant.name}</div>
                        <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Created {new Date(tenant.created_at).toLocaleDateString()}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Plan</div>
                        <div style={{ color: C.primary, fontWeight: 700, fontSize: 13, textTransform: 'capitalize' }}>{tenant.plan}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</div>
                        <div style={{ color: tenant.status === 'active' ? '#00E676' : '#FFD600', fontWeight: 700, fontSize: 13, textTransform: 'capitalize' }}>{tenant.status}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Messages</div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{msgs.toLocaleString()}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <button onClick={function() { setDrillDownTenant(tenant); setTenantPage('tenant_inbox'); }} style={Object.assign({}, btnPrimary, { padding: '8px 16px', fontSize: 12 })}>Manage →</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Create Tenant Modal ── */}
        {showCreate && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={function() { setShowCreate(false); }}>
            <div style={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: 16, padding: 32, width: 500, maxHeight: '80vh', overflowY: 'auto' }} onClick={function(e) { e.stopPropagation(); }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h2 style={{ color: '#fff', margin: 0, fontSize: 20, fontWeight: 700 }}>Add New Tenant</h2>
                <span onClick={function() { setShowCreate(false); }} style={{ color: C.muted, cursor: 'pointer', fontSize: 20 }}>✕</span>
              </div>
              {createResult && createResult.success ? (
                <div style={{ background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.3)', borderRadius: 10, padding: 20 }}>
                  <div style={{ color: '#00E676', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>✓ Tenant Created</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8, fontSize: 13 }}>
                    <span style={{ color: C.muted }}>Company:</span><span style={{ color: '#fff', fontWeight: 600 }}>{createResult.tenant_name}</span>
                    <span style={{ color: C.muted }}>Email:</span><span style={{ color: '#fff' }}>{createResult.email}</span>
                    <span style={{ color: C.muted }}>Password:</span><span style={{ color: C.primary, fontFamily: 'monospace' }}>{createForm.password}</span>
                    <span style={{ color: C.muted }}>Portal:</span><span style={{ color: C.primary }}>portal.engwx.com</span>
                  </div>
                  <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                    <button onClick={function() { navigator.clipboard.writeText('Portal: portal.engwx.com\nEmail: ' + createResult.email + '\nPassword: ' + createForm.password); }} style={btnPrimary}>Copy Credentials</button>
                    <button onClick={function() { setCreateResult(null); setCreateForm({ fullName: '', email: '', companyName: '', password: '', plan: 'starter' }); }} style={btnSec}>Add Another</button>
                    <button onClick={function() { setShowCreate(false); }} style={btnSec}>Close</button>
                  </div>
                </div>
              ) : (
                <div>
                  {createResult && createResult.error && (
                    <div style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#FF3B30', fontSize: 13 }}>{createResult.error}</div>
                  )}
                  <div style={{ display: 'grid', gap: 16 }}>
                    <div>
                      <label style={labelStyle}>Website URL</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={createForm.websiteUrl} onChange={function(e) { setCreateForm(Object.assign({}, createForm, { websiteUrl: e.target.value })); }} placeholder="https://clientbusiness.com" style={Object.assign({}, inputStyle, { flex: 1 })} />
                        <button onClick={detectBrand} disabled={!createForm.websiteUrl || createForm.detecting} style={{ background: createForm.detecting ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #00C9FF, #7C4DFF)', border: 'none', borderRadius: 10, padding: '10px 14px', color: createForm.detecting ? '#6B8BAE' : '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
                          {createForm.detecting ? '⏳' : '✨ Auto-detect'}
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div><label style={labelStyle}>Contact Name</label><input value={createForm.fullName} onChange={function(e) { setCreateForm(Object.assign({}, createForm, { fullName: e.target.value })); }} placeholder="Jane Smith" style={inputStyle} /></div>
                      <div><label style={labelStyle}>Company Name *</label><input value={createForm.companyName} onChange={function(e) { var n = e.target.value; setCreateForm(Object.assign({}, createForm, { companyName: n, password: generatePassword(n) })); }} placeholder="Client Business" style={inputStyle} /></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div><label style={labelStyle}>Email *</label><input value={createForm.email} onChange={function(e) { setCreateForm(Object.assign({}, createForm, { email: e.target.value })); }} placeholder="jane@company.com" type="email" style={inputStyle} /></div>
                      <div><label style={labelStyle}>Password *</label><input value={createForm.password} onChange={function(e) { setCreateForm(Object.assign({}, createForm, { password: e.target.value })); }} style={Object.assign({}, inputStyle, { fontFamily: 'monospace' })} /></div>
                    </div>
                    <div>
                      <label style={labelStyle}>Plan</label>
                      <div style={{ display: 'flex', gap: 10 }}>
                        {['starter', 'growth', 'pro'].map(function(p) {
                          var selected = createForm.plan === p;
                          return <button key={p} onClick={function() { setCreateForm(Object.assign({}, createForm, { plan: p })); }} style={{ background: selected ? C.primary + '22' : 'rgba(255,255,255,0.03)', border: '1px solid ' + (selected ? C.primary + '66' : 'rgba(255,255,255,0.08)'), borderRadius: 8, padding: '8px 20px', color: selected ? C.primary : '#fff', fontWeight: selected ? 700 : 500, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif", textTransform: 'capitalize' }}>{p}</button>;
                        })}
                      </div>
                    </div>
                    <button onClick={handleCreateTenant} disabled={createLoading} style={Object.assign({}, btnPrimary, { width: '100%', padding: '14px', fontSize: 14, opacity: createLoading ? 0.6 : 1 })}>{createLoading ? 'Creating...' : 'Create Tenant'}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Sandbox Modal ── */}
        {showSandbox && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={function() { setShowSandbox(false); }}>
            <div style={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: 16, padding: 32, width: 480, maxHeight: '80vh', overflowY: 'auto' }} onClick={function(e) { e.stopPropagation(); }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h2 style={{ color: '#fff', margin: 0, fontSize: 20, fontWeight: 700 }}>🧪 Create Sandbox</h2>
                <span onClick={function() { setShowSandbox(false); }} style={{ color: C.muted, cursor: 'pointer', fontSize: 20 }}>✕</span>
              </div>
              <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Create a sandbox account for a prospect to explore the platform with full access and no commitment.</p>
              {sandboxResult && sandboxResult.success ? (
                <div style={{ background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.3)', borderRadius: 10, padding: 20 }}>
                  <div style={{ color: '#00E676', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>✓ Sandbox Created</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8, fontSize: 13 }}>
                    <span style={{ color: C.muted }}>Company:</span><span style={{ color: '#fff', fontWeight: 600 }}>{sandboxResult.tenant_name}</span>
                    <span style={{ color: C.muted }}>Email:</span><span style={{ color: '#fff' }}>{sandboxResult.email}</span>
                    <span style={{ color: C.muted }}>Password:</span><span style={{ color: C.primary, fontFamily: 'monospace' }}>{sandboxResult.password}</span>
                    <span style={{ color: C.muted }}>Portal:</span><span style={{ color: C.primary }}>portal.engwx.com</span>
                  </div>
                  <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                    <button onClick={function() { navigator.clipboard.writeText('Portal: portal.engwx.com\nEmail: ' + sandboxResult.email + '\nPassword: ' + sandboxResult.password); }} style={btnPrimary}>Copy Credentials</button>
                    <button onClick={function() { setSandboxResult(null); setSandboxForm({ fullName: '', email: '', companyName: '', password: '' }); }} style={btnSec}>Create Another</button>
                    <button onClick={function() { setShowSandbox(false); }} style={btnSec}>Close</button>
                  </div>
                </div>
              ) : (
                <div>
                  {sandboxResult && sandboxResult.error && (
                    <div style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#FF3B30', fontSize: 13 }}>{sandboxResult.error}</div>
                  )}
                  <div style={{ display: 'grid', gap: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div><label style={labelStyle}>Contact Name</label><input value={sandboxForm.fullName} onChange={function(e) { setSandboxForm(Object.assign({}, sandboxForm, { fullName: e.target.value })); }} placeholder="Jane Smith" style={inputStyle} /></div>
                      <div><label style={labelStyle}>Company Name *</label><input value={sandboxForm.companyName} onChange={function(e) { var n = e.target.value; setSandboxForm(Object.assign({}, sandboxForm, { companyName: n, password: generatePassword(n) })); }} placeholder="Prospect Co" style={inputStyle} /></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div><label style={labelStyle}>Email *</label><input value={sandboxForm.email} onChange={function(e) { setSandboxForm(Object.assign({}, sandboxForm, { email: e.target.value })); }} placeholder="jane@prospect.com" type="email" style={inputStyle} /></div>
                      <div><label style={labelStyle}>Password</label><input value={sandboxForm.password} onChange={function(e) { setSandboxForm(Object.assign({}, sandboxForm, { password: e.target.value })); }} placeholder="Auto-generated" style={Object.assign({}, inputStyle, { fontFamily: 'monospace' })} /></div>
                    </div>
                    <div style={{ background: 'rgba(0,201,255,0.06)', border: '1px solid rgba(0,201,255,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.muted }}>
                      🧪 Sandbox accounts use the <span style={{ color: C.primary }}>Starter plan</span> with full feature access. A welcome email will be sent automatically.
                    </div>
                    <button onClick={handleCreateSandbox} disabled={sandboxLoading || !sandboxForm.email || !sandboxForm.companyName} style={Object.assign({}, btnPrimary, { width: '100%', padding: '14px', fontSize: 14, opacity: (sandboxLoading || !sandboxForm.email || !sandboxForm.companyName) ? 0.6 : 1 })}>{sandboxLoading ? 'Creating...' : '🧪 Create Sandbox Account'}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Demo Account Modal ── */}
        {showDemoForm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={function() { setShowDemoForm(false); }}>
            <div style={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: 16, padding: 32, width: 480, maxHeight: '80vh', overflowY: 'auto' }} onClick={function(e) { e.stopPropagation(); }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h2 style={{ color: '#fff', margin: 0, fontSize: 20, fontWeight: 700 }}>🎮 Create Demo Account</h2>
                <span onClick={function() { setShowDemoForm(false); }} style={{ color: C.muted, cursor: 'pointer', fontSize: 20 }}>✕</span>
              </div>
              <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Create a pre-configured demo account to showcase the platform to a prospect in a live setting.</p>
              {demoResult && demoResult.success ? (
                <div style={{ background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.3)', borderRadius: 10, padding: 20 }}>
                  <div style={{ color: '#00E676', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>✓ Demo Account Created</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8, fontSize: 13 }}>
                    <span style={{ color: C.muted }}>Company:</span><span style={{ color: '#fff', fontWeight: 600 }}>{demoResult.tenant_name}</span>
                    <span style={{ color: C.muted }}>Email:</span><span style={{ color: '#fff' }}>{demoResult.email}</span>
                    <span style={{ color: C.muted }}>Password:</span><span style={{ color: C.primary, fontFamily: 'monospace' }}>{demoResult.password}</span>
                    <span style={{ color: C.muted }}>Portal:</span><span style={{ color: C.primary }}>portal.engwx.com</span>
                  </div>
                  <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                    <button onClick={function() { navigator.clipboard.writeText('Portal: portal.engwx.com\nEmail: ' + demoResult.email + '\nPassword: ' + demoResult.password); }} style={btnPrimary}>Copy Credentials</button>
                    <button onClick={function() { setDemoResult(null); setDemoForm({ fullName: '', email: '', companyName: '', password: '' }); }} style={btnSec}>Create Another</button>
                    <button onClick={function() { setShowDemoForm(false); }} style={btnSec}>Close</button>
                  </div>
                </div>
              ) : (
                <div>
                  {demoResult && demoResult.error && (
                    <div style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#FF3B30', fontSize: 13 }}>{demoResult.error}</div>
                  )}
                  <div style={{ display: 'grid', gap: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div><label style={labelStyle}>Contact Name</label><input value={demoForm.fullName} onChange={function(e) { setDemoForm(Object.assign({}, demoForm, { fullName: e.target.value })); }} placeholder="Jane Smith" style={inputStyle} /></div>
                      <div><label style={labelStyle}>Company Name *</label><input value={demoForm.companyName} onChange={function(e) { var n = e.target.value; setDemoForm(Object.assign({}, demoForm, { companyName: n, password: generatePassword(n) })); }} placeholder="Prospect Co" style={inputStyle} /></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div><label style={labelStyle}>Email *</label><input value={demoForm.email} onChange={function(e) { setDemoForm(Object.assign({}, demoForm, { email: e.target.value })); }} placeholder="jane@prospect.com" type="email" style={inputStyle} /></div>
                      <div><label style={labelStyle}>Password</label><input value={demoForm.password} onChange={function(e) { setDemoForm(Object.assign({}, demoForm, { password: e.target.value })); }} placeholder="Auto-generated" style={Object.assign({}, inputStyle, { fontFamily: 'monospace' })} /></div>
                    </div>
                    <div style={{ background: 'rgba(224,64,251,0.06)', border: '1px solid rgba(224,64,251,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.muted }}>
                      🎮 Demo accounts come pre-loaded and are great for live prospect walkthroughs.
                    </div>
                    <button onClick={handleCreateDemo} disabled={demoLoading || !demoForm.email || !demoForm.companyName} style={{ background: 'linear-gradient(135deg, ' + C.accent + ', #7C4DFF)', border: 'none', borderRadius: 10, padding: '14px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: "'DM Sans', sans-serif", width: '100%', opacity: (demoLoading || !demoForm.email || !demoForm.companyName) ? 0.6 : 1 }}>{demoLoading ? 'Creating...' : '🎮 Create Demo Account'}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
