import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import BrandingEditor from './BrandingEditor';
import EmailDigest from './EmailDigest';
import PlatformUpdatesBell from './PlatformUpdatesBell';
import HelpDeskModule from './components/HelpDesk/HelpDeskModule';
import SupportRequestForm from './SupportRequestForm';
import OnboardingWizard from './OnboardingWizard';

var PLAN_MRR = { starter: 99, growth: 249, pro: 499, enterprise: 999, silver: 499, gold: 1499, platinum: 3999, diamond: 7999 };

function getColors() {
  return { bg: '#050810', surface: '#0d1220', border: '#1a2540', primary: '#E040FB', accent: '#FFD600', text: '#E8F4FD', muted: '#6B8BAE' };
}

function planBadge(plan) {
  var colors = { starter: '#6366f1', growth: '#00C9FF', pro: '#E040FB', enterprise: '#FF6B35', silver: '#94a3b8', gold: '#FFD600', platinum: '#e2e8f0', diamond: '#67e8f9' };
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: (colors[plan] || '#6366f1') + '22', color: colors[plan] || '#6366f1', border: '1px solid ' + (colors[plan] || '#6366f1') + '44', textTransform: 'capitalize' }}>{plan || '—'}</span>;
}

function statusDot(status) {
  var color = status === 'active' ? '#00E676' : status === 'trial' ? '#FFD600' : '#64748b';
  return <span style={{ color: color, fontWeight: 700, fontSize: 12 }}>{status === 'active' ? '● Active' : status === 'trial' ? '◐ Trial' : '○ ' + (status || 'inactive')}</span>;
}

export default function MasterAgentPortal({ masterAgentTenantId, onLogout, onBack, profile, onOpenTenantPortal }) {
  var baseC = getColors();
  var [brandOverrides, setBrandOverrides] = useState({});
  useEffect(function() {
    if (!masterAgentTenantId) return;
    (async function() {
      try {
        var r = await supabase.from('tenants').select('brand_primary, brand_secondary').eq('id', masterAgentTenantId).maybeSingle();
        if (r.data) {
          var p = {};
          if (r.data.brand_primary) p.primary = r.data.brand_primary;
          if (r.data.brand_secondary) p.accent = r.data.brand_secondary;
          if (Object.keys(p).length > 0) setBrandOverrides(p);
        }
      } catch (e) {}
    })();
  }, [masterAgentTenantId]);
  var C = Object.assign({}, baseC, brandOverrides);
  var [page, setPage] = useState('dashboard');
  var [needsOnboarding, setNeedsOnboarding] = useState(false);
  useEffect(function() {
    if (!masterAgentTenantId) return;
    var isSuper = profile && profile.role === 'superadmin';
    if (isSuper) return;
    (async function() {
      try {
        var t = await supabase.from('tenants').select('aup_accepted, onboarding_completed').eq('id', masterAgentTenantId).maybeSingle();
        if (t.data && t.data.aup_accepted && !t.data.onboarding_completed) setNeedsOnboarding(true);
      } catch (e) {}
    })();
  }, [masterAgentTenantId, profile]);
  var [info, setInfo] = useState(null);
  var [agents, setAgents] = useState([]);
  var [agentTenantsMap, setAgentTenantsMap] = useState({});
  var [overrides, setOverrides] = useState([]);
  var [commissions, setCommissions] = useState([]);
  var [loading, setLoading] = useState(false);
  var [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  var [expandedAgent, setExpandedAgent] = useState(null);
  var [drillAgent, setDrillAgent] = useState(null);

  useEffect(function() { loadData(); }, [masterAgentTenantId]);

  async function loadData() {
    setLoading(true);
    try {
      // Master agent info
      var m = await supabase.from('tenants').select('*').eq('id', masterAgentTenantId).maybeSingle();
      if (m.data) setInfo(m.data);

      // Agents under this master — tenants where parent_entity_id = this master AND entity_tier = 'agent'
      var a = await supabase.from('tenants').select('*').eq('parent_entity_id', masterAgentTenantId).eq('entity_tier', 'agent').order('created_at', { ascending: false });
      var agentList = a.data || [];
      setAgents(agentList);

      // For each agent, load their tenants
      var tenantsByAgent = {};
      for (var i = 0; i < agentList.length; i++) {
        var ag = agentList[i];
        var at = await supabase.from('tenants').select('*').eq('parent_entity_id', ag.id).order('created_at', { ascending: false });
        tenantsByAgent[ag.id] = at.data || [];
      }
      setAgentTenantsMap(tenantsByAgent);

      // Override rates for this master's agents
      var o = await supabase.from('master_agent_overrides').select('*').eq('master_agent_id', masterAgentTenantId);
      setOverrides(o.data || []);

      // Commissions — referrals where referrer_id = this master, join commissions
      var refs = await supabase.from('referrals').select('id').eq('referrer_id', masterAgentTenantId);
      var refIds = (refs.data || []).map(function(r) { return r.id; });
      if (refIds.length > 0) {
        var c = await supabase.from('commissions').select('*').in('referral_id', refIds).order('billing_period', { ascending: false });
        setCommissions(c.data || []);
      } else {
        setCommissions([]);
      }
    } catch (e) { console.error('[MasterAgent] Load error:', e); }
    setLoading(false);
  }

  function doLogout() {
    supabase.auth.signOut().then(function() { if (onLogout) onLogout(); window.location.href = '/'; }).catch(function() { window.location.href = '/'; });
  }

  function exportCSV() {
    var rows = [['Period', 'Referral ID', 'Gross Amount', 'Commission Amount', 'Status', 'Paid Date']];
    commissions.forEach(function(c) {
      rows.push([c.billing_period, c.referral_id, c.gross_amount, c.commission_amount, c.status, c.paid_date || '']);
    });
    var csv = rows.map(function(r) { return r.join(','); }).join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'commissions.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  var allAgentTenants = Object.values(agentTenantsMap).reduce(function(a, b) { return a.concat(b); }, []);
  var totalMRR = allAgentTenants.reduce(function(sum, t) { return sum + (t.status === 'active' ? (PLAN_MRR[t.plan] || 0) : 0); }, 0);
  var totalCommissionsEarned = commissions.reduce(function(sum, c) { return sum + parseFloat(c.commission_amount || 0); }, 0);
  var pendingCommissions = commissions.filter(function(c) { return c.status === 'pending'; }).reduce(function(sum, c) { return sum + parseFloat(c.commission_amount || 0); }, 0);
  var paidCommissions = commissions.filter(function(c) { return c.status === 'paid'; }).reduce(function(sum, c) { return sum + parseFloat(c.commission_amount || 0); }, 0);

  var navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
    { id: 'agents', label: 'Agents', icon: '🤝' },
    { id: 'commissions', label: 'Commissions', icon: '💰' },
    { id: 'helpdesk', label: 'Help Desk', icon: '🎫' },
    { id: 'email-digest', label: 'AI Omnichannel Digest', icon: '📡' },
    { id: 'branding', label: 'Branding', icon: '🎨' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 22 };
  var btnPrimary = { background: 'linear-gradient(135deg, ' + C.primary + ', ' + C.accent + ')', border: 'none', borderRadius: 10, padding: '10px 20px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13 };
  var btnSec = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 16px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12 };

  // Drill-down: read-only agent detail
  if (drillAgent) {
    var agent = agents.find(function(a) { return a.id === drillAgent; });
    var tenants = agentTenantsMap[drillAgent] || [];
    var agentMRR = tenants.reduce(function(sum, t) { return sum + (t.status === 'active' ? (PLAN_MRR[t.plan] || 0) : 0); }, 0);
    return (
      <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'DM Sans', sans-serif", color: C.text, padding: '32px 40px' }}>
        <button onClick={function() { setDrillAgent(null); }} style={Object.assign({}, btnSec, { marginBottom: 16 })}>← Back to Agents</button>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>{agent ? agent.name : 'Agent'}</h1>
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Read-only view — {tenants.length} tenant(s), ${agentMRR.toLocaleString()}/mo MRR</p>

        {tenants.length === 0 ? (
          <div style={Object.assign({}, card, { textAlign: 'center', padding: 40 })}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🏢</div>
            <div style={{ color: C.muted, fontSize: 13 }}>No tenants under this agent yet.</div>
          </div>
        ) : (
          <div style={Object.assign({}, card, { padding: 0 })}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 12, padding: '12px 18px', fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div>Tenant</div><div>Plan</div><div>Status</div><div>MRR</div><div>Joined</div>
            </div>
            {tenants.map(function(t) {
              return (
                <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 12, alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                  <div>{planBadge(t.plan)}</div>
                  <div>{statusDot(t.status)}</div>
                  <div style={{ color: '#00E676', fontWeight: 700 }}>${PLAN_MRR[t.plan] || 0}/mo</div>
                  <div style={{ color: C.muted, fontSize: 12 }}>{t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (needsOnboarding) {
    return <OnboardingWizard tenantId={masterAgentTenantId} onComplete={function() { setNeedsOnboarding(false); }} />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: "'DM Sans', sans-serif", color: C.text }}>
      {/* Sidebar */}
      <div style={{ width: sidebarCollapsed ? 64 : 240, background: C.surface, borderRight: '1px solid ' + C.border, display: 'flex', flexDirection: 'column', padding: sidebarCollapsed ? '24px 8px' : '24px 16px', position: 'fixed', height: '100vh', zIndex: 100, transition: 'all 0.25s ease' }}>
        {onBack && <div onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', color: C.primary, fontSize: 12, fontWeight: 600, marginBottom: 12, background: C.primary + '10', border: '1px solid ' + C.primary + '22' }}><span>←</span>{!sidebarCollapsed && <span>Back to Platform</span>}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, ' + C.primary + ', ' + C.accent + ')', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18, color: '#000' }}>{info ? (info.name || 'M').charAt(0).toUpperCase() : 'M'}</div>
          {!sidebarCollapsed && <div><div style={{ fontWeight: 800, fontSize: 15, color: '#fff' }}>{info ? info.name : 'Master Agent'}</div><div style={{ fontSize: 10, color: C.primary, fontWeight: 600 }}>MASTER AGENT</div></div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {navItems.map(function(item) {
            var active = page === item.id;
            return <div key={item.id} onClick={function() { setPage(item.id); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', background: active ? C.primary + '15' : 'transparent', color: active ? C.primary : C.muted, fontWeight: active ? 700 : 500, fontSize: 13, justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}><span style={{ fontSize: 18 }}>{item.icon}</span>{!sidebarCollapsed && <span>{item.label}</span>}</div>;
          })}
        </div>
        <div style={{ marginTop: 'auto' }}>
          <div onClick={function() { setSidebarCollapsed(!sidebarCollapsed); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', color: C.muted, fontSize: 13 }}><span>{sidebarCollapsed ? '»' : '«'}</span>{!sidebarCollapsed && <span>Collapse</span>}</div>
          <div onClick={doLogout} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, cursor: 'pointer', color: '#FF5252', fontSize: 13, background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.15)', marginTop: 8 }}><span>⏻</span>{!sidebarCollapsed && <span>Sign Out</span>}</div>
        </div>
      </div>

      <div style={{ marginLeft: sidebarCollapsed ? 64 : 240, flex: 1, padding: '32px 40px', transition: 'margin-left 0.25s', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 16, right: 20, zIndex: 100 }}>
          <PlatformUpdatesBell userId={profile ? profile.id : null} audience="master_agent" />
        </div>
        {/* Dashboard */}
        {page === 'dashboard' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>Welcome back{info ? ', ' + info.name : ''}</h1>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>Master Agent rollup — agents, tenants, and commissions</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
              {[
                { label: 'My Agents', value: agents.length, color: C.primary, icon: '🤝' },
                { label: 'Total Tenants', value: allAgentTenants.length, color: '#00C9FF', icon: '🏢' },
                { label: 'Total MRR', value: '$' + totalMRR.toLocaleString(), color: '#00E676', icon: '💰' },
                { label: 'Commissions Earned', value: '$' + totalCommissionsEarned.toFixed(0), color: C.accent, icon: '⚡' },
              ].map(function(s, i) {
                return (
                  <div key={i} style={Object.assign({}, card, { textAlign: 'center' })}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s.label}</div>
                  </div>
                );
              })}
            </div>

            <div style={Object.assign({}, card, { background: 'linear-gradient(135deg, rgba(224,64,251,0.06), rgba(255,214,0,0.06))', borderColor: 'rgba(224,64,251,0.2)', marginBottom: 20 })}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Commission Breakdown</div>
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>${pendingCommissions.toFixed(0)} pending · ${paidCommissions.toFixed(0)} paid</div>
                </div>
                <button onClick={function() { setPage('commissions'); }} style={btnPrimary}>View Commissions →</button>
              </div>
            </div>

            <div style={card}>
              <h2 style={{ color: '#fff', margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>Your Agents</h2>
              {agents.length === 0 ? (
                <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: 20 }}>No agents yet — ask SP admin to assign agents to you via parent_entity_id.</div>
              ) : agents.slice(0, 5).map(function(a) {
                var t = agentTenantsMap[a.id] || [];
                var mrr = t.reduce(function(sum, x) { return sum + (x.status === 'active' ? (PLAN_MRR[x.plan] || 0) : 0); }, 0);
                return (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{a.name}</div>
                      <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{t.length} tenants · {t.filter(function(x) { return x.status === 'active'; }).length} active</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#00E676', fontWeight: 700, fontSize: 14 }}>${mrr.toLocaleString()}/mo</div>
                      <div style={{ color: C.muted, fontSize: 10 }}>total MRR</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Agents tab */}
        {page === 'agents' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>My Agents</h1>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>{agents.length} agent(s) under you · {allAgentTenants.length} total tenants · ${totalMRR.toLocaleString()}/mo MRR</p>
            {agents.length === 0 ? (
              <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🤝</div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>No agents assigned yet</div>
                <div style={{ color: C.muted, fontSize: 13 }}>SP admin sets parent_entity_id on agent tenants to assign them to you.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {agents.map(function(a) {
                  var t = agentTenantsMap[a.id] || [];
                  var mrr = t.reduce(function(s, x) { return s + (x.status === 'active' ? (PLAN_MRR[x.plan] || 0) : 0); }, 0);
                  var override = overrides.find(function(o) { return o.agent_id === a.id; });
                  var myCommission = mrr * (override ? parseFloat(override.override_percent) : 0.05);
                  return (
                    <div key={a.id} style={card}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 100px', gap: 16, alignItems: 'center' }}>
                        <div>
                          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{a.name}</div>
                          <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Since {a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>TENANTS</div><div style={{ color: '#fff', fontWeight: 700 }}>{t.length}</div></div>
                        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>ACTIVE</div><div style={{ color: '#00E676', fontWeight: 700 }}>{t.filter(function(x) { return x.status === 'active'; }).length}</div></div>
                        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>MRR</div><div style={{ color: '#00E676', fontWeight: 700 }}>${mrr.toLocaleString()}</div></div>
                        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>MY OVERRIDE</div><div style={{ color: C.accent, fontWeight: 700 }}>${myCommission.toFixed(0)}</div><div style={{ fontSize: 9, color: C.muted }}>{override ? (parseFloat(override.override_percent) * 100).toFixed(1) + '%' : '5%'}</div></div>
                        <div style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button onClick={function() { setDrillAgent(a.id); }} style={btnSec}>View →</button>
                          {info && info.msp_enabled && info.letter_of_agency && onOpenTenantPortal && (
                            <button onClick={function() { onOpenTenantPortal(a.id); }} style={Object.assign({}, btnPrimary, { padding: '8px 12px', fontSize: 11 })}>🔓 Open Portal</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Commissions tab */}
        {page === 'commissions' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
              <div>
                <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>Commissions</h1>
                <p style={{ color: C.muted, fontSize: 14 }}>Monthly breakdown · ${totalCommissionsEarned.toFixed(0)} total earned</p>
              </div>
              <button onClick={exportCSV} style={btnPrimary} disabled={commissions.length === 0}>📥 Export CSV</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              <div style={Object.assign({}, card, { textAlign: 'center' })}>
                <div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Total Earned</div>
                <div style={{ color: C.accent, fontSize: 32, fontWeight: 800 }}>${totalCommissionsEarned.toFixed(0)}</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>All time</div>
              </div>
              <div style={Object.assign({}, card, { textAlign: 'center' })}>
                <div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Pending</div>
                <div style={{ color: '#FFD600', fontSize: 32, fontWeight: 800 }}>${pendingCommissions.toFixed(0)}</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{commissions.filter(function(c) { return c.status === 'pending'; }).length} open</div>
              </div>
              <div style={Object.assign({}, card, { textAlign: 'center' })}>
                <div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Paid</div>
                <div style={{ color: '#00E676', fontSize: 32, fontWeight: 800 }}>${paidCommissions.toFixed(0)}</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{commissions.filter(function(c) { return c.status === 'paid'; }).length} paid</div>
              </div>
            </div>

            <div style={Object.assign({}, card, { padding: 0 })}>
              {commissions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: C.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>💰</div>
                  <div style={{ fontSize: 14 }}>No commissions recorded yet.</div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 12, padding: '12px 18px', fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div>Period</div><div>Gross</div><div>Commission</div><div>Status</div><div>Paid Date</div>
                  </div>
                  {commissions.map(function(c) {
                    return (
                      <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 12, alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <div style={{ color: '#fff', fontWeight: 600 }}>{c.billing_period ? new Date(c.billing_period).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : '—'}</div>
                        <div style={{ color: C.muted }}>${parseFloat(c.gross_amount || 0).toFixed(2)}</div>
                        <div style={{ color: C.accent, fontWeight: 700 }}>${parseFloat(c.commission_amount || 0).toFixed(2)}</div>
                        <div><span style={{ background: (c.status === 'paid' ? '#00E67622' : '#FFD60022'), color: c.status === 'paid' ? '#00E676' : '#FFD600', border: '1px solid ' + (c.status === 'paid' ? '#00E67644' : '#FFD60044'), borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{c.status}</span></div>
                        <div style={{ color: C.muted, fontSize: 12 }}>{c.paid_date ? new Date(c.paid_date).toLocaleDateString() : '—'}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {page === 'helpdesk' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <SupportRequestForm tenantId={masterAgentTenantId} userEmail={profile ? profile.email : null} userName={profile ? profile.full_name : null} C={C} />
            </div>
            <HelpDeskModule tenantId={masterAgentTenantId} userRole="tenant" C={C} demoMode={false} />
          </div>
        )}
        {page === 'email-digest' && <EmailDigest C={C} currentTenantId={masterAgentTenantId} />}

        {page === 'branding' && (
          <div style={{ maxWidth: 900 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>🎨 Branding</h1>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>Customize your master agent portal branding. Editing sub-agent or tenant branding requires MSP Access (Letter of Agency).</p>
            <BrandingEditor entityId={masterAgentTenantId} actor={{ tenantId: masterAgentTenantId, entityTier: 'master_agent', isSuperAdmin: false, mspEnabled: !!(info && info.msp_enabled), loaOnFile: !!(info && info.letter_of_agency) }} C={C} />
          </div>
        )}

        {page === 'settings' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 20px' }}>Settings</h1>
            <div style={card}><div style={{ color: C.muted, fontSize: 13 }}>Contact SP admin for account changes.</div></div>
          </div>
        )}
      </div>
    </div>
  );
}
