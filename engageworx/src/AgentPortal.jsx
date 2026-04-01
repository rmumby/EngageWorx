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
  var [agentBrand, setAgentBrand] = useState({});
  var [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  var [expandedAgent, setExpandedAgent] = useState(null);

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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: "'DM Sans', sans-serif", color: C.text }}>
      {/* Sidebar */}
      <div style={{ width: sidebarCollapsed ? 64 : 240, background: C.surface, borderRight: '1px solid ' + C.border, display: 'flex', flexDirection: 'column', padding: sidebarCollapsed ? '24px 8px' : '24px 16px', flexShrink: 0, position: 'fixed', height: '100vh', zIndex: 100, transition: 'all 0.25s ease', overflow: 'hidden' }}>
        {onBack && <div onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', color: C.primary, fontSize: 12, fontWeight: 600, marginBottom: 12, background: C.primary + '10', border: '1px solid ' + C.primary + '22', justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}><span>←</span>{!sidebarCollapsed && <span>Back to Platform</span>}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #FFD600, #FF6B35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, color: '#000', flexShrink: 0 }}>EW</div>
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

      {/* Main */}
      <div style={{ marginLeft: sidebarCollapsed ? 64 : 240, flex: 1, padding: '32px 40px', transition: 'margin-left 0.25s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginBottom: 8 }}>
          {onBack && <span onClick={onBack} style={{ color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>← Back to Platform</span>}
          <span onClick={doLogout} style={{ color: '#FF5252', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>⏻ Sign Out</span>
        </div>

        {/* DASHBOARD */}
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

        {/* MY CLIENTS */}
        {page === 'tenants' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>My Clients</h1>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>{directTenants.length} clients · {activeDirect} active · ${directCommission.toFixed(0)}/mo commission</p>
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

        {/* SUB-AGENTS */}
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

        {/* COMMISSIONS */}
        {page === 'commissions' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>Commissions</h1>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>Your earnings breakdown</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
              <div style={Object.assign({}, card, { textAlign: 'center' })}><div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Direct Commission</div><div style={{ color: '#00E676', fontSize: 32, fontWeight: 800 }}>${directCommission.toFixed(0)}</div><div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{activeDirect} clients × 20% MRR</div></div>
              <div style={Object.assign({}, card, { textAlign: 'center' })}><div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Override Commission</div><div style={{ color: C.primary, fontSize: 32, fontWeight: 800 }}>${overrideCommission.toFixed(0)}</div><div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{activeSubTenants} sub-agent clients × 5%</div></div>
              <div style={Object.assign({}, card, { textAlign: 'center', background: 'rgba(255,214,0,0.06)', borderColor: 'rgba(255,214,0,0.3)' })}><div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Total Monthly</div><div style={{ color: C.primary, fontSize: 32, fontWeight: 900 }}>${totalMonthly.toFixed(0)}</div><div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Paid on the 24th</div></div>
            </div>

            <div style={Object.assign({}, card, { marginBottom: 20 })}>
              <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 16 }}>Commission Rate Schedule</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
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

            <div style={card}>
              <h3 style={{ color: '#fff', margin: '0 0 12px', fontSize: 16 }}>How It Works</h3>
              <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.8 }}>
                <div style={{ marginBottom: 8 }}>🏢 <span style={{ color: '#fff', fontWeight: 600 }}>Direct clients</span> — earn <span style={{ color: '#00E676', fontWeight: 700 }}>20%</span> of their monthly plan MRR for as long as they're active.</div>
                <div style={{ marginBottom: 8 }}>🤝 <span style={{ color: '#fff', fontWeight: 600 }}>Sub-agent clients</span> — earn a <span style={{ color: C.primary, fontWeight: 700 }}>5% override</span> on all MRR from tenants your sub-agents bring in.</div>
                <div>💳 <span style={{ color: '#fff', fontWeight: 600 }}>Payment</span> — commissions are paid on the 24th of each month for the previous month's collected invoices.</div>
              </div>
            </div>
          </div>
        )}

        {/* RESOURCES */}
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

        {/* SETTINGS */}
        {page === 'settings' && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>Settings</h1>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>Your agent account details and branding</p>
            <div style={Object.assign({}, card, { marginBottom: 20 })}>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, fontSize: 14 }}>
                <span style={{ color: C.muted, fontWeight: 600 }}>Company:</span><span style={{ color: '#fff' }}>{agentInfo ? agentInfo.name : '—'}</span>
                <span style={{ color: C.muted, fontWeight: 600 }}>Partner Type:</span><span style={{ color: C.primary, fontWeight: 700 }}>Master Agent</span>
                <span style={{ color: C.muted, fontWeight: 600 }}>Status:</span><span style={{ color: '#00E676' }}>{agentInfo ? agentInfo.status : '—'}</span>
                <span style={{ color: C.muted, fontWeight: 600 }}>Direct Rate:</span><span style={{ color: '#00E676', fontWeight: 700 }}>20% of MRR</span>
                <span style={{ color: C.muted, fontWeight: 600 }}>Override Rate:</span><span style={{ color: C.primary, fontWeight: 700 }}>5% on sub-agent MRR</span>
                <span style={{ color: C.muted, fontWeight: 600 }}>Payment:</span><span style={{ color: '#fff' }}>24th of each month</span>
              </div>
            </div>
            <div style={Object.assign({}, card, { maxWidth: 560 })}>
              <h3 style={{ color: '#fff', margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>🎨 Brand Settings</h3>
              <div style={{ display: 'grid', gap: 16 }}>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Brand Name</div>
                  <input value={agentBrand.name || (agentInfo ? agentInfo.name : '')} onChange={function(e) { setAgentBrand(function(b) { return Object.assign({}, b, { name: e.target.value }); }); }} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' }} />
                </div>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Primary Color</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="color" value={agentBrand.primary || '#FFD600'} onChange={function(e) { setAgentBrand(function(b) { return Object.assign({}, b, { primary: e.target.value }); }); }} style={{ width: 44, height: 44, borderRadius: 8, border: '2px solid rgba(255,255,255,0.2)', cursor: 'pointer', padding: 2, background: 'transparent' }} />
                    <input value={agentBrand.primary || '#FFD600'} onChange={function(e) { setAgentBrand(function(b) { return Object.assign({}, b, { primary: e.target.value }); }); }} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box', outline: 'none' }} />
                  </div>
                </div>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Secondary Color</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="color" value={agentBrand.accent || '#FF6B35'} onChange={function(e) { setAgentBrand(function(b) { return Object.assign({}, b, { accent: e.target.value }); }); }} style={{ width: 44, height: 44, borderRadius: 8, border: '2px solid rgba(255,255,255,0.2)', cursor: 'pointer', padding: 2, background: 'transparent' }} />
                    <input value={agentBrand.accent || '#FF6B35'} onChange={function(e) { setAgentBrand(function(b) { return Object.assign({}, b, { accent: e.target.value }); }); }} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box', outline: 'none' }} />
                  </div>
                </div>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Logo URL (optional)</div>
                  <input value={agentBrand.logoUrl || ''} onChange={function(e) { setAgentBrand(function(b) { return Object.assign({}, b, { logoUrl: e.target.value }); }); }} placeholder="https://yourdomain.com/logo.png" style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' }} />
                </div>
                <button onClick={async function() {
                  var res = await supabase.from('tenants').update({
                    brand_name: agentBrand.name || (agentInfo ? agentInfo.name : ''),
                    brand_primary: agentBrand.primary || '#FFD600',
                    brand_secondary: agentBrand.accent || '#FF6B35',
                    brand_logo_url: agentBrand.logoUrl || null,
                  }).eq('id', agentTenantId);
                  if (res.error) { alert('Save failed: ' + res.error.message); }
                  else { alert('Branding saved!'); }
                }} style={{ background: 'linear-gradient(135deg, #FFD600, #FF6B35)', border: 'none', borderRadius: 10, padding: '14px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: "'DM Sans', sans-serif", width: '100%' }}>💾 Save Branding</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
