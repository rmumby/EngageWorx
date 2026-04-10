import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

var PLAN_MRR = { starter: 99, growth: 249, pro: 499, enterprise: 999, silver: 499, gold: 1499, platinum: 3999, diamond: 7999 };
var MASTER_RATE = 0.20;
var SUB_RATE = 0.15;
var OVERRIDE_RATE = 0.05;

function calcCommission(tenants, rate) {
  return tenants.reduce(function(sum, t) {
    var mrr = PLAN_MRR[t.plan] || 0;
    return sum + (t.status === 'active' ? mrr * rate : 0);
  }, 0);
}

function getColors() {
  return { bg: '#050810', surface: '#0d1220', border: '#1a2540', primary: '#FFD600', accent: '#FF6B35', text: '#E8F4FD', muted: '#6B8BAE' };
}

export default function AgentPortal({ agentTenantId, onLogout, onBack, profile }) {
  var C = getColors();
  var [page, setPage] = useState('dashboard');
  var [agentInfo, setAgentInfo] = useState(null);
  var [directTenants, setDirectTenants] = useState([]);
  var [subAgents, setSubAgents] = useState([]);
  var [subAgentTenants, setSubAgentTenants] = useState({});
  var [loading, setLoading] = useState(false);
  var [agentBrand, setAgentBrand] = useState({});
  var [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  var [expandedAgent, setExpandedAgent] = useState(null);
  var [commissionModel, setCommissionModel] = useState('revenue_share');
// Sandbox state
var [showSandbox, setShowSandbox] = useState(false);
var [sandboxForm, setSandboxForm] = useState({ fullName: '', email: '', companyName: '', password: '' });
var [sandboxLoading, setSandboxLoading] = useState(false);
var [sandboxResult, setSandboxResult] = useState(null);
// Demo state
var [showDemoForm, setShowDemoForm] = useState(false);
var [demoForm, setDemoForm] = useState({ fullName: '', email: '', companyName: '', password: '' });
var [demoLoading, setDemoLoading] = useState(false);
var [demoResult, setDemoResult] = useState(null);

  useEffect(function() { loadAgentData(); }, [agentTenantId]);

  async function loadAgentData() {
    setLoading(true);
    try {
      var a = await supabase.from('tenants').select('*').eq('id', agentTenantId).maybeSingle();
      if (a.data) setAgentInfo(a.data);
      var d = await supabase.from('tenants').select('*').eq('parent_tenant_id', agentTenantId).eq('tenant_type', 'business').order('created_at', { ascending: false });
      setDirectTenants(d.data || []);
      var sa = await supabase.from('tenants').select('*').eq('parent_tenant_id', agentTenantId).eq('tenant_type', 'agent').order('created_at', { ascending: false });
      var agents = sa.data || [];
      setSubAgents(agents);
      var tenantsMap = {};
      for (var i = 0; i < agents.length; i++) {
        var st = await supabase.from('tenants').select('*').eq('parent_tenant_id', agents[i].id).order('created_at', { ascending: false });
        tenantsMap[agents[i].id] = st.data || [];
      }
      setSubAgentTenants(tenantsMap);
    } catch (e) { console.error('Agent load error:', e); }
    setLoading(false);
  }

  async function detectAgentBrand() {
  if (!agentBrand.websiteUrl) return;
  setAgentBrand(function(b) { return Object.assign({}, b, { detecting: true }); });
  try {
    var res = await fetch('/api/detect-brand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: agentBrand.websiteUrl })
    });
    var data = await res.json();
    setAgentBrand(function(b) { return Object.assign({}, b, {
      detecting: false,
      name: data.brand?.name || b.name,
      primary: data.brand?.primary || b.primary,
      accent: data.brand?.secondary || b.accent,
      logoUrl: data.brand?.logoUrl || b.logoUrl,
    }); });
  } catch(e) {
    setAgentBrand(function(b) { return Object.assign({}, b, { detecting: false }); });
  }
}

  var allSubTenants = Object.values(subAgentTenants).reduce(function(a, b) { return a.concat(b); }, []);
  var directCommission = calcCommission(directTenants, MASTER_RATE);
  var overrideCommission = calcCommission(allSubTenants, OVERRIDE_RATE);
  var totalMonthly = directCommission + overrideCommission;
  var activeDirect = directTenants.filter(function(t) { return t.status === 'active'; }).length;
  var totalSubTenants = allSubTenants.length;
  var activeSubTenants = allSubTenants.filter(function(t) { return t.status === 'active'; }).length;

  var navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
    { id: 'tenants', label: 'My Clients', icon: '🏢' },
    { id: 'subagents', label: 'Sub-Agents', icon: '🤝' },
    { id: 'commissions', label: 'Commissions', icon: '💰' },
    { id: 'resources', label: 'Resources', icon: '📚' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 22 };
  var btnPrimary = { background: 'linear-gradient(135deg, #FFD600, #FF6B35)', border: 'none', borderRadius: 10, padding: '10px 20px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  var inputStyle = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' };

  function planBadge(plan) {
    var colors = { starter: '#6366f1', growth: '#00C9FF', pro: '#E040FB', enterprise: '#FF6B35', silver: '#94a3b8', gold: '#FFD600', platinum: '#e2e8f0', diamond: '#67e8f9' };
    return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: (colors[plan] || '#6366f1') + '22', color: colors[plan] || '#6366f1', border: '1px solid ' + (colors[plan] || '#6366f1') + '44', textTransform: 'capitalize' }}>{plan}</span>;
  }

  function statusDot(status) {
    var color = status === 'active' ? '#00E676' : status === 'trial' ? '#FFD600' : '#64748b';
    return <span style={{ color: color, fontWeight: 700, fontSize: 12 }}>{status === 'active' ? '● Active' : status === 'trial' ? '◐ Trial' : '○ ' + status}</span>;
  }

  function doLogout() {
    supabase.auth.signOut().then(function() { if (onLogout) onLogout(); window.location.href = '/'; }).catch(function() { window.location.href = '/'; });
  }

  function copyLink() {
    navigator.clipboard.writeText('https://engwx.com/ref/' + (agentInfo ? agentInfo.slug : ''));
  }
function generatePassword(company) {
  var base = company.replace(/[^a-zA-Z]/g, '');
  if (base.length < 3) base = 'Tenant';
  return base.charAt(0).toUpperCase() + base.slice(1, 6) + '2026!';
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
        csp_tenant_id: agentTenantId,
        email: sandboxForm.email.trim(),
        password: password,
        full_name: sandboxForm.fullName.trim() || 'Sandbox User',
        company_name: sandboxForm.companyName.trim(),
        plan: 'starter',
        is_sandbox: true,
      }),
    });
    var data = await resp.json();
    if (data.success) { setSandboxResult(Object.assign({}, data, { password: password })); loadAgentData(); }
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
        csp_tenant_id: agentTenantId,
        email: demoForm.email.trim(),
        password: password,
        full_name: demoForm.fullName.trim() || 'Demo User',
        company_name: demoForm.companyName.trim(),
        plan: 'starter',
        is_demo: true,
      }),
    });
    var data = await resp.json();
    if (data.success) { setDemoResult(Object.assign({}, data, { password: password })); loadAgentData(); }
    else { setDemoResult({ error: data.error || 'Failed to create demo account' }); }
  } catch (e) { setDemoResult({ error: e.message }); }
  setDemoLoading(false);
}
  
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: "'DM Sans', sans-serif", color: C.text }}>
      <div style={{ width: sidebarCollapsed ? 64 : 240, background: C.surface, borderRight: '1px solid ' + C.border, display: 'flex', flexDirection: 'column', padding: sidebarCollapsed ? '24px 8px' : '24px 16px', flexShrink: 0, position: 'fixed', height: '100vh', zIndex: 100, transition: 'all 0.25s ease', overflow: 'hidden' }}>
        {onBack && <div onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', color: C.primary, fontSize: 12, fontWeight: 600, marginBottom: 12, background: C.primary + '10', border: '1px solid ' + C.primary + '22', justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}><span>←</span>{!sidebarCollapsed && <span>Back to Platform</span>}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #FFD600, #FF6B35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18, color: '#000', flexShrink: 0 }}>{agentInfo ? (agentInfo.name || 'A').charAt(0).toUpperCase() : 'A'}</div>
          {!sidebarCollapsed && <div><div style={{ fontWeight: 800, fontSize: 15, color: '#fff', letterSpacing: -0.5 }}>{agentInfo ? agentInfo.name : 'Agent Portal'}</div><div style={{ fontSize: 10, color: C.primary, fontWeight: 600, letterSpacing: 0.5 }}>MASTER AGENT</div></div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {navItems.map(function(item) {
            var active = page === item.id;
            return <div key={item.id} onClick={function() { setPage(item.id); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: sidebarCollapsed ? '10px 8px' : '10px 14px', borderRadius: 10, cursor: 'pointer', background: active ? C.primary + '15' : 'transparent', color: active ? C.primary : C.muted, fontWeight: active ? 700 : 500, fontSize: 13, transition: 'all 0.2s', justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}><span style={{ fontSize: 18 }}>{item.icon}</span>{!sidebarCollapsed && <span>{item.label}</span>}</div>;
          })}
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div onClick={function() { setSidebarCollapsed(!sidebarCollapsed); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', color: C.muted, fontSize: 13, justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}><span>{sidebarCollapsed ? '»' : '«'}</span>{!sidebarCollapsed && <span>Collapse</span>}</div>
          <div onClick={doLogout} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, cursor: 'pointer', color: '#FF5252', fontSize: 13, justifyContent: sidebarCollapsed ? 'center' : 'flex-start', background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.15)' }}><span>⏻</span>{!sidebarCollapsed && <span style={{ fontWeight: 600 }}>Sign Out</span>}</div>
        </div>
      </div>

      <div style={{ marginLeft: sidebarCollapsed ? 64 : 240, flex: 1, padding: '32px 40px', transition: 'margin-left 0.25s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginBottom: 8 }}>
          {onBack && <span onClick={onBack} style={{ color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>← Back to Platform</span>}
          <span onClick={doLogout} style={{ color: '#FF5252', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>⏻ Sign Out</span>
        </div>

        {page === 'dashboard' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>Welcome back{agentInfo ? ', ' + agentInfo.name : ''}</h1>
            <p style={{ color: C.muted, marginTop: 0, marginBottom: 28, fontSize: 14 }}>Master Agent Dashboard — track your clients, sub-agents, and commissions</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
              {[
                { label: 'Direct Clients', value: directTenants.length, sub: activeDirect + ' active', icon: '🏢', color: '#00C9FF' },
                { label: 'Sub-Agents', value: subAgents.length, sub: totalSubTenants + ' their clients', icon: '🤝', color: '#E040FB' },
                { label: 'Direct Commission', value: '$' + directCommission.toFixed(0), sub: '20% of MRR', icon: '💰', color: '#00E676' },
                { label: 'Override Commission', value: '$' + overrideCommission.toFixed(0), sub: '5% on sub-agent MRR', icon: '⚡', color: C.primary },
              ].map(function(s, i) {
                return <div key={i} style={Object.assign({}, card, { textAlign: 'center' })}><div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div><div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div><div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s.label}</div><div style={{ fontSize: 10, color: s.color, marginTop: 4, fontWeight: 600 }}>{s.sub}</div></div>;
              })}
            </div>
            <div style={Object.assign({}, card, { marginBottom: 20, background: 'linear-gradient(135deg, rgba(255,214,0,0.06), rgba(255,107,53,0.06))', borderColor: 'rgba(255,214,0,0.2)' })}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Total Monthly Commission</div>
                  <div style={{ color: C.primary, fontSize: 32, fontWeight: 900 }}>${totalMonthly.toFixed(0)}<span style={{ fontSize: 14, color: C.muted, fontWeight: 400 }}>/mo</span></div>
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>${directCommission.toFixed(0)} direct + ${overrideCommission.toFixed(0)} override</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>Your Referral Link</div>
                  <div style={{ color: C.primary, fontSize: 13, fontFamily: 'monospace', marginBottom: 8 }}>engwx.com/ref/{agentInfo ? agentInfo.slug : '...'}</div>
                  <button onClick={copyLink} style={btnPrimary}>Copy Link</button>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={card}>
                <h2 style={{ color: '#fff', margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>Recent Clients</h2>
                {directTenants.length === 0 ? <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: 20 }}>No clients yet</div> : directTenants.slice(0, 5).map(function(t) {
                  var mrr = PLAN_MRR[t.plan] || 0;
                  var comm = t.status === 'active' ? mrr * MASTER_RATE : 0;
                  return <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div><div style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{t.name}</div><div style={{ display: 'flex', gap: 6, marginTop: 3 }}>{planBadge(t.plan)}{statusDot(t.status)}</div></div>
                    <div style={{ textAlign: 'right' }}><div style={{ color: '#00E676', fontWeight: 700, fontSize: 14 }}>${comm.toFixed(0)}/mo</div><div style={{ color: C.muted, fontSize: 10 }}>${mrr} MRR × 20%</div></div>
                  </div>;
                })}
              </div>
              <div style={card}>
                <h2 style={{ color: '#fff', margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>Sub-Agents</h2>
                {subAgents.length === 0 ? <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: 20 }}>No sub-agents yet</div> : subAgents.slice(0, 5).map(function(sa) {
                  var saTenants = subAgentTenants[sa.id] || [];
                  var saOverride = calcCommission(saTenants, OVERRIDE_RATE);
                  return <div key={sa.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div><div style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{sa.name}</div><div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{saTenants.length} clients · {saTenants.filter(function(t) { return t.status === 'active'; }).length} active</div></div>
                    <div style={{ textAlign: 'right' }}><div style={{ color: C.primary, fontWeight: 700, fontSize: 14 }}>${saOverride.toFixed(0)}/mo</div><div style={{ color: C.muted, fontSize: 10 }}>5% override</div></div>
                  </div>;
                })}
              </div>
            </div>
          </div>
        )}

        {page === 'tenants' && (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>My Clients</h1>
        <p style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>{directTenants.length} clients · {activeDirect} active · ${directCommission.toFixed(0)}/mo commission</p>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={function() { setShowSandbox(true); setSandboxResult(null); setSandboxForm({ fullName: '', email: '', companyName: '', password: '' }); }} style={{ background: C.primary + '22', border: '1px solid ' + C.primary + '55', borderRadius: 10, padding: '10px 16px', color: C.primary, fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>🧪 Create Sandbox</button>
        <button onClick={function() { setShowDemoForm(true); setDemoResult(null); setDemoForm({ fullName: '', email: '', companyName: '', password: '' }); }} style={{ background: C.accent + '22', border: '1px solid ' + C.accent + '55', borderRadius: 10, padding: '10px 16px', color: C.accent, fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>🎮 Create Demo</button>
      </div>
    </div>
    {directTenants.length === 0 ? (
              <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🏢</div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 20, marginBottom: 8 }}>No clients yet</div>
                <div style={{ color: C.muted, fontSize: 14, marginBottom: 24 }}>Share your referral link to start earning commissions.</div>
                <button onClick={copyLink} style={btnPrimary}>Copy Referral Link</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {directTenants.map(function(t) {
                  var mrr = PLAN_MRR[t.plan] || 0;
                  var comm = t.status === 'active' ? mrr * MASTER_RATE : 0;
                  return <div key={t.id} style={Object.assign({}, card, { display: 'grid', gridTemplateColumns: '1fr 120px 120px 120px 140px', alignItems: 'center', gap: 16, borderLeft: '4px solid ' + (t.status === 'active' ? '#00E676' : '#FFD600') })}>
                    <div><div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{t.name}</div><div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Since {new Date(t.created_at).toLocaleDateString()}</div></div>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', marginBottom: 3 }}>Plan</div>{planBadge(t.plan)}</div>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', marginBottom: 3 }}>Status</div>{statusDot(t.status)}</div>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', marginBottom: 3 }}>MRR</div><div style={{ color: '#fff', fontWeight: 700 }}>${mrr}</div></div>
                    <div style={{ textAlign: 'right' }}><div style={{ color: '#00E676', fontWeight: 800, fontSize: 16 }}>${comm.toFixed(0)}/mo</div><div style={{ color: C.muted, fontSize: 10 }}>20% commission</div></div>
                  </div>;
                })}
              </div>
            )}
          </div>
        )}

        {page === 'subagents' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>Sub-Agents</h1>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>{subAgents.length} sub-agents · {totalSubTenants} their clients · ${overrideCommission.toFixed(0)}/mo override commission</p>
            <div style={{ background: 'rgba(255,214,0,0.06)', border: '1px solid rgba(255,214,0,0.2)', borderRadius: 12, padding: '14px 20px', marginBottom: 24, fontSize: 13, color: C.muted }}>
              You earn a <span style={{ color: C.primary, fontWeight: 700 }}>5% override</span> on all MRR generated by your sub-agents' clients, on top of their <span style={{ color: '#E040FB', fontWeight: 700 }}>15% direct commission</span>.
            </div>
            {subAgents.length === 0 ? (
              <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🤝</div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 20, marginBottom: 8 }}>No sub-agents yet</div>
                <div style={{ color: C.muted, fontSize: 14 }}>Recruit agents to build your downline and earn override commissions.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {subAgents.map(function(sa) {
                  var saTenants = subAgentTenants[sa.id] || [];
                  var saActive = saTenants.filter(function(t) { return t.status === 'active'; }).length;
                  var saDirectComm = calcCommission(saTenants, SUB_RATE);
                  var myOverride = calcCommission(saTenants, OVERRIDE_RATE);
                  var isExpanded = expandedAgent === sa.id;
                  return (
                    <div key={sa.id} style={card}>
                      <div onClick={function() { setExpandedAgent(isExpanded ? null : sa.id); }} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 140px 140px 40px', alignItems: 'center', gap: 16, cursor: 'pointer' }}>
                        <div><div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{sa.name}</div><div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Since {new Date(sa.created_at).toLocaleDateString()}</div></div>
                        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>CLIENTS</div><div style={{ color: '#fff', fontWeight: 700 }}>{saTenants.length}</div></div>
                        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>ACTIVE</div><div style={{ color: '#00E676', fontWeight: 700 }}>{saActive}</div></div>
                        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>THEIR COMM</div><div style={{ color: '#E040FB', fontWeight: 700 }}>${saDirectComm.toFixed(0)}/mo</div><div style={{ fontSize: 9, color: C.muted }}>15% direct</div></div>
                        <div style={{ textAlign: 'right' }}><div style={{ color: C.primary, fontWeight: 800, fontSize: 16 }}>${myOverride.toFixed(0)}/mo</div><div style={{ fontSize: 10, color: C.muted }}>your 5% override</div></div>
                        <div style={{ textAlign: 'center', color: C.muted, fontSize: 16 }}>{isExpanded ? '▲' : '▼'}</div>
                      </div>
                      {isExpanded && saTenants.length > 0 && (
                        <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
                          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>{sa.name}'s Clients</div>
                          <div style={{ display: 'grid', gap: 6 }}>
                            {saTenants.map(function(t) {
                              var mrr = PLAN_MRR[t.plan] || 0;
                              var override = t.status === 'active' ? mrr * OVERRIDE_RATE : 0;
                              return <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px 120px', alignItems: 'center', gap: 12, padding: '8px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                                <div style={{ color: '#f1f5f9', fontSize: 13 }}>{t.name}</div>
                                <div style={{ textAlign: 'center' }}>{planBadge(t.plan)}</div>
                                <div style={{ textAlign: 'center' }}>{statusDot(t.status)}</div>
                                <div style={{ textAlign: 'center', color: C.muted, fontSize: 12 }}>${mrr} MRR</div>
                                <div style={{ textAlign: 'right', color: C.primary, fontWeight: 700, fontSize: 13 }}>${override.toFixed(0)}/mo</div>
                              </div>;
                            })}
                          </div>
                        </div>
                      )}
                      {isExpanded && saTenants.length === 0 && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', color: C.muted, fontSize: 13, textAlign: 'center' }}>No clients yet under this sub-agent</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {page === 'commissions' && (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>Commissions</h1>
      <div style={{ display: 'flex', gap: 0, background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
        {[{ id: 'revenue_share', label: '% Revenue Share' }, { id: 'flat', label: '$ Flat Rate' }].map(function(m) {
          var active = commissionModel === m.id;
          return <button key={m.id} onClick={function() { setCommissionModel(m.id); }} style={{ background: active ? 'linear-gradient(135deg, #FFD600, #FF6B35)' : 'transparent', border: 'none', borderRadius: 8, padding: '8px 18px', color: active ? '#000' : C.muted, fontWeight: active ? 700 : 500, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s' }}>{m.label}</button>;
        })}
      </div>
    </div>
    <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>
      {commissionModel === 'revenue_share' ? '20% of MRR on direct clients · 5% override on sub-agent clients' : '$50–$75 flat per active referral per month'}
    </p>

    {commissionModel === 'revenue_share' ? (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
          {[
            { label: 'Direct Commission', value: '$' + directCommission.toFixed(0), sub: activeDirect + ' clients × 20% MRR', color: '#00E676' },
            { label: 'Override Commission', value: '$' + overrideCommission.toFixed(0), sub: activeSubTenants + ' sub-agent clients × 5%', color: C.primary },
            { label: 'Total Monthly', value: '$' + totalMonthly.toFixed(0), sub: 'Paid on the 24th', color: C.primary, highlight: true },
            { label: 'Projected Annual', value: '$' + (totalMonthly * 12).toFixed(0), sub: 'Based on current MRR', color: '#E040FB' },
          ].map(function(s, i) {
            return <div key={i} style={Object.assign({}, card, { textAlign: 'center', background: s.highlight ? 'rgba(255,214,0,0.06)' : card.background, borderColor: s.highlight ? 'rgba(255,214,0,0.3)' : card.border })}>
              <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{s.label}</div>
              <div style={{ color: s.color, fontSize: 28, fontWeight: 900 }}>{s.value}</div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{s.sub}</div>
            </div>;
          })}
        </div>

        <div style={Object.assign({}, card, { marginBottom: 20 })}>
          <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Rate Schedule — Revenue Share</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {Object.entries(PLAN_MRR).map(function(entry) {
              var plan = entry[0]; var mrr = entry[1];
              return <div key={plan} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ textTransform: 'capitalize', color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{plan}</div>
                <div style={{ color: C.muted, fontSize: 11 }}>MRR: <span style={{ color: '#fff' }}>${mrr}</span></div>
                <div style={{ color: '#00E676', fontSize: 11, marginTop: 2 }}>Direct: <span style={{ fontWeight: 700 }}>${(mrr * MASTER_RATE).toFixed(0)}/mo</span></div>
                <div style={{ color: C.primary, fontSize: 11, marginTop: 1 }}>Override: <span style={{ fontWeight: 700 }}>${(mrr * OVERRIDE_RATE).toFixed(0)}/mo</span></div>
              </div>;
            })}
          </div>
        </div>
      </div>
    ) : (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
          {[
            { label: 'Standard Referrals', value: directTenants.filter(function(t) { return t.status === 'active' && (PLAN_MRR[t.plan] || 0) < 249; }).length, sub: '$50/mo each', color: '#00E676' },
            { label: 'Premium Referrals', value: directTenants.filter(function(t) { return t.status === 'active' && (PLAN_MRR[t.plan] || 0) >= 249; }).length, sub: '$75/mo each (Growth+)', color: C.primary },
            { label: 'Flat Total Monthly', value: '$' + (directTenants.reduce(function(sum, t) { return sum + (t.status === 'active' ? ((PLAN_MRR[t.plan] || 0) >= 249 ? 75 : 50) : 0); }, 0)).toFixed(0), sub: 'Flat commission total', color: '#E040FB', highlight: true },
            { label: 'Projected Annual', value: '$' + (directTenants.reduce(function(sum, t) { return sum + (t.status === 'active' ? ((PLAN_MRR[t.plan] || 0) >= 249 ? 75 : 50) : 0); }, 0) * 12).toFixed(0), sub: 'Based on active referrals', color: '#00C9FF' },
          ].map(function(s, i) {
            return <div key={i} style={Object.assign({}, card, { textAlign: 'center', background: s.highlight ? 'rgba(224,64,251,0.06)' : card.background, borderColor: s.highlight ? 'rgba(224,64,251,0.3)' : card.border })}>
              <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{s.label}</div>
              <div style={{ color: s.color, fontSize: 28, fontWeight: 900 }}>{s.value}</div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{s.sub}</div>
            </div>;
          })}
        </div>

        <div style={Object.assign({}, card, { marginBottom: 20 })}>
          <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Rate Schedule — Flat Commission</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { tier: 'Standard', desc: 'Any active paid plan', rate: '$50/mo', color: '#00E676' },
              { tier: 'Premium', desc: 'Growth plan or higher ($249+)', rate: '$75/mo', color: C.primary },
              { tier: 'Custom', desc: 'High-volume by agreement', rate: 'Negotiated', color: '#E040FB' },
            ].map(function(r, i) {
              return <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '16px 18px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ color: r.color, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{r.tier}</div>
                <div style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>{r.desc}</div>
                <div style={{ color: '#fff', fontWeight: 900, fontSize: 22 }}>{r.rate}</div>
                <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>per active referral</div>
              </div>;
            })}
          </div>
        </div>
      </div>
    )}

    <div style={Object.assign({}, card, { marginBottom: 20 })}>
      <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Payment History</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {[
          { month: 'March 2026', direct: directCommission * 0.9, override: overrideCommission * 0.8, status: 'Paid', date: 'Mar 24' },
          { month: 'February 2026', direct: directCommission * 0.7, override: overrideCommission * 0.6, status: 'Paid', date: 'Feb 24' },
          { month: 'January 2026', direct: directCommission * 0.5, override: overrideCommission * 0.4, status: 'Paid', date: 'Jan 24' },
        ].map(function(p, i) {
          var total = p.direct + p.override;
          return <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 100px 80px', alignItems: 'center', gap: 16, padding: '12px 18px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{p.month}</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: C.muted, fontSize: 10, marginBottom: 2 }}>DIRECT</div>
              <div style={{ color: '#00E676', fontWeight: 700 }}>${p.direct.toFixed(0)}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: C.muted, fontSize: 10, marginBottom: 2 }}>OVERRIDE</div>
              <div style={{ color: C.primary, fontWeight: 700 }}>${p.override.toFixed(0)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>${total.toFixed(0)}</div>
              <div style={{ color: C.muted, fontSize: 10 }}>total</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ background: 'rgba(0,230,118,0.12)', border: '1px solid rgba(0,230,118,0.3)', borderRadius: 6, padding: '3px 8px', color: '#00E676', fontSize: 10, fontWeight: 700 }}>{p.status}</span>
            </div>
          </div>;
        })}
      </div>
    </div>

    <div style={card}>
      <h3 style={{ color: '#fff', margin: '0 0 12px', fontSize: 16 }}>How It Works</h3>
      <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.8 }}>
        {commissionModel === 'revenue_share' ? (
          <div>
            <div style={{ marginBottom: 8 }}>🏢 <span style={{ color: '#fff', fontWeight: 600 }}>Direct clients</span> — earn <span style={{ color: '#00E676', fontWeight: 700 }}>20% of MRR</span> for as long as they're active.</div>
            <div style={{ marginBottom: 8 }}>🤝 <span style={{ color: '#fff', fontWeight: 600 }}>Sub-agent clients</span> — earn a <span style={{ color: C.primary, fontWeight: 700 }}>5% override</span> on all MRR from tenants your sub-agents bring in.</div>
            <div>💳 <span style={{ color: '#fff', fontWeight: 600 }}>Payment</span> — commissions paid on the 24th of each month for the previous month.</div>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 8 }}>🏢 <span style={{ color: '#fff', fontWeight: 600 }}>Standard tier</span> — earn <span style={{ color: '#00E676', fontWeight: 700 }}>$50/mo</span> per active referral on any paid plan.</div>
            <div style={{ marginBottom: 8 }}>⭐ <span style={{ color: '#fff', fontWeight: 600 }}>Premium tier</span> — earn <span style={{ color: C.primary, fontWeight: 700 }}>$75/mo</span> per active referral on Growth plan or higher.</div>
            <div>💳 <span style={{ color: '#fff', fontWeight: 600 }}>Payment</span> — commissions paid on the 24th of each month. Minimum $100 payout threshold.</div>
          </div>
        )}
      </div>
    </div>
  </div>
)}

        {page === 'resources' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>Resources</h1>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>Everything you need to close deals</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 20 }}>
              {[{ title: 'Platform Demo', desc: 'Live interactive demo to share with prospects', icon: '🎯', link: 'https://engwx.com/demo' }, { title: 'Pricing', desc: 'Current plans and pricing sheets', icon: '💲', link: 'https://engwx.com/pricing' }, { title: 'API Docs', desc: 'Technical documentation for clients', icon: '🔌', link: 'https://docs.engwx.com' }, { title: 'Support', desc: 'Contact the EngageWorx team', icon: '📞', link: 'mailto:rob@engwx.com' }].map(function(r, i) {
                return <div key={i} style={Object.assign({}, card, { cursor: 'pointer' })} onClick={function() { window.open(r.link, '_blank'); }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>{r.icon}</div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{r.title}</div>
                  <div style={{ color: C.muted, fontSize: 13 }}>{r.desc}</div>
                  <div style={{ color: C.primary, fontSize: 12, fontWeight: 600, marginTop: 10 }}>Open →</div>
                </div>;
              })}
            </div>
            <div style={card}>
              <h2 style={{ color: '#fff', margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>Your Referral Link</h2>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 16px', color: C.primary, fontFamily: 'monospace', fontSize: 14 }}>https://engwx.com/ref/{agentInfo ? agentInfo.slug : '...'}</div>
                <button onClick={copyLink} style={btnPrimary}>Copy</button>
              </div>
            </div>
          </div>
        )}

        {page === 'settings' && (
  <div>
    <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>Settings</h1>
    <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>Your agent account details and branding</p>

    {/* Account Info */}
    <div style={Object.assign({}, card, { marginBottom: 20 })}>
      <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>👤 Account Info</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, fontSize: 14 }}>
        <span style={{ color: C.muted, fontWeight: 600 }}>Company:</span><span style={{ color: '#fff' }}>{agentInfo ? agentInfo.name : '—'}</span>
        <span style={{ color: C.muted, fontWeight: 600 }}>Partner Type:</span><span style={{ color: C.primary, fontWeight: 700 }}>Master Agent</span>
        <span style={{ color: C.muted, fontWeight: 600 }}>Status:</span><span style={{ color: '#00E676' }}>{agentInfo ? agentInfo.status : '—'}</span>
        <span style={{ color: C.muted, fontWeight: 600 }}>Direct Rate:</span><span style={{ color: '#00E676', fontWeight: 700 }}>20% of MRR</span>
        <span style={{ color: C.muted, fontWeight: 600 }}>Override Rate:</span><span style={{ color: C.primary, fontWeight: 700 }}>5% on sub-agent MRR</span>
        <span style={{ color: C.muted, fontWeight: 600 }}>Payment:</span><span style={{ color: '#fff' }}>24th of each month</span>
      </div>
    </div>

    {/* Brand Settings */}
    <div style={Object.assign({}, card, { maxWidth: 560 })}>
      <h3 style={{ color: '#fff', margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>🎨 Brand Settings</h3>
      <div style={{ display: 'grid', gap: 16 }}>

        {/* Website URL + Auto-detect */}
        <div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Website URL</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={agentBrand.websiteUrl || ''}
              onChange={function(e) { setAgentBrand(function(b) { return Object.assign({}, b, { websiteUrl: e.target.value }); }); }}
              placeholder="https://yourdomain.com"
              style={Object.assign({}, inputStyle, { flex: 1 })}
            />
            <button
              onClick={detectAgentBrand}
              disabled={!agentBrand.websiteUrl || agentBrand.detecting}
              style={{
                background: agentBrand.detecting ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #FFD600, #FF6B35)',
                border: 'none', borderRadius: 8, padding: '10px 14px',
                color: agentBrand.detecting ? '#6B8BAE' : '#000',
                fontWeight: 700, cursor: agentBrand.websiteUrl && !agentBrand.detecting ? 'pointer' : 'not-allowed',
                fontSize: 13, whiteSpace: 'nowrap', fontFamily: "'DM Sans', sans-serif",
                opacity: !agentBrand.websiteUrl ? 0.5 : 1,
              }}
            >
              {agentBrand.detecting ? '⏳ Detecting…' : '✨ Auto-detect'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Auto-fills brand name, colors and logo from your website.</div>
          {agentBrand.name && agentBrand.websiteUrl && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.25)', borderRadius: 8, fontSize: 12, color: '#00E676', fontWeight: 600 }}>
              ✅ Detected: {agentBrand.name}{agentBrand.primary ? ' · ' + agentBrand.primary : ''}
            </div>
          )}
        </div>

        <div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Brand Name</div>
          <input value={agentBrand.name || (agentInfo ? agentInfo.name : '')} onChange={function(e) { setAgentBrand(function(b) { return Object.assign({}, b, { name: e.target.value }); }); }} style={inputStyle} />
        </div>
        <div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Primary Color</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="color" value={agentBrand.primary || '#FFD600'} onChange={function(e) { setAgentBrand(function(b) { return Object.assign({}, b, { primary: e.target.value }); }); }} style={{ width: 44, height: 44, borderRadius: 8, border: '2px solid rgba(255,255,255,0.2)', cursor: 'pointer', padding: 2, background: 'transparent' }} />
            <input value={agentBrand.primary || '#FFD600'} onChange={function(e) { setAgentBrand(function(b) { return Object.assign({}, b, { primary: e.target.value }); }); }} style={Object.assign({}, inputStyle, { fontFamily: 'monospace' })} />
          </div>
        </div>
        <div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Secondary Color</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="color" value={agentBrand.accent || '#FF6B35'} onChange={function(e) { setAgentBrand(function(b) { return Object.assign({}, b, { accent: e.target.value }); }); }} style={{ width: 44, height: 44, borderRadius: 8, border: '2px solid rgba(255,255,255,0.2)', cursor: 'pointer', padding: 2, background: 'transparent' }} />
            <input value={agentBrand.accent || '#FF6B35'} onChange={function(e) { setAgentBrand(function(b) { return Object.assign({}, b, { accent: e.target.value }); }); }} style={Object.assign({}, inputStyle, { fontFamily: 'monospace' })} />
          </div>
        </div>
        <div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Logo URL (optional)</div>
          <input value={agentBrand.logoUrl || ''} onChange={function(e) { setAgentBrand(function(b) { return Object.assign({}, b, { logoUrl: e.target.value }); }); }} placeholder="https://yourdomain.com/logo.png" style={inputStyle} />
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Paste a direct image URL. Right-click your logo → Copy image address.</div>
        </div>
        <button onClick={async function() {
          var res = await supabase.from('tenants').update({
            brand_name: agentBrand.name || (agentInfo ? agentInfo.name : ''),
            brand_primary: agentBrand.primary || '#FFD600',
            brand_secondary: agentBrand.accent || '#FF6B35',
            brand_logo_url: agentBrand.logoUrl || null,
            website_url: agentBrand.websiteUrl || null,
          }).eq('id', agentTenantId);
          if (res.error) { alert('Save failed: ' + res.error.message); }
          else { alert('Branding saved!'); }
        }} style={{ background: 'linear-gradient(135deg, #FFD600, #FF6B35)', border: 'none', borderRadius: 10, padding: '14px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: "'DM Sans', sans-serif", width: '100%' }}>💾 Save Branding</button>
      </div>
    </div>
  </div>
)}
        {/* ── Sandbox Modal ── */}
{showSandbox && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={function() { setShowSandbox(false); }}>
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
            <button onClick={function() { setSandboxResult(null); setSandboxForm({ fullName: '', email: '', companyName: '', password: '' }); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 20px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Create Another</button>
            <button onClick={function() { setShowSandbox(false); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 20px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Close</button>
          </div>
        </div>
      ) : (
        <div>
          {sandboxResult && sandboxResult.error && (
            <div style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#FF3B30', fontSize: 13 }}>{sandboxResult.error}</div>
          )}
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Contact Name</div>
                <input value={sandboxForm.fullName} onChange={function(e) { setSandboxForm(Object.assign({}, sandboxForm, { fullName: e.target.value })); }} placeholder="Jane Smith" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Company Name *</div>
                <input value={sandboxForm.companyName} onChange={function(e) { var n = e.target.value; setSandboxForm(Object.assign({}, sandboxForm, { companyName: n, password: generatePassword(n) })); }} placeholder="Prospect Co" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Email *</div>
                <input value={sandboxForm.email} onChange={function(e) { setSandboxForm(Object.assign({}, sandboxForm, { email: e.target.value })); }} placeholder="jane@prospect.com" type="email" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Password</div>
                <input value={sandboxForm.password} onChange={function(e) { setSandboxForm(Object.assign({}, sandboxForm, { password: e.target.value })); }} placeholder="Auto-generated" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: 'monospace', boxSizing: 'border-box', outline: 'none' }} />
              </div>
            </div>
            <div style={{ background: 'rgba(0,201,255,0.06)', border: '1px solid rgba(0,201,255,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.muted }}>
              🧪 Sandbox accounts use the <span style={{ color: C.primary }}>Starter plan</span> with full feature access. Appears under your My Clients list.
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
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={function() { setShowDemoForm(false); }}>
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
            <button onClick={function() { setDemoResult(null); setDemoForm({ fullName: '', email: '', companyName: '', password: '' }); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 20px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Create Another</button>
            <button onClick={function() { setShowDemoForm(false); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 20px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Close</button>
          </div>
        </div>
      ) : (
        <div>
          {demoResult && demoResult.error && (
            <div style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#FF3B30', fontSize: 13 }}>{demoResult.error}</div>
          )}
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Contact Name</div>
                <input value={demoForm.fullName} onChange={function(e) { setDemoForm(Object.assign({}, demoForm, { fullName: e.target.value })); }} placeholder="Jane Smith" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Company Name *</div>
                <input value={demoForm.companyName} onChange={function(e) { var n = e.target.value; setDemoForm(Object.assign({}, demoForm, { companyName: n, password: generatePassword(n) })); }} placeholder="Prospect Co" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Email *</div>
                <input value={demoForm.email} onChange={function(e) { setDemoForm(Object.assign({}, demoForm, { email: e.target.value })); }} placeholder="jane@prospect.com" type="email" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Password</div>
                <input value={demoForm.password} onChange={function(e) { setDemoForm(Object.assign({}, demoForm, { password: e.target.value })); }} placeholder="Auto-generated" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: 'monospace', boxSizing: 'border-box', outline: 'none' }} />
              </div>
            </div>
            <div style={{ background: 'rgba(224,64,251,0.06)', border: '1px solid rgba(224,64,251,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.muted }}>
              🎮 Demo accounts come ready for a live walkthrough. Appears under your My Clients list and counts toward your commission tracking.
            </div>
            <button onClick={handleCreateDemo} disabled={demoLoading || !demoForm.email || !demoForm.companyName} style={{ background: 'linear-gradient(135deg, ' + C.accent + ', #7C4DFF)', border: 'none', borderRadius: 10, padding: '14px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: "'DM Sans', sans-serif", width: '100%', opacity: (demoLoading || !demoForm.email || !demoForm.companyName) ? 0.6 : 1 }}>{demoLoading ? 'Creating...' : '🎮 Create Demo Account'}</button>
          )}
          </div>
        </div>
      )}

      {/* ── Sandbox Modal ── */}
      {showSandbox && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={function() { setShowSandbox(false); }}>
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
                  <button onClick={function() { setSandboxResult(null); setSandboxForm({ fullName: '', email: '', companyName: '', password: '' }); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 20px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Create Another</button>
                  <button onClick={function() { setShowSandbox(false); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 20px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Close</button>
                </div>
              </div>
            ) : (
              <div>
                {sandboxResult && sandboxResult.error && (
                  <div style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#FF3B30', fontSize: 13 }}>{sandboxResult.error}</div>
                )}
                <div style={{ display: 'grid', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Contact Name</div>
                      <input value={sandboxForm.fullName} onChange={function(e) { setSandboxForm(Object.assign({}, sandboxForm, { fullName: e.target.value })); }} placeholder="Jane Smith" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' }} />
                    </div>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Company Name *</div>
                      <input value={sandboxForm.companyName} onChange={function(e) { var n = e.target.value; setSandboxForm(Object.assign({}, sandboxForm, { companyName: n, password: generatePassword(n) })); }} placeholder="Prospect Co" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Email *</div>
                      <input value={sandboxForm.email} onChange={function(e) { setSandboxForm(Object.assign({}, sandboxForm, { email: e.target.value })); }} placeholder="jane@prospect.com" type="email" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' }} />
                    </div>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Password</div>
                      <input value={sandboxForm.password} onChange={function(e) { setSandboxForm(Object.assign({}, sandboxForm, { password: e.target.value })); }} placeholder="Auto-generated" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: 'monospace', boxSizing: 'border-box', outline: 'none' }} />
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0,201,255,0.06)', border: '1px solid rgba(0,201,255,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.muted }}>
                    🧪 Sandbox accounts use the <span style={{ color: C.primary }}>Starter plan</span> with full feature access. Appears under your My Clients list.
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={function() { setShowDemoForm(false); }}>
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
                  <button onClick={function() { setDemoResult(null); setDemoForm({ fullName: '', email: '', companyName: '', password: '' }); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 20px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Create Another</button>
                  <button onClick={function() { setShowDemoForm(false); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 20px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Close</button>
                </div>
              </div>
            ) : (
              <div>
                {demoResult && demoResult.error && (
                  <div style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#FF3B30', fontSize: 13 }}>{demoResult.error}</div>
                )}
                <div style={{ display: 'grid', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Contact Name</div>
                      <input value={demoForm.fullName} onChange={function(e) { setDemoForm(Object.assign({}, demoForm, { fullName: e.target.value })); }} placeholder="Jane Smith" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' }} />
                    </div>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Company Name *</div>
                      <input value={demoForm.companyName} onChange={function(e) { var n = e.target.value; setDemoForm(Object.assign({}, demoForm, { companyName: n, password: generatePassword(n) })); }} placeholder="Prospect Co" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Email *</div>
                      <input value={demoForm.email} onChange={function(e) { setDemoForm(Object.assign({}, demoForm, { email: e.target.value })); }} placeholder="jane@prospect.com" type="email" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' }} />
                    </div>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Password</div>
                      <input value={demoForm.password} onChange={function(e) { setDemoForm(Object.assign({}, demoForm, { password: e.target.value })); }} placeholder="Auto-generated" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: 'monospace', boxSizing: 'border-box', outline: 'none' }} />
                    </div>
                  </div>
                  <div style={{ background: 'rgba(224,64,251,0.06)', border: '1px solid rgba(224,64,251,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.muted }}>
                    🎮 Demo accounts come ready for a live walkthrough. Appears under My Clients and counts toward commission
