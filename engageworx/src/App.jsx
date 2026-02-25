
// ─── TENANT DATA ──────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import AgentInbox from './AgentInbox';
import FlowBuilder from './FlowBuilder';
import ChatbotConfig from './ChatbotConfig';
import DemoMode from './DemoMode';
import WhiteLabelBranding from './WhiteLabelBranding';
import LandingPage from './components/LandingPage';
import TCRRegistration from './TCRRegistration';
import NLCampaignBuilder from './NLCampaignBuilder';
import ContactManager from './ContactManager';
import AnalyticsDashboard from './AnalyticsDashboard';
import SignupPage from './SignupPage';
import AdminTenants from './AdminTenants';
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

// ─── TENANT MANAGEMENT (White-label config) ───────────────────────────────────
function TenantManagement({ C }) {
  const [activeTab, setActiveTab] = useState("tenants");
  const [showNew, setShowNew] = useState(false);

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

      {activeTab === "branding" && <WhiteLabelBranding tenantId="sp_root" />}

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
  const C = tenant.colors;
  const [page, setPage] = useState("dashboard");

  const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "⊞" },
  { id: "campaigns", label: "Campaigns", icon: "🚀" },
  { id: "flows", label: "Flow Builder", icon: "⚡" },
  { id: "chatbot", label: "AI Chatbot", icon: "🤖" },
  { id: "inbox", label: "Live Inbox", icon: "💬" },
  { id: "analytics", label: "Analytics", icon: "📊" },
  { id: "contacts", label: "Contacts", icon: "👥" },
  { id: "registration", label: "Registration", icon: "📋" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', sans-serif" }}>
      {/* White-labeled Sidebar */}
      <div style={{ width: 220, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", padding: "24px 16px", flexShrink: 0 }}>
        <div style={{ marginBottom: 28, paddingLeft: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{tenant.brand.name}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Powered by EngageWorx</div>
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

        {page === "analytics" && (
  <AnalyticsDashboard tenantId={tenantId} />
)}
        {page === "chatbot" && (
  <ChatbotConfig tenantId={tenantId} />
)}
        {page === "flows" && (
  <FlowBuilder tenantId={tenantId} />
)}
        {page === "registration" && (
  <TCRRegistration tenantId={tenantId} />
)}
        {page === "contacts" && (
  <ContactManager tenantId={tenantId} />
)}
              {page === "campaigns" && (
          <NLCampaignBuilder tenantId={tenantId} />
        )}

        {page === "inbox" && (
          <AgentInbox tenantId={tenantId} />
        )}

      {page !== "dashboard" && page !== "inbox" && page !== "campaigns" && page !== "analytics" && page !== "contacts" && page !== "chatbot" && page !== "registration" && page !== "flows" && (
          <div style={{ padding: "32px 36px" }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>{navItems.find(n => n.id === page)?.label}</h1>
            <p style={{ color: C.muted, fontSize: 14 }}>Manage your {page} within {tenant.brand.name}</p>
            <div style={{ marginTop: 24, background: `${C.primary}08`, border: `1px solid ${C.primary}22`, borderRadius: 14, padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{navItems.find(n => n.id === page)?.icon}</div>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 18 }}>{navItems.find(n => n.id === page)?.label} Module</div>
              <div style={{ color: C.muted, marginTop: 8 }}>Fully white-labeled — branded as {tenant.brand.name}</div>
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
  // Check for signup success redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("signup") === "success") {
      setView("signup");
    }
  }, []);

  // Check if we're on /landing
if (window.location.pathname === '/landing') {
  return <LandingPage />;
}
  const C = TENANTS.serviceProvider.colors;

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
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ width: 480 }}>
          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#fff" }}>Engage<span style={{ color: C.primary }}>Worx</span></div>
            <div style={{ color: C.muted, marginTop: 6 }}>Multi-Tenant Communications Platform</div>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 40 }}>
            <h2 style={{ color: "#fff", margin: "0 0 8px", textAlign: "center", fontSize: 22 }}>Select Portal</h2>
            <p style={{ color: C.muted, textAlign: "center", marginBottom: 28, fontSize: 14 }}>Choose your access level to continue</p>

            {/* Role Selection */}
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
              <span style={{ color: C.muted, fontSize: 14 }}>New to EngageWorx? </span>
              <button onClick={() => setView("signup")} style={{ background: "none", border: "none", color: C.primary, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                Sign Up →
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
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>Engage<span style={{ color: C.primary }}>Worx</span></div>
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

        <button onClick={() => setView("login")} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px", color: C.muted, cursor: "pointer", fontSize: 12, marginBottom: 12 }}>← Switch Portal</button>

        <div style={{ padding: "14px", marginBottom: 16, background: C.bg, borderRadius: 10, border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#000" }}>EW</div>
            <div>
              <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>EngageWorx Admin</div>
              <div style={{ color: C.muted, fontSize: 11 }}>Service Provider</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, marginLeft: 240, overflowY: "auto" }}>
        {spPage === "dashboard" && <SuperAdminDashboard tenant={TENANTS.serviceProvider} onDrillDown={(id) => setDrillDownTenant(id)} C={C} />}
        {spPage === "tenants" && <TenantManagement C={C} />}
        {["analytics", "api", "settings"].includes(spPage) && (
          <div style={{ padding: "32px 40px" }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>{spNavItems.find(n => n.id === spPage)?.label}</h1>
            <p style={{ color: C.muted }}>Full {spPage} module available here</p>
            <DemoMode />
          </div>
        )}
      </div>
    </div>
  );
}
