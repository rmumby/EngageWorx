// ─── TENANT DATA ──────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from './AuthContext';
import SignupPage from './SignupPage';
import AdminTenants from './AdminTenants';
import AnalyticsDashboard from './AnalyticsDashboard';
import CampaignsModule from './CampaignsModule';
import ContactsModule from './ContactsModule';
import LiveInbox from './LiveInbox';
import AIChatbot from './AIChatbot';
import FlowBuilder from './FlowBuilder';
import Settings from './Settings';
import Registration from './Registration';
import LandingPage from './components/LandingPage';

const TENANTS = {
  serviceProvider: {
    id: "sp_root",
    name: "EngageWorx",
    logo: "EW",
    role: "superadmin",
    colors: { primary: "#00C9FF", accent: "#E040FB", bg: "#080d1a", surface: "#0d1425", border: "#182440", text: "#E8F4FD", muted: "#6B8BAE" },
    customers: ["acme", "retailco", "finserv"],
    stats: { totalMessages: 1284712, totalRevenue: 892450, activeCustomers: 3, totalCampaigns: 87 },
  },
  acme: {
    id: "acme",
    name: "Acme Corp",
    logo: "AC",
    role: "customer",
    brand: { primary: "#FF6B35", secondary: "#FF8C42", name: "AcmeEngage" },
    colors: { primary: "#FF6B35", accent: "#FF8C42", bg: "#0c0a10", surface: "#141018", border: "#2a1f30", text: "#FFF0E8", muted: "#8B6B55" },
    stats: { messages: 284712, revenue: 128450, campaigns: 24, contacts: 48200, deliveryRate: 95.3, openRate: 51.2 },
    channels: ["SMS", "Email", "WhatsApp"],
  },
  retailco: {
    id: "retailco",
    name: "RetailCo",
    logo: "RC",
    role: "customer",
    brand: { primary: "#00E676", secondary: "#00BFA5", name: "RetailReach" },
    colors: { primary: "#00E676", accent: "#00BFA5", bg: "#080d10", surface: "#0d1518", border: "#122a20", text: "#E8FFF2", muted: "#4B8B65" },
    stats: { messages: 612340, revenue: 441200, campaigns: 38, contacts: 124000, deliveryRate: 97.1, openRate: 44.8 },
    channels: ["SMS", "MMS", "Email", "RCS"],
  },
  finserv: {
    id: "finserv",
    name: "FinServ Group",
    logo: "FS",
    role: "customer",
    brand: { primary: "#7C4DFF", secondary: "#651FFF", name: "FinConnect" },
    colors: { primary: "#7C4DFF", accent: "#651FFF", bg: "#0a0810", surface: "#110e1c", border: "#1e1535", text: "#EDE8FF", muted: "#6B5B8B" },
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginBottom: 32 }}>
        <StatCard label="Total Messages Sent" value="1.28M" sub="Across all tenants" color={C.primary} icon="📨" />
        <StatCard label="Platform Revenue" value="$892,450" sub="+18.4% this month" color="#00E676" icon="💰" />
        <StatCard label="Active Customers" value="3" sub="All tenants healthy" color={C.accent} icon="🏢" />
        <StatCard label="Total Campaigns" value="87" sub="32 currently live" color="#FF6B35" icon="🚀" />
      </div>

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
  const [showDemoForm, setShowDemoForm] = useState(false);
  const [demoForm, setDemoForm] = useState({ email: "", password: "demo1234", companyName: "", brandColor: "#00C9FF", plan: "starter", expiresIn: "7" });
  const [demoCreating, setDemoCreating] = useState(false);
  const [demoResult, setDemoResult] = useState(null);
  const [editingBrand, setEditingBrand] = useState(null);
  const [brandForm, setBrandForm] = useState({ name: "", primary: "", secondary: "", logo: "" });
  const [configuringTenant, setConfiguringTenant] = useState(null);
  const [suspendedTenants, setSuspendedTenants] = useState({});
  const [confirmSuspend, setConfirmSuspend] = useState(null);

  const inputStyleTM = { width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 13, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" };
  const themePresets = [
    { name: "Sunset", primary: "#FF6B35", secondary: "#FF8C42" },
    { name: "Emerald", primary: "#00E676", secondary: "#00BFA5" },
    { name: "Violet", primary: "#7C4DFF", secondary: "#651FFF" },
    { name: "Ocean", primary: "#00C9FF", secondary: "#0091EA" },
    { name: "Ruby", primary: "#FF3B30", secondary: "#FF6B6B" },
    { name: "Gold", primary: "#FFD600", secondary: "#FFAB00" },
    { name: "Coral", primary: "#E040FB", secondary: "#AA00FF" },
    { name: "Slate", primary: "#6B8BAE", secondary: "#4A6FA5" },
  ];

  const openBrandEditor = (tenant) => {
    setEditingBrand(tenant.id);
    setBrandForm({ name: tenant.brand.name, primary: tenant.brand.primary, secondary: tenant.brand.secondary, logo: "" });
  };

  return (
    <div style={{ padding: "32px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>Tenant Management</h1>
          <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>Manage white-label customers, branding & access</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { setShowDemoForm(true); setShowNew(false); }} style={{ background: `${C.accent}22`, border: `1px solid ${C.accent}55`, borderRadius: 10, padding: "12px 20px", color: C.accent, fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
            🎮 Create Demo Account
          </button>
          <button onClick={() => { setShowNew(true); setShowDemoForm(false); }} style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, border: "none", borderRadius: 10, padding: "12px 24px", color: "#000", fontWeight: 700, cursor: "pointer" }}>
            + New Tenant
          </button>
        </div>
      </div>

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
          {/* Demo Account Creator */}
          {showDemoForm && (
            <div style={{ background: `${C.accent}08`, border: `1px solid ${C.accent}33`, borderRadius: 14, padding: 28, marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <h3 style={{ color: "#fff", margin: "0 0 4px" }}>🎮 Create Demo Account</h3>
                  <p style={{ color: C.muted, margin: 0, fontSize: 12 }}>Generate credentials for a prospect to explore the platform with demo data</p>
                </div>
                <button onClick={() => { setShowDemoForm(false); setDemoResult(null); }} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 14px", color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>✕ Close</button>
              </div>

              {demoResult ? (
                <div style={{ background: "#00E67612", border: "1px solid #00E67633", borderRadius: 12, padding: 24 }}>
                  <div style={{ color: "#00E676", fontWeight: 700, fontSize: 15, marginBottom: 12 }}>✓ Demo Account Created</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Login Email</div>
                      <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, fontFamily: "monospace" }}>{demoResult.email}</div>
                    </div>
                    <div>
                      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Password</div>
                      <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, fontFamily: "monospace" }}>{demoResult.password}</div>
                    </div>
                    <div>
                      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Portal URL</div>
                      <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, fontFamily: "monospace" }}>portal.engwx.com</div>
                    </div>
                    <div>
                      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Company</div>
                      <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14 }}>{demoResult.company}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                    <button onClick={() => { navigator.clipboard.writeText(`Portal: portal.engwx.com\nEmail: ${demoResult.email}\nPassword: ${demoResult.password}`); }} style={{ background: `${C.primary}22`, border: `1px solid ${C.primary}44`, borderRadius: 8, padding: "8px 18px", color: C.primary, fontWeight: 700, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>📋 Copy Credentials</button>
                    <button onClick={() => { setDemoResult(null); setDemoForm({ email: "", password: "demo1234", companyName: "", brandColor: "#00C9FF", plan: "starter", expiresIn: "7" }); }} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 18px", color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>+ Create Another</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                    <div>
                      <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Prospect Email</label>
                      <input value={demoForm.email} onChange={e => setDemoForm(p => ({ ...p, email: e.target.value }))} placeholder="prospect@company.com" style={inputStyleTM} />
                    </div>
                    <div>
                      <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Password</label>
                      <input value={demoForm.password} onChange={e => setDemoForm(p => ({ ...p, password: e.target.value }))} placeholder="demo1234" style={inputStyleTM} />
                    </div>
                    <div>
                      <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Company Name</label>
                      <input value={demoForm.companyName} onChange={e => setDemoForm(p => ({ ...p, companyName: e.target.value }))} placeholder="Prospect Corp" style={inputStyleTM} />
                    </div>
                    <div>
                      <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Brand Color</label>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input type="color" value={demoForm.brandColor} onChange={e => setDemoForm(p => ({ ...p, brandColor: e.target.value }))} style={{ width: 40, height: 36, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, cursor: "pointer", background: "transparent" }} />
                        <input value={demoForm.brandColor} onChange={e => setDemoForm(p => ({ ...p, brandColor: e.target.value }))} style={{ ...inputStyleTM, fontFamily: "monospace" }} />
                      </div>
                    </div>
                    <div>
                      <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Plan</label>
                      <select value={demoForm.plan} onChange={e => setDemoForm(p => ({ ...p, plan: e.target.value }))} style={{ ...inputStyleTM, cursor: "pointer" }}>
                        <option value="starter">Starter ($299/mo)</option>
                        <option value="growth">Growth ($799/mo)</option>
                        <option value="enterprise">Enterprise (Custom)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Access Duration</label>
                      <select value={demoForm.expiresIn} onChange={e => setDemoForm(p => ({ ...p, expiresIn: e.target.value }))} style={{ ...inputStyleTM, cursor: "pointer" }}>
                        <option value="3">3 days</option>
                        <option value="7">7 days</option>
                        <option value="14">14 days</option>
                        <option value="30">30 days</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                    <button onClick={async () => {
                      if (!demoForm.email || !demoForm.companyName) return;
                      setDemoCreating(true);
                      try {
                        const { supabase } = await import('./supabaseClient');
                        const slug = demoForm.companyName.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-demo";
                        const { data: tenant, error: tErr } = await supabase.from("tenants").insert({
                          name: demoForm.companyName, slug, brand_primary: demoForm.brandColor,
                          brand_name: demoForm.companyName, plan: demoForm.plan, status: "trial",
                          channels_enabled: ["sms", "email", "whatsapp", "rcs"],
                        }).select().single();
                        if (tErr) throw tErr;
                        const { data: authData, error: aErr } = await supabase.auth.admin?.createUser?.({
                          email: demoForm.email, password: demoForm.password,
                          email_confirm: true,
                          user_metadata: { full_name: "Demo User", company_name: demoForm.companyName },
                        }) || await supabase.auth.signUp({
                          email: demoForm.email, password: demoForm.password,
                          options: { data: { full_name: "Demo User", company_name: demoForm.companyName } },
                        });
                        if (aErr) throw aErr;
                        const userId = authData?.user?.id;
                        if (userId) {
                          await supabase.from("user_profiles").update({
                            tenant_id: tenant.id, role: "admin", company_name: demoForm.companyName,
                          }).eq("id", userId);
                          await supabase.from("tenant_members").insert({
                            tenant_id: tenant.id, user_id: userId, role: "admin", status: "active", joined_at: new Date().toISOString(),
                          });
                        }
                        setDemoResult({ email: demoForm.email, password: demoForm.password, company: demoForm.companyName, tenantId: tenant.id });
                      } catch (err) { alert("Error: " + err.message); }
                      setDemoCreating(false);
                    }} disabled={demoCreating || !demoForm.email || !demoForm.companyName} style={{
                      background: `linear-gradient(135deg, ${C.accent}, ${C.primary})`, border: "none", borderRadius: 8, padding: "10px 22px",
                      color: "#000", fontWeight: 700, cursor: demoCreating ? "wait" : "pointer", fontSize: 13,
                      fontFamily: "'DM Sans', sans-serif", opacity: demoCreating ? 0.7 : 1,
                    }}>{demoCreating ? "Creating..." : "🎮 Create Demo Account"}</button>
                    <button onClick={() => setShowDemoForm(false)} style={{ background: "transparent", border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 8, padding: "10px 22px", color: C.muted, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
                  </div>
                </>
              )}
            </div>
          )}

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
            {Object.values(TENANTS).filter(t => t.role === "customer").map(c => {
              const isSuspended = suspendedTenants[c.id];
              const isConfiguring = configuringTenant === c.id;
              return (
              <div key={c.id}>
                <div style={{ background: isConfiguring ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.03)", border: `1px solid ${isConfiguring ? C.primary + "44" : "rgba(255,255,255,0.07)"}`, borderLeft: `4px solid ${isSuspended ? "#FF3B30" : c.brand.primary}`, borderRadius: 12, padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 240px", alignItems: "center", gap: 20, opacity: isSuspended ? 0.6 : 1, transition: "all 0.2s" }}>
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
                <div><Badge color={isSuspended ? "#FF3B30" : "#00E676"}>{isSuspended ? "⏸ Suspended" : "● Active"}</Badge></div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setConfiguringTenant(isConfiguring ? null : c.id)} style={{ background: isConfiguring ? C.primary : `${c.brand.primary}22`, border: `1px solid ${isConfiguring ? C.primary : c.brand.primary + "55"}`, borderRadius: 7, padding: "7px 14px", color: isConfiguring ? "#000" : c.brand.primary, fontWeight: 700, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{isConfiguring ? "Close" : "Configure"}</button>
                  {confirmSuspend === c.id ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => { setSuspendedTenants(prev => ({ ...prev, [c.id]: !isSuspended })); setConfirmSuspend(null); }} style={{ background: isSuspended ? "#00E67622" : "#FF3B3022", border: `1px solid ${isSuspended ? "#00E67644" : "#FF3B3044"}`, borderRadius: 7, padding: "7px 10px", color: isSuspended ? "#00E676" : "#FF3B30", fontWeight: 700, cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{isSuspended ? "Reactivate" : "Confirm"}</button>
                      <button onClick={() => setConfirmSuspend(null)} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "7px 8px", color: C.muted, cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmSuspend(c.id)} style={{ background: "transparent", border: `1px solid ${isSuspended ? "#00E67644" : "rgba(255,255,255,0.1)"}`, borderRadius: 7, padding: "7px 14px", color: isSuspended ? "#00E676" : C.muted, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{isSuspended ? "Reactivate" : "Suspend"}</button>
                  )}
                </div>
                </div>

                {/* Inline Configure Panel */}
                {isConfiguring && (
                  <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.primary}33`, borderRadius: "0 0 12px 12px", borderTop: "none", padding: "20px 24px", marginTop: -1 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>Tenant Name</div>
                        <input defaultValue={c.name} style={inputStyleTM} />
                      </div>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>Admin Email</div>
                        <input defaultValue={`admin@${c.name.toLowerCase().replace(/\s/g, "")}.com`} style={inputStyleTM} />
                      </div>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>Plan</div>
                        <select defaultValue="growth" style={inputStyleTM}><option value="starter">Starter ($299/mo)</option><option value="growth">Growth ($799/mo)</option><option value="enterprise">Enterprise (Custom)</option></select>
                      </div>
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: 700 }}>Active Channels</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {["SMS", "Email", "WhatsApp", "RCS", "MMS", "Voice"].map(ch => (
                          <label key={ch} style={{ display: "flex", alignItems: "center", gap: 4, background: c.channels.includes(ch) ? `${c.brand.primary}15` : "rgba(255,255,255,0.03)", border: `1px solid ${c.channels.includes(ch) ? c.brand.primary + "44" : "rgba(255,255,255,0.08)"}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, color: c.channels.includes(ch) ? c.brand.primary : "rgba(255,255,255,0.4)" }}>
                            <input type="checkbox" defaultChecked={c.channels.includes(ch)} style={{ accentColor: c.brand.primary }} /> {ch}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>Message Limit</div>
                        <input type="number" defaultValue={250000} style={inputStyleTM} />
                      </div>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>Contact Limit</div>
                        <input type="number" defaultValue={100000} style={inputStyleTM} />
                      </div>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>User Seats</div>
                        <input type="number" defaultValue={10} style={inputStyleTM} />
                      </div>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>API Rate Limit</div>
                        <select style={inputStyleTM}><option>100 req/sec</option><option>50 req/sec</option><option>200 req/sec</option><option>Unlimited</option></select>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => setConfiguringTenant(null)} style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, border: "none", borderRadius: 8, padding: "8px 18px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>Save Changes</button>
                      <button onClick={() => { openBrandEditor(c); setActiveTab("branding"); setConfiguringTenant(null); }} style={{ background: `${c.brand.primary}22`, border: `1px solid ${c.brand.primary}44`, borderRadius: 8, padding: "8px 18px", color: c.brand.primary, fontWeight: 600, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>🎨 Edit Branding</button>
                      <button onClick={() => setConfiguringTenant(null)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 18px", color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "branding" && (
        <div>
          {/* Brand Editor Panel */}
          {editingBrand && (
            <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${C.primary}44`, borderRadius: 14, padding: 28, marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h3 style={{ color: "#fff", margin: 0, fontSize: 18 }}>Edit Brand — {Object.values(TENANTS).find(t => t.id === editingBrand)?.name}</h3>
                <button onClick={() => setEditingBrand(null)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 14px", color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>✕ Close</button>
              </div>

              {/* Theme Presets */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, fontWeight: 700 }}>Theme Presets</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {themePresets.map(p => (
                    <button key={p.name} onClick={() => setBrandForm(prev => ({ ...prev, primary: p.primary, secondary: p.secondary }))} style={{
                      background: brandForm.primary === p.primary ? `${p.primary}22` : "rgba(255,255,255,0.03)",
                      border: `2px solid ${brandForm.primary === p.primary ? p.primary : "rgba(255,255,255,0.06)"}`,
                      borderRadius: 10, padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                      fontFamily: "'DM Sans', sans-serif",
                    }}>
                      <div style={{ display: "flex", gap: 3 }}>
                        <div style={{ width: 18, height: 18, borderRadius: 4, background: p.primary }} />
                        <div style={{ width: 18, height: 18, borderRadius: 4, background: p.secondary }} />
                      </div>
                      <span style={{ color: brandForm.primary === p.primary ? p.primary : "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 600 }}>{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Form Fields */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Brand Name</div>
                  <input value={brandForm.name} onChange={e => setBrandForm(prev => ({ ...prev, name: e.target.value }))} style={inputStyleTM} />
                </div>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Primary Color</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="color" value={brandForm.primary} onChange={e => setBrandForm(prev => ({ ...prev, primary: e.target.value }))} style={{ width: 44, height: 44, borderRadius: 8, border: "2px solid rgba(255,255,255,0.2)", cursor: "pointer", padding: 2 }} />
                    <input value={brandForm.primary} onChange={e => setBrandForm(prev => ({ ...prev, primary: e.target.value }))} style={{ ...inputStyleTM, flex: 1, fontFamily: "monospace" }} />
                  </div>
                </div>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Secondary Color</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="color" value={brandForm.secondary} onChange={e => setBrandForm(prev => ({ ...prev, secondary: e.target.value }))} style={{ width: 44, height: 44, borderRadius: 8, border: "2px solid rgba(255,255,255,0.2)", cursor: "pointer", padding: 2 }} />
                    <input value={brandForm.secondary} onChange={e => setBrandForm(prev => ({ ...prev, secondary: e.target.value }))} style={{ ...inputStyleTM, flex: 1, fontFamily: "monospace" }} />
                  </div>
                </div>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Logo</div>
                  {brandForm.logo ? (
                    <div style={{ position: "relative", width: 44, height: 44 }}>
                      <img src={brandForm.logo} alt="Logo" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "contain", background: "rgba(255,255,255,0.06)", border: "2px solid rgba(255,255,255,0.15)" }} />
                      <button onClick={() => setBrandForm(prev => ({ ...prev, logo: "" }))} style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "#FF3B30", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                    </div>
                  ) : (
                    <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 44, background: "rgba(255,255,255,0.03)", border: "2px dashed rgba(255,255,255,0.12)", borderRadius: 8, cursor: "pointer", transition: "all 0.15s" }}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.background = `${C.primary}10`; }}
                      onDragLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                      onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; const file = e.dataTransfer.files[0]; if (file && file.type.startsWith("image/")) { const reader = new FileReader(); reader.onload = ev => setBrandForm(prev => ({ ...prev, logo: ev.target.result })); reader.readAsDataURL(file); }}}
                    >
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = ev => setBrandForm(prev => ({ ...prev, logo: ev.target.result })); reader.readAsDataURL(file); }}} />
                      <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>📁 Upload</span>
                    </label>
                  )}
                </div>
              </div>

              {/* Logo Upload Area (expanded) */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, fontWeight: 700 }}>Logo Upload</div>
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <label style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", background: "rgba(255,255,255,0.03)", border: "2px dashed rgba(255,255,255,0.12)", borderRadius: 12, cursor: "pointer", transition: "all 0.2s", textAlign: "center" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = C.primary + "66"; e.currentTarget.style.background = `${C.primary}08`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.background = `${C.primary}15`; }}
                    onDragLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                    onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; const file = e.dataTransfer.files[0]; if (file && file.type.startsWith("image/")) { const reader = new FileReader(); reader.onload = ev => setBrandForm(prev => ({ ...prev, logo: ev.target.result })); reader.readAsDataURL(file); }}}
                  >
                    <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style={{ display: "none" }} onChange={e => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = ev => setBrandForm(prev => ({ ...prev, logo: ev.target.result })); reader.readAsDataURL(file); }}} />
                    <div style={{ fontSize: 28, marginBottom: 6 }}>📁</div>
                    <div style={{ color: "#fff", fontWeight: 600, fontSize: 13, marginBottom: 2 }}>Drop logo here or click to upload</div>
                    <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>PNG, JPG, SVG, or WebP · Max 2MB · Recommended 224×224px</div>
                  </label>
                  {brandForm.logo && (
                    <div style={{ textAlign: "center" }}>
                      <img src={brandForm.logo} alt="Logo preview" style={{ width: 80, height: 80, borderRadius: 12, objectFit: "contain", background: "rgba(255,255,255,0.06)", border: `2px solid ${brandForm.primary}44`, padding: 8 }} />
                      <div style={{ marginTop: 6 }}>
                        <button onClick={() => setBrandForm(prev => ({ ...prev, logo: "" }))} style={{ background: "#FF3B3022", border: "1px solid #FF3B3044", borderRadius: 6, padding: "3px 10px", color: "#FF3B30", cursor: "pointer", fontSize: 10, fontFamily: "'DM Sans', sans-serif" }}>Remove</button>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 8 }}>
                  <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, marginBottom: 4 }}>Or paste a URL:</div>
                  <input value={brandForm.logo && !brandForm.logo.startsWith("data:") ? brandForm.logo : ""} onChange={e => setBrandForm(prev => ({ ...prev, logo: e.target.value }))} placeholder="https://your-domain.com/logo.png" style={{ ...inputStyleTM, fontSize: 12 }} />
                </div>
              </div>

              {/* Live Preview */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, fontWeight: 700 }}>Live Preview</div>
                <div style={{ background: "#0a0a14", borderRadius: 12, padding: 20, border: `1px solid ${brandForm.primary}33` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    {brandForm.logo ? (
                      <img src={brandForm.logo} alt="Logo" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "contain", background: "rgba(255,255,255,0.06)" }} />
                    ) : (
                      <div style={{ width: 32, height: 32, background: `linear-gradient(135deg, ${brandForm.primary}, ${brandForm.secondary})`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#000", fontSize: 12 }}>{brandForm.name.slice(0, 2).toUpperCase()}</div>
                    )}
                    <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{brandForm.name || "Brand Name"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <div style={{ flex: 1, height: 6, background: brandForm.primary, borderRadius: 3 }} />
                    <div style={{ flex: 1, height: 6, background: brandForm.secondary, borderRadius: 3 }} />
                    <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3 }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <div style={{ background: brandForm.primary, borderRadius: 6, padding: "6px 16px", fontSize: 12, color: "#000", fontWeight: 700 }}>Primary Button</div>
                    <div style={{ background: "transparent", border: `1px solid ${brandForm.primary}`, borderRadius: 6, padding: "6px 16px", fontSize: 12, color: brandForm.primary, fontWeight: 600 }}>Secondary</div>
                    <div style={{ background: `${brandForm.primary}22`, borderRadius: 6, padding: "6px 16px", fontSize: 12, color: brandForm.primary }}>Ghost</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ background: `${brandForm.primary}18`, border: `1px solid ${brandForm.primary}33`, borderRadius: 8, padding: "8px 14px", flex: 1 }}>
                      <div style={{ color: brandForm.primary, fontSize: 11, fontWeight: 700 }}>Card Component</div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 2 }}>With branded accent</div>
                    </div>
                    <div style={{ background: `${brandForm.secondary}18`, border: `1px solid ${brandForm.secondary}33`, borderRadius: 8, padding: "8px 14px", flex: 1 }}>
                      <div style={{ color: brandForm.secondary, fontSize: 11, fontWeight: 700 }}>Secondary Card</div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 2 }}>With secondary accent</div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setEditingBrand(null)} style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, border: "none", borderRadius: 10, padding: "12px 24px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>💾 Save Branding</button>
                <button onClick={() => setEditingBrand(null)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 24px", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Tenant Brand Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {Object.values(TENANTS).filter(t => t.role === "customer").map(c => (
            <div key={c.id} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${editingBrand === c.id ? C.primary + "66" : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: 24, overflow: "hidden", transition: "border-color 0.2s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div style={{ width: 48, height: 48, background: `linear-gradient(135deg, ${c.brand.primary}, ${c.brand.secondary})`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#000", fontSize: 18 }}>{c.logo}</div>
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{c.name}</div>
                  <div style={{ color: c.brand.primary, fontSize: 13 }}>{c.brand.name}</div>
                </div>
              </div>
              <div style={{ background: "#000", borderRadius: 10, padding: 16, marginBottom: 16, border: `1px solid ${c.brand.primary}33` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 24, height: 24, background: c.brand.primary, borderRadius: 5 }} />
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{c.brand.name}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1, height: 6, background: c.brand.primary, borderRadius: 3 }} />
                  <div style={{ flex: 1, height: 6, background: c.brand.secondary + "66", borderRadius: 3 }} />
                  <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3 }} />
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                  <div style={{ background: c.brand.primary, borderRadius: 5, padding: "4px 12px", fontSize: 11, color: "#000", fontWeight: 700 }}>Button</div>
                  <div style={{ background: "transparent", border: `1px solid ${c.brand.primary}`, borderRadius: 5, padding: "4px 12px", fontSize: 11, color: c.brand.primary }}>Outline</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: "Primary", color: c.brand.primary },
                  { label: "Secondary", color: c.brand.secondary },
                ].map(sw => (
                  <div key={sw.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, background: sw.color, borderRadius: 6, border: "2px solid rgba(255,255,255,0.2)" }} />
                    <div>
                      <div style={{ color: "#fff", fontSize: 12 }}>{sw.label}</div>
                      <div style={{ color: C.muted, fontSize: 11 }}>{sw.color}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => openBrandEditor(c)} style={{ marginTop: 14, width: "100%", background: `${c.brand.primary}22`, border: `1px solid ${c.brand.primary}55`, borderRadius: 8, padding: "9px", color: c.brand.primary, fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Edit Brand Settings</button>
            </div>
          ))}
          </div>
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

        {page === "campaigns" && (
          <CampaignsModule C={C} tenants={TENANTS} viewLevel="tenant" currentTenantId={tenantId} />
        )}

        {page === "analytics" && (
          <AnalyticsDashboard C={C} tenants={TENANTS} viewLevel="tenant" currentTenantId={tenantId} />
        )}

        {page === "contacts" && (
          <ContactsModule C={C} tenants={TENANTS} viewLevel="tenant" currentTenantId={tenantId} />
        )}

        {page === "inbox" && (
          <LiveInbox C={C} tenants={TENANTS} viewLevel="tenant" currentTenantId={tenantId} />
        )}

        {page === "chatbot" && (
          <AIChatbot C={C} tenants={TENANTS} viewLevel="tenant" currentTenantId={tenantId} />
        )}

        {page === "flows" && (
          <FlowBuilder C={C} tenants={TENANTS} viewLevel="tenant" currentTenantId={tenantId} />
        )}

        {page === "settings" && (
          <Settings C={C} tenants={TENANTS} viewLevel="tenant" currentTenantId={tenantId} />
        )}

        {page === "registration" && (
          <Registration C={C} tenants={TENANTS} viewLevel="tenant" currentTenantId={tenantId} />
        )}

        {page !== "dashboard" && page !== "campaigns" && page !== "analytics" && page !== "contacts" && page !== "inbox" && page !== "chatbot" && page !== "flows" && page !== "settings" && page !== "registration" && (
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
function AppInner() {
  const { user, profile, loading, demoMode, toggleDemoMode, signIn, signUp, signOut, resetPassword, authError, isSuperAdmin, isAuthenticated } = useAuth();
  const [view, setView] = useState("login");
  const [selectedRole, setSelectedRole] = useState(null);
  const [drillDownTenant, setDrillDownTenant] = useState(null);
  const [spPage, setSpPage] = useState("dashboard");
  const [loginTab, setLoginTab] = useState("login"); // "login" | "signup" | "reset" | "demo"
  const [loginForm, setLoginForm] = useState({ email: "", password: "", fullName: "", companyName: "" });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginMessage, setLoginMessage] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    
    // Handle return from Stripe checkout
    if (params.get("checkout") === "success" || params.get("signup") === "success") {
      window.history.replaceState({}, "", window.location.pathname);
      
      // Check if we have signup data from before checkout
      const signupRaw = sessionStorage.getItem("ewx_signup");
      if (signupRaw) {
        const signupData = JSON.parse(signupRaw);
        sessionStorage.removeItem("ewx_signup");
        
        // Create the Supabase user account now
        (async () => {
          try {
            const { data: authData, error: authError } = await supabase.auth.signUp({
              email: signupData.email,
              password: signupData.password,
              options: {
                data: {
                  full_name: signupData.fullName,
                  company_name: signupData.companyName,
                }
              }
            });
            
            if (authError) {
              console.error("Post-checkout signup error:", authError);
              setLoginMessage({ type: "error", text: "Payment received! But account creation failed: " + authError.message + ". Please contact support@engwx.com" });
              return;
            }

            // Create tenant with service role key via API
            setLoginMessage({ type: "success", text: "🎉 Payment received! Your account is ready. Please sign in." });
            setLoginTab("login");
            setLoginForm(p => ({ ...p, email: signupData.email, password: "" }));
            
            // Sign out immediately so user can sign in fresh
            await supabase.auth.signOut();
          } catch (err) {
            console.error("Post-checkout error:", err);
            setLoginMessage({ type: "success", text: "🎉 Payment received! Please sign in with your credentials." });
          }
        })();
      } else {
        setLoginMessage({ type: "success", text: "🎉 Payment received! Please sign in." });
      }
    }
  }, []);

  // Auto-route authenticated users directly to their portal
  useEffect(() => {
    if (isAuthenticated && profile && view === "login") {
      if (profile.role === "superadmin") {
        setView("sp");
      } else if (profile.tenant_id) {
        setView("tenant_" + profile.tenant_id);
      }
    }
  }, [isAuthenticated, profile, view]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginMessage(null);
    const { error } = await signIn({ email: loginForm.email, password: loginForm.password });
    if (error) setLoginMessage({ type: "error", text: error });
    setLoginLoading(false);
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginMessage(null);
    const { error } = await signUp({
      email: loginForm.email,
      password: loginForm.password,
      fullName: loginForm.fullName,
      companyName: loginForm.companyName,
    });
    if (error) {
      setLoginMessage({ type: "error", text: error });
    } else {
      setLoginMessage({ type: "success", text: "Account created! Check your email for a confirmation link. Once confirmed, you'll be taken directly to your portal." });
      setLoginTab("login");
    }
    setLoginLoading(false);
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginMessage(null);
    const { error } = await resetPassword(loginForm.email);
    if (error) {
      setLoginMessage({ type: "error", text: error });
    } else {
      setLoginMessage({ type: "success", text: "Password reset email sent!" });
    }
    setLoginLoading(false);
  };

  const handleLogout = async () => {
    toggleDemoMode(false);
    await signOut();
    setView("login");
    setLoginTab("login");
    setSpPage("dashboard");
  };

  const C = TENANTS.serviceProvider.colors;

  const spNavItems = [
    { id: "dashboard", label: "Platform Overview", icon: "⊞" },
    { id: "tenants", label: "Tenant Management", icon: "🏢" },
    { id: "campaigns", label: "Campaigns", icon: "🚀" },
    { id: "contacts", label: "Contacts", icon: "👥" },
    { id: "inbox", label: "Live Inbox", icon: "💬" },
    { id: "chatbot", label: "AI Chatbot", icon: "🤖" },
    { id: "flows", label: "Flow Builder", icon: "⚡" },
    { id: "analytics", label: "Global Analytics", icon: "📊" },
    { id: "api", label: "API & Integrations", icon: "🔌" },
    { id: "registration", label: "Registration", icon: "📋" },
    { id: "settings", label: "Settings", icon: "⚙️" },
  ];

  const hostname = window.location.hostname;
  const isPortal = hostname.startsWith("portal.") || hostname === "localhost" || hostname === "127.0.0.1";

  if (!isPortal) {
    return <LandingPage />;
  }

  // Signup page should NEVER be interrupted by loading state
  if (view === "signup") {
    return <SignupPage onBack={() => setView("login")} />;
  }

  // Show loading while checking auth state
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: "#fff", marginBottom: 16 }}>Engage<span style={{ color: C.primary }}>Worx</span></div>
          <div style={{ color: C.muted, fontSize: 14 }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (drillDownTenant) {
    return <CustomerPortal tenantId={drillDownTenant} onBack={() => setDrillDownTenant(null)} />;
  }
  if (view === "admin_tenants") {
    return <AdminTenants onBack={() => setView("sp")} />;
  }
  if (view === "login") {
    const inputLogin = { width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" };

    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ width: 480 }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#fff" }}>Engage<span style={{ color: C.primary }}>Worx</span></div>
            <div style={{ color: C.muted, marginTop: 6 }}>Multi-Tenant Communications Platform</div>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 40 }}>
            {/* Mode Toggle */}
            <div style={{ display: "flex", gap: 2, marginBottom: 24, background: "rgba(255,255,255,0.04)", padding: 3, borderRadius: 10 }}>
              {[
                { id: "login", label: "Sign In" },
                { id: "signup", label: "Sign Up" },
              ].map(t => (
                <button key={t.id} onClick={() => { setLoginTab(t.id); setLoginMessage(null); }} style={{
                  flex: 1, background: loginTab === t.id ? C.primary : "transparent",
                  border: "none", borderRadius: 8, padding: "8px 12px",
                  color: loginTab === t.id ? "#000" : C.muted,
                  fontWeight: loginTab === t.id ? 700 : 400, cursor: "pointer", fontSize: 13,
                  fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s",
                }}>{t.label}</button>
              ))}
            </div>

            {/* Status message */}
            {loginMessage && (
              <div style={{ background: loginMessage.type === "error" ? "#FF3B3018" : "#00E67618", border: `1px solid ${loginMessage.type === "error" ? "#FF3B3044" : "#00E67644"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, color: loginMessage.type === "error" ? "#FF3B30" : "#00E676", fontSize: 13 }}>
                {loginMessage.text}
              </div>
            )}

            {/* ═══ SIGN IN ═══ */}
            {loginTab === "login" && (
              <form onSubmit={handleLogin}>
                <h2 style={{ color: "#fff", margin: "0 0 8px", textAlign: "center", fontSize: 20 }}>Sign In</h2>
                <p style={{ color: C.muted, textAlign: "center", marginBottom: 24, fontSize: 13 }}>Access your account with email and password</p>

                <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
                  <div>
                    <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4, fontWeight: 700 }}>Email</label>
                    <input type="email" required value={loginForm.email} onChange={e => setLoginForm(p => ({ ...p, email: e.target.value }))} placeholder="you@company.com" style={inputLogin} />
                  </div>
                  <div>
                    <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4, fontWeight: 700 }}>Password</label>
                    <input type="password" required value={loginForm.password} onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))} placeholder="••••••••" style={inputLogin} />
                  </div>
                </div>

                <button type="submit" disabled={loginLoading} style={{
                  width: "100%", background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
                  border: "none", borderRadius: 10, padding: "14px",
                  color: "#000", fontWeight: 700, cursor: loginLoading ? "wait" : "pointer",
                  fontSize: 15, opacity: loginLoading ? 0.7 : 1,
                }}>
                  {loginLoading ? "Signing in..." : "Sign In →"}
                </button>

                <div style={{ marginTop: 14, textAlign: "center" }}>
                  <button type="button" onClick={() => { setLoginTab("reset"); setLoginMessage(null); }} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 12 }}>
                    Forgot password?
                  </button>
                </div>
              </form>
            )}

            {/* ═══ SIGN UP ═══ */}
            {loginTab === "signup" && (
              <div>
                <h2 style={{ color: "#fff", margin: "0 0 8px", textAlign: "center", fontSize: 20 }}>Create Account</h2>
                <p style={{ color: C.muted, textAlign: "center", marginBottom: 24, fontSize: 13 }}>Start your free trial — no credit card required</p>

                <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4, fontWeight: 700 }}>Full Name</label>
                      <input type="text" required value={loginForm.fullName} onChange={e => setLoginForm(p => ({ ...p, fullName: e.target.value }))} placeholder="Jane Smith" style={inputLogin} />
                    </div>
                    <div>
                      <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4, fontWeight: 700 }}>Company</label>
                      <input type="text" required value={loginForm.companyName} onChange={e => setLoginForm(p => ({ ...p, companyName: e.target.value }))} placeholder="Acme Inc" style={inputLogin} />
                    </div>
                  </div>
                  <div>
                    <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4, fontWeight: 700 }}>Email</label>
                    <input type="email" required value={loginForm.email} onChange={e => setLoginForm(p => ({ ...p, email: e.target.value }))} placeholder="you@company.com" style={inputLogin} />
                  </div>
                  <div>
                    <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4, fontWeight: 700 }}>Password</label>
                    <input type="password" required minLength={6} value={loginForm.password} onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))} placeholder="Min 6 characters" style={inputLogin} />
                  </div>
                </div>

                <button type="button" disabled={loginLoading} onClick={async () => {
                  if (!loginForm.fullName || !loginForm.companyName || !loginForm.email || !loginForm.password) {
                    setLoginMessage({ type: "error", text: "Please fill all fields" });
                    return;
                  }
                  if (loginForm.password.length < 6) {
                    setLoginMessage({ type: "error", text: "Password must be at least 6 characters" });
                    return;
                  }
                  setLoginLoading(true);
                  setLoginMessage(null);
                  try {
                    const checkoutRes = await fetch("/api/billing?action=checkout", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        plan: "starter",
                        email: loginForm.email,
                        tenantName: loginForm.companyName,
                      }),
                    });
                    const checkoutData = await checkoutRes.json();
                    if (checkoutData.url) {
                      // Store signup data in sessionStorage for after checkout
                      sessionStorage.setItem("ewx_signup", JSON.stringify({
                        email: loginForm.email,
                        password: loginForm.password,
                        fullName: loginForm.fullName,
                        companyName: loginForm.companyName,
                      }));
                      // Send admin notification in background
                      fetch("/api/email?action=send", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          to: "rob@engwx.com",
                          subject: "🎉 New Signup: " + loginForm.companyName + " (starter)",
                          html: "<h2>New EngageWorx Signup</h2><p><b>Name:</b> " + loginForm.fullName + "</p><p><b>Business:</b> " + loginForm.companyName + "</p><p><b>Email:</b> " + loginForm.email + "</p>",
                        }),
                      }).catch(() => {});
                      window.location.href = checkoutData.url;
                    } else {
                      throw new Error(checkoutData.error || "Checkout failed");
                    }
                  } catch (err) {
                    console.error("SIGNUP ERROR:", err);
                    setLoginMessage({ type: "error", text: err.message });
                    setLoginLoading(false);
                  }
                }} style={{
                  width: "100%", background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
                  border: "none", borderRadius: 10, padding: "14px",
                  color: "#000", fontWeight: 700, cursor: loginLoading ? "wait" : "pointer",
                  fontSize: 15, opacity: loginLoading ? 0.7 : 1,
                }}>
                  {loginLoading ? "Creating account..." : "Create Account →"}
                </button>
              </div>
            )}

            {/* ═══ RESET PASSWORD ═══ */}
            {loginTab === "reset" && (
              <form onSubmit={handleReset}>
                <h2 style={{ color: "#fff", margin: "0 0 8px", textAlign: "center", fontSize: 20 }}>Reset Password</h2>
                <p style={{ color: C.muted, textAlign: "center", marginBottom: 24, fontSize: 13 }}>Enter your email and we'll send a reset link</p>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4, fontWeight: 700 }}>Email</label>
                  <input type="email" required value={loginForm.email} onChange={e => setLoginForm(p => ({ ...p, email: e.target.value }))} placeholder="you@company.com" style={inputLogin} />
                </div>

                <button type="submit" disabled={loginLoading} style={{
                  width: "100%", background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
                  border: "none", borderRadius: 10, padding: "14px",
                  color: "#000", fontWeight: 700, cursor: loginLoading ? "wait" : "pointer",
                  fontSize: 15, opacity: loginLoading ? 0.7 : 1,
                }}>
                  {loginLoading ? "Sending..." : "Send Reset Link"}
                </button>

                <div style={{ marginTop: 14, textAlign: "center" }}>
                  <button type="button" onClick={() => { setLoginTab("login"); setLoginMessage(null); }} style={{ background: "none", border: "none", color: C.primary, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                    ← Back to Sign In
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (view.startsWith("tenant_")) {
    const tenantId = view.replace("tenant_", "");
    return <CustomerPortal tenantId={tenantId} onBack={() => setView("login")} />;
  }

  // Service Provider portal
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', sans-serif", color: C.text }}>
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

        {/* Demo Mode Toggle — superadmin only */}
        <button onClick={() => toggleDemoMode(!demoMode)} style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 12px", borderRadius: 9, marginBottom: 8,
          background: demoMode ? `${C.accent}22` : "rgba(255,255,255,0.03)",
          border: `1px solid ${demoMode ? C.accent + "44" : "rgba(255,255,255,0.08)"}`,
          color: demoMode ? C.accent : C.muted, cursor: "pointer", fontSize: 13,
          fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s",
        }}>
          <span>🎮 Demo Mode</span>
          <span style={{
            width: 36, height: 20, borderRadius: 10, position: "relative",
            background: demoMode ? C.accent : "rgba(255,255,255,0.15)",
            display: "inline-block", transition: "all 0.2s",
          }}>
            <span style={{
              width: 16, height: 16, borderRadius: "50%", background: "#fff",
              position: "absolute", top: 2, left: demoMode ? 18 : 2,
              transition: "all 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }} />
          </span>
        </button>

        {/* Demo Credentials Manager */}
        {demoMode && (
          <div style={{ background: `${C.accent}11`, border: `1px solid ${C.accent}33`, borderRadius: 9, padding: "8px 10px", marginBottom: 8, fontSize: 11, color: C.accent }}>
            ● Demo data active — all modules show sample data
          </div>
        )}

        <button onClick={handleLogout} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px", color: C.muted, cursor: "pointer", fontSize: 12, marginBottom: 12 }}>← Sign Out</button>

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

      <div style={{ flex: 1, marginLeft: 240, overflowY: "auto" }}>
        {spPage === "dashboard" && <SuperAdminDashboard tenant={TENANTS.serviceProvider} onDrillDown={(id) => setDrillDownTenant(id)} C={C} />}
        {spPage === "tenants" && <TenantManagement C={C} />}
        {spPage === "campaigns" && <CampaignsModule C={C} tenants={TENANTS} viewLevel="sp" />}
        {spPage === "contacts" && <ContactsModule C={C} tenants={TENANTS} viewLevel="sp" />}
        {spPage === "inbox" && <LiveInbox C={C} tenants={TENANTS} viewLevel="sp" />}
        {spPage === "chatbot" && <AIChatbot C={C} tenants={TENANTS} viewLevel="sp" />}
        {spPage === "flows" && <FlowBuilder C={C} tenants={TENANTS} viewLevel="sp" />}
        {spPage === "analytics" && <AnalyticsDashboard C={C} tenants={TENANTS} viewLevel="sp" demoMode={demoMode} />}
        {spPage === "api" && <Settings C={C} tenants={TENANTS} viewLevel="sp" />}
        {spPage === "registration" && <Registration C={C} tenants={TENANTS} viewLevel="sp" />}
        {spPage === "settings" && <Settings C={C} tenants={TENANTS} viewLevel="sp" />}
      </div>
    </div>
  );
}

// ─── WRAP WITH AUTH PROVIDER ──────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
