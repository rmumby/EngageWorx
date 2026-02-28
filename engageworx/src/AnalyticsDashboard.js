import { useState, useEffect, useRef, useCallback } from "react";

// ─── DEMO DATA GENERATOR ──────────────────────────────────────────────────────
const CHANNELS = ["SMS", "MMS", "RCS", "WhatsApp", "Email", "Voice"];
const CHANNEL_COLORS = { SMS: "#00C9FF", MMS: "#7C4DFF", RCS: "#E040FB", WhatsApp: "#25D366", Email: "#FF6B35", Voice: "#FFD600" };

const DEMO_TENANTS = [
  { id: "acme", name: "Acme Corp", brand: "AcmeEngage", color: "#FF6B35", logo: "AC" },
  { id: "retailco", name: "RetailCo", brand: "RetailReach", color: "#00E676", logo: "RC" },
  { id: "finserv", name: "FinServ Group", brand: "FinConnect", color: "#7C4DFF", logo: "FS" },
];

function generateDemoData(startDate, endDate, tenantFilter, channelFilter) {
  const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
  const tenants = tenantFilter === "all" ? DEMO_TENANTS : DEMO_TENANTS.filter(t => t.id === tenantFilter);
  const channels = channelFilter === "all" ? CHANNELS : [channelFilter];

  // Daily time series
  const daily = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    const weekendDip = (dow === 0 || dow === 6) ? 0.55 : 1;
    const trend = 1 + i * 0.005;
    const seasonality = 1 + 0.15 * Math.sin((i / 7) * Math.PI);

    const dayData = { date: new Date(d), label: `${d.getMonth()+1}/${d.getDate()}` };
    let totalSent = 0, totalDelivered = 0, totalFailed = 0, totalOpened = 0, totalClicked = 0, totalReplied = 0, totalOptOut = 0, totalRevenue = 0;

    // Per channel
    channels.forEach(ch => {
      const base = ch === "SMS" ? 4200 : ch === "Email" ? 2400 : ch === "WhatsApp" ? 1800 : ch === "RCS" ? 640 : ch === "MMS" ? 380 : 200;
      const scale = tenants.length / 3;
      const sent = Math.round(base * scale * weekendDip * trend * seasonality * (0.85 + Math.random() * 0.3));
      const deliveryRate = ch === "Email" ? 0.94 + Math.random() * 0.04 : 0.95 + Math.random() * 0.04;
      const delivered = Math.round(sent * deliveryRate);
      const failed = sent - delivered;
      const openRate = ch === "Email" ? 0.28 + Math.random() * 0.15 : ch === "SMS" ? 0.92 + Math.random() * 0.06 : 0.55 + Math.random() * 0.2;
      const opened = Math.round(delivered * openRate);
      const clicked = Math.round(opened * (0.12 + Math.random() * 0.12));
      const replied = Math.round(delivered * (0.04 + Math.random() * 0.06));
      const optOut = Math.round(delivered * (0.001 + Math.random() * 0.003));
      const costPer = ch === "SMS" ? 0.0079 : ch === "MMS" ? 0.02 : ch === "RCS" ? 0.015 : ch === "WhatsApp" ? 0.005 : ch === "Email" ? 0.001 : 0.04;
      const revenue = Math.round(sent * costPer * (2.5 + Math.random()) * 100) / 100;

      totalSent += sent; totalDelivered += delivered; totalFailed += failed;
      totalOpened += opened; totalClicked += clicked; totalReplied += replied;
      totalOptOut += optOut; totalRevenue += revenue;
    });

    dayData.sent = totalSent; dayData.delivered = totalDelivered; dayData.failed = totalFailed;
    dayData.opened = totalOpened; dayData.clicked = totalClicked; dayData.replied = totalReplied;
    dayData.optOut = totalOptOut; dayData.revenue = Math.round(totalRevenue);
    daily.push(dayData);
  }

  // Hourly distribution (aggregate)
  const hourly = Array.from({ length: 24 }, (_, h) => {
    const peak = Math.exp(-0.5 * Math.pow((h - 14) / 4, 2));
    const morning = Math.exp(-0.5 * Math.pow((h - 10) / 3, 2)) * 0.6;
    return { hour: h, label: `${h.toString().padStart(2,"0")}:00`, value: Math.round(1800 * (peak + morning) * (0.8 + Math.random() * 0.4) * (tenants.length / 3)) };
  });

  // Channel breakdown
  const channelBreakdown = channels.map(ch => {
    const bases = { SMS: 542000, MMS: 36712, RCS: 64000, WhatsApp: 231000, Email: 308000, Voice: 18000 };
    const scale = tenants.length / 3 * (days / 30);
    const val = Math.round((bases[ch] || 10000) * scale * (0.85 + Math.random() * 0.3));
    return { name: ch, value: val, color: CHANNEL_COLORS[ch] };
  });
  const chTotal = channelBreakdown.reduce((s, c) => s + c.value, 0);
  channelBreakdown.forEach(c => c.pct = Math.round((c.value / chTotal) * 100));

  // Per tenant breakdown
  const tenantBreakdown = tenants.map(t => {
    const bases = { acme: { messages: 284712, revenue: 128450, campaigns: 24, contacts: 48200, deliveryRate: 95.3, openRate: 51.2 },
      retailco: { messages: 612340, revenue: 441200, campaigns: 38, contacts: 124000, deliveryRate: 97.1, openRate: 44.8 },
      finserv: { messages: 387660, revenue: 322800, campaigns: 25, contacts: 89300, deliveryRate: 98.2, openRate: 62.1 } };
    const b = bases[t.id] || bases.acme;
    const scale = days / 30;
    return { ...t, messages: Math.round(b.messages * scale), revenue: Math.round(b.revenue * scale),
      campaigns: Math.round(b.campaigns * scale), contacts: b.contacts,
      deliveryRate: b.deliveryRate + (Math.random() - 0.5), openRate: b.openRate + (Math.random() - 0.5) * 3 };
  });

  // Error codes
  const errorCodes = [
    { code: "30003", desc: "Unreachable destination", count: Math.round(420 * (days/30) * (tenants.length/3)), severity: "warning" },
    { code: "30005", desc: "Unknown destination", count: Math.round(285 * (days/30) * (tenants.length/3)), severity: "warning" },
    { code: "30006", desc: "Landline or unreachable carrier", count: Math.round(198 * (days/30) * (tenants.length/3)), severity: "info" },
    { code: "30007", desc: "Carrier violation", count: Math.round(67 * (days/30) * (tenants.length/3)), severity: "error" },
    { code: "30008", desc: "Unknown error", count: Math.round(34 * (days/30) * (tenants.length/3)), severity: "error" },
    { code: "21610", desc: "Opt-out reply (STOP)", count: Math.round(512 * (days/30) * (tenants.length/3)), severity: "info" },
    { code: "30034", desc: "Message blocked (spam)", count: Math.round(23 * (days/30) * (tenants.length/3)), severity: "error" },
  ].sort((a, b) => b.count - a.count);

  // Response types
  const responseTypes = [
    { type: "User Content", count: Math.round(18400 * (days/30) * (tenants.length/3)), color: "#00C9FF" },
    { type: "Opt-Out (STOP)", count: Math.round(512 * (days/30) * (tenants.length/3)), color: "#FF3B30" },
    { type: "Opt-In (START)", count: Math.round(89 * (days/30) * (tenants.length/3)), color: "#00E676" },
    { type: "Help Request", count: Math.round(234 * (days/30) * (tenants.length/3)), color: "#FFD600" },
    { type: "Auto-Reply", count: Math.round(4200 * (days/30) * (tenants.length/3)), color: "#E040FB" },
  ];

  // Latency distribution
  const latency = [
    { bucket: "< 1s", count: 72, color: "#00E676" },
    { bucket: "1-3s", count: 18, color: "#00C9FF" },
    { bucket: "3-5s", count: 6, color: "#FFD600" },
    { bucket: "5-10s", count: 3, color: "#FF6B35" },
    { bucket: "> 10s", count: 1, color: "#FF3B30" },
  ];

  // Aggregate stats
  const totals = daily.reduce((acc, d) => ({
    sent: acc.sent + d.sent, delivered: acc.delivered + d.delivered, failed: acc.failed + d.failed,
    opened: acc.opened + d.opened, clicked: acc.clicked + d.clicked, replied: acc.replied + d.replied,
    optOut: acc.optOut + d.optOut, revenue: acc.revenue + d.revenue
  }), { sent: 0, delivered: 0, failed: 0, opened: 0, clicked: 0, replied: 0, optOut: 0, revenue: 0 });

  return { daily, hourly, channelBreakdown, tenantBreakdown, errorCodes, responseTypes, latency, totals, days };
}

// ─── CHART COMPONENTS ──────────────────────────────────────────────────────────
function BarChart({ data, color, height = 200, valueKey = "value", format, gradientId }) {
  const max = Math.max(...data.map(d => d[valueKey])) || 1;
  const showEvery = data.length > 60 ? 14 : data.length > 30 ? 7 : data.length > 14 ? 3 : 1;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: data.length > 60 ? 1 : 2, height, padding: "0 0 24px" }}>
        {data.map((d, i) => {
          const pct = (d[valueKey] / max) * 100;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end", position: "relative" }}>
              <div
                title={`${d.label}: ${format ? format(d[valueKey]) : d[valueKey].toLocaleString()}`}
                style={{ width: "100%", minWidth: 2, maxWidth: 20, height: `${pct}%`, background: typeof color === "function" ? color(d, i) : `linear-gradient(180deg, ${color}, ${color}66)`, borderRadius: "2px 2px 0 0", transition: "height 0.3s", cursor: "pointer" }}
                onMouseEnter={(e) => { e.target.style.filter = "brightness(1.3)"; }}
                onMouseLeave={(e) => { e.target.style.filter = "none"; }}
              />
              {(i % showEvery === 0) && <span style={{ position: "absolute", bottom: -18, fontSize: 9, color: "rgba(255,255,255,0.2)", whiteSpace: "nowrap" }}>{d.label}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Sparkline({ data, color, width = 80, height = 28, valueKey = "value" }) {
  const vals = data.map(d => d[valueKey]);
  const max = Math.max(...vals); const min = Math.min(...vals); const range = max - min || 1;
  const points = vals.map((v, i) => `${(i / (vals.length - 1)) * width},${height - ((v - min) / range) * (height - 4)}`).join(" ");
  return <svg width={width} height={height} style={{ overflow: "visible" }}><polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function DonutChart({ segments, size = 140, label }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  let cum = 0; const r = 52; const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 140 140">
      {segments.map((seg, i) => {
        const pct = seg.value / total; const offset = cum * circ; cum += pct;
        return <circle key={i} cx="70" cy="70" r={r} fill="none" stroke={seg.color} strokeWidth="18" strokeDasharray={`${pct * circ} ${circ}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" style={{ transition: "all 0.5s" }} />;
      })}
      <text x="70" y="66" textAnchor="middle" fill="#fff" fontSize="20" fontWeight="900">{total >= 1000000 ? `${(total/1000000).toFixed(1)}M` : total >= 1000 ? `${(total/1000).toFixed(0)}K` : total}</text>
      {label && <text x="70" y="84" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="10">{label}</text>}
    </svg>
  );
}

function ProgressBar({ value, max = 100, color, height = 6 }) {
  return (
    <div style={{ height, background: "rgba(255,255,255,0.05)", borderRadius: height/2 }}>
      <div style={{ height: "100%", width: `${Math.min((value/max)*100, 100)}%`, background: color, borderRadius: height/2, transition: "width 0.5s" }} />
    </div>
  );
}

// ─── DATE RANGE PICKER ─────────────────────────────────────────────────────────
function DateRangePicker({ startDate, endDate, onChangeStart, onChangeEnd, onPreset }) {
  const presets = [
    { label: "Today", days: 0 }, { label: "7D", days: 7 }, { label: "30D", days: 30 },
    { label: "90D", days: 90 }, { label: "120D", days: 120 },
  ];
  const inputStyle = { background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none" };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.04)", padding: 3, borderRadius: 8 }}>
        {presets.map(p => {
          const now = new Date(); const preset = new Date(); preset.setDate(preset.getDate() - p.days);
          const isActive = Math.abs(startDate - preset) < 86400000 && Math.abs(endDate - now) < 86400000;
          return (
            <button key={p.label} onClick={() => onPreset(p.days)} style={{
              background: isActive ? "#00C9FF" : "transparent", border: "none", borderRadius: 6,
              padding: "6px 12px", color: isActive ? "#000" : "rgba(255,255,255,0.4)",
              fontWeight: isActive ? 700 : 400, cursor: "pointer", fontSize: 12, transition: "all 0.2s",
            }}>{p.label}</button>
          );
        })}
      </div>
      <input type="date" value={startDate.toISOString().split("T")[0]} onChange={(e) => onChangeStart(new Date(e.target.value))} style={inputStyle} />
      <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>to</span>
      <input type="date" value={endDate.toISOString().split("T")[0]} onChange={(e) => onChangeEnd(new Date(e.target.value))} style={inputStyle} />
    </div>
  );
}

// ─── EXPORT FUNCTIONS ──────────────────────────────────────────────────────────
function exportToCSV(data, filename) {
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  const csv = [headers.join(","), ...data.map(row => headers.map(h => {
    const val = row[h];
    return val instanceof Date ? val.toISOString().split("T")[0] : typeof val === "string" && val.includes(",") ? `"${val}"` : val;
  }).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── MAIN ANALYTICS DASHBOARD ──────────────────────────────────────────────────
export default function AnalyticsDashboard({ C, tenants, viewLevel = "sp", currentTenantId = null, demoMode = true }) {
  const now = new Date();
  const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const [startDate, setStartDate] = useState(thirtyAgo);
  const [endDate, setEndDate] = useState(now);
  const [tenantFilter, setTenantFilter] = useState(currentTenantId || "all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");
  const [chartMetric, setChartMetric] = useState("sent");
  const [drillTenant, setDrillTenant] = useState(null);

  const handlePreset = (days) => {
    const end = new Date();
    const start = new Date(); start.setDate(start.getDate() - (days || 0));
    setStartDate(start); setEndDate(end);
  };

  // Generate or fetch data
  const data = demoMode ? generateDemoData(startDate, endDate, tenantFilter, channelFilter) : generateDemoData(startDate, endDate, tenantFilter, channelFilter); // TODO: replace with real fetch

  const tabs = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "delivery", label: "Delivery & Errors", icon: "📬" },
    { id: "responses", label: "Responses", icon: "💬" },
    { id: "channels", label: "Channels", icon: "📡" },
    ...(viewLevel === "sp" ? [{ id: "tenants", label: "Tenants", icon: "🏢" }] : []),
    { id: "campaigns", label: "Campaigns", icon: "🚀" },
    { id: "ai", label: "AI Performance", icon: "🤖" },
    { id: "revenue", label: "Revenue", icon: "💰" },
  ];

  const selectStyle = { background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", appearance: "auto", cursor: "pointer" };

  // Drill-down into specific tenant
  if (drillTenant) {
    const t = DEMO_TENANTS.find(x => x.id === drillTenant);
    return (
      <div style={{ padding: "32px 40px", maxWidth: 1400 }}>
        <button onClick={() => setDrillTenant(null)} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 8, padding: "8px 16px", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 20, fontFamily: "'DM Sans', sans-serif" }}>← Back to All Tenants</button>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <div style={{ width: 48, height: 48, background: `linear-gradient(135deg, ${t.color}, ${t.color}88)`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#000", fontSize: 18 }}>{t.logo}</div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>{t.name}</h1>
            <p style={{ color: t.color, margin: 0, fontSize: 14 }}>{t.brand} Analytics</p>
          </div>
        </div>
        <AnalyticsDashboard C={{ ...C, primary: t.color }} tenants={tenants} viewLevel="tenant" currentTenantId={t.id} />
    </div>
    );
  }

  return (
    <div style={{ padding: viewLevel === "sp" ? "32px 40px" : 0, maxWidth: 1400 }}>
      {/* Header */}
      {viewLevel === "sp" && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>Global Analytics</h1>
            <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>Platform-wide performance metrics across all tenants</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Export */}
            <button onClick={() => exportToCSV(data.daily.map(d => ({ date: d.label, sent: d.sent, delivered: d.delivered, failed: d.failed, opened: d.opened, clicked: d.clicked, replied: d.replied, optOut: d.optOut, revenue: d.revenue })), `analytics-${startDate.toISOString().split("T")[0]}-${endDate.toISOString().split("T")[0]}.csv`)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 16px", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
              📥 Export CSV
            </button>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20, padding: "14px 20px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
        <DateRangePicker startDate={startDate} endDate={endDate} onChangeStart={setStartDate} onChangeEnd={setEndDate} onPreset={handlePreset} />
        <div style={{ display: "flex", gap: 10 }}>
          {viewLevel === "sp" && (
            <select value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)} style={selectStyle}>
              <option value="all">All Tenants</option>
              {DEMO_TENANTS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} style={selectStyle}>
            <option value="all">All Channels</option>
            {CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 24, overflowX: "auto", paddingBottom: 4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background: activeTab === t.id ? C.primary : "rgba(255,255,255,0.04)",
            border: activeTab === t.id ? "none" : "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8, padding: "8px 16px", color: activeTab === t.id ? "#000" : "rgba(255,255,255,0.5)",
            fontWeight: activeTab === t.id ? 700 : 400, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap",
            fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* ═══════════════ OVERVIEW TAB ═══════════════ */}
      {activeTab === "overview" && (
        <>
          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 24 }}>
            {[
              { label: "Messages Sent", value: data.totals.sent, change: "+12.4%", pos: true, color: C.primary, icon: "📨", spark: data.daily.slice(-14) },
              { label: "Delivered", value: data.totals.delivered, change: `${((data.totals.delivered/data.totals.sent)*100).toFixed(1)}%`, pos: true, color: "#00E676", icon: "✅", spark: data.daily.slice(-14), sparkKey: "delivered" },
              { label: "Revenue", value: data.totals.revenue, change: "+18.4%", pos: true, color: "#FFD600", icon: "💰", fmt: v => `$${v.toLocaleString()}` },
              { label: "Opened", value: data.totals.opened, change: `${((data.totals.opened/data.totals.delivered)*100).toFixed(1)}%`, pos: true, color: C.accent, icon: "👁️" },
              { label: "Failed", value: data.totals.failed, change: `${((data.totals.failed/data.totals.sent)*100).toFixed(1)}%`, pos: false, color: "#FF3B30", icon: "⚠️" },
            ].map((kpi, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderTop: `3px solid ${kpi.color}`, borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1 }}>{kpi.label}</span>
                  <span style={{ fontSize: 16 }}>{kpi.icon}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{kpi.fmt ? kpi.fmt(kpi.value) : kpi.value.toLocaleString()}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: kpi.pos ? "#00E676" : "#FF3B30", fontWeight: 600 }}>{kpi.pos ? "↑" : "↓"} {kpi.change}</span>
                  {kpi.spark && <div style={{ marginLeft: "auto" }}><Sparkline data={kpi.spark} color={kpi.color} valueKey={kpi.sparkKey || "sent"} /></div>}
                </div>
              </div>
            ))}
          </div>

          {/* Main chart + Channel donut */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ color: "#fff", margin: 0, fontSize: 15 }}>Message Volume Over Time</h3>
                <div style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.04)", padding: 3, borderRadius: 7 }}>
                  {[{ id: "sent", label: "Sent" }, { id: "delivered", label: "Delivered" }, { id: "revenue", label: "Revenue" }].map(m => (
                    <button key={m.id} onClick={() => setChartMetric(m.id)} style={{ background: chartMetric === m.id ? "rgba(255,255,255,0.1)" : "transparent", border: "none", borderRadius: 5, padding: "4px 10px", color: chartMetric === m.id ? "#fff" : "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 11, fontWeight: chartMetric === m.id ? 600 : 400 }}>{m.label}</button>
                  ))}
                </div>
              </div>
              <BarChart data={data.daily} color={chartMetric === "revenue" ? "#00E676" : C.primary} height={200} valueKey={chartMetric} format={chartMetric === "revenue" ? v => `$${v.toLocaleString()}` : undefined} />
              <div style={{ display: "flex", gap: 20, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Total: <strong style={{ color: "#fff" }}>{chartMetric === "revenue" ? `$${data.totals[chartMetric].toLocaleString()}` : data.totals[chartMetric].toLocaleString()}</strong></span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Daily Avg: <strong style={{ color: "#fff" }}>{chartMetric === "revenue" ? `$${Math.round(data.totals[chartMetric] / data.days).toLocaleString()}` : Math.round(data.totals[chartMetric] / data.days).toLocaleString()}</strong></span>
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 22 }}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Channel Mix</h3>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                <DonutChart segments={data.channelBreakdown} label="messages" />
              </div>
              {data.channelBreakdown.map(ch => (
                <div key={ch.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: ch.color, flexShrink: 0 }} />
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, flex: 1 }}>{ch.name}</span>
                  <span style={{ color: ch.color, fontSize: 11, fontWeight: 700, width: 32, textAlign: "right" }}>{ch.pct}%</span>
                  <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, width: 60, textAlign: "right" }}>{ch.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Hourly + Funnel */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 22 }}>
              <h3 style={{ color: "#fff", margin: "0 0 4px", fontSize: 15 }}>Hourly Distribution</h3>
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginBottom: 14 }}>Peak hours highlighted · All times EST</p>
              <BarChart data={data.hourly} color={(d) => d.value > 1200 ? C.accent : `${C.primary}88`} height={130} />
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 22 }}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Engagement Funnel</h3>
              {[
                { label: "Sent", value: data.totals.sent, color: C.primary },
                { label: "Delivered", value: data.totals.delivered, color: "#00E676" },
                { label: "Opened", value: data.totals.opened, color: "#00C9FF" },
                { label: "Clicked", value: data.totals.clicked, color: C.accent },
                { label: "Replied", value: data.totals.replied, color: "#FF6B35" },
              ].map((step, i) => {
                const pct = ((step.value / data.totals.sent) * 100).toFixed(1);
                return (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>{step.label}</span>
                      <span style={{ fontSize: 12 }}><span style={{ color: step.color, fontWeight: 700 }}>{step.value.toLocaleString()}</span> <span style={{ color: "rgba(255,255,255,0.2)" }}>({pct}%)</span></span>
                    </div>
                    <ProgressBar value={parseFloat(pct)} color={step.color} height={8} />
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ═══════════════ DELIVERY & ERRORS TAB ═══════════════ */}
      {activeTab === "delivery" && (
        <>
          {/* Delivery KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
            {[
              { label: "Delivery Rate", value: `${((data.totals.delivered/data.totals.sent)*100).toFixed(1)}%`, color: "#00E676" },
              { label: "Failed Messages", value: data.totals.failed.toLocaleString(), color: "#FF3B30" },
              { label: "Avg Latency", value: "1.8s", color: "#00C9FF" },
              { label: "Error Rate", value: `${((data.totals.failed/data.totals.sent)*100).toFixed(2)}%`, color: "#FF6B35" },
            ].map((kpi, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderLeft: `4px solid ${kpi.color}`, borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{kpi.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Delivery status over time */}
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 22, marginBottom: 16 }}>
            <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Delivery Status Over Time</h3>
            <BarChart data={data.daily} color={(d) => {
              const rate = d.delivered / d.sent;
              return rate > 0.97 ? "#00E676" : rate > 0.94 ? "#FFD600" : "#FF3B30";
            }} height={180} valueKey="delivered" />
          </div>

          {/* Error codes + Latency */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 22 }}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Top Error Codes</h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Code", "Description", "Count", "Severity"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.errorCodes.map((err, i) => (
                    <tr key={i}>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.03)", color: "#fff", fontWeight: 700, fontSize: 13, fontFamily: "monospace" }}>{err.code}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{err.desc}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.03)", color: "#fff", fontSize: 13, fontWeight: 600 }}>{err.count.toLocaleString()}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                        <span style={{ background: err.severity === "error" ? "rgba(255,59,48,0.1)" : err.severity === "warning" ? "rgba(255,214,0,0.1)" : "rgba(0,201,255,0.1)", color: err.severity === "error" ? "#FF3B30" : err.severity === "warning" ? "#FFD600" : "#00C9FF", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{err.severity}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 22 }}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Latency Distribution</h3>
              {data.latency.map((l, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{l.bucket}</span>
                    <span style={{ color: l.color, fontSize: 13, fontWeight: 700 }}>{l.count}%</span>
                  </div>
                  <ProgressBar value={l.count} color={l.color} height={8} />
                </div>
              ))}
              <div style={{ marginTop: 20, padding: "12px 16px", background: "rgba(0,230,118,0.05)", border: "1px solid rgba(0,230,118,0.15)", borderRadius: 10 }}>
                <div style={{ fontSize: 12, color: "#00E676", fontWeight: 600 }}>✓ 90% of messages delivered under 3 seconds</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>Meets SLA target of &lt; 5s for 95% of messages</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════ RESPONSES TAB ═══════════════ */}
      {activeTab === "responses" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 22 }}>
              <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 15 }}>Response Types</h3>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                <DonutChart segments={data.responseTypes.map(r => ({ value: r.count, color: r.color }))} label="responses" />
              </div>
              {data.responseTypes.map(r => (
                <div key={r.type} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: r.color, flexShrink: 0 }} />
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, flex: 1 }}>{r.type}</span>
                  <span style={{ color: r.color, fontSize: 12, fontWeight: 700 }}>{r.count.toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 22 }}>
              <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 15 }}>Opt-Out Monitoring</h3>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 48, fontWeight: 900, color: data.totals.optOut / data.totals.delivered < 0.005 ? "#00E676" : "#FF6B35" }}>{((data.totals.optOut / data.totals.delivered) * 100).toFixed(2)}%</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Opt-out rate</div>
              </div>
              <div style={{ padding: "14px 16px", background: "rgba(0,230,118,0.05)", border: "1px solid rgba(0,230,118,0.15)", borderRadius: 10, marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#00E676", fontWeight: 600 }}>✓ Below industry average of 0.5%</div>
              </div>
              {[
                { label: "Total Opt-Outs", value: data.totals.optOut.toLocaleString() },
                { label: "Re-subscriptions (START)", value: Math.round(data.totals.optOut * 0.17).toLocaleString() },
                { label: "Help Requests", value: Math.round(data.totals.optOut * 0.45).toLocaleString() },
                { label: "Net Subscriber Change", value: `+${Math.round(data.totals.sent * 0.002).toLocaleString()}` },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{s.label}</span>
                  <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ═══════════════ CHANNELS TAB ═══════════════ */}
      {activeTab === "channels" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 16 }}>
            {data.channelBreakdown.map(ch => (
              <div key={ch.name} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderTop: `3px solid ${ch.color}`, borderRadius: 12, padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{ch.name}</span>
                  <span style={{ background: `${ch.color}22`, color: ch.color, borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700 }}>{ch.pct}%</span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 8 }}>{ch.value.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>messages in period</div>
                <ProgressBar value={ch.pct} color={ch.color} height={4} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* ═══════════════ TENANTS TAB ═══════════════ */}
      {activeTab === "tenants" && viewLevel === "sp" && (
        <>
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 22, marginBottom: 16 }}>
            <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Tenant Performance</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Tenant", "Messages", "Revenue", "Campaigns", "Contacts", "Delivery", "Open Rate", ""].map(h => (
                    <th key={h} style={{ textAlign: h === "Tenant" || h === "" ? "left" : "center", padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.tenantBreakdown.map(t => (
                  <tr key={t.id} style={{ cursor: "pointer" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 36, height: 36, background: `linear-gradient(135deg, ${t.color}, ${t.color}88)`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#000", fontSize: 13 }}>{t.logo}</div>
                        <div><div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{t.name}</div><div style={{ color: t.color, fontSize: 11 }}>{t.brand}</div></div>
                      </div>
                    </td>
                    <td style={{ textAlign: "center", padding: "14px", borderBottom: "1px solid rgba(255,255,255,0.04)", color: "#fff", fontWeight: 700 }}>{t.messages.toLocaleString()}</td>
                    <td style={{ textAlign: "center", padding: "14px", borderBottom: "1px solid rgba(255,255,255,0.04)", color: "#00E676", fontWeight: 700 }}>${t.revenue.toLocaleString()}</td>
                    <td style={{ textAlign: "center", padding: "14px", borderBottom: "1px solid rgba(255,255,255,0.04)", color: "#fff" }}>{t.campaigns}</td>
                    <td style={{ textAlign: "center", padding: "14px", borderBottom: "1px solid rgba(255,255,255,0.04)", color: "#fff" }}>{t.contacts.toLocaleString()}</td>
                    <td style={{ textAlign: "center", padding: "14px", borderBottom: "1px solid rgba(255,255,255,0.04)", color: t.deliveryRate > 96 ? "#00E676" : "#FFD600", fontWeight: 600 }}>{t.deliveryRate.toFixed(1)}%</td>
                    <td style={{ textAlign: "center", padding: "14px", borderBottom: "1px solid rgba(255,255,255,0.04)", color: "#fff" }}>{t.openRate.toFixed(1)}%</td>
                    <td style={{ padding: "14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <button onClick={() => setDrillTenant(t.id)} style={{ background: `${t.color}22`, border: `1px solid ${t.color}55`, borderRadius: 6, padding: "6px 12px", color: t.color, fontWeight: 700, cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>Drill Down →</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Revenue comparison */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {data.tenantBreakdown.map(t => (
              <div key={t.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderLeft: `4px solid ${t.color}`, borderRadius: 14, padding: 22 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 32, height: 32, background: `linear-gradient(135deg, ${t.color}, ${t.color}88)`, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#000", fontSize: 12 }}>{t.logo}</div>
                  <div><div style={{ color: "#fff", fontWeight: 700 }}>{t.name}</div><div style={{ color: t.color, fontSize: 11 }}>{t.brand}</div></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    { label: "Messages", value: t.messages.toLocaleString() },
                    { label: "Revenue", value: `$${t.revenue.toLocaleString()}` },
                    { label: "Delivery", value: `${t.deliveryRate.toFixed(1)}%` },
                    { label: "Open Rate", value: `${t.openRate.toFixed(1)}%` },
                  ].map(s => (
                    <div key={s.label}>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ═══════════════ CAMPAIGNS TAB ═══════════════ */}
      {activeTab === "campaigns" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 22 }}>
            <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Campaign Summary</h3>
            {[
              { label: "Total Campaigns", value: data.tenantBreakdown.reduce((s, t) => s + t.campaigns, 0), icon: "🚀", color: "#FF6B35" },
              { label: "Active Now", value: Math.round(data.tenantBreakdown.reduce((s, t) => s + t.campaigns, 0) * 0.37), icon: "🟢", color: "#00E676" },
              { label: "Completed", value: Math.round(data.tenantBreakdown.reduce((s, t) => s + t.campaigns, 0) * 0.55), icon: "✅", color: "#00C9FF" },
              { label: "Scheduled", value: Math.round(data.tenantBreakdown.reduce((s, t) => s + t.campaigns, 0) * 0.08), icon: "📅", color: "#E040FB" },
              { label: "Avg Revenue/Campaign", value: `$${Math.round(data.totals.revenue / Math.max(data.tenantBreakdown.reduce((s, t) => s + t.campaigns, 0), 1)).toLocaleString()}`, icon: "💵", color: "#FFD600" },
              { label: "AI-Generated Copy", value: "34%", icon: "🤖", color: "#7C4DFF" },
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < 5 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: `${item.color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{item.icon}</div>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, flex: 1 }}>{item.label}</span>
                <span style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>{typeof item.value === "number" ? item.value.toLocaleString() : item.value}</span>
              </div>
            ))}
          </div>

          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 22 }}>
            <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Top Performing Campaigns</h3>
            {[
              { name: "Flash Sale Alert", tenant: "RetailCo", channel: "SMS", sent: 45200, openRate: 94.2, clickRate: 22.1, color: "#00E676" },
              { name: "Account Verification", tenant: "FinServ", channel: "SMS", sent: 38400, openRate: 98.1, clickRate: 8.2, color: "#7C4DFF" },
              { name: "Weekly Newsletter", tenant: "Acme Corp", channel: "Email", sent: 24100, openRate: 42.8, clickRate: 12.4, color: "#FF6B35" },
              { name: "Abandoned Cart", tenant: "RetailCo", channel: "WhatsApp", sent: 18600, openRate: 72.4, clickRate: 31.2, color: "#25D366" },
              { name: "Product Launch RCS", tenant: "Acme Corp", channel: "RCS", sent: 12800, openRate: 68.9, clickRate: 28.7, color: "#E040FB" },
            ].map((c, i) => (
              <div key={i} style={{ padding: "14px 0", borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div>
                    <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{c.name}</span>
                    <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginLeft: 8 }}>{c.tenant}</span>
                  </div>
                  <span style={{ background: `${CHANNEL_COLORS[c.channel]}22`, color: CHANNEL_COLORS[c.channel], borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{c.channel}</span>
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>Sent: <strong style={{ color: "#fff" }}>{c.sent.toLocaleString()}</strong></span>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>Open: <strong style={{ color: "#00E676" }}>{c.openRate}%</strong></span>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>Click: <strong style={{ color: C.accent }}>{c.clickRate}%</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════ AI PERFORMANCE TAB ═══════════════ */}
      {activeTab === "ai" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 22 }}>
            <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 15 }}>AI Chatbot Metrics</h3>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 56, fontWeight: 900, background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>94.2%</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Automated Resolution Rate</div>
            </div>
            {[
              { label: "Total Conversations", value: "42,847", icon: "💬" },
              { label: "Avg Response Time", value: "0.3s", icon: "⚡" },
              { label: "Escalated to Human", value: "5.8%", icon: "🙋" },
              { label: "Customer Satisfaction", value: "4.7 / 5.0", icon: "⭐" },
              { label: "Avg Conversation Length", value: "4.2 msgs", icon: "📏" },
              { label: "Cost Savings vs Human", value: "$28,400", icon: "💵" },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ fontSize: 16, width: 24 }}>{s.icon}</span>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, flex: 1 }}>{s.label}</span>
                <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{s.value}</span>
              </div>
            ))}
          </div>

          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 22 }}>
            <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 15 }}>Top Intents Detected</h3>
            {[
              { intent: "Order Status", count: 12840, pct: 30, color: "#00C9FF" },
              { intent: "Product Information", count: 8420, pct: 20, color: "#E040FB" },
              { intent: "Return / Refund", count: 6210, pct: 14, color: "#FF6B35" },
              { intent: "Billing Question", count: 4890, pct: 11, color: "#FFD600" },
              { intent: "Account Support", count: 3640, pct: 8, color: "#00E676" },
              { intent: "Scheduling", count: 2780, pct: 6, color: "#7C4DFF" },
              { intent: "Complaint", count: 1920, pct: 4, color: "#FF3B30" },
              { intent: "Other", count: 2147, pct: 5, color: "#6B8BAE" },
            ].map(item => (
              <div key={item.intent} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{item.intent}</span>
                  <span style={{ fontSize: 12 }}><span style={{ color: item.color, fontWeight: 700 }}>{item.pct}%</span> <span style={{ color: "rgba(255,255,255,0.2)" }}>({item.count.toLocaleString()})</span></span>
                </div>
                <ProgressBar value={item.pct} color={item.color} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════ REVENUE TAB ═══════════════ */}
      {activeTab === "revenue" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
            {[
              { label: "Total Revenue", value: `$${data.totals.revenue.toLocaleString()}`, color: "#00E676", icon: "💰" },
              { label: "MRR", value: `$${Math.round(data.totals.revenue / Math.max(data.days / 30, 1)).toLocaleString()}`, color: "#00C9FF", icon: "📈" },
              { label: "Avg Revenue / Message", value: `$${(data.totals.revenue / data.totals.sent).toFixed(4)}`, color: C.accent, icon: "📊" },
              { label: "Projected Annual", value: `$${Math.round((data.totals.revenue / data.days) * 365).toLocaleString()}`, color: "#FFD600", icon: "🎯" },
            ].map((kpi, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderTop: `3px solid ${kpi.color}`, borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1 }}>{kpi.label}</span>
                  <span style={{ fontSize: 16 }}>{kpi.icon}</span>
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginTop: 6 }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 22, marginBottom: 16 }}>
            <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Revenue Over Time</h3>
            <BarChart data={data.daily} color="#00E676" height={200} valueKey="revenue" format={v => `$${v.toLocaleString()}`} />
          </div>

          {viewLevel === "sp" && (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 22 }}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Revenue by Tenant</h3>
              {data.tenantBreakdown.map(t => {
                const maxRev = Math.max(...data.tenantBreakdown.map(x => x.revenue));
                return (
                  <div key={t.id} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 24, height: 24, background: `linear-gradient(135deg, ${t.color}, ${t.color}88)`, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#000", fontSize: 9 }}>{t.logo}</div>
                        <span style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{t.name}</span>
                      </div>
                      <span style={{ color: t.color, fontSize: 14, fontWeight: 700 }}>${t.revenue.toLocaleString()}</span>
                    </div>
                    <ProgressBar value={t.revenue} max={maxRev} color={t.color} height={10} />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
