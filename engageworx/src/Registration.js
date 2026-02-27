import { useState } from "react";

// ─── TCR/10DLC DATA ───────────────────────────────────────────────────────────
const TCR_BRANDS = [
  { id: "br_1", name: "Acme Corp", ein: "12-3456789", status: "verified", score: 85, created: "Jan 5, 2025", vertical: "Technology", entityType: "Private Company", country: "US", stockSymbol: "" },
  { id: "br_2", name: "RetailCo", ein: "98-7654321", status: "verified", score: 72, created: "Jan 12, 2025", vertical: "Retail", entityType: "Public Company", country: "US", stockSymbol: "RTLC" },
  { id: "br_3", name: "FinServ Group", ein: "55-1234567", status: "pending", score: null, created: "Feb 20, 2025", vertical: "Financial Services", entityType: "Private Company", country: "US", stockSymbol: "" },
];

const TCR_CAMPAIGNS = [
  { id: "cp_1", brandId: "br_1", name: "Marketing Promotions", useCase: "Marketing", subUseCase: "Marketing", status: "approved", throughput: "75 msg/sec", created: "Jan 10, 2025", numbers: 3, sampleMsg: "Acme Flash Sale! 25% off all items this weekend. Shop now: acme.co/sale Reply STOP to opt out" },
  { id: "cp_2", brandId: "br_1", name: "Account Notifications", useCase: "Mixed", subUseCase: "Account Notification", status: "approved", throughput: "75 msg/sec", created: "Jan 10, 2025", numbers: 2, sampleMsg: "Acme Corp: Your order #4521 has shipped. Track: acme.co/track/4521" },
  { id: "cp_3", brandId: "br_1", name: "2FA Authentication", useCase: "Low Volume Mixed", subUseCase: "2FA", status: "approved", throughput: "75 msg/sec", created: "Jan 15, 2025", numbers: 1, sampleMsg: "Your Acme verification code is 847291. Expires in 5 min." },
  { id: "cp_4", brandId: "br_2", name: "Promotional Offers", useCase: "Marketing", subUseCase: "Marketing", status: "approved", throughput: "50 msg/sec", created: "Jan 18, 2025", numbers: 5, sampleMsg: "RetailCo: New arrivals just dropped! Free shipping on orders $50+. Shop: retailco.com/new Reply STOP to end" },
  { id: "cp_5", brandId: "br_2", name: "Delivery Updates", useCase: "Mixed", subUseCase: "Delivery Notification", status: "pending", throughput: "—", created: "Feb 22, 2025", numbers: 0, sampleMsg: "RetailCo: Your package is out for delivery today. ETA 2-5 PM." },
  { id: "cp_6", brandId: "br_3", name: "Transaction Alerts", useCase: "Mixed", subUseCase: "Account Notification", status: "pending", throughput: "—", created: "Feb 22, 2025", numbers: 0, sampleMsg: "FinServ Alert: Transaction of $1,250.00 on card ending 4821. If unauthorized call 1-800-555-0199" },
];

const PROVISIONED_NUMBERS = [
  { number: "+1 (555) 234-0001", campaign: "Marketing Promotions", brand: "Acme Corp", type: "10DLC", status: "active", msgSent: 48200 },
  { number: "+1 (555) 234-0002", campaign: "Marketing Promotions", brand: "Acme Corp", type: "10DLC", status: "active", msgSent: 31400 },
  { number: "+1 (555) 234-0003", campaign: "Marketing Promotions", brand: "Acme Corp", type: "10DLC", status: "active", msgSent: 27800 },
  { number: "+1 (555) 567-0001", campaign: "Account Notifications", brand: "Acme Corp", type: "10DLC", status: "active", msgSent: 124500 },
  { number: "+1 (555) 567-0002", campaign: "Account Notifications", brand: "Acme Corp", type: "10DLC", status: "active", msgSent: 89300 },
  { number: "+1 (555) 890-0001", campaign: "2FA Authentication", brand: "Acme Corp", type: "10DLC", status: "active", msgSent: 312000 },
  { number: "+1 (555) 345-0001", campaign: "Promotional Offers", brand: "RetailCo", type: "10DLC", status: "active", msgSent: 67400 },
  { number: "+1 (800) 555-1234", campaign: "—", brand: "Acme Corp", type: "Toll-Free", status: "verified", msgSent: 15200 },
  { number: "44321", campaign: "—", brand: "RetailCo", type: "Short Code", status: "active", msgSent: 542000 },
];

// ─── RCS DATA ─────────────────────────────────────────────────────────────────
const RCS_AGENTS = [
  {
    id: "rcs_1", brandName: "Acme Corp", agentName: "AcmeEngage",
    agentId: "brands/acme/agents/engage", status: "launched",
    logo: "AC", color: "#FF6B35",
    carriers: [
      { name: "T-Mobile", status: "approved", launched: "Jan 20, 2025" },
      { name: "AT&T", status: "approved", launched: "Feb 1, 2025" },
      { name: "Verizon", status: "pending", launched: "—" },
      { name: "Google Messages", status: "approved", launched: "Jan 15, 2025" },
    ],
    features: ["Rich cards", "Carousels", "Suggested replies", "Suggested actions", "File sharing"],
    verification: "verified",
    created: "Dec 15, 2024",
    monthlyMessages: 34200,
  },
  {
    id: "rcs_2", brandName: "RetailCo", agentName: "RetailReach",
    agentId: "brands/retailco/agents/reach", status: "review",
    logo: "RC", color: "#00E676",
    carriers: [
      { name: "T-Mobile", status: "review", launched: "—" },
      { name: "AT&T", status: "pending", launched: "—" },
      { name: "Verizon", status: "pending", launched: "—" },
      { name: "Google Messages", status: "review", launched: "—" },
    ],
    features: ["Rich cards", "Suggested replies"],
    verification: "pending",
    created: "Feb 10, 2025",
    monthlyMessages: 0,
  },
  {
    id: "rcs_3", brandName: "FinServ Group", agentName: "FinConnect",
    agentId: "", status: "draft",
    logo: "FS", color: "#7C4DFF",
    carriers: [],
    features: [],
    verification: "not_started",
    created: "—",
    monthlyMessages: 0,
  },
];

const RCS_STEPS = [
  { step: 1, label: "Create Agent", desc: "Set up agent identity, branding & description" },
  { step: 2, label: "Brand Verification", desc: "Verify your brand through Google Business" },
  { step: 3, label: "Agent Review", desc: "Google reviews agent for compliance" },
  { step: 4, label: "Carrier Launch", desc: "Submit to carriers for approval & launch" },
  { step: 5, label: "Live", desc: "Agent is live and can send RCS messages" },
];

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function Registration({ C, tenants, viewLevel = "tenant", currentTenantId }) {
  const [mainTab, setMainTab] = useState("10dlc");
  const [tcrView, setTcrView] = useState("overview");
  const [rcsView, setRcsView] = useState("overview");
  const [showNewBrand, setShowNewBrand] = useState(false);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [selectedRcsAgent, setSelectedRcsAgent] = useState(null);

  const inputStyle = { width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" };
  const btnPrimary = { background: `linear-gradient(135deg, ${C.primary}, ${C.accent || C.primary})`, border: "none", borderRadius: 10, padding: "10px 20px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  const btnSec = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 20px", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  const card = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 22 };
  const badge = (color) => ({ display: "inline-block", background: color + "18", color, border: `1px solid ${color}44`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 });
  const labelStyle = { color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, display: "block", fontWeight: 700 };

  const statusColor = (s) => s === "verified" || s === "approved" || s === "active" || s === "launched" ? "#00E676" : s === "pending" || s === "review" ? "#FFD600" : s === "rejected" || s === "revoked" ? "#FF3B30" : "#6B8BAE";
  const statusLabel = (s) => s === "verified" ? "✓ Verified" : s === "approved" ? "✓ Approved" : s === "active" ? "● Active" : s === "launched" ? "🚀 Launched" : s === "pending" ? "⏳ Pending" : s === "review" ? "🔍 In Review" : s === "rejected" ? "✕ Rejected" : s === "draft" ? "◯ Draft" : s;

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1200, fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>Registration & Compliance</h1>
          <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>TCR/10DLC brand & campaign registration, RCS agent provisioning</p>
        </div>
      </div>

      {/* Main Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 24 }}>
        {[
          { id: "10dlc", label: "TCR / 10DLC", icon: "📋" },
          { id: "rcs", label: "RCS Registration", icon: "✨" },
        ].map(t => (
          <button key={t.id} onClick={() => setMainTab(t.id)} style={{
            background: mainTab === t.id ? C.primary : "rgba(255,255,255,0.04)",
            border: mainTab === t.id ? "none" : "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8, padding: "10px 24px", color: mainTab === t.id ? "#000" : C.muted,
            fontWeight: mainTab === t.id ? 700 : 400, cursor: "pointer", fontSize: 14,
            fontFamily: "'DM Sans', sans-serif",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TCR / 10DLC TAB */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {mainTab === "10dlc" && (
        <div>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Registered Brands", value: TCR_BRANDS.length, color: C.primary, icon: "🏢" },
              { label: "Active Campaigns", value: TCR_CAMPAIGNS.filter(c => c.status === "approved").length, color: "#00E676", icon: "📋" },
              { label: "Provisioned Numbers", value: PROVISIONED_NUMBERS.filter(n => n.status === "active" || n.status === "verified").length, color: "#FFD600", icon: "📞" },
              { label: "Pending Reviews", value: TCR_CAMPAIGNS.filter(c => c.status === "pending").length + TCR_BRANDS.filter(b => b.status === "pending").length, color: "#FF6B35", icon: "⏳" },
              { label: "Avg Trust Score", value: Math.round(TCR_BRANDS.filter(b => b.score).reduce((s, b) => s + b.score, 0) / TCR_BRANDS.filter(b => b.score).length), color: "#7C4DFF", icon: "⭐" },
            ].map((kpi, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.04)", borderTop: `3px solid ${kpi.color}`, borderRadius: 10, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 0.8 }}>{kpi.label}</span>
                  <span style={{ fontSize: 14 }}>{kpi.icon}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginTop: 6 }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Sub Tabs */}
          <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
            {[
              { id: "overview", label: "Overview" },
              { id: "brands", label: "Brands" },
              { id: "campaigns", label: "Campaigns" },
              { id: "numbers", label: "Numbers" },
            ].map(t => (
              <button key={t.id} onClick={() => setTcrView(t.id)} style={{
                background: tcrView === t.id ? `${C.primary}22` : "rgba(255,255,255,0.03)",
                border: `1px solid ${tcrView === t.id ? C.primary + "44" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 8, padding: "7px 16px", color: tcrView === t.id ? C.primary : "rgba(255,255,255,0.4)",
                fontWeight: tcrView === t.id ? 700 : 400, cursor: "pointer", fontSize: 12,
                fontFamily: "'DM Sans', sans-serif",
              }}>{t.label}</button>
            ))}
          </div>

          {/* ─── OVERVIEW ─── */}
          {tcrView === "overview" && (
            <div>
              {/* Registration Flow */}
              <div style={{ ...card, marginBottom: 20 }}>
                <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>10DLC Registration Flow</h3>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "16px 0", overflowX: "auto" }}>
                  {[
                    { label: "Register\nBrand", icon: "🏢", color: C.primary, desc: "Submit business identity to TCR" },
                    { label: "→", icon: "" },
                    { label: "Brand\nVetting", icon: "🔍", color: "#FFD600", desc: "TCR reviews & assigns trust score" },
                    { label: "→", icon: "" },
                    { label: "Register\nCampaign", icon: "📋", color: "#7C4DFF", desc: "Define use case & sample messages" },
                    { label: "→", icon: "" },
                    { label: "Campaign\nApproval", icon: "✅", color: "#00E676", desc: "Carriers review & approve" },
                    { label: "→", icon: "" },
                    { label: "Provision\nNumbers", icon: "📞", color: "#FF6B35", desc: "Assign 10DLC numbers to campaign" },
                    { label: "→", icon: "" },
                    { label: "Send\nMessages", icon: "🚀", color: "#00E676", desc: "Start sending at approved throughput" },
                  ].map((step, i) => (
                    step.icon ? (
                      <div key={i} style={{ background: `${step.color}10`, border: `1px solid ${step.color}33`, borderRadius: 12, padding: "14px 16px", textAlign: "center", minWidth: 90 }} title={step.desc}>
                        <div style={{ fontSize: 22, marginBottom: 6 }}>{step.icon}</div>
                        <div style={{ color: step.color, fontSize: 9, fontWeight: 700, whiteSpace: "pre-line", lineHeight: 1.3 }}>{step.label}</div>
                      </div>
                    ) : (
                      <div key={i} style={{ color: "rgba(255,255,255,0.12)", fontSize: 16, padding: "0 2px" }}>→</div>
                    )
                  ))}
                </div>
              </div>

              {/* Compliance Info */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={card}>
                  <h3 style={{ color: "#fff", margin: "0 0 12px", fontSize: 15 }}>What is 10DLC?</h3>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, lineHeight: 1.6 }}>
                    10DLC (10-Digit Long Code) is the industry standard for Application-to-Person (A2P) messaging in the US. All businesses sending SMS/MMS through local phone numbers must register their brand and campaigns with The Campaign Registry (TCR).
                  </div>
                  <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {["Required by US carriers", "Higher throughput", "Better deliverability", "Lower filtering"].map(b => (
                      <span key={b} style={{ background: `${C.primary}12`, color: C.primary, borderRadius: 6, padding: "4px 10px", fontSize: 11 }}>✓ {b}</span>
                    ))}
                  </div>
                </div>
                <div style={card}>
                  <h3 style={{ color: "#fff", margin: "0 0 12px", fontSize: 15 }}>Trust Score Impact</h3>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
                    Your TCR Trust Score determines message throughput. Higher scores unlock more messages per second across all carriers.
                  </div>
                  {[
                    { range: "75–100", throughput: "75 msg/sec", color: "#00E676" },
                    { range: "50–74", throughput: "40 msg/sec", color: "#FFD600" },
                    { range: "1–49", throughput: "4 msg/sec", color: "#FF6B35" },
                    { range: "Unverified", throughput: "1 msg/sec", color: "#FF3B30" },
                  ].map((t, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      <span style={{ color: t.color, fontSize: 13, fontWeight: 600 }}>Score {t.range}</span>
                      <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{t.throughput}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ─── BRANDS ─── */}
          {tcrView === "brands" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ color: "#fff", fontSize: 18, margin: 0 }}>Registered Brands</h2>
                <button onClick={() => setShowNewBrand(!showNewBrand)} style={btnPrimary}>+ Register Brand</button>
              </div>

              {showNewBrand && (
                <div style={{ ...card, marginBottom: 16, border: `1px solid ${C.primary}44` }}>
                  <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Register New Brand with TCR</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div><label style={labelStyle}>Legal Company Name</label><input placeholder="e.g. Acme Corporation Inc." style={inputStyle} /></div>
                    <div><label style={labelStyle}>DBA (Doing Business As)</label><input placeholder="e.g. Acme Corp" style={inputStyle} /></div>
                    <div><label style={labelStyle}>EIN / Tax ID</label><input placeholder="XX-XXXXXXX" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Entity Type</label><select style={inputStyle}><option>Private Company</option><option>Public Company</option><option>Non-Profit</option><option>Government</option><option>Sole Proprietor</option></select></div>
                    <div><label style={labelStyle}>Vertical / Industry</label><select style={inputStyle}><option>Technology</option><option>Retail</option><option>Healthcare</option><option>Financial Services</option><option>Education</option><option>Real Estate</option><option>Other</option></select></div>
                    <div><label style={labelStyle}>Country</label><select style={inputStyle}><option>United States</option><option>Canada</option></select></div>
                    <div><label style={labelStyle}>Company Website</label><input placeholder="https://acmecorp.com" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Stock Symbol (if public)</label><input placeholder="e.g. ACME" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Company Phone</label><input placeholder="+1 (555) 000-0000" style={inputStyle} /></div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div><label style={labelStyle}>Street Address</label><input placeholder="123 Main St, Suite 100" style={inputStyle} /></div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      <div><label style={labelStyle}>City</label><input placeholder="City" style={inputStyle} /></div>
                      <div><label style={labelStyle}>State</label><input placeholder="CA" style={inputStyle} /></div>
                      <div><label style={labelStyle}>ZIP</label><input placeholder="90210" style={inputStyle} /></div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={btnPrimary}>Submit to TCR</button>
                    <button onClick={() => setShowNewBrand(false)} style={btnSec}>Cancel</button>
                    <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, lineHeight: "40px", marginLeft: 8 }}>Registration fee: $4.00 (one-time)</span>
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gap: 10 }}>
                {TCR_BRANDS.map(brand => (
                  <div key={brand.id} style={{
                    ...card, display: "grid", gridTemplateColumns: "1fr 120px 100px 100px 80px 100px",
                    alignItems: "center", gap: 14,
                    borderLeft: `4px solid ${statusColor(brand.status)}`,
                  }}>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{brand.name}</div>
                      <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>EIN: {brand.ein} · {brand.vertical} · {brand.entityType}</div>
                    </div>
                    <div><span style={badge(statusColor(brand.status))}>{statusLabel(brand.status)}</span></div>
                    <div style={{ textAlign: "center" }}>
                      {brand.score ? (
                        <>
                          <div style={{ color: brand.score >= 75 ? "#00E676" : brand.score >= 50 ? "#FFD600" : "#FF6B35", fontSize: 20, fontWeight: 800 }}>{brand.score}</div>
                          <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>Trust Score</div>
                        </>
                      ) : (
                        <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>Pending</div>
                      )}
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>{TCR_CAMPAIGNS.filter(c => c.brandId === brand.id).length}</div>
                      <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>Campaigns</div>
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{brand.created}</div>
                    <button style={{ ...btnSec, padding: "6px 12px", fontSize: 11 }}>Manage</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── CAMPAIGNS ─── */}
          {tcrView === "campaigns" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ color: "#fff", fontSize: 18, margin: 0 }}>10DLC Campaigns</h2>
                <button onClick={() => setShowNewCampaign(!showNewCampaign)} style={btnPrimary}>+ Register Campaign</button>
              </div>

              {showNewCampaign && (
                <div style={{ ...card, marginBottom: 16, border: `1px solid ${C.primary}44` }}>
                  <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Register New Campaign</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div><label style={labelStyle}>Brand</label><select style={inputStyle}><option>Select brand...</option>{TCR_BRANDS.filter(b => b.status === "verified").map(b => <option key={b.id}>{b.name}</option>)}</select></div>
                    <div><label style={labelStyle}>Campaign Name</label><input placeholder="e.g. Holiday Promotions" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Use Case</label><select style={inputStyle}><option>Marketing</option><option>Mixed</option><option>Low Volume Mixed</option><option>Customer Care</option><option>Delivery Notifications</option><option>2FA</option><option>Account Notifications</option><option>Public Service Announcement</option></select></div>
                    <div><label style={labelStyle}>Sub Use Case</label><select style={inputStyle}><option>Marketing</option><option>Account Notification</option><option>Delivery Notification</option><option>2FA</option><option>Customer Care</option><option>Fraud Alert</option></select></div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Sample Message 1 (required)</label>
                    <textarea rows={2} placeholder="Include brand name, opt-out language (Reply STOP), and realistic content" style={{ ...inputStyle, resize: "vertical" }} />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Sample Message 2 (required)</label>
                    <textarea rows={2} placeholder="Different example of the messages you'll send" style={{ ...inputStyle, resize: "vertical" }} />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Campaign Description</label>
                    <textarea rows={2} placeholder="Describe how messages will be sent and how subscribers opt in" style={{ ...inputStyle, resize: "vertical" }} />
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                    {[
                      { label: "Subscriber opt-in", required: true },
                      { label: "Opt-out keywords (STOP)", required: true },
                      { label: "Help keywords (HELP)", required: true },
                      { label: "Embedded links", required: false },
                      { label: "Embedded phone", required: false },
                      { label: "Age-gated content", required: false },
                    ].map(c => (
                      <label key={c.label} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                        <input type="checkbox" defaultChecked={c.required} style={{ accentColor: C.primary }} /> {c.label} {c.required && <span style={{ color: "#FF3B30", fontSize: 10 }}>*</span>}
                      </label>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={btnPrimary}>Submit Campaign</button>
                    <button onClick={() => setShowNewCampaign(false)} style={btnSec}>Cancel</button>
                    <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, lineHeight: "40px", marginLeft: 8 }}>Monthly fee: $10.00/campaign</span>
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gap: 10 }}>
                {TCR_CAMPAIGNS.map(camp => (
                  <div key={camp.id} style={{
                    ...card, borderLeft: `4px solid ${statusColor(camp.status)}`,
                  }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 100px 80px 80px 80px", alignItems: "center", gap: 14 }}>
                      <div>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{camp.name}</div>
                        <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{TCR_BRANDS.find(b => b.id === camp.brandId)?.name} · {camp.useCase} → {camp.subUseCase}</div>
                      </div>
                      <div><span style={badge(statusColor(camp.status))}>{statusLabel(camp.status)}</span></div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{camp.throughput}</div>
                        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>Throughput</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{camp.numbers}</div>
                        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>Numbers</div>
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{camp.created}</div>
                      <button style={{ ...btnSec, padding: "6px 10px", fontSize: 11 }}>Details</button>
                    </div>
                    <div style={{ marginTop: 10, background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Sample Message</div>
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontStyle: "italic" }}>"{camp.sampleMsg}"</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── NUMBERS ─── */}
          {tcrView === "numbers" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ color: "#fff", fontSize: 18, margin: 0 }}>Provisioned Numbers</h2>
                <button style={btnPrimary}>+ Provision Number</button>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {PROVISIONED_NUMBERS.map((num, i) => (
                  <div key={i} style={{
                    ...card, display: "grid", gridTemplateColumns: "160px 1fr 120px 100px 100px 80px",
                    alignItems: "center", gap: 14, padding: "14px 22px",
                    borderLeft: `4px solid ${statusColor(num.status)}`,
                  }}>
                    <div style={{ fontFamily: "monospace", color: C.primary, fontSize: 13, fontWeight: 700 }}>{num.number}</div>
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{num.campaign}</div>
                      <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>{num.brand}</div>
                    </div>
                    <div><span style={badge(num.type === "10DLC" ? C.primary : num.type === "Toll-Free" ? "#00E676" : "#FFD600")}>{num.type}</span></div>
                    <div><span style={badge(statusColor(num.status))}>{statusLabel(num.status)}</span></div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{num.msgSent.toLocaleString()}</div>
                      <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>Messages</div>
                    </div>
                    <button style={{ ...btnSec, padding: "6px 10px", fontSize: 11 }}>Config</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* RCS REGISTRATION TAB */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {mainTab === "rcs" && (
        <div>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
            {[
              { label: "RCS Agents", value: RCS_AGENTS.length, color: "#7C4DFF", icon: "✨" },
              { label: "Launched", value: RCS_AGENTS.filter(a => a.status === "launched").length, color: "#00E676", icon: "🚀" },
              { label: "In Review", value: RCS_AGENTS.filter(a => a.status === "review").length, color: "#FFD600", icon: "🔍" },
              { label: "Monthly RCS Messages", value: RCS_AGENTS.reduce((s, a) => s + a.monthlyMessages, 0).toLocaleString(), color: C.primary, icon: "💬" },
            ].map((kpi, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.04)", borderTop: `3px solid ${kpi.color}`, borderRadius: 10, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 0.8 }}>{kpi.label}</span>
                  <span style={{ fontSize: 14 }}>{kpi.icon}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginTop: 6 }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Registration Steps */}
          <div style={{ ...card, marginBottom: 20 }}>
            <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>RCS Agent Registration Flow</h3>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 4, padding: "8px 0", overflowX: "auto" }}>
              {RCS_STEPS.map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
                  <div style={{ textAlign: "center", flex: 1 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${C.primary}22`, border: `2px solid ${C.primary}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px", color: C.primary, fontSize: 14, fontWeight: 800 }}>{step.step}</div>
                    <div style={{ color: "#fff", fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{step.label}</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, lineHeight: 1.3 }}>{step.desc}</div>
                  </div>
                  {i < RCS_STEPS.length - 1 && <div style={{ color: "rgba(255,255,255,0.12)", fontSize: 16, paddingBottom: 30 }}>→</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Agent List */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ color: "#fff", fontSize: 18, margin: 0 }}>RCS Agents</h2>
            <button onClick={() => setShowNewAgent(!showNewAgent)} style={btnPrimary}>+ Create Agent</button>
          </div>

          {showNewAgent && (
            <div style={{ ...card, marginBottom: 16, border: `1px solid #7C4DFF44` }}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Create RCS Business Messaging Agent</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div><label style={labelStyle}>Agent Display Name</label><input placeholder="e.g. AcmeEngage" style={inputStyle} /></div>
                <div><label style={labelStyle}>Brand Name</label><select style={inputStyle}><option>Select brand...</option>{TCR_BRANDS.map(b => <option key={b.id}>{b.name}</option>)}</select></div>
                <div><label style={labelStyle}>Agent Color</label><input type="color" defaultValue="#FF6B35" style={{ ...inputStyle, padding: "6px", height: 44 }} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div><label style={labelStyle}>Agent Description</label><textarea rows={2} placeholder="Describe what your agent does for customers" style={{ ...inputStyle, resize: "vertical" }} /></div>
                <div><label style={labelStyle}>Privacy Policy URL</label><input placeholder="https://acmecorp.com/privacy" style={inputStyle} /></div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Agent Features</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["Rich cards", "Carousels", "Suggested replies", "Suggested actions", "File sharing", "Location sharing", "Payment requests"].map(f => (
                    <label key={f} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                      <input type="checkbox" defaultChecked={["Rich cards", "Suggested replies"].includes(f)} style={{ accentColor: "#7C4DFF" }} /> {f}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div><label style={labelStyle}>Logo Upload</label><div style={{ ...inputStyle, textAlign: "center", color: "rgba(255,255,255,0.3)", cursor: "pointer", border: "2px dashed rgba(255,255,255,0.1)" }}>📁 Click to upload (224x224px, PNG)</div></div>
                <div><label style={labelStyle}>Hero Image (optional)</label><div style={{ ...inputStyle, textAlign: "center", color: "rgba(255,255,255,0.3)", cursor: "pointer", border: "2px dashed rgba(255,255,255,0.1)" }}>📁 Click to upload (1440x448px)</div></div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={{ ...btnPrimary, background: "linear-gradient(135deg, #7C4DFF, #651FFF)" }}>Submit for Review</button>
                <button onClick={() => setShowNewAgent(false)} style={btnSec}>Cancel</button>
              </div>
            </div>
          )}

          {/* Agent Cards */}
          <div style={{ display: "grid", gap: 14 }}>
            {RCS_AGENTS.map(agent => (
              <div key={agent.id} style={{ ...card, borderLeft: `4px solid ${agent.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: `linear-gradient(135deg, ${agent.color}44, ${agent.color}22)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: agent.color }}>{agent.logo}</div>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{agent.agentName}</div>
                      <div style={{ color: C.muted, fontSize: 12 }}>{agent.brandName} · {agent.agentId || "Not submitted"}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={badge(statusColor(agent.status))}>{statusLabel(agent.status)}</span>
                    {agent.verification === "verified" && <span style={badge("#00E676")}>✓ Brand Verified</span>}
                    {agent.verification === "pending" && <span style={badge("#FFD600")}>⏳ Verification Pending</span>}
                  </div>
                </div>

                {/* Carrier Status */}
                {agent.carriers.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Carrier Status</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                      {agent.carriers.map((carrier, ci) => (
                        <div key={ci} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${statusColor(carrier.status)}33`, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                          <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{carrier.name}</div>
                          <span style={badge(statusColor(carrier.status))}>{statusLabel(carrier.status)}</span>
                          {carrier.launched !== "—" && <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 4 }}>{carrier.launched}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Features & Stats */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {agent.features.map(f => <span key={f} style={{ background: `${agent.color}12`, color: agent.color, borderRadius: 4, padding: "2px 8px", fontSize: 10 }}>{f}</span>)}
                    {agent.features.length === 0 && <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>No features configured</span>}
                  </div>
                  <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    {agent.monthlyMessages > 0 && (
                      <div style={{ textAlign: "center" }}>
                        <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{agent.monthlyMessages.toLocaleString()}</div>
                        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>Messages/mo</div>
                      </div>
                    )}
                    <button style={{ ...btnSec, padding: "8px 14px", fontSize: 12 }}>{agent.status === "draft" ? "Configure" : "Manage"}</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* RCS Info */}
          <div style={{ ...card, marginTop: 20 }}>
            <h3 style={{ color: "#fff", margin: "0 0 12px", fontSize: 15 }}>About RCS Business Messaging</h3>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
              RCS (Rich Communication Services) enables rich, app-like messaging experiences directly in the native messaging app. Unlike SMS, RCS supports high-resolution images, carousels, suggested replies, and read receipts without requiring users to download an app.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[
                { label: "Rich Media", desc: "Send images, videos, carousels, and interactive cards", icon: "🖼️" },
                { label: "Verified Sender", desc: "Brand logo, name, and verification badge", icon: "✅" },
                { label: "SMS Fallback", desc: "Automatically falls back to SMS for unsupported devices", icon: "📱" },
              ].map((f, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "14px" }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{f.icon}</div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{f.label}</div>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, lineHeight: 1.4 }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
