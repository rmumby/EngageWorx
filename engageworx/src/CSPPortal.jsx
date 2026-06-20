import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import AIChatbot from './AIChatbot';
import ContactsModule from './ContactsModule';
import SequenceBuilder from './SequenceBuilder';
import LiveInbox from './components/LiveInboxV2';
import Settings from './Settings';
import BrandingEditor from './BrandingEditor';
import EmailDigest from './EmailDigest';
import PipelineDashboard from './components/PipelineDashboard';
import HelpDeskModule from './components/HelpDesk/HelpDeskModule';
import AnalyticsDashboard from './AnalyticsDashboard';
import CampaignsModule from './CampaignsModule';
import PlatformUpdatesBell from './PlatformUpdatesBell';
import ImportLeads from './ImportLeads';
import LeadScan from './LeadScan';
import OnboardingWizard from './OnboardingWizard';
import CSPSMSRegistration from './CSPSMSRegistration';
import AutoDetectBrandBar from './AutoDetectBrandBar';
import TenantBrandingManager from './TenantBrandingManager';
import { ThemeToggle, useTheme, getThemedColors } from './ThemeContext';
import FlowBuilder from './FlowBuilder';
import SequenceRoster from './SequenceRoster';
import ActionBoard from './ActionBoard';
import { getEnabledModules } from './lib/modules';
import PortalShell from './components/PortalShell';
import { SP_BASE_COLORS } from './themes/portalColors';
import { useBranding } from './BrandingContext';
import Button, { useOutlineButtonStyle, relativeLuminance, contrastText } from './components/ui/Button';

var DEFAULT_ENABLED_MODULES = ['pipeline', 'helpdesk', 'sequences', 'blog'];

export default function CSPPortal({ cspTenantId, onLogout, onBack, profile }) {
  var [brandColors, setBrandColors] = useState({});
  var [brandingKey, setBrandingKey] = useState(0);
  // Load this tenant's branding from DB so drilled-in SP admins see tenant colors, not EngageWorx defaults
  useEffect(function() {
    if (!cspTenantId) return;
    (async function() {
      try {
        var r = await supabase.from('tenants').select('brand_primary, brand_secondary, brand_logo_url, brand_name, name').eq('id', cspTenantId).maybeSingle();
        console.log('[CSPPortal] brand fetch for', cspTenantId, '→', r.data ? { primary: r.data.brand_primary, secondary: r.data.brand_secondary, name: r.data.brand_name || r.data.name } : 'no data');
        if (r.data) {
          var patch = {};
          if (r.data.brand_primary) patch.primary = r.data.brand_primary;
          if (r.data.brand_secondary) patch.accent = r.data.brand_secondary;
          if (r.data.brand_logo_url) patch.logoUrl = r.data.brand_logo_url;
          if (r.data.brand_name) patch.brandName = r.data.brand_name;
          if (Object.keys(patch).length > 0) {
            console.log('[CSPPortal] applying brand overrides:', patch);
            setBrandColors(patch);
          } else {
            console.log('[CSPPortal] tenant has no brand colors set — using defaults');
          }
        }
      } catch (e) { console.warn('[CSPPortal] brand fetch error:', e.message); }
    })();
  }, [cspTenantId]);
  var [needsOnboarding, setNeedsOnboarding] = useState(false);
  useEffect(function() {
    if (!cspTenantId) return;
    var isSuper = profile && profile.role === 'superadmin';
    if (isSuper) return;
    (async function() {
      try {
        var t = await supabase.from('tenants').select('aup_accepted, onboarding_completed').eq('id', cspTenantId).maybeSingle();
        if (t.data && t.data.aup_accepted && !t.data.onboarding_completed) setNeedsOnboarding(true);
      } catch (e) {}
    })();
  }, [cspTenantId, profile]);
  // Empty string → nav falls back to "AI Chatbot". Only populated when this CSP has actually configured an agent_name.
  var [agentName, setAgentName] = useState('');
  useEffect(function() {
    if (!cspTenantId) { setAgentName(''); return; }
    (async function() {
      try {
        var r = await supabase.from('chatbot_configs').select('bot_name').eq('tenant_id', cspTenantId).limit(1).maybeSingle();
        var n = r.data && r.data.bot_name ? String(r.data.bot_name).trim() : '';
        setAgentName(n);
      } catch (e) { setAgentName(''); }
    })();
  }, [cspTenantId]);
  var { theme: _cspTheme, isDark: _cspIsDark } = useTheme();
  // Same base palette as the SA shell + this tenant's brand overlay → shared chrome + shared theme
  // (light default / true-black dark come from ThemeContext, not a bespoke CSP palette).
  var C = getThemedColors(Object.assign({}, SP_BASE_COLORS, {
    primary: brandColors.primary || SP_BASE_COLORS.primary,
    accent: brandColors.accent || SP_BASE_COLORS.accent,
  }), _cspTheme);
  var btnOutline = useOutlineButtonStyle(); // standardized outline for Sandbox/Demo (vs +New Tenant = accent)
  var isSPAdmin = profile && (profile.role === 'superadmin' || profile.role === 'super_admin' || profile.role === 'sp_admin');

  // Per-tenant title/favicon for a CSP authenticated on the platform host (portal.engwx.com). Additive:
  // uses the existing BrandingContext mechanism and reverts on unmount; hostname-based resolution for
  // white-label domains, the SA console, and tenant portals is left untouched.
  var _branding = useBranding();
  var _setTenantBranding = _branding && _branding.setActiveTenantBranding;
  var _resetBranding = _branding && _branding.resetToHostBranding;
  useEffect(function() {
    if (!cspTenantId || !_setTenantBranding) return;
    _setTenantBranding(cspTenantId);
    return function() { if (_resetBranding) _resetBranding(); };
  }, [cspTenantId, _setTenantBranding, _resetBranding]);

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
  var [createForm, setCreateForm] = useState({ fullName: '', email: '', companyName: '', password: '', plan: 'starter', websiteUrl: '', detecting: false, parentProductLabel: '', displayAlias: '' });
  var [createLoading, setCreateLoading] = useState(false);
  var [createResult, setCreateResult] = useState(null);
  var [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  var [drillSidebarHidden, setDrillSidebarHidden] = useState(false);
  var [showSandbox, setShowSandbox] = useState(false);
  var [showDemoForm, setShowDemoForm] = useState(false);
  var [enabledModules, setEnabledModules] = useState({});
  var [subTenantEnabledModules, setSubTenantEnabledModules] = useState({});
  // Sandbox state
  var [sandboxForm, setSandboxForm] = useState({ fullName: '', email: '', companyName: '', password: '' });
  var [sandboxLoading, setSandboxLoading] = useState(false);
  var [sandboxResult, setSandboxResult] = useState(null);
  // Demo state
  var [demoForm, setDemoForm] = useState({ fullName: '', email: '', companyName: '', password: '' });
  var [demoLoading, setDemoLoading] = useState(false);
  var [demoResult, setDemoResult] = useState(null);

  useEffect(() => { if (cspTenantId) loadCSPData(); }, [cspTenantId]);

  useEffect(function() {
    if (!drillDownTenant || !drillDownTenant.id) {
      setSubTenantEnabledModules({});
      return;
    }
    supabase.rpc('get_tenant_enabled_modules', { p_tenant_id: drillDownTenant.id })
      .then(function(res) {
        if (res.error) { console.error('[CSPPortal sub-tenant] module fetch error', res.error); return; }
        setSubTenantEnabledModules(res.data || {});
      });
  }, [drillDownTenant && drillDownTenant.id]);

  async function loadCSPData() {
    setLoading(true);
    try {
      var cspResult = await supabase.from('tenants').select('*').eq('id', cspTenantId).maybeSingle();
      if (cspResult.data) {
        setCspInfo(cspResult.data);
      }
      // Load enabled modules from sp_settings via RPC
      try {
        var modRes = await supabase.rpc('get_tenant_enabled_modules', { p_tenant_id: cspTenantId });
        if (!modRes.error && modRes.data) setEnabledModules(modRes.data);
      } catch (modErr) { console.error('[CSPPortal] module fetch error', modErr); }
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
    if (!createForm.email || !createForm.companyName) return;
    setCreateLoading(true);
    setCreateResult(null);
    try {
      var _cs = await supabase.auth.getSession();
      var _cjwt = _cs.data.session ? _cs.data.session.access_token : null;
      var resp = await fetch('/api/csp?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _cjwt },
        body: JSON.stringify({
          csp_tenant_id: cspTenantId,
          email: createForm.email.trim(),
          full_name: createForm.fullName.trim(),
          company_name: createForm.companyName.trim(),
          plan: createForm.plan,
          website_url: createForm.websiteUrl || null,
          parent_product_label: createForm.parentProductLabel.trim() || null,
          display_alias: createForm.displayAlias.trim() || null,
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
    try {
      var _ss = await supabase.auth.getSession();
      var _sjwt = _ss.data.session ? _ss.data.session.access_token : null;
      var resp = await fetch('/api/csp?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _sjwt },
        body: JSON.stringify({
          csp_tenant_id: cspTenantId,
          email: sandboxForm.email.trim(),
          full_name: sandboxForm.fullName.trim() || 'Sandbox User',
          company_name: sandboxForm.companyName.trim(),
          plan: 'starter',
          is_sandbox: true,
        }),
      });
      var data = await resp.json();
      if (data.success) { setSandboxResult(data); loadCSPData(); }
      else { setSandboxResult({ error: data.error || 'Failed to create sandbox' }); }
    } catch (e) { setSandboxResult({ error: e.message }); }
    setSandboxLoading(false);
  }

  async function handleCreateDemo() {
    if (!demoForm.email || !demoForm.companyName) return;
    setDemoLoading(true);
    setDemoResult(null);
    try {
      var _msr = await supabase.auth.getSession();
      var _mjwt = _msr.data.session ? _msr.data.session.access_token : null;
      var resp = await fetch('/api/csp?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _mjwt },
        body: JSON.stringify({
          csp_tenant_id: cspTenantId,
          email: demoForm.email.trim(),
          full_name: demoForm.fullName.trim() || 'Demo User',
          company_name: demoForm.companyName.trim(),
          plan: 'starter',
          is_demo: true,
        }),
      });
      var data = await resp.json();
      if (data.success) { setDemoResult(data); loadCSPData(); }
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

  // Module registry → CSPPortal page routing
  var routeToPage = { 'chatbot': 'ai-studio', 'flows': 'flow-builder', 'help_desk': 'helpdesk', 'registrations': 'sms-registration', 'sequence_builder': 'sequences', 'sequence_roster': 'sequence-roster', 'import_leads': 'import', 'lead_scan': 'lead-scan', 'ai_digest': 'email-digest', 'action_board': 'action-board' };
  var visibleModules = getEnabledModules('csp', enabledModules);
  var navItems = visibleModules.map(function(mod) {
    var pageId = routeToPage[mod.route] || mod.route;
    return { id: pageId, label: mod.label, icon: mod.icon };
  });

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 22 };
  var inputStyle = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: C.text, fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' };
  var btnSec = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 20px', color: C.text, fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
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

  // Logo container background is the tenant's brand_primary (fixed dark #1f1f1f fallback) in BOTH
  // themes — not the theme bg — so a white/light lockup never disappears on a light-mode white panel.
  // Clamp: if brand_primary is light (WCAG luminance > 0.179), use #1f1f1f so a near-white brand
  // (e.g. Conecta Cloud #ffffff) can't whiteout the logo OR the no-logo initial badge. logoFg is the
  // WCAG-contrast text for that fill, used by the fallback initial.
  var logoBg = (function () {
    var p = brandColors.primary;
    if (!p || typeof p !== 'string') return '#1f1f1f';
    try { return relativeLuminance(p) > 0.179 ? '#1f1f1f' : p; } catch (e) { return '#1f1f1f'; }
  })();
  var logoFg = contrastText(logoBg);
  var logoEl = brandColors.logoUrl
    ? <img src={brandColors.logoUrl} alt="logo" style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'contain', background: logoBg, border: '1px solid rgba(255,255,255,0.14)', boxSizing: 'border-box', padding: 2, flexShrink: 0 }} />
    : <div style={{ width: 28, height: 28, borderRadius: 8, background: logoBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12, color: logoFg, flexShrink: 0 }}>{(cspInfo ? (cspInfo.brand_name || cspInfo.name || 'C') : 'C').charAt(0).toUpperCase()}</div>;

  // ── Tenant drill-down portal ──────────────────────────────────────────────
  if (drillDownTenant) {
    var subRouteToPage = {
      'dashboard':        'tenant_dashboard',
      'contacts':         'tenant_contacts',
      'inbox':            'tenant_inbox',
      'integrations':     'tenant_integrations',
      'branding':         'tenant_branding',
      'settings':         'tenant_settings',
      'pipeline':         'tenant_pipeline',
      'sequence_roster':  'tenant_sequence_roster',
      'sequence_builder': 'tenant_sequences',
      'campaigns':        'tenant_campaigns',
      'import_leads':     'tenant_import_leads',
      'lead_scan':        'tenant_lead_scan',
      'chatbot':          'tenant_ai',
      'flows':            'tenant_flows',
      'action_board':     'tenant_action_board',
      'registrations':    'tenant_registrations',
      'analytics':        'tenant_analytics',
      'help_desk':        'tenant_help_desk',
    };
    var visibleSubModules = getEnabledModules('tenant', subTenantEnabledModules);
    var tC = Object.assign({}, C, {
      primary: drillDownTenant.brand_primary || C.primary,
      accent: drillDownTenant.brand_secondary || C.accent,
    });

    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: "'DM Sans', sans-serif", color: C.text }}>
        <div style={{ width: drillSidebarHidden ? 0 : 240, background: C.bg, borderRight: drillSidebarHidden ? 'none' : ('1px solid ' + C.border), display: 'flex', flexDirection: 'column', padding: drillSidebarHidden ? 0 : '24px 16px', flexShrink: 0, position: 'fixed', height: '100vh', zIndex: 50, overflow: 'hidden', transition: 'width 0.25s ease, padding 0.25s ease' }}>
          <div onClick={function() { setDrillDownTenant(null); setPage('tenants'); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', color: C.primary, fontSize: 12, fontWeight: 600, marginBottom: 12, background: C.primary + '10', border: '1px solid ' + C.primary + '22' }}>
            <span>←</span><span>Back to {cspInfo ? cspInfo.name : 'Portal'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, ' + tC.primary + ', ' + tC.accent + ')', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18, color: '#000', flexShrink: 0 }}>
              {(drillDownTenant.brand_name || drillDownTenant.name || 'T').charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.text, letterSpacing: -0.5 }}>{drillDownTenant.name}</div>
              <div style={{ fontSize: 10, color: tC.primary, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>{drillDownTenant.plan} · {drillDownTenant.status}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, overflowY: 'auto' }}>
            {visibleSubModules.filter(function(mod) { return mod.id !== 'ai_omni_digest'; }).map(function(mod) {
              var pageId = subRouteToPage[mod.route];
              if (!pageId) return null;
              var active = tenantPage === pageId;
              return (
                <div key={mod.id} onClick={function() { setTenantPage(pageId); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', background: active ? (_cspIsDark ? 'rgba(255,255,255,0.1)' : tC.primary + '15') : 'transparent', color: active ? (_cspIsDark ? '#ffffff' : tC.primary) : C.muted, fontWeight: active ? 700 : 500, fontSize: 13, transition: 'all 0.2s' }}>
                  <span style={{ fontSize: 18 }}>{mod.icon}</span>
                  <span>{mod.label}</span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 'auto' }}>
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 11, color: C.muted }}>
              <div style={{ color: C.text, fontWeight: 600, marginBottom: 2 }}>Managing as</div>
              <div>{cspInfo ? cspInfo.name : 'Partner'}</div>
            </div>
          </div>
        </div>
        <div style={{ marginLeft: drillSidebarHidden ? 0 : 240, flex: 1, overflow: 'hidden', minWidth: 0, transition: 'margin-left 0.25s ease' }}>
          {tenantPage === 'tenant_dashboard' && (
            <div style={{ padding: '32px 40px' }}>
              <h1 style={{ color: tC.text, fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Dashboard</h1>
              <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
                <div style={{ color: C.muted, fontSize: 14 }}>Coming soon — tenant overview and metrics.</div>
              </div>
            </div>
          )}
          {tenantPage === 'tenant_inbox' && (
            <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', width: '100%', overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + C.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.surface }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span onClick={function() { setDrillSidebarHidden(!drillSidebarHidden); }} style={{ cursor: 'pointer', fontSize: 16, color: C.muted, padding: '2px 6px', borderRadius: 4, border: '1px solid ' + C.border, lineHeight: 1 }} title={drillSidebarHidden ? 'Show sidebar' : 'Hide sidebar'}>{drillSidebarHidden ? '»' : '«'}</span>
                  <h2 style={{ color: C.text, margin: 0, fontSize: 16, fontWeight: 700 }}>💬 Live Inbox — {drillDownTenant.name}</h2>
                </div>
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
          {tenantPage === 'tenant_pipeline' && (
            <div style={{ padding: '32px 40px' }}>
              <PipelineDashboard C={tC} tenantId={drillDownTenant.id} demoMode={false} />
            </div>
          )}
          {tenantPage === 'tenant_sequence_roster' && (
            <div style={{ padding: '32px 40px' }}>
              <SequenceRoster C={tC} currentTenantId={drillDownTenant.id} demoMode={false} />
            </div>
          )}
          {tenantPage === 'tenant_sequences' && (
            <div style={{ padding: '24px 32px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
              <SequenceBuilder C={tC} currentTenantId={drillDownTenant.id} />
            </div>
          )}
          {tenantPage === 'tenant_campaigns' && (
            <div style={{ padding: '32px 40px' }}>
              <CampaignsModule C={tC} tenants={[]} viewLevel="tenant" currentTenantId={drillDownTenant.id} demoMode={false} />
            </div>
          )}
          {tenantPage === 'tenant_import_leads' && (
            <div style={{ padding: '32px 40px' }}>
              <ImportLeads C={tC} demoMode={false} />
            </div>
          )}
          {tenantPage === 'tenant_lead_scan' && (
            <div style={{ padding: '32px 40px' }}>
              <LeadScan C={tC} demoMode={false} />
            </div>
          )}
          {tenantPage === 'tenant_ai' && (
            <div style={{ padding: '24px 32px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
              <AIChatbot C={tC} viewLevel="tenant" currentTenantId={drillDownTenant.id} demoMode={false} />
            </div>
          )}
          {tenantPage === 'tenant_flows' && (
            <div style={{ padding: '24px 32px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
              <FlowBuilder C={tC} tenants={[]} viewLevel="tenant" currentTenantId={drillDownTenant.id} demoMode={false} />
            </div>
          )}
          {tenantPage === 'tenant_action_board' && (
            <div style={{ padding: '32px 40px' }}>
              <ActionBoard C={tC} currentTenantId={drillDownTenant.id} demoMode={false} />
            </div>
          )}
          {tenantPage === 'tenant_registrations' && (
            <div style={{ padding: '32px 40px' }}>
              <CSPSMSRegistration C={tC} currentTenantId={drillDownTenant.id} />
            </div>
          )}
          {tenantPage === 'tenant_analytics' && (
            <div style={{ padding: '32px 40px' }}>
              <AnalyticsDashboard C={tC} tenants={[]} viewLevel="tenant" currentTenantId={drillDownTenant.id} demoMode={false} />
            </div>
          )}
          {tenantPage === 'tenant_help_desk' && (
            <div style={{ padding: '32px 40px' }}>
              <HelpDeskModule C={tC} tenantId={drillDownTenant.id} />
            </div>
          )}
          {tenantPage === 'tenant_branding' && (
            <div style={{ padding: '32px 40px' }}>
              <BrandingEditor entityId={drillDownTenant.id} actor={{ tenantId: drillDownTenant.id, entityTier: 'tenant', isSuperAdmin: false, mspEnabled: false, loaOnFile: false }} C={tC} />
            </div>
          )}
          {tenantPage === 'tenant_integrations' && (
            <div style={{ padding: '32px 40px' }}>
              <Settings C={tC} currentTenantId={drillDownTenant.id} viewLevel="tenant" demoMode={false} defaultTab="integrations" allowedTabs={["integrations", "api", "webhooks"]} />
            </div>
          )}
          {tenantPage === 'tenant_settings' && (
            <div style={{ padding: '32px 40px' }}>
              <Settings C={tC} currentTenantId={drillDownTenant.id} viewLevel="tenant" demoMode={false} defaultTab="channels" allowedTabs={["channels", "team", "notifications", "security", "modules"]} />
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
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{cspInfo ? cspInfo.name : 'Partner Portal'}</div>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)' }} />
          <span style={{ color: C.primary, fontSize: 12, fontWeight: 600 }}>{icon} {label}</span>
        </div>
        <span onClick={function() { setPage('dashboard'); }} style={{ background: C.primary + '20', border: '1px solid ' + C.primary + '44', borderRadius: 8, padding: '5px 12px', color: C.primary, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>← Back to Portal</span>
      </div>
    );
  };

  // ai-studio, sequences, flow-builder, inbox all render inside the main sidebar layout (below)

  if (needsOnboarding) {
    return <OnboardingWizard tenantId={cspTenantId} onComplete={function() { setNeedsOnboarding(false); }} />;
  }

  // ── Main layout ───────────────────────────────────────────────────────────
  return (
    <PortalShell
      C={C}
      isDark={_cspIsDark}
      navItems={navItems}
      activePage={page}
      onNav={function(id) { setPage(id); setDrillDown(null); }}
      collapsed={sidebarCollapsed}
      onToggleCollapse={function() { setSidebarCollapsed(!sidebarCollapsed); }}
      onSignOut={function() { supabase.auth.signOut().then(function() { if (onLogout) onLogout(); window.location.href = '/'; }).catch(function() { window.location.href = '/'; }); }}
      themeToggle={<ThemeToggle />}
      contentScroll={page !== 'inbox'}
      header={(
        <div>
          {onBack && (
            <div onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', color: C.primary, fontSize: 12, fontWeight: 600, marginBottom: 12, background: C.primary + '10', border: '1px solid ' + C.primary + '22' }}>
              <span>←</span>{!sidebarCollapsed && <span>Back to Platform</span>}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {brandColors.logoUrl
              ? <img src={brandColors.logoUrl} alt="logo" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'contain', background: logoBg, border: '1px solid rgba(255,255,255,0.14)', boxSizing: 'border-box', padding: 3, flexShrink: 0 }} />
              : <div style={{ width: 36, height: 36, borderRadius: 10, background: logoBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18, color: logoFg, flexShrink: 0 }}>{(cspInfo ? (cspInfo.brand_name || cspInfo.name || 'C') : 'C').charAt(0).toUpperCase()}</div>
            }
            {!sidebarCollapsed && <div style={{ flex: 1 }} />}
            <PlatformUpdatesBell userId={profile ? profile.id : null} audience="csp" />
          </div>
          {!sidebarCollapsed && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.text, letterSpacing: -0.5 }}>{cspInfo ? cspInfo.name : 'CSP Portal'}</div>
              <div style={{ fontSize: 10, color: C.primary, fontWeight: 600, letterSpacing: 0.5 }}>PARTNER PORTAL</div>
            </div>
          )}
        </div>
      )}
    >
      <div style={{ flex: 1, minHeight: 0, padding: page === 'inbox' ? 0 : '32px 40px', display: 'flex', flexDirection: 'column' }}>
        {page !== 'inbox' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginBottom: 8 }}>
            {onBack && <span onClick={onBack} style={{ color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>← Back to Platform</span>}
          </div>
        )}

        {page === 'inbox' && <LiveInbox C={C} tenants={[]} viewLevel="tenant" currentTenantId={cspTenantId} demoMode={false} supabase={supabase} />}

        {page === 'contacts' && <ContactsModule C={C} tenants={[]} viewLevel="tenant" currentTenantId={cspTenantId} demoMode={false} />}

        {page === 'pipeline' && <PipelineDashboard C={C} tenantId={cspTenantId} demoMode={false} />}

        {page === 'ai-studio' && <AIChatbot C={C} viewLevel="tenant" currentTenantId={cspTenantId} demoMode={false} />}

        {page === 'flow-builder' && <FlowBuilder C={C} tenants={[]} viewLevel="tenant" currentTenantId={cspTenantId} demoMode={false} />}

        {page === 'sequences' && <SequenceBuilder C={C} currentTenantId={cspTenantId} />}

        {page === 'helpdesk' && (
          <HelpDeskModule tenantId={cspTenantId} userRole="tenant" C={C} demoMode={false} />
        )}

        {page === 'blog' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '0 0 8px' }}>📝 Blog Manager</h1>
            <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
              <div style={{ color: C.muted, fontSize: 14 }}>Blog Manager coming to CSP portal in next update.</div>
            </div>
          </div>
        )}

        {page === 'registration' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '0 0 8px' }}>📋 Registration</h1>
            <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
              <div style={{ color: C.muted, fontSize: 14 }}>Registration module coming to CSP portal in next update.</div>
            </div>
          </div>
        )}

        {page === 'campaigns' && <CampaignsModule C={C} tenants={[]} viewLevel="tenant" currentTenantId={cspTenantId} demoMode={false} />}

        {page === 'analytics' && <AnalyticsDashboard C={C} tenants={[]} viewLevel="tenant" currentTenantId={cspTenantId} demoMode={false} />}

        {page === 'sms-registration' && <CSPSMSRegistration cspTenantId={cspTenantId} C={C} />}
        {page === 'integrations' && <Settings C={C} currentTenantId={cspTenantId} viewLevel="tenant" demoMode={false} defaultTab="integrations" allowedTabs={["integrations", "api", "webhooks"]} />}

        {page === 'import' && <ImportLeads C={C} demoMode={false} />}
        {page === 'lead-scan' && <LeadScan C={C} demoMode={false} />}
        {page === 'sequence-roster' && <SequenceRoster C={C} currentTenantId={cspTenantId} demoMode={false} />}
        {page === 'action-board' && <ActionBoard C={C} currentTenantId={cspTenantId} demoMode={false} />}

        {page === 'email-digest' && cspTenantId && <EmailDigest C={C} currentTenantId={cspTenantId} />}

        {page === 'branding' && (
          <div style={{ padding: '32px 36px', maxWidth: 900 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '0 0 8px' }}>🎨 Your Branding</h1>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 16 }}>Your portal brand colors, logo, and identity.</p>
            <AutoDetectBrandBar tenantId={cspTenantId} C={C} onDetected={function() { setBrandingKey(function(k) { return k + 1; }); }} />
            <BrandingEditor key={'brand-' + brandingKey} entityId={cspTenantId} actor={{ tenantId: cspTenantId, entityTier: 'csp', isSuperAdmin: false, mspEnabled: true, loaOnFile: true }} C={C} />

            <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 6px' }}>🏢 Tenant Branding</h2>
              <p style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>Manage branding for each tenant under your account. Click a tenant to expand their branding editor and auto-detect.</p>
              <TenantBrandingManager parentTenantId={cspTenantId} C={C} />
            </div>
          </div>
        )}

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
                <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: 0 }}>{cspInfo ? cspInfo.name : 'Partner'} Dashboard</h1>
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
                <h2 style={{ color: C.text, margin: 0, fontSize: 18, fontWeight: 700 }}>Your Tenants</h2>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={function() { setShowSandbox(true); setSandboxResult(null); setSandboxForm({ fullName: '', email: '', companyName: '', password: '' }); }} style={{ ...btnOutline, padding: '10px 16px', fontSize: 12, fontWeight: 700 }}>🧪 Sandbox</button>
                  <button onClick={function() { setShowDemoForm(true); setShowCreate(false); setDemoResult(null); setDemoForm({ fullName: '', email: '', companyName: '', password: '' }); }} style={{ ...btnOutline, padding: '10px 16px', fontSize: 12, fontWeight: 700 }}>🎮 Demo</button>
                  <Button variant="accent" onClick={function() { setShowCreate(true); setShowDemoForm(false); setShowSandbox(false); setCreateResult(null); setCreateForm({ fullName: '', email: '', companyName: '', password: '', plan: 'starter', websiteUrl: '', detecting: false, detectedBrand: null }); }}>+ New Tenant</Button>
                </div>
              </div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Loading...</div>
              ) : tenants.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
                  <div style={{ color: C.text, fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No tenants yet</div>
                  <Button variant="accent" onClick={function() { setShowCreate(true); }}>Add Your First Tenant</Button>
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
                          <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{tenant.display_alias || tenant.name}</div>
                          <div style={{ color: C.muted, fontSize: 11 }}>{tenant.parent_product_label ? tenant.parent_product_label + ' · ' : ''}{tenant.plan} · {tenant.status}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{msgs.toLocaleString()}</div>
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
                          <Button variant="accent" onClick={function() { setDrillDownTenant(tenant); setTenantPage('tenant_inbox'); }} style={{ padding: '6px 14px', fontSize: 11 }}>Manage →</Button>
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
                <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: 0 }}>Tenant Management</h1>
                <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>{tenants.length} tenant{tenants.length !== 1 ? 's' : ''} under {cspInfo ? cspInfo.name : 'your account'}</p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={function() { setShowSandbox(true); setSandboxResult(null); setSandboxForm({ fullName: '', email: '', companyName: '', password: '' }); }} style={{ ...btnOutline, padding: '12px 20px', fontSize: 13, fontWeight: 700 }}>🧪 Create Sandbox</button>
                <button onClick={function() { setShowDemoForm(true); setShowCreate(false); setDemoResult(null); setDemoForm({ fullName: '', email: '', companyName: '', password: '' }); }} style={{ ...btnOutline, padding: '12px 20px', fontSize: 13, fontWeight: 700 }}>🎮 Create Demo Account</button>
                <Button variant="accent" onClick={function() { setShowCreate(true); setShowDemoForm(false); setShowSandbox(false); setCreateResult(null); setCreateForm({ fullName: '', email: '', companyName: '', password: '', plan: 'starter', websiteUrl: '', detecting: false, detectedBrand: null }); }} style={{ padding: '12px 24px' }}>+ New Tenant</Button>
              </div>
            </div>
            {tenants.length === 0 ? (
              <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🏢</div>
                <div style={{ color: C.text, fontWeight: 700, fontSize: 20, marginBottom: 8 }}>No tenants yet</div>
                <Button variant="accent" onClick={function() { setShowCreate(true); }}>Add Your First Tenant</Button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {tenants.map(function(tenant) {
                  var msgs = tenant.usage ? tenant.usage.total_messages : 0;
                  return (
                    <div key={tenant.id} style={Object.assign({}, card, { display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px 120px', alignItems: 'center', gap: 16, borderLeft: '4px solid ' + (tenant.status === 'active' ? '#00E676' : '#FFD600') })}>
                      <div>
                        <div style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>{tenant.name}</div>
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
                        <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{msgs.toLocaleString()}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <Button variant="accent" onClick={function() { setDrillDownTenant(tenant); setTenantPage('tenant_inbox'); }} style={{ padding: '8px 16px', fontSize: 12 }}>Manage →</Button>
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
                <h2 style={{ color: C.text, margin: 0, fontSize: 20, fontWeight: 700 }}>Add New Tenant</h2>
                <span onClick={function() { setShowCreate(false); }} style={{ color: C.muted, cursor: 'pointer', fontSize: 20 }}>✕</span>
              </div>
              {createResult && createResult.success ? (
                <div style={{ background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.3)', borderRadius: 10, padding: 20 }}>
                  <div style={{ color: '#00E676', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>✓ Tenant Created</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8, fontSize: 13 }}>
                    <span style={{ color: C.muted }}>Company:</span><span style={{ color: C.text, fontWeight: 600 }}>{createResult.tenant_name}</span>
                    <span style={{ color: C.muted }}>Email:</span><span style={{ color: C.text }}>{createResult.email}</span>
                    <span style={{ color: C.muted }}>Set-password link:</span><span style={{ color: C.primary, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>{createResult.set_password_link || '(emailed — use Resend if it expires)'}</span>
                    <span style={{ color: C.muted }}>Portal:</span><span style={{ color: C.primary }}>portal.engwx.com</span>
                    <span style={{ color: C.muted }}>Welcome email:</span><span style={{ color: createResult.welcome_email_sent === false ? '#FF6B35' : '#00E676', fontWeight: 600 }}>{createResult.welcome_email_sent === false ? 'Failed — ' + (createResult.welcome_email_error || 'unknown') : '✓ Sent'}</span>
                  </div>
                  <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                    <Button variant="accent" onClick={function() { navigator.clipboard.writeText(createResult.set_password_link || ''); }} disabled={!createResult.set_password_link}>Copy set-password link</Button>
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
                        <Button variant="accent" onClick={detectBrand} disabled={!createForm.websiteUrl || createForm.detecting} style={{ padding: '10px 14px' }}>
                          {createForm.detecting ? '⏳' : '✨ Auto-detect'}
                        </Button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div><label style={labelStyle}>Contact Name</label><input value={createForm.fullName} onChange={function(e) { setCreateForm(Object.assign({}, createForm, { fullName: e.target.value })); }} placeholder="Jane Smith" style={inputStyle} /></div>
                      <div><label style={labelStyle}>Company Name *</label><input value={createForm.companyName} onChange={function(e) { var n = e.target.value; setCreateForm(Object.assign({}, createForm, { companyName: n, password: generatePassword(n) })); }} placeholder="Client Business" style={inputStyle} /></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div><label style={labelStyle}>Email *</label><input value={createForm.email} onChange={function(e) { setCreateForm(Object.assign({}, createForm, { email: e.target.value })); }} placeholder="jane@company.com" type="email" style={inputStyle} /></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div><label style={labelStyle}>Product Label</label><input value={createForm.parentProductLabel} onChange={function(e) { setCreateForm(Object.assign({}, createForm, { parentProductLabel: e.target.value })); }} placeholder="e.g. Cloud SMS, Business Messaging" style={inputStyle} /><div style={{ color: C.muted, fontSize: 10, marginTop: 4 }}>Generic product name shown in reporting</div></div>
                      <div><label style={labelStyle}>Display Alias</label><input value={createForm.displayAlias} onChange={function(e) { setCreateForm(Object.assign({}, createForm, { displayAlias: e.target.value })); }} placeholder="Optional display name override" style={inputStyle} /><div style={{ color: C.muted, fontSize: 10, marginTop: 4 }}>Overrides tenant name in your portal views</div></div>
                    </div>
                    {isSPAdmin ? (
                      <div>
                        <label style={labelStyle}>Plan</label>
                        <div style={{ display: 'flex', gap: 10 }}>
                          {['starter', 'growth', 'pro'].map(function(p) {
                            var selected = createForm.plan === p;
                            return <button key={p} onClick={function() { setCreateForm(Object.assign({}, createForm, { plan: p })); }} style={{ background: selected ? C.primary + '22' : 'rgba(255,255,255,0.03)', border: '1px solid ' + (selected ? C.primary + '66' : 'rgba(255,255,255,0.08)'), borderRadius: 8, padding: '8px 20px', color: selected ? C.primary : '#fff', fontWeight: selected ? 700 : 500, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif", textTransform: 'capitalize' }}>{p}</button>;
                          })}
                        </div>
                      </div>
                    ) : (
                      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 14px', color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
                        Sub-tenant pricing managed by you outside the platform for now. Per-partner pricing layer coming soon.
                      </div>
                    )}
                    <Button variant="accent" onClick={handleCreateTenant} disabled={createLoading} style={{ width: '100%', padding: '14px', fontSize: 14 }}>{createLoading ? 'Creating...' : 'Create Tenant'}</Button>
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
                <h2 style={{ color: C.text, margin: 0, fontSize: 20, fontWeight: 700 }}>🧪 Create Sandbox</h2>
                <span onClick={function() { setShowSandbox(false); }} style={{ color: C.muted, cursor: 'pointer', fontSize: 20 }}>✕</span>
              </div>
              <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Create a sandbox account for a prospect to explore the platform with full access and no commitment.</p>
              {sandboxResult && sandboxResult.success ? (
                <div style={{ background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.3)', borderRadius: 10, padding: 20 }}>
                  <div style={{ color: '#00E676', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>✓ Sandbox Created</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8, fontSize: 13 }}>
                    <span style={{ color: C.muted }}>Company:</span><span style={{ color: C.text, fontWeight: 600 }}>{sandboxResult.tenant_name}</span>
                    <span style={{ color: C.muted }}>Email:</span><span style={{ color: C.text }}>{sandboxResult.email}</span>
                    <span style={{ color: C.muted }}>Set-password link:</span><span style={{ color: C.primary, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>{sandboxResult.set_password_link || '(emailed — use Resend if it expires)'}</span>
                    <span style={{ color: C.muted }}>Portal:</span><span style={{ color: C.primary }}>portal.engwx.com</span>
                  </div>
                  <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                    <Button variant="accent" onClick={function() { navigator.clipboard.writeText(sandboxResult.set_password_link || ''); }} disabled={!sandboxResult.set_password_link}>Copy set-password link</Button>
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
                    </div>
                    <div style={{ background: 'rgba(0,201,255,0.06)', border: '1px solid rgba(0,201,255,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.muted }}>
                      🧪 Sandbox accounts use the <span style={{ color: C.primary }}>Starter plan</span> with full feature access. A welcome email will be sent automatically.
                    </div>
                    <Button variant="accent" onClick={handleCreateSandbox} disabled={sandboxLoading || !sandboxForm.email || !sandboxForm.companyName} style={{ width: '100%', padding: '14px', fontSize: 14 }}>{sandboxLoading ? 'Creating...' : '🧪 Create Sandbox Account'}</Button>
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
                <h2 style={{ color: C.text, margin: 0, fontSize: 20, fontWeight: 700 }}>🎮 Create Demo Account</h2>
                <span onClick={function() { setShowDemoForm(false); }} style={{ color: C.muted, cursor: 'pointer', fontSize: 20 }}>✕</span>
              </div>
              <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Create a pre-configured demo account to showcase the platform to a prospect in a live setting.</p>
              {demoResult && demoResult.success ? (
                <div style={{ background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.3)', borderRadius: 10, padding: 20 }}>
                  <div style={{ color: '#00E676', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>✓ Demo Account Created</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8, fontSize: 13 }}>
                    <span style={{ color: C.muted }}>Company:</span><span style={{ color: C.text, fontWeight: 600 }}>{demoResult.tenant_name}</span>
                    <span style={{ color: C.muted }}>Email:</span><span style={{ color: C.text }}>{demoResult.email}</span>
                    <span style={{ color: C.muted }}>Set-password link:</span><span style={{ color: C.primary, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>{demoResult.set_password_link || '(emailed — use Resend if it expires)'}</span>
                    <span style={{ color: C.muted }}>Portal:</span><span style={{ color: C.primary }}>portal.engwx.com</span>
                  </div>
                  <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                    <Button variant="accent" onClick={function() { navigator.clipboard.writeText(demoResult.set_password_link || ''); }} disabled={!demoResult.set_password_link}>Copy set-password link</Button>
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
                    </div>
                    <div style={{ background: 'rgba(224,64,251,0.06)', border: '1px solid rgba(224,64,251,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.muted }}>
                      🎮 Demo accounts come pre-loaded and are great for live prospect walkthroughs.
                    </div>
                    <Button variant="accent" onClick={handleCreateDemo} disabled={demoLoading || !demoForm.email || !demoForm.companyName} style={{ padding: '14px', fontSize: 14, width: '100%' }}>{demoLoading ? 'Creating...' : '🎮 Create Demo Account'}</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </PortalShell>
  );
}
