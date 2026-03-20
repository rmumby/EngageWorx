import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

var C = { bg: '#050810', surface: '#0d1220', border: '#1a2540', primary: '#FFD600', accent: '#FF6B35', text: '#E8F4FD', muted: '#6B8BAE' };

export default function AgentPortal({ agentTenantId, onLogout, onBack, profile }) {
  var [page, setPage] = useState('dashboard');
  var [agentInfo, setAgentInfo] = useState(null);
  var [referrals, setReferrals] = useState([]);
  var [loading, setLoading] = useState(true);
  var [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(function() { loadAgentData(); }, [agentTenantId]);

  async function loadAgentData() {
    setLoading(true);
    try {
      var a = await supabase.from('tenants').select('*').eq('id', agentTenantId).maybeSingle();
      if (a.data) setAgentInfo(a.data);
      var r = await supabase.from('tenants').select('*').eq('parent_tenant_id', agentTenantId).order('created_at', { ascending: false });
      if (r.data) setReferrals(r.data);
    } catch (e) { console.error('Agent load error:', e); }
    setLoading(false);
  }

  var navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
    { id: 'referrals', label: 'Referrals', icon: '🤝' },
    { id: 'commissions', label: 'Commissions', icon: '💰' },
    { id: 'resources', label: 'Resources', icon: '📚' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 22 };
  var btnPrimary = { background: 'linear-gradient(135deg, #FFD600, #FF6B35)', border: 'none', borderRadius: 10, padding: '10px 20px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  var activeReferrals = referrals.filter(function(r) { return r.status === 'active' || r.status === 'trial'; }).length;
  var commissionRate = 50;
  var monthlyCommission = activeReferrals * commissionRate;
  var totalEarned = referrals.length * commissionRate * 3;

  function copyLink() { navigator.clipboard.writeText('https://engwx.com/ref/' + (agentInfo ? agentInfo.slug : '')); }
  function doLogout() { supabase.auth.signOut().then(function() { if (onLogout) onLogout(); window.location.href = '/'; }).catch(function() { window.location.href = '/'; }); }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: "'DM Sans', sans-serif", color: C.text }}>
      <div style={{ width: sidebarCollapsed ? 64 : 240, background: C.surface, borderRight: '1px solid ' + C.border, display: 'flex', flexDirection: 'column', padding: sidebarCollapsed ? '24px 8px' : '24px 16px', flexShrink: 0, position: 'fixed', height: '100vh', zIndex: 100, transition: 'all 0.25s ease', overflow: 'hidden' }}>
        {onBack && <div onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', color: C.primary, fontSize: 12, fontWeight: 600, marginBottom: 12, background: C.primary + '10', border: '1px solid ' + C.primary + '22', justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}><span>←</span>{!sidebarCollapsed && <span>Back to Platform</span>}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #FFD600, #FF6B35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, color: '#000', flexShrink: 0 }}>EW</div>
          {!sidebarCollapsed && <div><div style={{ fontWeight: 800, fontSize: 15, color: '#fff', letterSpacing: -0.5 }}>{agentInfo ? agentInfo.name : 'Agent Portal'}</div><div style={{ fontSize: 10, color: C.primary, fontWeight: 600, letterSpacing: 0.5 }}>AGENT PARTNER</div></div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {navItems.map(function(item) { var active = page === item.id; return <div key={item.id} onClick={function() { setPage(item.id); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: sidebarCollapsed ? '10px 8px' : '10px 14px', borderRadius: 10, cursor: 'pointer', background: active ? C.primary + '15' : 'transparent', color: active ? C.primary : C.muted, fontWeight: active ? 700 : 500, fontSize: 13, transition: 'all 0.2s', justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}><span style={{ fontSize: 18 }}>{item.icon}</span>{!sidebarCollapsed && <span>{item.label}</span>}</div>; })}
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div onClick={function() { setSidebarCollapsed(!sidebarCollapsed); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', color: C.muted, fontSize: 13, justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}><span>{sidebarCollapsed ? '»' : '«'}</span>{!sidebarCollapsed && <span>Collapse</span>}</div>
          <div onClick={doLogout} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, cursor: 'pointer', color: '#FF5252', fontSize: 13, justifyContent: sidebarCollapsed ? 'center' : 'flex-start', background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.15)' }}><span>⏻</span>{!sidebarCollapsed && <span style={{ fontWeight: 600 }}>Sign Out</span>}</div>
        </div>
      </div>
      <div style={{ marginLeft: sidebarCollapsed ? 64 : 240, flex: 1, padding: '32px 40px', transition: 'margin-left 0.25s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginBottom: 8 }}>{onBack && <span onClick={onBack} style={{ color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>← Back to Platform</span>}<span onClick={doLogout} style={{ color: '#FF5252', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>⏻ Sign Out</span></div>

        {page === 'dashboard' && <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>Welcome back{agentInfo ? ', ' + agentInfo.name : ''}</h1>
          <p style={{ color: C.muted, marginTop: 0, marginBottom: 28, fontSize: 14 }}>Your agent dashboard — track referrals and commissions</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
            {[{ label: 'Active Referrals', value: activeReferrals, icon: '🤝', color: '#00E676' }, { label: 'Total Referrals', value: referrals.length, icon: '📊', color: C.primary }, { label: 'Monthly Commission', value: '$' + monthlyCommission.toLocaleString(), icon: '💰', color: '#00E676' }, { label: 'Total Earned', value: '$' + totalEarned.toLocaleString(), icon: '🏆', color: C.accent }].map(function(s, i) { return <div key={i} style={Object.assign({}, card, { textAlign: 'center' })}><div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div><div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div><div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{s.label}</div></div>; })}
          </div>
          <div style={Object.assign({}, card, { marginBottom: 28, background: 'linear-gradient(135deg, rgba(255,214,0,0.05), rgba(255,107,53,0.05))' })}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><div style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Your Referral Link</div><div style={{ color: C.primary, fontSize: 14, fontFamily: 'monospace' }}>https://engwx.com/ref/{agentInfo ? agentInfo.slug : 'your-code'}</div></div>
              <button onClick={copyLink} style={btnPrimary}>Copy Link</button>
            </div>
          </div>
          <div style={card}>
            <h2 style={{ color: '#fff', margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>Recent Referrals</h2>
            {referrals.length === 0 ? <div style={{ textAlign: 'center', padding: 40 }}><div style={{ fontSize: 40, marginBottom: 12 }}>🤝</div><div style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No referrals yet</div><div style={{ color: C.muted, fontSize: 13 }}>Share your referral link to start earning commissions.</div></div> : <div style={{ display: 'grid', gap: 8 }}>{referrals.slice(0, 5).map(function(ref) { return <div key={ref.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 120px', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}><div><div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{ref.name}</div><div style={{ color: C.muted, fontSize: 11 }}>Referred {new Date(ref.created_at).toLocaleDateString()}</div></div><div style={{ textAlign: 'center' }}><div style={{ color: C.primary, fontWeight: 700, fontSize: 13, textTransform: 'capitalize' }}>{ref.plan}</div></div><div style={{ textAlign: 'center' }}><div style={{ color: ref.status === 'active' ? '#00E676' : '#FFD600', fontWeight: 700, fontSize: 13, textTransform: 'capitalize' }}>{ref.status}</div></div><div style={{ textAlign: 'right' }}><div style={{ color: '#00E676', fontWeight: 700, fontSize: 14 }}>${commissionRate}/mo</div></div></div>; })}</div>}
          </div>
        </div>}

        {page === 'referrals' && <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>Referrals</h1>
          <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>{referrals.length} total · {activeReferrals} active</p>
          {referrals.length === 0 ? <div style={Object.assign({}, card, { textAlign: 'center', padding: 60 })}><div style={{ fontSize: 48, marginBottom: 16 }}>🤝</div><div style={{ color: '#fff', fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Start Referring</div><div style={{ color: C.muted, fontSize: 14, marginBottom: 24 }}>Share your referral link with businesses who need AI-powered communications.</div><button onClick={copyLink} style={btnPrimary}>Copy Your Referral Link</button></div> : <div style={{ display: 'grid', gap: 12 }}>{referrals.map(function(ref) { return <div key={ref.id} style={Object.assign({}, card, { display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px 120px', alignItems: 'center', gap: 16, borderLeft: '4px solid ' + (ref.status === 'active' ? '#00E676' : '#FFD600') })}><div><div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{ref.name}</div><div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Referred {new Date(ref.created_at).toLocaleDateString()}</div></div><div style={{ textAlign: 'center' }}><div style={{ fontSize: 11, color: C.muted }}>Plan</div><div style={{ color: C.primary, fontWeight: 700, fontSize: 13, textTransform: 'capitalize' }}>{ref.plan}</div></div><div style={{ textAlign: 'center' }}><div style={{ fontSize: 11, color: C.muted }}>Status</div><div style={{ color: ref.status === 'active' ? '#00E676' : '#FFD600', fontWeight: 700, fontSize: 13, textTransform: 'capitalize' }}>{ref.status}</div></div><div style={{ textAlign: 'center' }}><div style={{ fontSize: 11, color: C.muted }}>Months</div><div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>3</div></div><div style={{ textAlign: 'right' }}><div style={{ color: '#00E676', fontWeight: 700, fontSize: 16 }}>${commissionRate}/mo</div></div></div>; })}</div>}
        </div>}

        {page === 'commissions' && <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>Commissions</h1>
          <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>Track your earnings from referrals</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
            <div style={Object.assign({}, card, { textAlign: 'center' })}><div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>This Month</div><div style={{ color: '#00E676', fontSize: 32, fontWeight: 800 }}>${monthlyCommission.toLocaleString()}</div><div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{activeReferrals} active × ${commissionRate}/mo</div></div>
            <div style={Object.assign({}, card, { textAlign: 'center' })}><div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Total Earned</div><div style={{ color: C.primary, fontSize: 32, fontWeight: 800 }}>${totalEarned.toLocaleString()}</div><div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Lifetime earnings</div></div>
            <div style={Object.assign({}, card, { textAlign: 'center' })}><div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Commission Rate</div><div style={{ color: C.accent, fontSize: 32, fontWeight: 800 }}>${commissionRate}</div><div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Per active referral / month</div></div>
          </div>
          <div style={card}><h2 style={{ color: '#fff', margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}>How Commissions Work</h2><div style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}><p style={{ margin: '0 0 12px' }}>You earn <span style={{ color: C.primary, fontWeight: 700 }}>${commissionRate}/month</span> for every active referral on a paid plan. Commissions are calculated monthly and paid on the 15th.</p><p style={{ margin: '0 0 12px' }}>A referral is <span style={{ color: '#00E676', fontWeight: 700 }}>active</span> when the business has a paid subscription. Trials don't count until they convert.</p><p style={{ margin: 0 }}>No cap on referrals. The more businesses you bring in, the more you earn — every month, for as long as they're active.</p></div></div>
        </div>}

        {page === 'resources' && <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>Resources</h1>
          <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>Everything you need to refer businesses</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {[{ title: 'Platform Demo', desc: 'Interactive AI-guided demo', icon: '🎯', link: 'https://engwx.com/demo' }, { title: 'Pricing', desc: 'Current plans and pricing', icon: '💲', link: 'https://engwx.com/pricing' }, { title: 'API Docs', desc: 'Technical reference', icon: '🔌', link: 'https://engwx.com/api-docs' }, { title: 'Blog', desc: 'Use cases and articles', icon: '📝', link: 'https://engwx.com/blog' }].map(function(r, i) { return <div key={i} style={Object.assign({}, card, { cursor: 'pointer' })} onClick={function() { window.open(r.link, '_blank'); }}><div style={{ fontSize: 32, marginBottom: 12 }}>{r.icon}</div><div style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{r.title}</div><div style={{ color: C.muted, fontSize: 13 }}>{r.desc}</div><div style={{ color: C.primary, fontSize: 12, fontWeight: 600, marginTop: 8 }}>Open →</div></div>; })}
          </div>
          <div style={Object.assign({}, card, { marginTop: 24 })}><h2 style={{ color: '#fff', margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}>Your Referral Link</h2><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 16px', color: C.primary, fontFamily: 'monospace', fontSize: 14 }}>https://engwx.com/ref/{agentInfo ? agentInfo.slug : 'your-code'}</div><button onClick={copyLink} style={btnPrimary}>Copy</button></div></div>
        </div>}

        {page === 'settings' && <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>Settings</h1>
          <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>Manage your agent account</p>
          <div style={card}><div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, fontSize: 14 }}><span style={{ color: C.muted, fontWeight: 600 }}>Company:</span><span style={{ color: '#fff' }}>{agentInfo ? agentInfo.name : '—'}</span><span style={{ color: C.muted, fontWeight: 600 }}>Type:</span><span style={{ color: C.primary }}>Agent / Referral Partner</span><span style={{ color: C.muted, fontWeight: 600 }}>Status:</span><span style={{ color: '#00E676' }}>{agentInfo ? agentInfo.status : '—'}</span><span style={{ color: C.muted, fontWeight: 600 }}>Slug:</span><span style={{ color: '#fff', fontFamily: 'monospace' }}>{agentInfo ? agentInfo.slug : '—'}</span><span style={{ color: C.muted, fontWeight: 600 }}>Commission:</span><span style={{ color: '#fff' }}>${commissionRate}/mo per active referral</span></div></div>
          <div style={Object.assign({}, card, { marginTop: 16 })}><h3 style={{ color: '#fff', margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>Payment Information</h3><p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Commission payments are processed on the 15th of each month. Contact hello@engwx.com to update your payment method.</p></div>
        </div>}
      </div>
    </div>
  );
}
