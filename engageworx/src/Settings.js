import { useState } from "react";

// ─── DEMO DATA ────────────────────────────────────────────────────────────────
const API_KEYS = [
  { id: "key_1", name: "Production API Key", prefix: "ewx_live_8f3k", created: "Jan 15, 2025", lastUsed: "2 min ago", status: "active", permissions: ["messages", "contacts", "campaigns", "analytics"] },
  { id: "key_2", name: "Staging API Key", prefix: "ewx_test_2m9p", created: "Feb 1, 2025", lastUsed: "3 hours ago", status: "active", permissions: ["messages", "contacts"] },
  { id: "key_3", name: "Analytics Read-Only", prefix: "ewx_ro_7x4d", created: "Feb 10, 2025", lastUsed: "1 day ago", status: "active", permissions: ["analytics"] },
  { id: "key_4", name: "Legacy Key (deprecated)", prefix: "ewx_old_1a2b", created: "Nov 5, 2024", lastUsed: "45 days ago", status: "revoked", permissions: ["messages"] },
];

const WEBHOOKS = [
  { id: "wh_1", name: "Message Delivered", url: "https://api.acmecorp.com/webhooks/delivered", events: ["message.delivered", "message.failed"], status: "active", successRate: 99.8, lastTriggered: "1 min ago" },
  { id: "wh_2", name: "Campaign Events", url: "https://hooks.acmecorp.com/campaigns", events: ["campaign.started", "campaign.completed", "campaign.paused"], status: "active", successRate: 100, lastTriggered: "15 min ago" },
  { id: "wh_3", name: "Contact Sync", url: "https://crm.acmecorp.com/api/contacts/sync", events: ["contact.created", "contact.updated", "contact.deleted"], status: "active", successRate: 97.2, lastTriggered: "5 min ago" },
  { id: "wh_4", name: "Billing Notifications", url: "https://billing.acmecorp.com/hooks", events: ["invoice.created", "payment.received"], status: "paused", successRate: 0, lastTriggered: "Never" },
];

const TEAM_MEMBERS = [
  { id: "tm_1", name: "Sarah Mitchell", email: "sarah.m@acmecorp.com", role: "Admin", avatar: "SM", status: "active", lastLogin: "2 min ago" },
  { id: "tm_2", name: "James Kumar", email: "james.k@acmecorp.com", role: "Campaign Manager", avatar: "JK", status: "active", lastLogin: "1 hour ago" },
  { id: "tm_3", name: "Priya Rao", email: "priya.r@acmecorp.com", role: "Analyst", avatar: "PR", status: "active", lastLogin: "3 hours ago" },
  { id: "tm_4", name: "Alex Dumont", email: "alex.d@acmecorp.com", role: "Support Agent", avatar: "AD", status: "invited", lastLogin: "Never" },
  { id: "tm_5", name: "Maria Chen", email: "maria.c@acmecorp.com", role: "Admin", avatar: "MC", status: "active", lastLogin: "Yesterday" },
];

const ROLES = ["Admin", "Campaign Manager", "Analyst", "Support Agent", "Read Only"];

const NOTIFICATION_PREFS = [
  { id: "np_1", label: "Campaign completed", email: true, push: true, sms: false },
  { id: "np_2", label: "Campaign failed", email: true, push: true, sms: true },
  { id: "np_3", label: "New contact signup", email: false, push: true, sms: false },
  { id: "np_4", label: "Webhook failure", email: true, push: true, sms: true },
  { id: "np_5", label: "API rate limit warning", email: true, push: false, sms: false },
  { id: "np_6", label: "Monthly usage report", email: true, push: false, sms: false },
  { id: "np_7", label: "New team member joined", email: true, push: true, sms: false },
  { id: "np_8", label: "Billing invoice ready", email: true, push: false, sms: false },
  { id: "np_9", label: "Message delivery errors spike", email: true, push: true, sms: true },
  { id: "np_10", label: "Security alert", email: true, push: true, sms: true },
];

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function Settings({ C, tenants, viewLevel = "tenant", currentTenantId }) {
  const [activeTab, setActiveTab] = useState("api");
  const [showNewKey, setShowNewKey] = useState(false);
  const [showNewWebhook, setShowNewWebhook] = useState(false);
  const [notifications, setNotifications] = useState(NOTIFICATION_PREFS);

  const inputStyle = { width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" };
  const btnPrimary = { background: `linear-gradient(135deg, ${C.primary}, ${C.accent || C.primary})`, border: "none", borderRadius: 10, padding: "10px 20px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  const btnSec = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 20px", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  const card = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 22 };
  const badge = (color) => ({ display: "inline-block", background: color + "18", color, border: `1px solid ${color}44`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 });
  const label = { color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, display: "block", fontWeight: 700 };

  const toggleNotif = (id, channel) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, [channel]: !n[channel] } : n));
  };

  const Toggle = ({ enabled, color }) => (
    <div style={{ width: 36, height: 20, borderRadius: 10, cursor: "pointer", background: enabled ? (color || C.primary) : "rgba(255,255,255,0.1)", position: "relative", transition: "all 0.2s", flexShrink: 0 }}>
      <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: enabled ? 18 : 2, transition: "all 0.2s" }} />
    </div>
  );

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1200, fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>Settings</h1>
        <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>API keys, integrations, channels, billing & team management</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 24, overflowX: "auto", paddingBottom: 4 }}>
        {[
          { id: "api", label: "API Keys", icon: "🔑" },
          { id: "webhooks", label: "Webhooks", icon: "🔗" },
          { id: "channels", label: "Channels", icon: "📡" },
          { id: "billing", label: "Billing", icon: "💳" },
          { id: "team", label: "Team", icon: "👥" },
          { id: "notifications", label: "Notifications", icon: "🔔" },
          { id: "security", label: "Security", icon: "🔒" },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background: activeTab === t.id ? C.primary : "rgba(255,255,255,0.04)",
            border: activeTab === t.id ? "none" : "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8, padding: "8px 16px", color: activeTab === t.id ? "#000" : C.muted,
            fontWeight: activeTab === t.id ? 700 : 400, cursor: "pointer", fontSize: 13,
            fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s", whiteSpace: "nowrap",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* ═══════════ API KEYS TAB ═══════════ */}
      {activeTab === "api" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ color: "#fff", fontSize: 18, margin: 0 }}>API Keys</h2>
            <button onClick={() => setShowNewKey(!showNewKey)} style={btnPrimary}>+ Generate Key</button>
          </div>

          {showNewKey && (
            <div style={{ ...card, marginBottom: 16, border: `1px solid ${C.primary}44` }}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Generate New API Key</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div><label style={label}>Key Name</label><input placeholder="e.g. Production API Key" style={inputStyle} /></div>
                <div><label style={label}>Environment</label><select style={inputStyle}><option>Production</option><option>Staging</option><option>Development</option></select></div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={label}>Permissions</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["Messages", "Contacts", "Campaigns", "Analytics", "Webhooks", "Flows", "Settings"].map(p => (
                    <label key={p} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                      <input type="checkbox" defaultChecked={["Messages", "Contacts"].includes(p)} style={{ accentColor: C.primary }} /> {p}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={btnPrimary}>Generate Key</button>
                <button onClick={() => setShowNewKey(false)} style={btnSec}>Cancel</button>
              </div>
            </div>
          )}

          {/* API Endpoint */}
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={label}>Base URL</label>
                <div style={{ ...inputStyle, background: "rgba(0,0,0,0.4)", fontFamily: "monospace", fontSize: 13, color: C.primary, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>https://api.engwx.com/v1</span>
                  <button style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 11 }}>Copy</button>
                </div>
              </div>
              <div>
                <label style={label}>API Version</label>
                <div style={{ ...inputStyle, background: "rgba(0,0,0,0.4)", color: "rgba(255,255,255,0.5)" }}>v1 (Latest) — Released Feb 2025</div>
              </div>
            </div>
          </div>

          {/* Key List */}
          <div style={{ display: "grid", gap: 10 }}>
            {API_KEYS.map(key => (
              <div key={key.id} style={{
                ...card, display: "grid", gridTemplateColumns: "1fr 160px 140px 100px 120px",
                alignItems: "center", gap: 14, opacity: key.status === "revoked" ? 0.5 : 1,
                borderLeft: `4px solid ${key.status === "active" ? "#00E676" : "#FF3B30"}`,
              }}>
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{key.name}</div>
                  <div style={{ fontFamily: "monospace", color: C.primary, fontSize: 12, marginTop: 2 }}>{key.prefix}...••••••</div>
                  <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 2 }}>Created {key.created}</div>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {key.permissions.map(p => (
                    <span key={p} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 4, padding: "1px 6px", fontSize: 9, color: "rgba(255,255,255,0.4)" }}>{p}</span>
                  ))}
                </div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>Last used: {key.lastUsed}</div>
                <div><span style={badge(key.status === "active" ? "#00E676" : "#FF3B30")}>{key.status === "active" ? "● Active" : "● Revoked"}</span></div>
                <div style={{ display: "flex", gap: 6 }}>
                  {key.status === "active" && <button style={{ ...btnSec, padding: "6px 10px", fontSize: 11 }}>Revoke</button>}
                  <button style={{ ...btnSec, padding: "6px 10px", fontSize: 11 }}>Copy</button>
                </div>
              </div>
            ))}
          </div>

          {/* Rate Limits */}
          <div style={{ ...card, marginTop: 16 }}>
            <h3 style={{ color: "#fff", margin: "0 0 14px", fontSize: 15 }}>Rate Limits</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
              {[
                { label: "Requests/sec", value: "100", plan: "Growth" },
                { label: "Messages/month", value: "250,000", used: "142,800" },
                { label: "Contacts", value: "Unlimited", plan: "Growth" },
                { label: "Webhooks", value: "50", used: "4" },
              ].map((r, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "14px", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, textTransform: "uppercase", marginBottom: 6 }}>{r.label}</div>
                  <div style={{ color: "#fff", fontSize: 18, fontWeight: 800 }}>{r.value}</div>
                  {r.used && <div style={{ color: C.primary, fontSize: 11, marginTop: 2 }}>{r.used} used</div>}
                  {r.plan && <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{r.plan} plan</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ WEBHOOKS TAB ═══════════ */}
      {activeTab === "webhooks" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ color: "#fff", fontSize: 18, margin: 0 }}>Webhooks</h2>
            <button onClick={() => setShowNewWebhook(!showNewWebhook)} style={btnPrimary}>+ Add Webhook</button>
          </div>

          {showNewWebhook && (
            <div style={{ ...card, marginBottom: 16, border: `1px solid ${C.primary}44` }}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>New Webhook Endpoint</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div><label style={label}>Name</label><input placeholder="e.g. CRM Sync" style={inputStyle} /></div>
                <div><label style={label}>URL</label><input placeholder="https://your-domain.com/webhook" style={inputStyle} /></div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={label}>Events</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["message.sent", "message.delivered", "message.failed", "message.replied", "contact.created", "contact.updated", "contact.deleted", "campaign.started", "campaign.completed", "campaign.paused", "invoice.created", "payment.received"].map(ev => (
                    <label key={ev} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>
                      <input type="checkbox" style={{ accentColor: C.primary }} /> {ev}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div><label style={label}>Secret (for signature verification)</label><input placeholder="Auto-generated" style={inputStyle} readOnly /></div>
                <div><label style={label}>Retry Policy</label><select style={inputStyle}><option>3 retries with exponential backoff</option><option>5 retries</option><option>No retries</option></select></div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={btnPrimary}>Create Webhook</button>
                <button onClick={() => setShowNewWebhook(false)} style={btnSec}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            {WEBHOOKS.map(wh => (
              <div key={wh.id} style={{
                ...card, display: "grid", gridTemplateColumns: "1fr 180px 100px 80px 100px",
                alignItems: "center", gap: 14,
                borderLeft: `4px solid ${wh.status === "active" ? "#00E676" : "#FFD600"}`,
              }}>
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{wh.name}</div>
                  <div style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis" }}>{wh.url}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                    {wh.events.map(ev => <span key={ev} style={{ background: `${C.primary}12`, color: C.primary, borderRadius: 4, padding: "1px 6px", fontSize: 9, fontFamily: "monospace" }}>{ev}</span>)}
                  </div>
                </div>
                <div>
                  <div style={{ color: wh.successRate >= 99 ? "#00E676" : wh.successRate >= 95 ? "#FFD600" : "#FF3B30", fontSize: 16, fontWeight: 700 }}>{wh.successRate}%</div>
                  <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>Success rate</div>
                </div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{wh.lastTriggered}</div>
                <div><span style={badge(wh.status === "active" ? "#00E676" : "#FFD600")}>{wh.status}</span></div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...btnSec, padding: "6px 10px", fontSize: 11 }}>Test</button>
                  <button style={{ ...btnSec, padding: "6px 10px", fontSize: 11 }}>Edit</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════ CHANNELS TAB ═══════════ */}
      {activeTab === "channels" && (
        <div>
          <h2 style={{ color: "#fff", fontSize: 18, margin: "0 0 20px" }}>Channel Configuration</h2>
          <div style={{ display: "grid", gap: 16 }}>
            {/* SMS / Twilio */}
            <div style={{ ...card, borderLeft: "4px solid #00C9FF" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 24 }}>💬</span>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>SMS (Twilio)</div>
                    <div style={{ color: "#00E676", fontSize: 11 }}>● Connected</div>
                  </div>
                </div>
                <Toggle enabled={true} color="#00C9FF" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div><label style={label}>Account SID</label><input defaultValue="AC••••••••••••••••4f2a" style={inputStyle} /></div>
                <div><label style={label}>Auth Token</label><input type="password" defaultValue="••••••••••••" style={inputStyle} /></div>
                <div><label style={label}>Phone Number</label><input defaultValue="+1 (555) 000-1234" style={inputStyle} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
                <div><label style={label}>Messaging Service SID</label><input defaultValue="MG••••••••••••••••8b1c" style={inputStyle} /></div>
                <div><label style={label}>Webhook URL (Inbound)</label><input defaultValue="https://api.engwx.com/v1/sms/inbound" style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12 }} readOnly /></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button style={{ ...btnSec, padding: "8px 14px", fontSize: 11 }}>Test Connection</button>
                <button style={{ ...btnSec, padding: "8px 14px", fontSize: 11 }}>Send Test SMS</button>
                <button style={{ ...btnSec, padding: "8px 14px", fontSize: 11 }}>View Logs</button>
              </div>
            </div>

            {/* Email / SMTP */}
            <div style={{ ...card, borderLeft: "4px solid #FF6B35" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 24 }}>📧</span>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>Email (SendGrid)</div>
                    <div style={{ color: "#00E676", fontSize: 11 }}>● Connected</div>
                  </div>
                </div>
                <Toggle enabled={true} color="#FF6B35" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div><label style={label}>API Key</label><input type="password" defaultValue="SG.••••••••••••" style={inputStyle} /></div>
                <div><label style={label}>From Email</label><input defaultValue="noreply@acmecorp.com" style={inputStyle} /></div>
                <div><label style={label}>From Name</label><input defaultValue="AcmeEngage" style={inputStyle} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 14 }}>
                <div><label style={label}>Domain</label><input defaultValue="mail.acmecorp.com" style={inputStyle} /></div>
                <div>
                  <label style={label}>DKIM</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={badge("#00E676")}>✓ Verified</span></div>
                </div>
                <div>
                  <label style={label}>SPF</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={badge("#00E676")}>✓ Verified</span></div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button style={{ ...btnSec, padding: "8px 14px", fontSize: 11 }}>Test Connection</button>
                <button style={{ ...btnSec, padding: "8px 14px", fontSize: 11 }}>Send Test Email</button>
                <button style={{ ...btnSec, padding: "8px 14px", fontSize: 11 }}>DNS Records</button>
              </div>
            </div>

            {/* WhatsApp */}
            <div style={{ ...card, borderLeft: "4px solid #25D366" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 24 }}>📱</span>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>WhatsApp Business API</div>
                    <div style={{ color: "#00E676", fontSize: 11 }}>● Connected</div>
                  </div>
                </div>
                <Toggle enabled={true} color="#25D366" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div><label style={label}>Business Account ID</label><input defaultValue="WBA-••••••••4821" style={inputStyle} /></div>
                <div><label style={label}>Phone Number ID</label><input defaultValue="+1 (555) 000-5678" style={inputStyle} /></div>
                <div><label style={label}>Access Token</label><input type="password" defaultValue="EAAx••••••••" style={inputStyle} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
                <div>
                  <label style={label}>Approved Templates</label>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>12 templates <span style={{ color: "#00E676", fontSize: 11 }}>· 3 pending</span></div>
                </div>
                <div>
                  <label style={label}>Quality Rating</label>
                  <div style={{ color: "#00E676", fontSize: 14, fontWeight: 700 }}>High ⭐⭐⭐</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button style={{ ...btnSec, padding: "8px 14px", fontSize: 11 }}>Manage Templates</button>
                <button style={{ ...btnSec, padding: "8px 14px", fontSize: 11 }}>Test Message</button>
              </div>
            </div>

            {/* RCS */}
            <div style={{ ...card, borderLeft: "4px solid #7C4DFF" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 24 }}>✨</span>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>RCS Business Messaging</div>
                    <div style={{ color: "#FFD600", fontSize: 11 }}>◉ Pending Approval</div>
                  </div>
                </div>
                <Toggle enabled={false} color="#7C4DFF" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div><label style={label}>Agent ID</label><input defaultValue="brands/acme/agents/engage" style={inputStyle} /></div>
                <div><label style={label}>Service Account</label><input defaultValue="rcs-agent@acme.iam.gserviceaccount.com" style={{ ...inputStyle, fontSize: 11 }} /></div>
                <div>
                  <label style={label}>Status</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <span style={badge("#FFD600")}>⏳ Carrier review</span>
                  </div>
                </div>
              </div>
              <div style={{ background: "#FFD60010", border: "1px solid #FFD60033", borderRadius: 8, padding: "10px 14px", marginTop: 14, color: "#FFD600", fontSize: 12 }}>
                ⚠️ RCS agent is awaiting carrier approval. Estimated 5-10 business days. SMS fallback is active for unsupported devices.
              </div>
            </div>

            {/* Voice */}
            <div style={{ ...card, borderLeft: "4px solid #FFD600" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 24 }}>📞</span>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>Voice (Twilio)</div>
                    <div style={{ color: "#00E676", fontSize: 11 }}>● Connected</div>
                  </div>
                </div>
                <Toggle enabled={true} color="#FFD600" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div><label style={label}>Voice Number</label><input defaultValue="+1 (555) 000-9999" style={inputStyle} /></div>
                <div><label style={label}>SIP Domain</label><input defaultValue="acme.sip.twilio.com" style={inputStyle} /></div>
                <div><label style={label}>TTS Voice</label><select style={inputStyle}><option>Polly (Neural)</option><option>Google WaveNet</option><option>Amazon Nova</option></select></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
                <div><label style={label}>IVR Webhook</label><input defaultValue="https://api.engwx.com/v1/voice/ivr" style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12 }} readOnly /></div>
                <div><label style={label}>Recording Storage</label><select style={inputStyle}><option>EngageWorx Cloud (encrypted)</option><option>AWS S3</option><option>Google Cloud Storage</option></select></div>
              </div>
            </div>

            {/* MMS */}
            <div style={{ ...card, borderLeft: "4px solid #E040FB" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 24 }}>📷</span>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>MMS (via Twilio)</div>
                    <div style={{ color: "#00E676", fontSize: 11 }}>● Connected (shares SMS config)</div>
                  </div>
                </div>
                <Toggle enabled={true} color="#E040FB" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div><label style={label}>Max Media Size</label><select style={inputStyle}><option>5 MB (default)</option><option>1 MB</option><option>10 MB</option></select></div>
                <div><label style={label}>Supported Formats</label><div style={{ ...inputStyle, background: "rgba(0,0,0,0.2)", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>JPEG, PNG, GIF, MP4, PDF</div></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ BILLING TAB ═══════════ */}
      {activeTab === "billing" && (
        <div>
          <h2 style={{ color: "#fff", fontSize: 18, margin: "0 0 20px" }}>Billing & Subscription</h2>

          {/* Current Plan */}
          <div style={{ ...card, marginBottom: 20, borderLeft: `4px solid ${C.primary}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: C.primary, fontSize: 22, fontWeight: 800 }}>Growth Plan</span>
                  <span style={badge("#00E676")}>● Active</span>
                </div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>$799/month · Billed monthly · Next invoice: Mar 15, 2025</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "#fff", fontSize: 28, fontWeight: 800 }}>$799<span style={{ color: C.muted, fontSize: 14, fontWeight: 400 }}>/mo</span></div>
                <button style={{ ...btnSec, padding: "6px 14px", fontSize: 11, marginTop: 6 }}>Upgrade Plan</button>
              </div>
            </div>
          </div>

          {/* Usage */}
          <div style={{ ...card, marginBottom: 20 }}>
            <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Current Usage</h3>
            <div style={{ display: "grid", gap: 14 }}>
              {[
                { label: "Messages", used: 142800, limit: 250000, color: C.primary },
                { label: "Contacts", used: 48200, limit: 100000, color: "#00E676" },
                { label: "Campaigns", used: 24, limit: 50, color: "#FFD600" },
                { label: "Users", used: 5, limit: 10, color: "#E040FB" },
                { label: "API Calls (today)", used: 12400, limit: 100000, color: "#FF6B35" },
              ].map((u, i) => {
                const pct = Math.round((u.used / u.limit) * 100);
                return (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{u.label}</span>
                      <span style={{ color: pct > 80 ? "#FF6B35" : "#fff", fontSize: 13, fontWeight: 600 }}>{u.used.toLocaleString()} / {u.limit.toLocaleString()} <span style={{ color: u.color, fontSize: 11 }}>({pct}%)</span></span>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3 }}>
                      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: pct > 90 ? "#FF3B30" : pct > 80 ? "#FF6B35" : u.color, borderRadius: 3, transition: "width 0.3s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stripe Config */}
          <div style={{ ...card, marginBottom: 20 }}>
            <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Payment Method (Stripe)</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 28 }}>💳</div>
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Visa ending in 4821</div>
                  <div style={{ color: C.muted, fontSize: 12 }}>Expires 12/2027</div>
                </div>
                <span style={{ ...badge("#00E676"), marginLeft: "auto" }}>Default</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button style={btnSec}>Update Payment Method</button>
                <button style={btnSec}>View Invoices</button>
              </div>
            </div>
          </div>

          {/* Stripe Keys (SP only) */}
          {viewLevel === "sp" && (
            <div style={{ ...card }}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Stripe Integration (Service Provider)</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div><label style={label}>Stripe Publishable Key</label><input defaultValue="pk_live_••••••••••••••••" style={inputStyle} type="password" /></div>
                <div><label style={label}>Stripe Secret Key</label><input defaultValue="sk_live_••••••••••••••••" style={inputStyle} type="password" /></div>
                <div><label style={label}>Webhook Signing Secret</label><input defaultValue="whsec_••••••••••••" style={inputStyle} type="password" /></div>
                <div><label style={label}>Webhook Endpoint</label><input defaultValue="https://api.engwx.com/v1/stripe/webhook" style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12 }} readOnly /></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button style={btnPrimary}>Save Stripe Config</button>
                <button style={btnSec}>Test Connection</button>
                <button style={btnSec}>View Dashboard →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ TEAM TAB ═══════════ */}
      {activeTab === "team" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ color: "#fff", fontSize: 18, margin: 0 }}>Team Members</h2>
            <button style={btnPrimary}>+ Invite Member</button>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {TEAM_MEMBERS.map(tm => (
              <div key={tm.id} style={{
                ...card, display: "grid", gridTemplateColumns: "1fr 140px 120px 80px 100px",
                alignItems: "center", gap: 14,
                borderLeft: `4px solid ${tm.status === "active" ? "#00E676" : "#FFD600"}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: `linear-gradient(135deg, ${C.primary}44, ${C.primary}22)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: C.primary }}>{tm.avatar}</div>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{tm.name}</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>{tm.email}</div>
                  </div>
                </div>
                <div>
                  <select defaultValue={tm.role} style={{ ...inputStyle, padding: "6px 10px", fontSize: 12 }}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{tm.lastLogin}</div>
                <div><span style={badge(tm.status === "active" ? "#00E676" : "#FFD600")}>{tm.status}</span></div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...btnSec, padding: "6px 10px", fontSize: 11 }}>Edit</button>
                  <button style={{ ...btnSec, padding: "6px 10px", fontSize: 11, color: "#FF3B30" }}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════ NOTIFICATIONS TAB ═══════════ */}
      {activeTab === "notifications" && (
        <div>
          <h2 style={{ color: "#fff", fontSize: 18, margin: "0 0 20px" }}>Notification Preferences</h2>
          <div style={card}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px", gap: 8, padding: "0 0 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 8 }}>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Event</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" }}>📧 Email</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" }}>🔔 Push</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" }}>💬 SMS</div>
            </div>
            {notifications.map(n => (
              <div key={n.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px", gap: 8, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", alignItems: "center" }}>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{n.label}</div>
                {["email", "push", "sms"].map(ch => (
                  <div key={ch} style={{ textAlign: "center" }} onClick={() => toggleNotif(n.id, ch)}>
                    <Toggle enabled={n[ch]} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════ SECURITY TAB ═══════════ */}
      {activeTab === "security" && (
        <div>
          <h2 style={{ color: "#fff", fontSize: 18, margin: "0 0 20px" }}>Security Settings</h2>
          <div style={{ display: "grid", gap: 16 }}>
            <div style={card}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Authentication</h3>
              <div style={{ display: "grid", gap: 14 }}>
                {[
                  { label: "Two-Factor Authentication (2FA)", desc: "Require 2FA for all team members", enabled: true },
                  { label: "SSO (Single Sign-On)", desc: "SAML 2.0 / OpenID Connect integration", enabled: false },
                  { label: "IP Allowlist", desc: "Restrict API access to specific IP addresses", enabled: false },
                  { label: "Session Timeout", desc: "Auto-logout after 30 minutes of inactivity", enabled: true },
                ].map((s, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                    <div>
                      <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{s.label}</div>
                      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 2 }}>{s.desc}</div>
                    </div>
                    <Toggle enabled={s.enabled} />
                  </div>
                ))}
              </div>
            </div>

            <div style={card}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Data & Compliance</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {[
                  { label: "Data Encryption", status: "AES-256 at rest, TLS 1.3 in transit", color: "#00E676" },
                  { label: "GDPR Compliance", status: "Enabled — DPA signed", color: "#00E676" },
                  { label: "SOC 2 Type II", status: "Certified", color: "#00E676" },
                  { label: "Data Retention", status: "90 days (configurable)", color: "#FFD600" },
                  { label: "PII Masking", status: "Enabled for logs", color: "#00E676" },
                  { label: "Audit Trail", status: "All actions logged", color: "#00E676" },
                ].map((item, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "12px 16px" }}>
                    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 4 }}>{item.label}</div>
                    <div style={{ color: item.color, fontSize: 13, fontWeight: 600 }}>{item.status}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={card}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Recent Security Events</h3>
              {[
                { event: "API key generated", user: "sarah.m@acmecorp.com", time: "2 hours ago", icon: "🔑" },
                { event: "Team member invited", user: "sarah.m@acmecorp.com", time: "Yesterday", icon: "👤" },
                { event: "Password changed", user: "james.k@acmecorp.com", time: "3 days ago", icon: "🔒" },
                { event: "2FA enabled", user: "priya.r@acmecorp.com", time: "1 week ago", icon: "🛡️" },
                { event: "Failed login attempt (blocked)", user: "unknown@attacker.com", time: "2 weeks ago", icon: "🚫" },
              ].map((ev, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>{ev.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{ev.event}</div>
                    <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>{ev.user}</div>
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>{ev.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
