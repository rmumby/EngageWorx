import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useTheme, ThemeToggle } from './ThemeContext';
import ContactsModule from './ContactsModule';
import LiveInbox from './components/LiveInboxV2';

function getCSPColors(themeObj) {
  if (!themeObj || themeObj.mode === 'dark') return { bg: '#050810', surface: '#0d1220', border: '#1a2540', primary: '#00C9FF', accent: '#E040FB', text: '#E8F4FD', muted: '#6B8BAE' };
  return { bg: '#F0F2F5', surface: '#FFFFFF', border: '#D1D9E6', primary: '#0077B6', accent: '#7C3AED', text: '#111827', muted: '#4B5563' };
}

export default function CSPPortal({ cspTenantId, onLogout, onBack, profile }) {
  var themeCtx = useTheme();
  var C = getCSPColors(themeCtx.theme);
  var pageState = useState('dashboard');
  var page = pageState[0];
  var setPage = pageState[1];

  var cspInfoState = useState(null);
  var cspInfo = cspInfoState[0];
  var setCspInfo = cspInfoState[1];

  var tenantsState = useState([]);
  var tenants = tenantsState[0];
  var setTenants = tenantsState[1];

  var loadingState = useState(true);
  var loading = loadingState[0];
  var setLoading = loadingState[1];

  var drillDownState = useState(null);
  var drillDown = drillDownState[0];
  var setDrillDown = drillDownState[1];

  var showCreateState = useState(false);
  var showCreate = showCreateState[0];
  var setShowCreate = showCreateState[1];

  var createFormState = useState({ fullName: '', email: '', companyName: '', password: '', plan: 'starter' });
  var createForm = createFormState[0];
  var setCreateForm = createFormState[1];

  var createLoadingState = useState(false);
  var createLoading = createLoadingState[0];
  var setCreateLoading = createLoadingState[1];

  var createResultState = useState(null);
  var createResult = createResultState[0];
  var setCreateResult = createResultState[1];

  var sidebarCollapsedState = useState(false);
  var sidebarCollapsed = sidebarCollapsedState[0];
  var setSidebarCollapsed = sidebarCollapsedState[1];

  // Load CSP data
  useEffect(function() {
    loadCSPData();
  }, [cspTenantId]);

  async function loadCSPData() {
    setLoading(true);
    try {
      // Get CSP info
      var cspResult = await supabase.from('tenants').select('*').eq('id', cspTenantId).maybeSingle();
      if (cspResult.data) setCspInfo(cspResult.data);

      // Get sub-tenants
      var tenantsResult = await supabase.from('tenants').select('*').eq('parent_tenant_id', cspTenantId).order('name');
      if (tenantsResult.data) setTenants(tenantsResult.data);

      // Try to get usage data for each tenant
      try {
        var periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
        var usageResult = await supabase.from('usage_metering').select('*').in('tenant_id', (tenantsResult.data || []).map(function(t) { return t.id; })).eq('period_start', periodStart);
        if (usageResult.data) {
          var usageMap = {};
          usageResult.data.forEach(function(u) { usageMap[u.tenant_id] = u; });
          setTenants((tenantsResult.data || []).map(function(t) {
            return Object.assign({}, t, { usage: usageMap[t.id] || null });
          }));
        }
      } catch (ue) {}
    } catch (err) {
      console.error('CSP data load error:', err);
    }
    setLoading(false);
  }

  // Create sub-tenant
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
        }),
      });
      var data = await resp.json();
      if (data.success) {
        setCreateResult(data);
        loadCSPData();
      } else {
        setCreateResult({ error: data.error || 'Failed to create tenant' });
      }
    } catch (e) {
      setCreateResult({ error: e.message });
    }
    setCreateLoading(false);
  }

  function generatePassword(company) {
    var base = company.replace(/[^a-zA-Z]/g, '');
    if (base.length < 3) base = 'Tenant';
    return base.charAt(0).toUpperCase() + base.slice(1, 6) + '2026!';
  }

  var navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
    { id: 'tenants', label: 'Tenant Management', icon: '🏢' },
    { id: 'campaigns', label: 'Campaigns', icon: '🚀' },
    { id: 'contacts', label: 'Contacts', icon: '👥' },
    { id: 'inbox', label: 'Live Inbox', icon: '💬' },
    { id: 'analytics', label: 'Analytics', icon: '📊' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 22 };
  var inputStyle = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' };
  var btnPrimary = { background: 'linear-gradient(135deg, #00C9FF, #E040FB)', border: 'none', borderRadius: 10, padding: '10px 20px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  var btnSec = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 20px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  var labelStyle = { color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'block', fontWeight: 700 };

  // Calculate stats
  var totalMessages = 0;
  var totalSms = 0;
  var totalWhatsapp = 0;
  var totalEmail = 0;
  tenants.forEach(function(t) {
    if (t.usage) {
      totalMessages += t.usage.total_messages || 0;
      totalSms += t.usage.sms_sent || 0;
      totalWhatsapp += t.usage.whatsapp_sent || 0;
      totalEmail += t.usage.email_sent || 0;
    }
  });

  // Full-screen inbox — bypass sidebar entirely
  if (page === 'inbox') {
    return (
      <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: C.bg }}>
        <button
          onClick={function() { setPage('dashboard'); }}
          style={{ position: 'fixed', top: 16, left: 16, zIndex: 200, background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '6px 14px', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', gap: 6 }}>
          ← {cspInfo ? cspInfo.name : 'Portal'}
        </button>
        <LiveInbox
          C={C}
          tenants={[]}
          viewLevel="tenant"
          currentTenantId={cspTenantId}
          demoMode={false}
          supabase={supabase}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: "'DM Sans', sans-serif", color: C.text }}>
      {/* Sidebar */}
      <div style={{ width: sidebarCollapsed ? 64 : 240, background: C.surface, borderRight: '1px solid ' + C.border, display: 'flex', flexDirection: 'column', padding: sidebarCollapsed ? '24px 8px' : '24px 16px', flexShrink: 0, position: 'fixed', height: '100vh', zIndex: 50, transition: 'all 0.25s ease', overflow: 'hidden' }}>
        {/* Back to SP (when drilled down from Super Admin) */}
        {onBack && (
          <div onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', color: C.primary, fontSize: 12, fontWeight: 600, marginBottom: 12, background: C.primary + '10', border: '1px solid ' + C.primary + '22' }}>
            <span>←</span>
            {!sidebarCollapsed && <span>Back to Platform</span>}
          </div>
        )}
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #00C9FF, #E040FB)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, color: '#000', flexShrink: 0 }}>EW</div>
          {!sidebarCollapsed && (
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', letterSpacing: -0.5 }}>{cspInfo ? cspInfo.name : 'CSP Portal'}</div>
              <div style={{ fontSize: 10, color: C.primary, fontWeight: 600, letterSpacing: 0.5 }}>PARTNER PORTAL</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
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

        {/* Theme + Collapse + Logout */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!sidebarCollapsed && <ThemeToggle />}
          <div onClick={function() { setSidebarCollapsed(!sidebarCollapsed); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', color: C.muted, fontSize: 13, justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}>
            <span>{sidebarCollapsed ? '»' : '«'}</span>
            {!sidebarCollapsed && <span>Collapse</span>}
          </div>
          <div onClick={function() {
            supabase.auth.signOut().then(function() {
              if (onLogout) onLogout();
              window.location.href = '/';
            }).catch(function() {
              window.location.href = '/';
            });
          }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, cursor: 'pointer', color: '#FF5252', fontSize: 13, justifyContent: sidebarCollapsed ? 'center' : 'flex-start', background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.15)' }}>
            <span>⏻</span>
            {!sidebarCollapsed && <span style={{ fontWeight: 600 }}>Sign Out</span>}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ marginLeft: sidebarCollapsed ? 64 : 240, flex: 1, padding: page === 'inbox' ? 0 : '32px 40px', height: page === 'inbox' ? '100vh' : 'auto', overflow: page === 'inbox' ? 'hidden' : 'visible', transition: 'margin-left 0.25s ease' }}>

        {/* Top bar — hidden on inbox to give full height */}
        {page !== 'inbox' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginBottom: 8 }}>
            {onBack && <span onClick={onBack} style={{ color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>← Back to Platform</span>}
            <span onClick={function() { supabase.auth.signOut().then(function() { if (onLogout) onLogout(); window.location.href = '/'; }).catch(function() { window.location.href = '/'; }); }} style={{ color: '#FF5252', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>⏻ Sign Out</span>
          </div>
        )}

        {/* ═══ CONTACTS ═══ */}
        {page === 'contacts' && (
          <ContactsModule
            C={C}
            tenants={[]}
            viewLevel="tenant"
            currentTenantId={cspTenantId}
            demoMode={false}
          />
        )}

        {/* ═══ DASHBOARD ═══ */}
        {page === 'dashboard' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
              <div>
                <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>{cspInfo ? cspInfo.name : 'Partner'} Dashboard</h1>
                <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>Manage your tenants and monitor usage</p>
              </div>
            </div>

            {/* Stats Cards */}
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

            {/* Tenant List */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ color: '#fff', margin: 0, fontSize: 18, fontWeight: 700 }}>Your Tenants</h2>
                <button onClick={function() { setShowCreate(true); setCreateResult(null); setCreateForm({ fullName: '', email: '', companyName: '', password: '', plan: 'starter' }); }} style={btnPrimary}>+ Add Tenant</button>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Loading...</div>
              ) : tenants.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No tenants yet</div>
                  <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>Add your first client to get started.</div>
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
                      <div key={tenant.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 150px 100px', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
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
                            <div style={{ height: '100%', width: Math.min(pct, 100) + '%', background: pct > 90 ? '#FF3B30' : pct > 80 ? '#FF6B35' : C.primary, borderRadius: 2, transition: 'width 0.3s' }} />
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <button onClick={function() { setDrillDown(tenant.id); setPage('tenant_detail'); }} style={Object.assign({}, btnSec, { padding: '6px 12px', fontSize: 11 })}>View</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TENANT MANAGEMENT ═══ */}
        {page === 'tenants' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
              <div>
                <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>Tenant Management</h1>
                <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>{tenants.length} tenant{tenants.length !== 1 ? 's' : ''} under {cspInfo ? cspInfo.name : 'your account'}</p>
              </div>
              <button onClick={function() { setShowCreate(true); setCreateResult(null); setCreateForm({ fullName: '', email: '', companyName: '', password: '', plan: 'starter' }); }} style={btnPrimary}>+ Add Tenant</button>
            </div>

            {tenants.length === 0 ? (
              <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🏢</div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 20, marginBottom: 8 }}>No tenants yet</div>
                <div style={{ color: C.muted, fontSize: 14, marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>Add your first client to start providing them with AI-powered communications under your brand.</div>
                <button onClick={function() { setShowCreate(true); }} style={btnPrimary}>Add Your First Tenant</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {tenants.map(function(tenant) {
                  var usage = tenant.usage;
                  var msgs = usage ? usage.total_messages : 0;
                  return (
                    <div key={tenant.id} style={Object.assign({}, card, { display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px 80px', alignItems: 'center', gap: 16, borderLeft: '4px solid ' + (tenant.status === 'active' ? '#00E676' : '#FFD600') })}>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{tenant.name}</div>
                        <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{tenant.slug} · Created {new Date(tenant.created_at).toLocaleDateString()}</div>
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
                        <button onClick={function() { setDrillDown(tenant.id); setPage('tenant_detail'); }} style={Object.assign({}, btnSec, { padding: '6px 14px', fontSize: 11 })}>Manage</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ OTHER PAGES (placeholder) ═══ */}
        {(page === 'campaigns' || page === 'analytics' || page === 'settings') && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>{navItems.find(function(n) { return n.id === page; }).label}</h1>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>Partner-level {page} view coming soon. For now, manage individual tenants from the Dashboard or Tenant Management.</p>
            <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>{navItems.find(function(n) { return n.id === page; }).icon}</div>
              <div style={{ color: C.muted, fontSize: 14 }}>This feature will aggregate data across all your tenants.</div>
            </div>
          </div>
        )}

        {/* ═══ TENANT DETAIL (drill-down) ═══ */}
        {page === 'tenant_detail' && drillDown && (
          <div>
            {function() {
              var tenant = tenants.find(function(t) { return t.id === drillDown; });
              if (!tenant) return <div style={{ color: C.muted }}>Tenant not found</div>;
              var usage = tenant.usage;
              var msgs = usage ? usage.total_messages : 0;
              var limit = usage ? usage.plan_limit : 0;
              var pct = limit > 0 ? Math.round((msgs / limit) * 100) : 0;
              return (
                <div>
                  <button onClick={function() { setPage('tenants'); setDrillDown(null); }} style={Object.assign({}, btnSec, { marginBottom: 20, padding: '8px 16px' })}>← Back to Tenants</button>
                  <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>{tenant.name}</h1>
                  <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>{tenant.plan} plan · {tenant.status} · ID: {tenant.id}</p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
                    {[
                      { label: 'Total Messages', value: msgs.toLocaleString(), color: C.primary },
                      { label: 'Plan Limit', value: limit.toLocaleString(), color: '#FFD600' },
                      { label: 'Usage', value: pct + '%', color: pct > 80 ? '#FF6B35' : '#00E676' },
                      { label: 'SMS / WhatsApp / Email', value: (usage ? usage.sms_sent : 0) + ' / ' + (usage ? usage.whatsapp_sent : 0) + ' / ' + (usage ? usage.email_sent : 0), color: '#fff' },
                    ].map(function(stat, i) {
                      return (
                        <div key={i} style={card}>
                          <div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{stat.label}</div>
                          <div style={{ color: stat.color, fontSize: 24, fontWeight: 800 }}>{stat.value}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Usage bar */}
                  <div style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ color: C.muted, fontSize: 13 }}>Message Usage</span>
                      <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{msgs.toLocaleString()} / {limit.toLocaleString()}</span>
                    </div>
                    <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4 }}>
                      <div style={{ height: '100%', width: Math.min(pct, 100) + '%', background: pct > 90 ? '#FF3B30' : pct > 80 ? '#FF6B35' : 'linear-gradient(90deg, #00C9FF, #E040FB)', borderRadius: 4, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                </div>
              );
            }()}
          </div>
        )}

        {/* ═══ CREATE TENANT MODAL ═══ */}
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
                    <button onClick={function() {
                      var text = 'Portal: portal.engwx.com\nEmail: ' + createResult.email + '\nPassword: ' + createForm.password;
                      navigator.clipboard.writeText(text);
                    }} style={btnPrimary}>Copy Credentials</button>
                    <button onClick={function() { setCreateResult(null); setCreateForm({ fullName: '', email: '', companyName: '', password: '', plan: 'starter' }); }} style={btnSec}>Add Another</button>
                    <button onClick={function() { setShowCreate(false); }} style={btnSec}>Close</button>
                  </div>
                </div>
              ) : (
                <>
                  {createResult && createResult.error && (
                    <div style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#FF3B30', fontSize: 13 }}>{createResult.error}</div>
                  )}
                  <div style={{ display: 'grid', gap: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={labelStyle}>Contact Name</label>
                        <input value={createForm.fullName} onChange={function(e) { setCreateForm(Object.assign({}, createForm, { fullName: e.target.value })); }} placeholder="Jane Smith" style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Company Name *</label>
                        <input value={createForm.companyName} onChange={function(e) { var name = e.target.value; setCreateForm(Object.assign({}, createForm, { companyName: name, password: generatePassword(name) })); }} placeholder="Client Business" style={inputStyle} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={labelStyle}>Email *</label>
                        <input value={createForm.email} onChange={function(e) { setCreateForm(Object.assign({}, createForm, { email: e.target.value })); }} placeholder="jane@company.com" type="email" style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Password *</label>
                        <input value={createForm.password} onChange={function(e) { setCreateForm(Object.assign({}, createForm, { password: e.target.value })); }} style={Object.assign({}, inputStyle, { fontFamily: 'monospace' })} />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Plan</label>
                      <div style={{ display: 'flex', gap: 10 }}>
                        {['starter', 'growth', 'pro'].map(function(p) {
                          var selected = createForm.plan === p;
                          return (
                            <button key={p} onClick={function() { setCreateForm(Object.assign({}, createForm, { plan: p })); }}
                              style={{ background: selected ? C.primary + '22' : 'rgba(255,255,255,0.03)', border: '1px solid ' + (selected ? C.primary + '66' : 'rgba(255,255,255,0.08)'), borderRadius: 8, padding: '8px 20px', color: selected ? C.primary : '#fff', fontWeight: selected ? 700 : 500, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif", textTransform: 'capitalize' }}>{p}</button>
                          );
                        })}
                      </div>
                    </div>
                    <button onClick={handleCreateTenant} disabled={createLoading} style={Object.assign({}, btnPrimary, { width: '100%', padding: '14px', fontSize: 14, opacity: createLoading ? 0.6 : 1 })}>
                      {createLoading ? 'Creating...' : 'Create Tenant'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
