import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';

// TODO: Replace hardcoded PLAN_LIMITS with per-tenant limits from tenants.message_limit.
// cron-usage-alerts.js was fixed in commit cc83d46 to read from tenants.message_limit;
// this display-only map should follow the same pattern for consistency.
// Custom plans (silver, csp_pilot, csp_platform, Master 20) fall back to Starter here.
// See docs/known-issues.md for tracking.
var PLAN_LIMITS = {
  Starter:    { sms: 1000,  whatsapp: 1000,  email: 5000,   ai: 500,   voice: 200 },
  Growth:     { sms: 5000,  whatsapp: 5000,  email: 25000,  ai: 2500,  voice: 1000 },
  Pro:        { sms: 20000, whatsapp: 20000, email: 100000, ai: 10000, voice: 4000 },
  Enterprise: { sms: 999999, whatsapp: 999999, email: 999999, ai: 999999, voice: 999999 },
};

var PLAN_MRR = { Starter: 99, Growth: 249, Pro: 499, Enterprise: 0 };

function pct(used, cap) {
  if (!cap) return 0;
  return Math.min(100, Math.round((Number(used || 0) / Number(cap)) * 100));
}

function healthOf(t) {
  var plan = t.plan || 'Starter';
  var lim = PLAN_LIMITS[plan] || PLAN_LIMITS.Starter;
  var ps = [pct(t.sms_used, lim.sms), pct(t.whatsapp_used, lim.whatsapp), pct(t.email_used, lim.email), pct(t.ai_interactions_used, lim.ai), pct(t.voice_minutes_used, lim.voice)];
  var max = Math.max.apply(null, ps);
  if (max >= 90 || t.soft_capped) return 'red';
  if (max >= 75) return 'amber';
  return 'green';
}

export default function CustomerSuccessDashboard({ C, onDrillDown }) {
  var colors = C || { primary: '#00C9FF', accent: '#E040FB', muted: '#6B8BAE', text: '#fff' };
  var [tenants, setTenants] = useState([]);
  var [aiCost, setAiCost] = useState({});
  var [loading, setLoading] = useState(true);
  var [filterHealth, setFilterHealth] = useState('all');
  var [filterPlan, setFilterPlan] = useState('all');
  var [filterTier, setFilterTier] = useState('all');

  useEffect(function() {
    (async function() {
      setLoading(true);
      try {
        var { data } = await supabase.from('tenants').select('id, name, plan, entity_tier, tenant_type, sms_used, whatsapp_used, email_used, ai_interactions_used, voice_minutes_used, contacts_count, soft_capped, updated_at, created_at, current_period_start');
        setTenants(data || []);

        // AI cost this month per tenant
        var periodStart = new Date();
        periodStart.setUTCDate(1); periodStart.setUTCHours(0, 0, 0, 0);
        var { data: ai } = await supabase.from('ai_usage_log').select('tenant_id, cost_usd').gte('created_at', periodStart.toISOString());
        var costMap = {};
        (ai || []).forEach(function(r) {
          if (!r.tenant_id) return;
          costMap[r.tenant_id] = (costMap[r.tenant_id] || 0) + Number(r.cost_usd || 0);
        });
        setAiCost(costMap);
      } catch (e) { console.warn('[CSDash] load error:', e.message); }
      setLoading(false);
    })();
  }, []);

  var rows = useMemo(function() {
    return tenants.map(function(t) {
      var plan = t.plan || 'Starter';
      var lim = PLAN_LIMITS[plan] || PLAN_LIMITS.Starter;
      return {
        t: t,
        plan: plan,
        mrr: PLAN_MRR[plan] || 0,
        sms: pct(t.sms_used, lim.sms),
        whatsapp: pct(t.whatsapp_used, lim.whatsapp),
        email: pct(t.email_used, lim.email),
        ai: pct(t.ai_interactions_used, lim.ai),
        aiCost: aiCost[t.id] || 0,
        health: healthOf(t),
      };
    });
  }, [tenants, aiCost]);

  var filtered = rows.filter(function(r) {
    if (filterHealth !== 'all' && r.health !== filterHealth) return false;
    if (filterPlan !== 'all' && r.plan !== filterPlan) return false;
    if (filterTier !== 'all') {
      var tier = r.t.entity_tier || r.t.tenant_type || 'direct';
      if (tier !== filterTier) return false;
    }
    return true;
  });

  var totalMrr = rows.reduce(function(s, r) { return s + r.mrr; }, 0);
  var totalAiCost = rows.reduce(function(s, r) { return s + r.aiCost; }, 0);
  var atRisk = rows.filter(function(r) { return r.health !== 'green'; }).length;

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 };
  var healthDot = { green: '🟢', amber: '🟡', red: '🔴' };
  var healthBg = { green: 'rgba(16,185,129,0.12)', amber: 'rgba(217,119,6,0.12)', red: 'rgba(220,38,38,0.15)' };

  function barCell(percent) {
    var col = percent >= 90 ? '#dc2626' : percent >= 75 ? '#d97706' : '#10b981';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 90 }}>
        <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: percent + '%', height: '100%', background: col }} />
        </div>
        <span style={{ color: col, fontSize: 11, fontWeight: 700, minWidth: 32, textAlign: 'right' }}>{percent}%</span>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>📊 Customer Success</h1>
          <p style={{ color: colors.muted, marginTop: 4, fontSize: 14 }}>Per-tenant usage, plan health, and revenue overview.</p>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        <div style={card}><div style={{ color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>Total MRR</div><div style={{ color: '#10b981', fontSize: 26, fontWeight: 800, marginTop: 6 }}>${totalMrr.toLocaleString()}</div></div>
        <div style={card}><div style={{ color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>AI Cost (MTD)</div><div style={{ color: '#a5b4fc', fontSize: 26, fontWeight: 800, marginTop: 6 }}>${totalAiCost.toFixed(2)}</div></div>
        <div style={card}><div style={{ color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>Tenants at Risk</div><div style={{ color: atRisk > 0 ? '#d97706' : '#10b981', fontSize: 26, fontWeight: 800, marginTop: 6 }}>{atRisk}</div></div>
        <div style={card}><div style={{ color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>Total Tenants</div><div style={{ color: '#fff', fontSize: 26, fontWeight: 800, marginTop: 6 }}>{rows.length}</div></div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <select value={filterHealth} onChange={function(e) { setFilterHealth(e.target.value); }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
          <option value="all">All health</option>
          <option value="green">🟢 Healthy</option>
          <option value="amber">🟡 Warning</option>
          <option value="red">🔴 At risk</option>
        </select>
        <select value={filterPlan} onChange={function(e) { setFilterPlan(e.target.value); }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
          <option value="all">All plans</option>
          <option value="Starter">Starter</option>
          <option value="Growth">Growth</option>
          <option value="Pro">Pro</option>
          <option value="Enterprise">Enterprise</option>
        </select>
        <select value={filterTier} onChange={function(e) { setFilterTier(e.target.value); }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
          <option value="all">All tiers</option>
          <option value="master_agent">Master Agent</option>
          <option value="agent">Agent</option>
          <option value="csp">CSP</option>
          <option value="direct">Direct</option>
        </select>
        <div style={{ marginLeft: 'auto', color: colors.muted, fontSize: 12 }}>{filtered.length} of {rows.length}</div>
      </div>

      {/* Table */}
      <div style={Object.assign({}, card, { padding: 0, overflow: 'hidden' })}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: colors.muted }}>Loading tenants…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: colors.muted }}>No tenants match these filters.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                {['Tenant', 'Plan', 'MRR', 'SMS', 'WhatsApp', 'Email', 'AI', 'AI Cost', 'Health', 'Last Active'].map(function(h) {
                  return <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: colors.muted, fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.6, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map(function(r) {
                return (
                  <tr key={r.t.id} onClick={function() { if (onDrillDown) onDrillDown(r.t.id); }} style={{ cursor: 'pointer', background: healthBg[r.health] || 'transparent' }}>
                    <td style={{ padding: '10px 12px', color: '#fff', fontWeight: 600 }}>{r.t.name || '(unnamed)'}<div style={{ color: colors.muted, fontSize: 10, fontWeight: 400 }}>{r.t.entity_tier || r.t.tenant_type || 'direct'}</div></td>
                    <td style={{ padding: '10px 12px', color: '#fff' }}>{r.plan}</td>
                    <td style={{ padding: '10px 12px', color: '#10b981', fontWeight: 700 }}>${r.mrr}</td>
                    <td style={{ padding: '10px 12px' }}>{barCell(r.sms)}</td>
                    <td style={{ padding: '10px 12px' }}>{barCell(r.whatsapp)}</td>
                    <td style={{ padding: '10px 12px' }}>{barCell(r.email)}</td>
                    <td style={{ padding: '10px 12px' }}>{barCell(r.ai)}</td>
                    <td style={{ padding: '10px 12px', color: '#a5b4fc', fontWeight: 700 }}>${r.aiCost.toFixed(2)}</td>
                    <td style={{ padding: '10px 12px' }}>{healthDot[r.health]}</td>
                    <td style={{ padding: '10px 12px', color: colors.muted, fontSize: 11 }}>{r.t.updated_at ? new Date(r.t.updated_at).toLocaleDateString() : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
