// ─── TENANT DATA ──────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import SignupPage from './SignupPage';
import AdminTenants from './AdminTenants';
import WhiteLabelBranding from './WhiteLabelBranding';
import LandingPage from './components/LandingPage';
import AnalyticsDashboard from './AnalyticsDashboard';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);
const TENANTS = {
  serviceProvider: {
    id: "sp_root",
    name: "EngageWorx",
    logo: "EW",
    role: "superadmin",
    colors: { primary: "#00C9FF", accent: "#E040FB", bg: "#0A0E1A", surface: "#111827", border: "#1e2d45", text: "#E8F4FD", muted: "#6B8BAE" },
    customers: ["acme", "retailco", "finserv"],
    stats: { totalMessages: 1284712, totalRevenue: 892450, activeCustomers: 3, totalCampaigns: 87 },
  },
  acme: {
    id: "acme",
    name: "Acme Corp",
    logo: "AC",
    role: "customer",
    brand: { primary: "#FF6B35", secondary: "#FF8C42", name: "AcmeEngage" },
    colors: { primary: "#FF6B35", accent: "#FF8C42", bg: "#0F0A06", surface: "#1A1208", border: "#2D1F0E", text: "#FFF0E8", muted: "#8B6B55" },
    stats: { messages: 284712, revenue: 128450, campaigns: 24, contacts: 48200, deliveryRate: 95.3, openRate: 51.2 },
    channels: ["SMS", "Email", "WhatsApp"],
  },
  retailco: {
    id: "retailco",
    name: "RetailCo",
    logo: "RC",
    role: "customer",
    brand: { primary: "#00E676", secondary: "#00BFA5", name: "RetailReach" },
    colors: { primary: "#00E676", accent: "#00BFA5", bg: "#050F09", surface: "#0A1A0F", border: "#0E2A18", text: "#E8FFF2", muted: "#4B8B65" },
    stats: { messages: 612340, revenue: 441200, campaigns: 38, contacts: 124000, deliveryRate: 97.1, openRate: 44.8 },
    channels: ["SMS", "MMS", "Email", "RCS"],
  },
  finserv: {
    id: "finserv",
    name: "FinServ Group",
    logo: "FS",
    role: "customer",
    brand: { primary: "#7C4DFF", secondary: "#651FFF", name: "FinConnect" },
    colors: { primary: "#7C4DFF", accent: "#651FFF", bg: "#07050F", surface: "#100C1A", border: "#1A1430", text: "#EDE8FF", muted: "#6B5B8B" },
    stats: { messages: 387660, revenue: 322800, campaigns: 25, contacts: 89300, deliveryRate: 98.2, openRate: 62.1 },
    channels: ["SMS", "Email", "Voice"],
  },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function Badge({ children, color, size = "sm" }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: size === "sm" ? "2px 8px" : "4px 12px",
      fontSize: size === "sm" ? 11 : 13, fontWeight: 700, letterSpacing: 0.5,
    }}>{children}</span>
  );
}

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid rgba(255,255,255,0.08)`, borderTop: `3px solid ${color}`, borderRadius: 12, padding: "20px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: "10px 0 4px" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color }}>{sub}</div>}
    </div>
  );
}

// ─── SUPER ADMIN VIEW (Service Provider) ─────────────────────────────────────
function SuperAdminDashboard({ tenant, onDrillDown, C }) {
  const sp = TENANTS.serviceProvider;
  const customers = sp.customers.map(id => TENANTS[id]);

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <Badge color={C.primary} size="md">🌐 Service Provider View</Badge>
            <Badge color="#00E676" size="md">● All Systems Operational</Badge>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>Platform Overview</h1>
          <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>Holistic view across all customer tenants</p>
        </div>
        <button style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, border: "none", borderRadius: 10, padding: "12px 24px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
          + Onboard New Customer
        </button>
      </div>

      {/* Platform KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginBottom: 32 }}>
        <StatCard label="Total Messages Sent" value="1.28M" sub="Across all tenants" color={C.primary} icon="📨" />
        <StatCard label="Platform Revenue" value="$892,450" sub="+18.4% this month" color="#00E676" icon="💰" />
        <StatCard label="Active Customers" value="3" sub="All tenants healthy" color={C.accent} icon="🏢" />
        <StatCard label="Total Campaigns" value="87" sub="32 currently live" color="#FF6B35" icon="🚀" />
      </div>

      {/* Customer Tenant Cards */}
      <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Customer Tenants</h2>
      <div style={{ display: "grid", gap: 16, marginBottom: 32 }}>
        {customers.map(c => (
          <div key={c.id} style={{
            background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.08)`,
            borderLeft: `4px solid ${c.brand.primary}`, borderRadius: 12, padding: "22px 28px",
            display: "grid", gridTemplateColumns: "220px 1fr 1fr 1fr 1fr 1fr 140px",
            alignItems: "center", gap: 20,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, background: `linear-gradient(135deg, ${c.brand.primary}, ${c.brand.secondary})`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#000" }}>{c.logo}</div>
              <div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                <div style={{ color: c.brand.primary, fontSize: 12 }}>{c.brand.name}</div>
              </div>
            </div>
            {[
              { label: "Messages", val: c.stats.messages.toLocaleString() },
              { label: "Revenue", val: `$${c.stats.revenue.toLocaleString()}` },
              { label: "Campaigns", val: c.stats.campaigns },
              { label: "Contacts", val: c.stats.contacts.toLocaleString() },
              { label: "Delivery", val: `${c.stats.deliveryRate}%` },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{s.val}</div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{s.label}</div>
              </div>
            ))}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Badge color="#00E676">● Active</Badge>
              <button onClick={() => onDrillDown(c.id)} style={{
                background: `${c.brand.primary}22`, border: `1px solid ${c.brand.primary}66`,
                borderRadius: 7, padding: "7px 14px", color: c.brand.primary,
                fontWeight: 700, cursor: "pointer", fontSize: 12,
              }}>Drill Down →</button>
            </div>
          </div>
        ))}
      </div>

      {/* Channel Usage Across Platform */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 14, padding: 24 }}>
          <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 16 }}>Channel Usage — Platform Wide</h3>
          {[
            { ch: "SMS", pct: 42, color: C.primary },
            { ch: "Email", pct: 24, color: "#FF6B35" },
            { ch: "WhatsApp", pct: 18, color: "#25D366" },
            { ch: "Voice", pct: 8, color: C.accent },
            { ch: "RCS", pct: 5, color: "#00E676" },
            { ch: "MMS", pct: 3, color: "#7C4DFF" },
          ].map(r => (
            <div key={r.ch} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{r.ch}</span>
                <span style={{ color: r.color, fontSize: 12, fontWeight: 700 }}>{r.pct}%</span>
              </div>
              <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${r.pct}%`, background: r.color, borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 14, padding: 24 }}>
          <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 16 }}>Tenant Comparison</h3>
          {customers.map(c => {
            const maxRev = 500000;
            const pct = Math.round((c.stats.revenue / maxRev) * 100);
            return (
              <div key={c.id} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                  <span style={{ color: c.brand.primary, fontSize: 13, fontWeight: 700 }}>${c.stats.revenue.toLocaleString()}</span>
                </div>
                <div style={{ height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${c.brand.primary}, ${c.brand.secondary})`, borderRadius: 4 }} />
                </div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 3 }}>{c.stats.messages.toLocaleString()} messages · {c.stats.campaigns} campaigns</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── GLOBAL ANALYTICS ─────────────────────────────────────────────────────────
function GlobalAnalytics({ C }) {
  const [timeRange, setTimeRange] = useState("30d");
  const [activeMetric, setActiveMetric] = useState("messages");
  const customers = Object.values(TENANTS).filter(t => t.role === "customer");
  const sp = TENANTS.serviceProvider;

  // Generate mock time series data
  const generateTimeSeries = (days, base, variance) => {
    const data = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayOfWeek = d.getDay();
      const weekendDip = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.6 : 1;
      const trend = 1 + (days - i) * 0.008;
      const val = Math.round(base * weekendDip * trend * (0.85 + Math.random() * variance));
      data.push({ date: d, label: `${d.getMonth()+1}/${d.getDate()}`, value: val });
    }
    return data;
  };

  const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
  const msgData = generateTimeSeries(days, 4200, 0.3);
  const revData = generateTimeSeries(days, 980, 0.25);

  // Chart renderer (pure CSS bar chart)
  const BarChart = ({ data, color, height = 200, label, format }) => {
    const max = Math.max(...data.map(d => d.value));
    const showEvery = data.length > 30 ? 7 : data.length > 14 ? 3 : 1;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height, padding: "0 0 24px" }}>
          {data.map((d, i) => {
            const pct = (d.value / max) * 100;
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end", position: "relative" }}>
                <div
                  title={`${d.label}: ${format ? format(d.value) : d.value.toLocaleString()}`}
                  style={{
                    width: "100%", minWidth: 3, maxWidth: 24,
                    height: `${pct}%`, background: `linear-gradient(180deg, ${color}, ${color}88)`,
                    borderRadius: "3px 3px 0 0", transition: "height 0.3s",
                    cursor: "pointer", position: "relative",
                  }}
                  onMouseEnter={(e) => { e.target.style.opacity = 0.8; e.target.style.boxShadow = `0 0 12px ${color}44`; }}
                  onMouseLeave={(e) => { e.target.style.opacity = 1; e.target.style.boxShadow = "none"; }}
                />
                {(i % showEvery === 0) && (
                  <span style={{ position: "absolute", bottom: -20, fontSize: 9, color: "rgba(255,255,255,0.25)", whiteSpace: "nowrap" }}>{d.label}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Mini sparkline
  const Sparkline = ({ data, color, width = 80, height = 28 }) => {
    const max = Math.max(...data.map(d => d.value));
    const min = Math.min(...data.map(d => d.value));
    const range = max - min || 1;
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((d.value - min) / range) * (height - 4);
      return `${x},${y}`;
    }).join(" ");
    return (
      <svg width={width} height={height} style={{ overflow: "visible" }}>
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  // Donut chart
  const DonutChart = ({ segments, size = 160 }) => {
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    let cumulative = 0;
    const radius = 60;
    const circumference = 2 * Math.PI * radius;

    return (
      <svg width={size} height={size} viewBox="0 0 160 160">
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const offset = cumulative * circumference;
          cumulative += pct;
          return (
            <circle key={i} cx="80" cy="80" r={radius} fill="none"
              stroke={seg.color} strokeWidth="20"
              strokeDasharray={`${pct * circumference} ${circumference}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
              style={{ transition: "all 0.5s" }}
            />
          );
        })}
        <text x="80" y="75" textAnchor="middle" fill="#fff" fontSize="24" fontWeight="900">{total.toLocaleString()}</text>
        <text x="80" y="95" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="11">Total</text>
      </svg>
    );
  };

  const channelData = [
    { name: "SMS", value: 542000, color: C.primary, pct: 42 },
    { name: "Email", value: 308000, color: "#FF6B35", pct: 24 },
    { name: "WhatsApp", value: 231000, color: "#25D366", pct: 18 },
    { name: "Voice", value: 103000, color: C.accent, pct: 8 },
    { name: "RCS", value: 64000, color: "#00E676", pct: 5 },
    { name: "MMS", value: 36712, color: "#7C4DFF", pct: 3 },
  ];

  const hourlyData = Array.from({ length: 24 }, (_, h) => {
    const peak = Math.exp(-0.5 * Math.pow((h - 14) / 4, 2));
    return { hour: h, value: Math.round(1800 * peak * (0.8 + Math.random() * 0.4)), label: `${h}:00` };
  });

  const weeklyTrend = generateTimeSeries(12, 32000, 0.2);

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>Global Analytics</h1>
          <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>Platform-wide performance metrics across all tenants</p>
        </div>
        <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", padding: 4, borderRadius: 10 }}>
          {[{ id: "7d", label: "7D" }, { id: "30d", label: "30D" }, { id: "90d", label: "90D" }].map(t => (
            <button key={t.id} onClick={() => setTimeRange(t.id)} style={{
              background: timeRange === t.id ? C.primary : "transparent",
              border: "none", borderRadius: 7, padding: "8px 16px",
              color: timeRange === t.id ? "#000" : C.muted,
              fontWeight: timeRange === t.id ? 700 : 400,
              cursor: "pointer", fontSize: 13, transition: "all 0.2s",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 28 }}>
        {[
          { label: "Total Messages", value: "1.28M", change: "+12.4%", positive: true, color: C.primary, icon: "📨", sparkData: msgData.slice(-14) },
          { label: "Platform Revenue", value: "$892,450", change: "+18.4%", positive: true, color: "#00E676", icon: "💰", sparkData: revData.slice(-14) },
          { label: "Avg Delivery Rate", value: "96.9%", change: "+0.8%", positive: true, color: "#00C9FF", icon: "✅" },
          { label: "Avg Open Rate", value: "52.7%", change: "+3.2%", positive: true, color: C.accent, icon: "👁️" },
          { label: "Active Campaigns", value: "87", change: "+6", positive: true, color: "#FF6B35", icon: "🚀" },
        ].map((kpi, i) => (
          <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderTop: `3px solid ${kpi.color}`, borderRadius: 12, padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>{kpi.label}</div>
              <span style={{ fontSize: 18 }}>{kpi.icon}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{kpi.value}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: kpi.positive ? "#00E676" : "#FF3B30", fontWeight: 600 }}>
                {kpi.positive ? "↑" : "↓"} {kpi.change}
              </span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>vs prev period</span>
              {kpi.sparkData && <div style={{ marginLeft: "auto" }}><Sparkline data={kpi.sparkData} color={kpi.color} /></div>}
            </div>
          </div>
        ))}
      </div>

      {/* Main Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Message Volume Chart */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ color: "#fff", margin: 0, fontSize: 16 }}>Message Volume</h3>
            <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", padding: 3, borderRadius: 8 }}>
              {[{ id: "messages", label: "Messages" }, { id: "revenue", label: "Revenue" }].map(m => (
                <button key={m.id} onClick={() => setActiveMetric(m.id)} style={{
                  background: activeMetric === m.id ? "rgba(255,255,255,0.1)" : "transparent",
                  border: "none", borderRadius: 6, padding: "5px 12px",
                  color: activeMetric === m.id ? "#fff" : C.muted,
                  cursor: "pointer", fontSize: 12, fontWeight: activeMetric === m.id ? 600 : 400,
                }}>{m.label}</button>
              ))}
            </div>
          </div>
          <BarChart
            data={activeMetric === "messages" ? msgData : revData}
            color={activeMetric === "messages" ? C.primary : "#00E676"}
            height={220}
            format={activeMetric === "revenue" ? (v) => `$${v.toLocaleString()}` : undefined}
          />
          <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
            <div style={{ fontSize: 12, color: C.muted }}>
              Total: <span style={{ color: "#fff", fontWeight: 700 }}>{activeMetric === "messages" ? (msgData.reduce((s, d) => s + d.value, 0)).toLocaleString() : `$${(revData.reduce((s, d) => s + d.value, 0)).toLocaleString()}`}</span>
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              Daily Avg: <span style={{ color: "#fff", fontWeight: 700 }}>{activeMetric === "messages" ? Math.round(msgData.reduce((s, d) => s + d.value, 0) / msgData.length).toLocaleString() : `$${Math.round(revData.reduce((s, d) => s + d.value, 0) / revData.length).toLocaleString()}`}</span>
            </div>
          </div>
        </div>

        {/* Channel Distribution */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 }}>
          <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 16 }}>Channel Distribution</h3>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <DonutChart segments={channelData} />
          </div>
          {channelData.map(ch => (
            <div key={ch.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: ch.color, flexShrink: 0 }} />
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, flex: 1 }}>{ch.name}</span>
              <span style={{ color: ch.color, fontSize: 12, fontWeight: 700 }}>{ch.pct}%</span>
              <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, width: 70, textAlign: "right" }}>{ch.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Second Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Hourly Distribution */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 }}>
          <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 16 }}>Hourly Distribution</h3>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>Peak hours: 12PM — 4PM EST</div>
          <BarChart data={hourlyData} color={C.accent} height={120} />
        </div>

        {/* Delivery Performance */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 }}>
          <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 16 }}>Delivery Performance</h3>
          {[
            { label: "Delivered", value: 96.9, color: "#00E676" },
            { label: "Opened", value: 52.7, color: C.primary },
            { label: "Clicked", value: 18.4, color: C.accent },
            { label: "Replied", value: 8.2, color: "#FF6B35" },
            { label: "Failed", value: 1.3, color: "#FF3B30" },
            { label: "Opted Out", value: 0.4, color: "#6B8BAE" },
          ].map(m => (
            <div key={m.label} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{m.label}</span>
                <span style={{ color: m.color, fontSize: 13, fontWeight: 700 }}>{m.value}%</span>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${m.value}%`, background: m.color, borderRadius: 3, transition: "width 0.5s" }} />
              </div>
            </div>
          ))}
        </div>

        {/* AI Performance */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 }}>
          <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 16 }}>AI Chatbot Performance</h3>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 48, fontWeight: 900, background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>94.2%</div>
            <div style={{ fontSize: 12, color: C.muted }}>Automated Resolution Rate</div>
          </div>
          {[
            { label: "Conversations Handled", value: "42,847", icon: "💬" },
            { label: "Avg Response Time", value: "0.3s", icon: "⚡" },
            { label: "Escalated to Human", value: "5.8%", icon: "🙋" },
            { label: "Customer Satisfaction", value: "4.7/5", icon: "⭐" },
            { label: "Top Intent", value: "Order Status", icon: "📦" },
          ].map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <span style={{ fontSize: 16 }}>{s.icon}</span>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, flex: 1 }}>{s.label}</span>
              <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tenant Comparison Table */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24, marginBottom: 20 }}>
        <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 16 }}>Tenant Performance Comparison</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Tenant", "Messages", "Revenue", "Campaigns", "Contacts", "Delivery %", "Open %", "Status"].map(h => (
                <th key={h} style={{ textAlign: h === "Tenant" ? "left" : "center", padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)", color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {customers.map(c => (
              <tr key={c.id}>
                <td style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, background: `linear-gradient(135deg, ${c.brand.primary}, ${c.brand.secondary})`, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#000", fontSize: 12 }}>{c.logo}</div>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                      <div style={{ color: c.brand.primary, fontSize: 11 }}>{c.brand.name}</div>
                    </div>
                  </div>
                </td>
                {[
                  c.stats.messages.toLocaleString(),
                  `$${c.stats.revenue.toLocaleString()}`,
                  c.stats.campaigns,
                  c.stats.contacts.toLocaleString(),
                  `${c.stats.deliveryRate}%`,
                  `${c.stats.openRate}%`,
                ].map((val, j) => (
                  <td key={j} style={{ textAlign: "center", padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", color: "#fff", fontSize: 14, fontWeight: j < 2 ? 700 : 400 }}>{val}</td>
                ))}
                <td style={{ textAlign: "center", padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ background: "rgba(0,230,118,0.1)", color: "#00E676", border: "1px solid rgba(0,230,118,0.2)", borderRadius: 4, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>● Active</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ padding: "14px 16px", fontWeight: 700, color: C.primary, fontSize: 14 }}>Platform Total</td>
              {[
                customers.reduce((s, c) => s + c.stats.messages, 0).toLocaleString(),
                `$${customers.reduce((s, c) => s + c.stats.revenue, 0).toLocaleString()}`,
                customers.reduce((s, c) => s + c.stats.campaigns, 0),
                customers.reduce((s, c) => s + c.stats.contacts, 0).toLocaleString(),
                `${(customers.reduce((s, c) => s + c.stats.deliveryRate, 0) / customers.length).toFixed(1)}%`,
                `${(customers.reduce((s, c) => s + c.stats.openRate, 0) / customers.length).toFixed(1)}%`,
              ].map((val, j) => (
                <td key={j} style={{ textAlign: "center", padding: "14px 16px", color: C.primary, fontSize: 14, fontWeight: 700 }}>{val}</td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Revenue by Tenant */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 }}>
          <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 16 }}>Revenue by Tenant</h3>
          {customers.map(c => {
            const maxRev = 500000;
            const pct = Math.round((c.stats.revenue / maxRev) * 100);
            return (
              <div key={c.id} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                  <span style={{ color: c.brand.primary, fontSize: 13, fontWeight: 700 }}>${c.stats.revenue.toLocaleString()}</span>
                </div>
                <div style={{ height: 10, background: "rgba(255,255,255,0.05)", borderRadius: 5 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${c.brand.primary}, ${c.brand.secondary})`, borderRadius: 5, transition: "width 0.5s" }} />
                </div>
                <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginTop: 3 }}>{c.stats.messages.toLocaleString()} messages · {c.stats.campaigns} campaigns</div>
              </div>
            );
          })}
          <div style={{ marginTop: 20, padding: "14px 16px", background: "rgba(255,255,255,0.04)", borderRadius: 10, display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: C.muted, fontSize: 13 }}>Platform MRR</span>
            <span style={{ color: "#00E676", fontWeight: 800, fontSize: 15 }}>${Math.round(customers.reduce((s, c) => s + c.stats.revenue, 0) / 12).toLocaleString()}/mo</span>
          </div>
        </div>

        {/* Campaign Performance */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 }}>
          <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 16 }}>Campaign Insights</h3>
          {[
            { label: "Total Campaigns", value: "87", sub: "32 currently live", color: "#FF6B35", icon: "🚀" },
            { label: "Best Performing", value: "Flash Sale — RetailCo", sub: "97.1% delivery · 62% open rate", color: "#00E676", icon: "🏆" },
            { label: "Avg Click Rate", value: "18.4%", sub: "+2.1% vs industry avg", color: C.primary, icon: "🖱️" },
            { label: "Avg Revenue per Campaign", value: "$10,258", sub: "Across all tenants", color: C.accent, icon: "💵" },
            { label: "Most Used Channel", value: "SMS (42%)", sub: "Followed by Email (24%)", color: "#00C9FF", icon: "📱" },
            { label: "AI Generated Campaigns", value: "34%", sub: "29 of 87 used AI copy", color: "#7C4DFF", icon: "🤖" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: i < 5 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `${item.color}15`, border: `1px solid ${item.color}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{item.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{item.label}</span>
                  <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{item.value}</span>
                </div>
                <div style={{ color: item.color, fontSize: 11, marginTop: 2 }}>{item.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function TenantManagement({ C, onBrandingSaved }) {
  const [activeTab, setActiveTab] = useState("tenants");
  const [showNew, setShowNew] = useState(false);
  const [brandingTenant, setBrandingTenant] = useState("sp_root");

  return (
    <div style={{ padding: "32px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>Tenant Management</h1>
          <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>Manage white-label customers, branding & access</p>
        </div>
        <button onClick={() => setShowNew(true)} style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, border: "none", borderRadius: 10, padding: "12px 24px", color: "#000", fontWeight: 700, cursor: "pointer" }}>
          + New Tenant
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "rgba(255,255,255,0.04)", padding: 4, borderRadius: 10, width: "fit-content" }}>
        {["tenants", "branding", "permissions", "billing"].map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            background: activeTab === t ? C.primary : "transparent",
            border: "none", borderRadius: 7, padding: "8px 20px",
            color: activeTab === t ? "#000" : C.muted,
            fontWeight: activeTab === t ? 700 : 400,
            cursor: "pointer", fontSize: 13, textTransform: "capitalize", transition: "all 0.2s",
          }}>{t === "tenants" ? "🏢 Tenants" : t === "branding" ? "🎨 Branding" : t === "permissions" ? "🔐 Permissions" : "💳 Billing"}</button>
        ))}
      </div>

      {activeTab === "tenants" && (
        <div>
          {showNew && (
            <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${C.primary}44`, borderRadius: 14, padding: 28, marginBottom: 24 }}>
              <h3 style={{ color: "#fff", margin: "0 0 20px" }}>Onboard New Tenant</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                {[
                  { label: "Company Name", placeholder: "e.g. TechCorp Ltd" },
                  { label: "White-Label Brand Name", placeholder: "e.g. TechEngage" },
                  { label: "Admin Email", placeholder: "admin@techcorp.com" },
                  { label: "Custom Domain", placeholder: "messaging.techcorp.com" },
                  { label: "Primary Color", placeholder: "#FF6B35", type: "color" },
                  { label: "Plan", placeholder: "Select plan" },
                ].map(f => (
                  <div key={f.label}>
                    <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>{f.label}</label>
                    <input type={f.type || "text"} placeholder={f.placeholder} style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, boxSizing: "border-box" }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                <button style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, border: "none", borderRadius: 8, padding: "10px 22px", color: "#000", fontWeight: 700, cursor: "pointer" }}>Create Tenant</button>
                <button onClick={() => setShowNew(false)} style={{ background: "transparent", border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 8, padding: "10px 22px", color: C.muted, cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gap: 12 }}>
            {Object.values(TENANTS).filter(t => t.role === "customer").map(c => (
              <div key={c.id} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.07)`, borderLeft: `4px solid ${c.brand.primary}`, borderRadius: 12, padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 200px", alignItems: "center", gap: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, background: `linear-gradient(135deg, ${c.brand.primary}, ${c.brand.secondary})`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#000" }}>{c.logo}</div>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 700 }}>{c.name}</div>
                    <div style={{ color: c.brand.primary, fontSize: 12 }}>{c.brand.name}</div>
                  </div>
                </div>
                <div>
                  <div style={{ color: "#fff", fontSize: 13 }}>{c.channels.join(", ")}</div>
                  <div style={{ color: C.muted, fontSize: 11 }}>Active channels</div>
                </div>
                <div>
                  <div style={{ color: "#fff", fontSize: 13 }}>{c.stats.contacts.toLocaleString()} contacts</div>
                  <div style={{ color: C.muted, fontSize: 11 }}>{c.stats.campaigns} campaigns</div>
                </div>
                <div><Badge color="#00E676">● Active</Badge></div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ background: `${c.brand.primary}22`, border: `1px solid ${c.brand.primary}55`, borderRadius: 7, padding: "7px 14px", color: c.brand.primary, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Configure</button>
                  <button style={{ background: "transparent", border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 7, padding: "7px 14px", color: C.muted, cursor: "pointer", fontSize: 12 }}>Suspend</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "branding" && (
        <div>
          {/* Tenant selector for branding */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
            <button onClick={() => setBrandingTenant("sp_root")} style={{
              background: brandingTenant === "sp_root" ? `${C.primary}22` : "rgba(255,255,255,0.04)",
              border: `2px solid ${brandingTenant === "sp_root" ? C.primary : "rgba(255,255,255,0.08)"}`,
              borderRadius: 10, padding: "10px 18px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 10, transition: "all 0.2s",
            }}>
              <div style={{ width: 32, height: 32, background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#000", fontSize: 12 }}>EW</div>
              <div style={{ textAlign: "left" }}>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>EngageWorx</div>
                <div style={{ color: C.muted, fontSize: 11 }}>Service Provider</div>
              </div>
            </button>
            {Object.values(TENANTS).filter(t => t.role === "customer").map(t => (
              <button key={t.id} onClick={() => setBrandingTenant(t.id)} style={{
                background: brandingTenant === t.id ? `${t.brand.primary}22` : "rgba(255,255,255,0.04)",
                border: `2px solid ${brandingTenant === t.id ? t.brand.primary : "rgba(255,255,255,0.08)"}`,
                borderRadius: 10, padding: "10px 18px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 10, transition: "all 0.2s",
              }}>
                <div style={{ width: 32, height: 32, background: `linear-gradient(135deg, ${t.brand.primary}, ${t.brand.secondary})`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#000", fontSize: 12 }}>{t.logo}</div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{t.brand.name}</div>
                  <div style={{ color: C.muted, fontSize: 11 }}>{t.name}</div>
                </div>
              </button>
            ))}
          </div>
          <WhiteLabelBranding key={brandingTenant} tenantId={brandingTenant} onSaved={brandingTenant === "sp_root" ? onBrandingSaved : undefined} />
        </div>
      )}

      {activeTab === "permissions" && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 14, padding: 28 }}>
          <h3 style={{ color: "#fff", margin: "0 0 20px" }}>Role & Permission Matrix</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ color: C.muted, fontSize: 12, textAlign: "left", padding: "10px 16px", borderBottom: `1px solid rgba(255,255,255,0.07)` }}>Feature</th>
                  {["Super Admin", "Tenant Admin", "Campaign Mgr", "Analyst", "Read Only"].map(r => (
                    <th key={r} style={{ color: C.primary, fontSize: 12, textAlign: "center", padding: "10px 16px", borderBottom: `1px solid rgba(255,255,255,0.07)` }}>{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["All Tenant Access", true, false, false, false, false],
                  ["Tenant Branding", true, true, false, false, false],
                  ["Create Campaigns", true, true, true, false, false],
                  ["View Analytics", true, true, true, true, true],
                  ["Manage Contacts", true, true, true, false, false],
                  ["Flow Builder", true, true, true, false, false],
                  ["API Keys", true, true, false, false, false],
                  ["Billing Access", true, true, false, false, false],
                  ["User Management", true, true, false, false, false],
                ].map(([feature, ...perms]) => (
                  <tr key={feature}>
                    <td style={{ color: "#fff", fontSize: 13, padding: "12px 16px", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>{feature}</td>
                    {perms.map((allowed, i) => (
                      <td key={i} style={{ textAlign: "center", padding: "12px 16px", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                        <span style={{ fontSize: 16 }}>{allowed ? "✅" : "—"}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "billing" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {[
            { plan: "Starter", price: "$299/mo", messages: "50,000", channels: 2, users: 3, color: "#6B8BAE" },
            { plan: "Growth", price: "$799/mo", messages: "250,000", channels: 4, users: 10, color: C.primary },
            { plan: "Enterprise", price: "Custom", messages: "Unlimited", channels: 6, users: "Unlimited", color: C.accent },
          ].map(p => (
            <div key={p.plan} style={{ background: "rgba(255,255,255,0.03)", border: `2px solid ${p.color}44`, borderRadius: 14, padding: 28, textAlign: "center" }}>
              <div style={{ color: p.color, fontWeight: 800, fontSize: 18, marginBottom: 8 }}>{p.plan}</div>
              <div style={{ color: "#fff", fontSize: 32, fontWeight: 800, marginBottom: 20 }}>{p.price}</div>
              {[`${p.messages} messages/mo`, `${p.channels} channels`, `${p.users} users`, "White-label portal", "Custom domain", p.plan === "Enterprise" ? "Dedicated support" : "Email support"].map(f => (
                <div key={f} style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, padding: "8px 0", borderBottom: `1px solid rgba(255,255,255,0.05)` }}>✓ {f}</div>
              ))}
              <button style={{ marginTop: 20, width: "100%", background: p.color, border: "none", borderRadius: 8, padding: "12px", color: "#000", fontWeight: 700, cursor: "pointer" }}>Assign to Tenant</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CUSTOMER TENANT PORTAL ───────────────────────────────────────────────────
function CustomerPortal({ tenantId, onBack }) {
  const tenant = TENANTS[tenantId];
  const defaultColors = tenant.colors;
  const [page, setPage] = useState("dashboard");
  const [brandColors, setBrandColors] = useState(defaultColors);
  const [brandName, setBrandName] = useState(tenant.brand.name);
  const [brandLogo, setBrandLogo] = useState("");
  const [brandTagline, setBrandTagline] = useState("");
  const [poweredByVisible, setPoweredByVisible] = useState(true);

  // Load tenant-specific branding from Supabase
  useEffect(() => {
    const loadTenantBranding = async () => {
      try {
        const { data } = await supabase
          .from("tenant_branding")
          .select("branding")
          .eq("tenant_id", tenantId)
          .limit(1)
          .single();
        if (data && data.branding) {
          const b = data.branding;
          setBrandColors({
            primary: b.primaryColor || defaultColors.primary,
            accent: b.secondaryColor || defaultColors.accent,
            bg: b.bgColor || defaultColors.bg,
            surface: b.surfaceColor || defaultColors.surface,
            border: b.borderColor || defaultColors.border,
            text: b.textColor || defaultColors.text,
            muted: b.mutedColor || defaultColors.muted,
          });
          if (b.companyName) setBrandName(b.companyName);
          if (b.logoUrl) setBrandLogo(b.logoUrl);
          if (b.tagline) setBrandTagline(b.tagline);
          if (b.poweredByVisible !== undefined) setPoweredByVisible(b.poweredByVisible);
        }
      } catch (err) { /* No branding saved for this tenant — use defaults */ }
    };
    loadTenantBranding();
  }, [tenantId]);

  const C = brandColors;

  const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "⊞" },
  { id: "campaigns", label: "Campaigns", icon: "🚀" },
  { id: "flows", label: "Flow Builder", icon: "⚡" },
  { id: "chatbot", label: "AI Chatbot", icon: "🤖" },
  { id: "inbox", label: "Live Inbox", icon: "💬" },
  { id: "analytics", label: "Analytics", icon: "📊" },
  { id: "contacts", label: "Contacts", icon: "👥" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', sans-serif" }}>
      {/* White-labeled Sidebar */}
      <div style={{ width: 220, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", padding: "24px 16px", flexShrink: 0 }}>
        <div style={{ marginBottom: 28, paddingLeft: 8 }}>
          {brandLogo ? (
            <img src={brandLogo} alt={brandName} style={{ maxHeight: 32, marginBottom: 4 }} />
          ) : (
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{brandName}</div>
          )}
          {brandTagline && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{brandTagline}</div>}
          {poweredByVisible && !brandTagline && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Powered by EngageWorx</div>}
        </div>

        <nav style={{ flex: 1 }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => setPage(item.id)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 8, border: "none",
              background: page === item.id ? `${C.primary}22` : "transparent",
              color: page === item.id ? C.primary : C.muted,
              cursor: "pointer", fontSize: 13, fontWeight: page === item.id ? 700 : 400,
              marginBottom: 3, textAlign: "left",
              borderLeft: page === item.id ? `3px solid ${C.primary}` : "3px solid transparent",
            }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <button onClick={onBack} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px", color: C.muted, cursor: "pointer", fontSize: 12, marginBottom: 12 }}>
          ← Back to Provider
        </button>

        <div style={{ padding: "14px", background: C.bg, borderRadius: 10, border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#000" }}>{tenant.logo}</div>
            <div>
              <div style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>{tenant.name}</div>
              <div style={{ color: C.muted, fontSize: 10 }}>Tenant Admin</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {page === "dashboard" && (
          <div style={{ padding: "32px 36px" }}>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: 0 }}>{tenant.brand.name} Dashboard</h1>
              <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>Welcome back, {tenant.name} team</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, marginBottom: 28 }}>
              <StatCard label="Messages Sent" value={tenant.stats.messages.toLocaleString()} sub={`Delivery: ${tenant.stats.deliveryRate}%`} color={C.primary} icon="📨" />
              <StatCard label="Revenue" value={`$${tenant.stats.revenue.toLocaleString()}`} sub="+22.7% this month" color="#00E676" icon="💰" />
              <StatCard label="Open Rate" value={`${tenant.stats.openRate}%`} sub="Industry avg: 38%" color={C.accent} icon="👁️" />
            </div>

            <div style={{ background: `${C.primary}11`, border: `1px solid ${C.primary}33`, borderRadius: 14, padding: 24 }}>
              <h3 style={{ color: C.text, margin: "0 0 16px", fontSize: 16 }}>Active Channels</h3>
              <div style={{ display: "flex", gap: 12 }}>
                {tenant.channels.map(ch => (
                  <div key={ch} style={{ background: `${C.primary}22`, border: `1px solid ${C.primary}44`, borderRadius: 10, padding: "12px 20px", color: C.primary, fontWeight: 700, fontSize: 14 }}>
                    ● {ch}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {page !== "dashboard" && (
          <div style={{ padding: "32px 36px" }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>{navItems.find(n => n.id === page)?.label}</h1>
            <p style={{ color: C.muted, fontSize: 14 }}>Manage your {page} within {brandName}</p>
            <div style={{ marginTop: 24, background: `${C.primary}08`, border: `1px solid ${C.primary}22`, borderRadius: 14, padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{navItems.find(n => n.id === page)?.icon}</div>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 18 }}>{navItems.find(n => n.id === page)?.label} Module</div>
              <div style={{ color: C.muted, marginTop: 8 }}>Fully white-labeled — branded as {brandName}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("login");
  const [selectedRole, setSelectedRole] = useState(null);
  const [drillDownTenant, setDrillDownTenant] = useState(null);
  const [spPage, setSpPage] = useState("dashboard");
  const [liveBranding, setLiveBranding] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginMode, setLoginMode] = useState("login"); // "login" | "register" | "forgot"
  const [registerName, setRegisterName] = useState("");
  const [registerCompany, setRegisterCompany] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setAuthUser(session.user);
          // Check user role to determine default view
          const { data: profile } = await supabase
            .from("user_profiles")
            .select("role, tenant_id")
            .eq("id", session.user.id)
            .single();
          if (profile?.role === "superadmin") {
            setView("sp");
          } else if (profile?.tenant_id) {
            setView("tenant_" + profile.tenant_id);
          } else {
            setView("sp"); // Default to SP view for now
          }
        }
      } catch (err) { /* No session */ }
      setAuthLoading(false);
    };
    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          setAuthUser(session.user);
        } else if (event === "SIGNED_OUT") {
          setAuthUser(null);
          setView("login");
        }
      }
    );
    return () => subscription?.unsubscribe();
  }, []);

  // Handle login
  const handleLogin = async (e) => {
    e?.preventDefault();
    setLoginError("");
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });
      if (error) throw error;
      setAuthUser(data.user);
      // Get user profile for role
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role, tenant_id")
        .eq("id", data.user.id)
        .single();
      if (profile?.role === "superadmin") {
        setView("sp");
      } else if (profile?.tenant_id) {
        setView("tenant_" + profile.tenant_id);
      } else {
        setView("sp");
      }
    } catch (err) {
      setLoginError(err.message || "Invalid email or password");
    }
  };

  // Handle registration
  const handleRegister = async (e) => {
    e?.preventDefault();
    setLoginError("");
    try {
      const { data, error } = await supabase.auth.signUp({
        email: loginEmail,
        password: loginPassword,
        options: {
          data: {
            full_name: registerName,
            company_name: registerCompany,
          }
        }
      });
      if (error) throw error;
      if (data.user && !data.session) {
        // Email confirmation required
        setAuthMessage("Check your email for a confirmation link to complete registration.");
        setLoginMode("login");
      } else if (data.session) {
        // Auto-confirmed (if email confirmations disabled)
        setAuthUser(data.user);
        setView("sp");
      }
    } catch (err) {
      setLoginError(err.message || "Registration failed");
    }
  };

  // Handle forgot password
  const handleForgotPassword = async (e) => {
    e?.preventDefault();
    setLoginError("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setAuthMessage("Password reset link sent to your email.");
      setLoginMode("login");
    } catch (err) {
      setLoginError(err.message || "Failed to send reset email");
    }
  };

  // Handle logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuthUser(null);
    setView("login");
    setSelectedRole(null);
    setLoginEmail("");
    setLoginPassword("");
    setLoginError("");
    setAuthMessage("");
  };

  // Load saved branding from Supabase
  useEffect(() => {
    const loadBranding = async () => {
      try {
        const { data } = await supabase
          .from("tenant_branding")
          .select("branding")
          .eq("tenant_id", "sp_root")
          .limit(1)
          .single();
        if (data && data.branding) {
          setLiveBranding(data.branding);
        }
      } catch (err) { /* No branding saved yet */ }
    };
    loadBranding();
  }, []);

  // Check for signup success redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("signup") === "success") {
      setView("signup");
    }
  }, []);

  // Landing page route — show on engwx.com (main domain) or /landing path
  const hostname = window.location.hostname;
  const isMarketingSite = hostname === 'engwx.com' || hostname === 'www.engwx.com';
  if (isMarketingSite || window.location.pathname === '/landing') {
    return <LandingPage />;
  }

  // Apply saved branding colors over defaults
  const applyBranding = (defaultColors) => {
    if (!liveBranding) return defaultColors;
    return {
      primary: liveBranding.primaryColor || defaultColors.primary,
      accent: liveBranding.secondaryColor || defaultColors.accent,
      bg: liveBranding.bgColor || defaultColors.bg,
      surface: liveBranding.surfaceColor || defaultColors.surface,
      border: liveBranding.borderColor || defaultColors.border,
      text: liveBranding.textColor || defaultColors.text,
      muted: liveBranding.mutedColor || defaultColors.muted,
    };
  };

  const C = applyBranding(TENANTS.serviceProvider.colors);
  const brandName = (liveBranding && liveBranding.companyName) || "EngageWorx";
  const brandTagline = (liveBranding && liveBranding.tagline) || "AI-Powered Engagement";
  const brandLogo = (liveBranding && liveBranding.logoUrl) || "";

  const spNavItems = [
    { id: "dashboard", label: "Platform Overview", icon: "⊞" },
    { id: "tenants", label: "Tenant Management", icon: "🏢" },
    { id: "analytics", label: "Global Analytics", icon: "📊" },
    { id: "api", label: "API & Integrations", icon: "🔌" },
    { id: "settings", label: "Settings", icon: "⚙️" },
  ];

  if (drillDownTenant) {
    return <CustomerPortal tenantId={drillDownTenant} onBack={() => setDrillDownTenant(null)} />;
  }
// Public signup page
  if (view === "signup") {
    return <SignupPage onBack={() => setView("login")} />;
  }

  // Admin tenant management
  if (view === "admin_tenants") {
    return <AdminTenants onBack={() => setView("sp")} />;
  }
  if (view === "login") {
    if (authLoading) {
      return (
        <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
          <div style={{ color: C.muted, fontSize: 16 }}>Loading...</div>
        </div>
      );
    }

    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ width: 440 }}>
          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            {brandLogo ? (
              <img src={brandLogo} alt={brandName} style={{ maxHeight: 48, marginBottom: 8 }} />
            ) : (
              <div style={{ fontSize: 36, fontWeight: 900, color: "#fff" }}>
                {brandName === "EngageWorx" ? <>Engage<span style={{ color: C.primary }}>Worx</span></> : <span style={{ color: C.primary }}>{brandName}</span>}
              </div>
            )}
            <div style={{ color: C.muted, marginTop: 6 }}>{brandTagline}</div>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 40 }}>
            {/* Auth Message */}
            {authMessage && (
              <div style={{ background: `${C.primary}15`, border: `1px solid ${C.primary}44`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, color: C.primary, fontSize: 13, textAlign: "center" }}>
                {authMessage}
              </div>
            )}

            {/* LOGIN MODE */}
            {loginMode === "login" && (
              <>
                <h2 style={{ color: "#fff", margin: "0 0 8px", textAlign: "center", fontSize: 22 }}>Welcome Back</h2>
                <p style={{ color: C.muted, textAlign: "center", marginBottom: 28, fontSize: 14 }}>Sign in to your account</p>

                {loginError && (
                  <div style={{ background: "rgba(255,59,48,0.1)", border: "1px solid rgba(255,59,48,0.3)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, color: "#FF3B30", fontSize: 13 }}>
                    {loginError}
                  </div>
                )}

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Email Address</label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    placeholder="you@company.com"
                    style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" }}
                  />
                </div>

                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                      placeholder="Enter your password"
                      style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" }}
                    />
                    <button onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 18 }}>
                      {showPassword ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                <div style={{ textAlign: "right", marginBottom: 20 }}>
                  <button onClick={() => { setLoginMode("forgot"); setLoginError(""); }} style={{ background: "none", border: "none", color: C.primary, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                    Forgot password?
                  </button>
                </div>

                <button
                  onClick={handleLogin}
                  style={{
                    width: "100%", background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
                    border: "none", borderRadius: 10, padding: "14px",
                    color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 16, transition: "all 0.2s",
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                  Sign In →
                </button>

                <div style={{ marginTop: 20, textAlign: "center" }}>
                  <span style={{ color: C.muted, fontSize: 14 }}>New to {brandName}? </span>
                  <button onClick={() => { setLoginMode("register"); setLoginError(""); }} style={{ background: "none", border: "none", color: C.primary, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                    Create Account →
                  </button>
                </div>

                {/* Demo Access Divider */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0 16px" }}>
                  <div style={{ flex: 1, height: 1, background: C.border }} />
                  <span style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>or explore demo</span>
                  <div style={{ flex: 1, height: 1, background: C.border }} />
                </div>

                <button
                  onClick={() => setView("demo_select")}
                  style={{
                    width: "100%", background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px",
                    color: C.muted, fontWeight: 600, cursor: "pointer", fontSize: 13,
                    fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s",
                  }}>
                  🎯 Try Demo Mode
                </button>
              </>
            )}

            {/* REGISTER MODE */}
            {loginMode === "register" && (
              <>
                <h2 style={{ color: "#fff", margin: "0 0 8px", textAlign: "center", fontSize: 22 }}>Create Account</h2>
                <p style={{ color: C.muted, textAlign: "center", marginBottom: 28, fontSize: 14 }}>Start your free trial — no credit card required</p>

                {loginError && (
                  <div style={{ background: "rgba(255,59,48,0.1)", border: "1px solid rgba(255,59,48,0.3)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, color: "#FF3B30", fontSize: 13 }}>
                    {loginError}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Full Name</label>
                    <input type="text" value={registerName} onChange={(e) => setRegisterName(e.target.value)} placeholder="John Smith" style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Company</label>
                    <input type="text" value={registerCompany} onChange={(e) => setRegisterCompany(e.target.value)} placeholder="Acme Corp" style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" }} />
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Email Address</label>
                  <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="you@company.com" style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" }} />
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Password</label>
                  <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleRegister()} placeholder="Min. 8 characters" style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" }} />
                </div>

                <button onClick={handleRegister} style={{ width: "100%", background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, border: "none", borderRadius: 10, padding: "14px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 16, fontFamily: "'DM Sans', sans-serif" }}>
                  Create Account →
                </button>

                <div style={{ marginTop: 20, textAlign: "center" }}>
                  <span style={{ color: C.muted, fontSize: 14 }}>Already have an account? </span>
                  <button onClick={() => { setLoginMode("login"); setLoginError(""); }} style={{ background: "none", border: "none", color: C.primary, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                    Sign In →
                  </button>
                </div>
              </>
            )}

            {/* FORGOT PASSWORD MODE */}
            {loginMode === "forgot" && (
              <>
                <h2 style={{ color: "#fff", margin: "0 0 8px", textAlign: "center", fontSize: 22 }}>Reset Password</h2>
                <p style={{ color: C.muted, textAlign: "center", marginBottom: 28, fontSize: 14 }}>Enter your email and we'll send you a reset link</p>

                {loginError && (
                  <div style={{ background: "rgba(255,59,48,0.1)", border: "1px solid rgba(255,59,48,0.3)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, color: "#FF3B30", fontSize: 13 }}>
                    {loginError}
                  </div>
                )}

                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Email Address</label>
                  <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleForgotPassword()} placeholder="you@company.com" style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" }} />
                </div>

                <button onClick={handleForgotPassword} style={{ width: "100%", background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, border: "none", borderRadius: 10, padding: "14px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 16, fontFamily: "'DM Sans', sans-serif" }}>
                  Send Reset Link →
                </button>

                <div style={{ marginTop: 20, textAlign: "center" }}>
                  <button onClick={() => { setLoginMode("login"); setLoginError(""); }} style={{ background: "none", border: "none", color: C.primary, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                    ← Back to Sign In
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Demo portal selector
  if (view === "demo_select") {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ width: 480 }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: `${C.primary}15`, border: `1px solid ${C.primary}33`, borderRadius: 100, padding: "6px 16px", fontSize: 12, fontWeight: 700, color: C.primary, marginBottom: 16 }}>🎯 DEMO MODE</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#fff" }}>
              {brandName === "EngageWorx" ? <>Engage<span style={{ color: C.primary }}>Worx</span></> : <span style={{ color: C.primary }}>{brandName}</span>}
            </div>
            <div style={{ color: C.muted, marginTop: 6 }}>Explore the platform with sample data</div>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 40 }}>
            <h2 style={{ color: "#fff", margin: "0 0 8px", textAlign: "center", fontSize: 22 }}>Select Portal</h2>
            <p style={{ color: C.muted, textAlign: "center", marginBottom: 28, fontSize: 14 }}>Choose your access level to explore</p>

            <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
              <button onClick={() => setSelectedRole("sp")} style={{
                background: selectedRole === "sp" ? `${C.primary}22` : "rgba(255,255,255,0.03)",
                border: `2px solid ${selectedRole === "sp" ? C.primary : "rgba(255,255,255,0.1)"}`,
                borderRadius: 12, padding: "16px 20px", cursor: "pointer", textAlign: "left",
                display: "flex", alignItems: "center", gap: 14, transition: "all 0.2s",
              }}>
                <div style={{ width: 44, height: 44, background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🌐</div>
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>Service Provider</div>
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>Holistic view · All tenants · Platform management</div>
                </div>
                {selectedRole === "sp" && <div style={{ marginLeft: "auto", color: C.primary, fontSize: 20 }}>✓</div>}
              </button>

              {Object.values(TENANTS).filter(t => t.role === "customer").map(t => (
                <button key={t.id} onClick={() => setSelectedRole(t.id)} style={{
                  background: selectedRole === t.id ? `${t.brand.primary}22` : "rgba(255,255,255,0.03)",
                  border: `2px solid ${selectedRole === t.id ? t.brand.primary : "rgba(255,255,255,0.1)"}`,
                  borderRadius: 12, padding: "16px 20px", cursor: "pointer", textAlign: "left",
                  display: "flex", alignItems: "center", gap: 14, transition: "all 0.2s",
                }}>
                  <div style={{ width: 44, height: 44, background: `linear-gradient(135deg, ${t.brand.primary}, ${t.brand.secondary})`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#000", fontSize: 16 }}>{t.logo}</div>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{t.brand.name}</div>
                    <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{t.name} · Customer Portal</div>
                  </div>
                  {selectedRole === t.id && <div style={{ marginLeft: "auto", color: t.brand.primary, fontSize: 20 }}>✓</div>}
                </button>
              ))}
            </div>

            <button
              onClick={() => selectedRole && setView(selectedRole === "sp" ? "sp" : "tenant_" + selectedRole)}
              disabled={!selectedRole}
              style={{
                width: "100%", background: selectedRole ? `linear-gradient(135deg, ${C.primary}, ${C.accent})` : "rgba(255,255,255,0.1)",
                border: "none", borderRadius: 10, padding: "14px",
                color: selectedRole ? "#000" : C.muted, fontWeight: 700, cursor: selectedRole ? "pointer" : "not-allowed",
                fontSize: 16, transition: "all 0.2s",
              }}>
              Enter Portal →
            </button>
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button onClick={() => { setView("login"); setSelectedRole(null); }} style={{ background: "none", border: "none", color: C.primary, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                ← Back to Sign In
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Public signup page
  if (view === "signup") {
    return <SignupPage onBack={() => setView("login")} />;
  }

  // Admin tenant management
  if (view === "admin_tenants") {
    return <AdminTenants onBack={() => setView("sp")} />;
  }
  // Customer tenant portal
  if (view.startsWith("tenant_")) {
    const tenantId = view.replace("tenant_", "");
    return <CustomerPortal tenantId={tenantId} onBack={() => setView("login")} />;
  }

  // Service Provider portal
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', sans-serif", color: C.text }}>
      {/* SP Sidebar */}
      <div style={{ width: 240, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", padding: "24px 16px", flexShrink: 0, position: "fixed", height: "100vh" }}>
        <div style={{ marginBottom: 32, paddingLeft: 8 }}>
          {brandLogo ? (
            <img src={brandLogo} alt={brandName} style={{ maxHeight: 32, marginBottom: 4 }} />
          ) : (
            <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>
              {brandName === "EngageWorx" ? <>Engage<span style={{ color: C.primary }}>Worx</span></> : <span style={{ color: C.primary }}>{brandName}</span>}
            </div>
          )}
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Service Provider Console</div>
          <div style={{ marginTop: 8 }}><Badge color={C.primary}>🌐 Super Admin</Badge></div>
        </div>

        <nav style={{ flex: 1 }}>
          {spNavItems.map(item => (
            <button key={item.id} onClick={() => setSpPage(item.id)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 12,
              padding: "11px 12px", borderRadius: 9, border: "none",
              background: spPage === item.id ? `${C.primary}22` : "transparent",
              color: spPage === item.id ? C.primary : C.muted,
              cursor: "pointer", fontSize: 14, fontWeight: spPage === item.id ? 700 : 400,
              marginBottom: 4, textAlign: "left",
              borderLeft: spPage === item.id ? `3px solid ${C.primary}` : "3px solid transparent",
            }}>
              <span style={{ fontSize: 17 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <button onClick={() => setView("login")} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px", color: C.muted, cursor: "pointer", fontSize: 12, marginBottom: 8, width: "100%" }}>← Switch Portal</button>
        {authUser && <button onClick={handleLogout} style={{ background: "rgba(255,59,48,0.1)", border: "1px solid rgba(255,59,48,0.2)", borderRadius: 8, padding: "10px", color: "#FF6B6B", cursor: "pointer", fontSize: 12, marginBottom: 12, width: "100%" }}>Sign Out</button>}

        <div style={{ padding: "14px", marginBottom: 16, background: C.bg, borderRadius: 10, border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#000" }}>{brandName.substring(0,2).toUpperCase()}</div>
            <div>
              <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{authUser ? authUser.email : `${brandName} Admin`}</div>
              <div style={{ color: C.muted, fontSize: 11 }}>Service Provider</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, marginLeft: 240, overflowY: "auto" }}>
        {spPage === "dashboard" && <SuperAdminDashboard tenant={TENANTS.serviceProvider} onDrillDown={(id) => setDrillDownTenant(id)} C={C} />}
        {spPage === "tenants" && <TenantManagement C={C} onBrandingSaved={() => {
          supabase.from("tenant_branding").select("branding").eq("tenant_id", "sp_root").limit(1).single()
            .then(({ data }) => { if (data && data.branding) setLiveBranding(data.branding); });
        }} />}
        {spPage === "analytics" && <AnalyticsDashboard C={C} tenants={TENANTS} viewLevel="sp" />}
        {["api", "settings"].includes(spPage) && (
          <div style={{ padding: "32px 40px" }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>{spNavItems.find(n => n.id === spPage)?.label}</h1>
            <p style={{ color: C.muted }}>Full {spPage} module available here</p>
          </div>
        )}
      </div>
    </div>
  );
}
