import { useState, useEffect } from "react";

const COLORS = {
  bg: "#0A0E1A",
  surface: "#111827",
  surfaceAlt: "#1a2235",
  border: "#1e2d45",
  accent: "#00C9FF",
  accent2: "#E040FB",
  accent3: "#00E676",
  accent4: "#FF6B35",
  text: "#E8F4FD",
  textMuted: "#6B8BAE",
  textDim: "#3A5068",
};

const channelConfig = {
  SMS: { color: "#00C9FF", icon: "💬" },
  MMS: { color: "#7C4DFF", icon: "🖼️" },
  WhatsApp: { color: "#25D366", icon: "📱" },
  Email: { color: "#FF6B35", icon: "📧" },
  Voice: { color: "#E040FB", icon: "📞" },
  RCS: { color: "#00E676", icon: "✨" },
};

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "⊞" },
  { id: "campaigns", label: "Campaigns", icon: "🚀" },
  { id: "flows", label: "Flow Builder", icon: "⚡" },
  { id: "chatbot", label: "AI Chatbot", icon: "🤖" },
  { id: "analytics", label: "Analytics", icon: "📊" },
  { id: "contacts", label: "Contacts", icon: "👥" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

const sparkData = [40, 65, 45, 80, 60, 90, 75, 95, 70, 88, 92, 100];

function Sparkline({ data, color }) {
  const w = 120, h = 40;
  const max = Math.max(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`sg-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke={color} strokeWidth="2" points={pts} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Badge({ children, color }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600, letterSpacing: 0.5
    }}>{children}</span>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard() {
  const [animate, setAnimate] = useState(false);
  useEffect(() => { setTimeout(() => setAnimate(true), 100); }, []);

  const stats = [
    { label: "Messages Sent", value: "284,712", delta: "+12.4%", color: COLORS.accent, icon: "📨" },
    { label: "Delivery Rate", value: "95.3%", delta: "+0.8%", color: COLORS.accent3, icon: "✅" },
    { label: "Open Rate", value: "51.2%", delta: "+3.1%", color: COLORS.accent2, icon: "👁️" },
    { label: "Revenue Generated", value: "$128,450", delta: "+22.7%", color: COLORS.accent4, icon: "💰" },
  ];

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1400 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: COLORS.text, margin: 0 }}>
          Command Center
        </h1>
        <p style={{ color: COLORS.textMuted, marginTop: 6, fontSize: 14 }}>
          Real-time overview · engwx.com · All channels active
        </p>
      </div>

      {/* Channel Status Bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 32, flexWrap: "wrap" }}>
        {Object.entries(channelConfig).map(([ch, cfg]) => (
          <div key={ch} style={{
            background: COLORS.surface, border: `1px solid ${cfg.color}44`,
            borderRadius: 10, padding: "10px 18px", display: "flex", alignItems: "center", gap: 10,
            opacity: animate ? 1 : 0, transition: "opacity 0.5s ease",
          }}>
            <span style={{ fontSize: 18 }}>{cfg.icon}</span>
            <div>
              <div style={{ fontSize: 12, color: cfg.color, fontWeight: 700 }}>{ch}</div>
              <div style={{ fontSize: 10, color: COLORS.textMuted }}>● Active</div>
            </div>
          </div>
        ))}
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, marginBottom: 32 }}>
        {stats.map((s, i) => (
          <div key={s.label} style={{
            background: COLORS.surface, border: `1px solid ${COLORS.border}`,
            borderRadius: 14, padding: 24,
            borderTop: `3px solid ${s.color}`,
            opacity: animate ? 1 : 0,
            transform: animate ? "translateY(0)" : "translateY(20px)",
            transition: `all 0.5s ease ${i * 0.1}s`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.text }}>{s.value}</div>
                <div style={{ color: s.color, fontSize: 13, marginTop: 4, fontWeight: 600 }}>{s.delta} vs last month</div>
              </div>
              <span style={{ fontSize: 24 }}>{s.icon}</span>
            </div>
            <div style={{ marginTop: 16 }}>
              <Sparkline data={sparkData.map(v => v * (0.8 + Math.random() * 0.4))} color={s.color} />
            </div>
          </div>
        ))}
      </div>

      {/* Channel Performance + Recent Campaigns */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 24 }}>
          <h3 style={{ color: COLORS.text, margin: "0 0 20px", fontSize: 16 }}>Channel Performance</h3>
          {Object.entries(channelConfig).map(([ch, cfg]) => {
            const pct = 40 + Math.floor(Math.random() * 55);
            return (
              <div key={ch} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: COLORS.text, fontSize: 13 }}>{cfg.icon} {ch}</span>
                  <span style={{ color: cfg.color, fontSize: 13, fontWeight: 700 }}>{pct}%</span>
                </div>
                <div style={{ height: 6, background: COLORS.bg, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: cfg.color, borderRadius: 3, transition: "width 1s ease" }} />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 24 }}>
          <h3 style={{ color: COLORS.text, margin: "0 0 20px", fontSize: 16 }}>Active Campaigns</h3>
          {[
            { name: "Summer Flash Sale", channel: "SMS", status: "Live", reach: "48,200", color: COLORS.accent },
            { name: "Welcome Series", channel: "Email", status: "Live", reach: "12,440", color: COLORS.accent4 },
            { name: "Re-engagement", channel: "WhatsApp", status: "Paused", reach: "6,800", color: "#25D366" },
            { name: "VIP Loyalty", channel: "RCS", status: "Draft", reach: "3,100", color: COLORS.accent3 },
          ].map(c => (
            <div key={c.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${COLORS.border}` }}>
              <div>
                <div style={{ color: COLORS.text, fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                <div style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>{channelConfig[c.channel]?.icon} {c.channel} · {c.reach} contacts</div>
              </div>
              <Badge color={c.status === "Live" ? COLORS.accent3 : c.status === "Paused" ? COLORS.accent4 : COLORS.textMuted}>{c.status}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── CAMPAIGNS ────────────────────────────────────────────────────────────────
function Campaigns() {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", channel: "SMS", audience: "", message: "", schedule: "now" });

  return (
    <div style={{ padding: "32px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: COLORS.text, margin: 0 }}>Campaign Manager</h1>
          <p style={{ color: COLORS.textMuted, marginTop: 6, fontSize: 14 }}>Create and manage omnichannel campaigns</p>
        </div>
        <button onClick={() => setShowNew(true)} style={{
          background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accent2})`,
          border: "none", borderRadius: 10, padding: "12px 24px",
          color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14,
        }}>+ New Campaign</button>
      </div>

      {showNew && (
        <div style={{
          background: COLORS.surface, border: `1px solid ${COLORS.accent}55`,
          borderRadius: 16, padding: 32, marginBottom: 32,
          boxShadow: `0 0 40px ${COLORS.accent}22`,
        }}>
          <h3 style={{ color: COLORS.text, margin: "0 0 24px", fontSize: 18 }}>⚡ Create New Campaign</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {[
              { label: "Campaign Name", key: "name", type: "text", placeholder: "e.g. Summer Flash Sale" },
              { label: "Audience Segment", key: "audience", type: "text", placeholder: "e.g. All subscribers" },
            ].map(f => (
              <div key={f.key}>
                <label style={{ color: COLORS.textMuted, fontSize: 12, display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>{f.label}</label>
                <input
                  value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  style={{ width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 14px", color: COLORS.text, fontSize: 14, boxSizing: "border-box" }}
                />
              </div>
            ))}
            <div>
              <label style={{ color: COLORS.textMuted, fontSize: 12, display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Channel</label>
              <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}
                style={{ width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 14px", color: COLORS.text, fontSize: 14 }}>
                {Object.keys(channelConfig).map(ch => <option key={ch}>{ch}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: COLORS.textMuted, fontSize: 12, display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Schedule</label>
              <select value={form.schedule} onChange={e => setForm({ ...form, schedule: e.target.value })}
                style={{ width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 14px", color: COLORS.text, fontSize: 14 }}>
                <option value="now">Send Immediately</option>
                <option value="later">Schedule for Later</option>
                <option value="trigger">Trigger-Based</option>
              </select>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ color: COLORS.textMuted, fontSize: 12, display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Message</label>
              <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                placeholder="Write your message... Use {{first_name}}, {{promo_code}} for personalization"
                rows={4}
                style={{ width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 14px", color: COLORS.text, fontSize: 14, resize: "vertical", boxSizing: "border-box" }}
              />
              <div style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 4 }}>Supports: personalization tokens, emoji, media links, opt-out footers</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button style={{ background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accent2})`, border: "none", borderRadius: 8, padding: "11px 24px", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
              Launch Campaign
            </button>
            <button onClick={() => setShowNew(false)} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "11px 24px", color: COLORS.textMuted, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {[
          { name: "Summer Flash Sale", channel: "SMS", status: "Live", sent: 48200, opened: 24100, clicked: 7230, revenue: "$34,200" },
          { name: "Welcome Onboarding Series", channel: "Email", status: "Live", sent: 12440, opened: 9830, clicked: 3210, revenue: "$8,700" },
          { name: "Cart Abandonment Recovery", channel: "WhatsApp", status: "Live", sent: 6800, opened: 5940, clicked: 2100, revenue: "$18,900" },
          { name: "Win-Back Re-engagement", channel: "SMS", status: "Paused", sent: 22100, opened: 8800, clicked: 2400, revenue: "$9,400" },
          { name: "VIP Loyalty Rewards", channel: "RCS", status: "Draft", sent: 0, opened: 0, clicked: 0, revenue: "$0" },
          { name: "Product Launch Blast", channel: "MMS", status: "Scheduled", sent: 0, opened: 0, clicked: 0, revenue: "$0" },
        ].map((c, i) => {
          const cfg = channelConfig[c.channel];
          const statusColor = c.status === "Live" ? COLORS.accent3 : c.status === "Paused" ? COLORS.accent4 : c.status === "Scheduled" ? COLORS.accent : COLORS.textMuted;
          return (
            <div key={i} style={{
              background: COLORS.surface, border: `1px solid ${COLORS.border}`,
              borderRadius: 12, padding: "20px 24px",
              display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 100px",
              alignItems: "center", gap: 16,
              transition: "border-color 0.2s",
            }}>
              <div>
                <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                <div style={{ color: cfg.color, fontSize: 12, marginTop: 4 }}>{cfg.icon} {c.channel}</div>
              </div>
              {[
                { label: "Sent", val: c.sent.toLocaleString() },
                { label: "Opened", val: c.opened.toLocaleString() },
                { label: "Clicked", val: c.clicked.toLocaleString() },
                { label: "Revenue", val: c.revenue },
              ].map(m => (
                <div key={m.label} style={{ textAlign: "center" }}>
                  <div style={{ color: COLORS.text, fontSize: 15, fontWeight: 700 }}>{m.val}</div>
                  <div style={{ color: COLORS.textMuted, fontSize: 11 }}>{m.label}</div>
                </div>
              ))}
              <div style={{ textAlign: "center" }}>
                <Badge color={statusColor}>{c.status}</Badge>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={{ background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "6px 12px", color: COLORS.textMuted, cursor: "pointer", fontSize: 12 }}>Edit</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── FLOW BUILDER ─────────────────────────────────────────────────────────────
function FlowBuilder() {
  const nodes = [
    { id: 1, type: "trigger", label: "Contact Joins List", x: 60, y: 60, color: COLORS.accent },
    { id: 2, type: "message", label: "Send Welcome SMS", x: 60, y: 200, color: "#7C4DFF" },
    { id: 3, type: "wait", label: "Wait 2 Days", x: 60, y: 340, color: COLORS.accent4 },
    { id: 4, type: "condition", label: "Opened SMS?", x: 60, y: 480, color: COLORS.accent2 },
    { id: 5, type: "message", label: "Send Follow-up Email ✓", x: 260, y: 580, color: COLORS.accent3 },
    { id: 6, type: "message", label: "Re-send via WhatsApp ✗", x: -140, y: 580, color: "#25D366" },
  ];

  const nodeTypes = [
    { type: "trigger", label: "Trigger", color: COLORS.accent, icon: "⚡" },
    { type: "message", label: "Send Message", color: "#7C4DFF", icon: "💬" },
    { type: "wait", label: "Wait / Delay", color: COLORS.accent4, icon: "⏱️" },
    { type: "condition", label: "Condition", color: COLORS.accent2, icon: "🔀" },
    { type: "action", label: "Action", color: COLORS.accent3, icon: "🎯" },
    { type: "ai", label: "AI Step", color: "#FF6B35", icon: "🤖" },
  ];

  return (
    <div style={{ padding: "32px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: COLORS.text, margin: 0 }}>Visual Flow Builder</h1>
          <p style={{ color: COLORS.textMuted, marginTop: 6, fontSize: 14 }}>Drag & drop to build automated customer journeys</p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 20px", color: COLORS.text, cursor: "pointer", fontSize: 13 }}>💾 Save</button>
          <button style={{ background: `linear-gradient(135deg, ${COLORS.accent3}, #00897B)`, border: "none", borderRadius: 8, padding: "10px 20px", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>▶ Activate Flow</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20 }}>
        {/* Sidebar */}
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ color: COLORS.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>Add Steps</div>
          {nodeTypes.map(n => (
            <div key={n.type} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              background: COLORS.bg, border: `1px solid ${n.color}44`, borderRadius: 8,
              marginBottom: 8, cursor: "grab", transition: "border-color 0.2s",
            }}>
              <span style={{ fontSize: 18 }}>{n.icon}</span>
              <div>
                <div style={{ color: n.color, fontSize: 12, fontWeight: 700 }}>{n.label}</div>
              </div>
            </div>
          ))}

          <div style={{ marginTop: 24, padding: "16px", background: COLORS.bg, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
            <div style={{ color: COLORS.accent, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>📋 TEMPLATES</div>
            {["Welcome Series", "Cart Recovery", "Re-engagement", "Post-Purchase", "Birthday Flow"].map(t => (
              <div key={t} style={{ color: COLORS.textMuted, fontSize: 12, padding: "6px 0", cursor: "pointer", borderBottom: `1px solid ${COLORS.border}` }}>
                {t}
              </div>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div style={{
          background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 12,
          height: 680, position: "relative", overflow: "hidden",
          backgroundImage: `radial-gradient(${COLORS.border} 1px, transparent 1px)`,
          backgroundSize: "28px 28px",
        }}>
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            {[[1, 2], [2, 3], [3, 4], [4, 5], [4, 6]].map(([a, b]) => {
              const from = nodes.find(n => n.id === a);
              const to = nodes.find(n => n.id === b);
              if (!from || !to) return null;
              const x1 = from.x + 160 + 80, y1 = from.y + 40;
              const x2 = to.x + 160 + 80, y2 = to.y + 16;
              return (
                <g key={`${a}-${b}`}>
                  <path d={`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`}
                    fill="none" stroke={COLORS.accent + "66"} strokeWidth="2" strokeDasharray="4 4" />
                  <polygon points={`${x2},${y2} ${x2 - 5},${y2 - 8} ${x2 + 5},${y2 - 8}`} fill={COLORS.accent + "88"} />
                </g>
              );
            })}
          </svg>
          {nodes.map(node => (
            <div key={node.id} style={{
              position: "absolute", left: node.x + 60, top: node.y + 30,
              width: 200, background: COLORS.surface, border: `2px solid ${node.color}`,
              borderRadius: 10, padding: "10px 14px", cursor: "pointer",
              boxShadow: `0 0 20px ${node.color}33`,
            }}>
              <div style={{ color: node.color, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                {node.type}
              </div>
              <div style={{ color: COLORS.text, fontSize: 13 }}>{node.label}</div>
            </div>
          ))}

          <div style={{
            position: "absolute", bottom: 16, right: 16, background: COLORS.surface,
            border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 16px",
            color: COLORS.textMuted, fontSize: 12,
          }}>
            6 nodes · 5 connections · Est. reach: 48,200
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AI CHATBOT ───────────────────────────────────────────────────────────────
function ChatbotConfig() {
  const [tab, setTab] = useState("setup");
  const [messages, setMessages] = useState([
    { from: "bot", text: "Hi! I'm your EngageWorx AI assistant. How can I help you today? 😊" },
  ]);
  const [input, setInput] = useState("");

  const send = () => {
    if (!input.trim()) return;
    const userMsg = { from: "user", text: input };
    const responses = [
      "I can help with that! Let me check your account details.",
      "Great question! Your order #4821 is currently in transit and expected by Friday.",
      "I've updated your preferences. Is there anything else I can assist with?",
      "I'm connecting you with a specialist for this. Please hold for a moment.",
      "Thanks for reaching out! I've logged this request and our team will follow up within 24 hours.",
    ];
    const botMsg = { from: "bot", text: responses[Math.floor(Math.random() * responses.length)] };
    setMessages(m => [...m, userMsg, botMsg]);
    setInput("");
  };

  const tabs = ["setup", "intents", "preview", "deploy"];

  return (
    <div style={{ padding: "32px 40px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: COLORS.text, margin: "0 0 8px" }}>AI Chatbot Studio</h1>
      <p style={{ color: COLORS.textMuted, marginBottom: 28, fontSize: 14 }}>Configure your intelligent conversational agent</p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 28, background: COLORS.surface, padding: 4, borderRadius: 10, width: "fit-content", border: `1px solid ${COLORS.border}` }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? COLORS.accent : "transparent",
            border: "none", borderRadius: 7, padding: "8px 20px",
            color: tab === t ? "#000" : COLORS.textMuted, fontWeight: tab === t ? 700 : 400,
            cursor: "pointer", fontSize: 13, textTransform: "capitalize", transition: "all 0.2s",
          }}>{t === "setup" ? "⚙️ Setup" : t === "intents" ? "🎯 Intents" : t === "preview" ? "👁️ Preview" : "🚀 Deploy"}</button>
        ))}
      </div>

      {tab === "setup" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 28 }}>
            <h3 style={{ color: COLORS.text, margin: "0 0 20px" }}>Bot Configuration</h3>
            {[
              { label: "Bot Name", placeholder: "EngageWorx Assistant", type: "text" },
              { label: "Fallback Message", placeholder: "I'll connect you to an agent...", type: "text" },
              { label: "Escalation Threshold", placeholder: "3 failed intents", type: "text" },
              { label: "Max Session Duration", placeholder: "30 minutes", type: "text" },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 16 }}>
                <label style={{ color: COLORS.textMuted, fontSize: 12, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>{f.label}</label>
                <input placeholder={f.placeholder} style={{ width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 14px", color: COLORS.text, fontSize: 14, boxSizing: "border-box" }} />
              </div>
            ))}

            <div style={{ marginTop: 8 }}>
              <div style={{ color: COLORS.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>AI Model</div>
              {["GPT-4o (Recommended)", "Claude 3.5", "Gemini Pro", "Custom Fine-tuned"].map(m => (
                <label key={m} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, cursor: "pointer" }}>
                  <input type="radio" name="model" defaultChecked={m.includes("Recommended")} style={{ accentColor: COLORS.accent }} />
                  <span style={{ color: COLORS.text, fontSize: 13 }}>{m}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 28 }}>
            <h3 style={{ color: COLORS.text, margin: "0 0 20px" }}>Handoff & Escalation Rules</h3>
            {[
              { label: "Live Agent Routing", desc: "Route to available agents when bot confidence < 70%" },
              { label: "Sentiment Detection", desc: "Escalate on negative sentiment detection" },
              { label: "VIP Priority Routing", desc: "Route VIP contacts to senior agents" },
              { label: "After-Hours Handling", desc: "Collect info & schedule callback outside hours" },
              { label: "Language Detection", desc: "Auto-detect and respond in customer's language" },
              { label: "Profanity Filter", desc: "Filter inappropriate content in both directions" },
            ].map(r => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${COLORS.border}` }}>
                <div>
                  <div style={{ color: COLORS.text, fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                  <div style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>{r.desc}</div>
                </div>
                <div style={{ width: 44, height: 24, background: COLORS.accent, borderRadius: 12, position: "relative", cursor: "pointer" }}>
                  <div style={{ width: 18, height: 18, background: "#fff", borderRadius: "50%", position: "absolute", right: 3, top: 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "intents" && (
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
            <h3 style={{ color: COLORS.text, margin: 0 }}>Intent Library</h3>
            <button style={{ background: COLORS.accent, border: "none", borderRadius: 8, padding: "8px 18px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Add Intent</button>
          </div>
          {[
            { intent: "Order Status", examples: 14, responses: 3, accuracy: "96%" },
            { intent: "Billing Inquiry", examples: 22, responses: 5, accuracy: "91%" },
            { intent: "Product Info", examples: 31, responses: 8, accuracy: "89%" },
            { intent: "Complaint", examples: 18, responses: 4, accuracy: "87%" },
            { intent: "Appointment Booking", examples: 25, responses: 6, accuracy: "94%" },
            { intent: "Returns & Refunds", examples: 20, responses: 5, accuracy: "92%" },
            { intent: "Human Agent Request", examples: 8, responses: 1, accuracy: "99%" },
          ].map((item, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 80px", gap: 16, padding: "14px 0", borderBottom: `1px solid ${COLORS.border}`, alignItems: "center" }}>
              <div style={{ color: COLORS.text, fontWeight: 600, fontSize: 14 }}>🎯 {item.intent}</div>
              <div style={{ color: COLORS.textMuted, fontSize: 13 }}>{item.examples} examples</div>
              <div style={{ color: COLORS.textMuted, fontSize: 13 }}>{item.responses} responses</div>
              <div>
                <Badge color={parseFloat(item.accuracy) > 90 ? COLORS.accent3 : COLORS.accent4}>{item.accuracy}</Badge>
              </div>
              <button style={{ background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "5px 12px", color: COLORS.textMuted, cursor: "pointer", fontSize: 12 }}>Edit</button>
            </div>
          ))}
        </div>
      )}

      {tab === "preview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24 }}>
          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 28 }}>
            <h3 style={{ color: COLORS.text, margin: "0 0 16px" }}>Conversation Flow Preview</h3>
            <p style={{ color: COLORS.textMuted, fontSize: 13 }}>Test your chatbot across different channels and scenarios. The chatbot preview on the right shows how customers will interact.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20 }}>
              {["Order Status Check", "Billing Issue", "Return Request", "Product Question", "Complaint Handling", "Book Appointment"].map(s => (
                <div key={s} style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "12px 16px", cursor: "pointer" }}>
                  <div style={{ color: COLORS.accent, fontSize: 13, fontWeight: 600 }}>▶ {s}</div>
                  <div style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 4 }}>Test scenario</div>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Preview */}
          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", height: 560 }}>
            <div style={{ padding: "14px 18px", background: COLORS.accent, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, background: "#fff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🤖</div>
              <div>
                <div style={{ color: "#000", fontWeight: 700, fontSize: 14 }}>EngageWorx Assistant</div>
                <div style={{ color: "#00000088", fontSize: 11 }}>● Online</div>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {messages.map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth: "80%", padding: "10px 14px", borderRadius: m.from === "user" ? "12px 12px 0 12px" : "12px 12px 12px 0",
                    background: m.from === "user" ? COLORS.accent : COLORS.bg,
                    color: m.from === "user" ? "#000" : COLORS.text,
                    fontSize: 13, lineHeight: 1.5,
                  }}>{m.text}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${COLORS.border}`, display: "flex", gap: 8 }}>
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && send()}
                placeholder="Test a message..." style={{
                  flex: 1, background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8,
                  padding: "8px 12px", color: COLORS.text, fontSize: 13,
                }} />
              <button onClick={send} style={{ background: COLORS.accent, border: "none", borderRadius: 8, padding: "8px 14px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>→</button>
            </div>
          </div>
        </div>
      )}

      {tab === "deploy" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {Object.entries(channelConfig).map(([ch, cfg]) => (
            <div key={ch} style={{ background: COLORS.surface, border: `1px solid ${cfg.color}44`, borderRadius: 14, padding: 24 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>{cfg.icon}</div>
              <h3 style={{ color: COLORS.text, margin: "0 0 8px", fontSize: 16 }}>{ch}</h3>
              <p style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: 16 }}>
                Deploy your AI chatbot on {ch}. {ch === "Voice" ? "Configure IVR and speech synthesis." : ch === "Email" ? "Enable email-based conversation threading." : "Connect via API integration."}
              </p>
              <button style={{
                background: `${cfg.color}22`, border: `1px solid ${cfg.color}66`,
                borderRadius: 8, padding: "10px 20px", color: cfg.color,
                fontWeight: 700, cursor: "pointer", fontSize: 13, width: "100%",
              }}>Configure {ch}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────
function Analytics() {
  const barData = [
    { month: "Aug", val: 62 }, { month: "Sep", val: 78 }, { month: "Oct", val: 55 },
    { month: "Nov", val: 91 }, { month: "Dec", val: 88 }, { month: "Jan", val: 74 },
    { month: "Feb", val: 96 },
  ];

  return (
    <div style={{ padding: "32px 40px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: COLORS.text, margin: "0 0 8px" }}>Analytics & Insights</h1>
      <p style={{ color: COLORS.textMuted, marginBottom: 28, fontSize: 14 }}>Deep dive into campaign and channel performance</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
        {[
          { label: "Total Revenue", val: "$128,450", icon: "💰", color: COLORS.accent4 },
          { label: "Avg. CTR", val: "14.8%", icon: "🖱️", color: COLORS.accent },
          { label: "Conversion Rate", val: "3.2%", icon: "🎯", color: COLORS.accent3 },
          { label: "Cost Per Message", val: "$0.021", icon: "💡", color: COLORS.accent2 },
        ].map(s => (
          <div key={s.label} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 24 }}>{s.icon}</span>
              <Badge color={s.color}>+↑</Badge>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: COLORS.text, marginTop: 12 }}>{s.val}</div>
            <div style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 28 }}>
          <h3 style={{ color: COLORS.text, margin: "0 0 24px" }}>Monthly Message Volume</h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 200 }}>
            {barData.map((d, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>{d.val}K</div>
                <div style={{
                  width: "100%", height: d.val * 2, background: `linear-gradient(180deg, ${COLORS.accent}, ${COLORS.accent2})`,
                  borderRadius: "4px 4px 0 0", transition: "height 0.5s ease",
                }} />
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>{d.month}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 28 }}>
          <h3 style={{ color: COLORS.text, margin: "0 0 20px" }}>Channel Mix</h3>
          {[
            { ch: "SMS", pct: 42, val: "119,580" },
            { ch: "Email", pct: 24, val: "68,330" },
            { ch: "WhatsApp", pct: 18, val: "51,248" },
            { ch: "Voice", pct: 8, val: "22,777" },
            { ch: "RCS", pct: 5, val: "14,236" },
            { ch: "MMS", pct: 3, val: "8,541" },
          ].map(r => {
            const cfg = channelConfig[r.ch];
            return (
              <div key={r.ch} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ color: COLORS.text, fontSize: 13 }}>{cfg.icon} {r.ch}</span>
                  <span style={{ color: cfg.color, fontSize: 12, fontWeight: 700 }}>{r.pct}% · {r.val}</span>
                </div>
                <div style={{ height: 5, background: COLORS.bg, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${r.pct}%`, background: cfg.color, borderRadius: 3 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("dashboard");

  const pageMap = {
    dashboard: <Dashboard />,
    campaigns: <Campaigns />,
    flows: <FlowBuilder />,
    chatbot: <ChatbotConfig />,
    analytics: <Analytics />,
    contacts: (
      <div style={{ padding: "32px 40px" }}>
        <h1 style={{ color: COLORS.text, fontSize: 28, fontWeight: 700 }}>Contacts</h1>
        <p style={{ color: COLORS.textMuted }}>Contact management, segmentation, and CRM sync coming here.</p>
      </div>
    ),
    settings: (
      <div style={{ padding: "32px 40px" }}>
        <h1 style={{ color: COLORS.text, fontSize: 28, fontWeight: 700 }}>Settings</h1>
        <p style={{ color: COLORS.textMuted }}>API keys, integrations, team management, billing, and compliance settings.</p>
      </div>
    ),
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: COLORS.bg, fontFamily: "'DM Sans', 'Segoe UI', sans-serif", color: COLORS.text }}>
      {/* Sidebar */}
      <div style={{
        width: 240, background: COLORS.surface, borderRight: `1px solid ${COLORS.border}`,
        display: "flex", flexDirection: "column", padding: "24px 16px", flexShrink: 0,
        position: "fixed", height: "100vh", top: 0,
      }}>
        <div style={{ marginBottom: 32, paddingLeft: 8 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.text, letterSpacing: -0.5 }}>
            Engage<span style={{ color: COLORS.accent }}>Worx</span>
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>Customer Communications</div>
        </div>

        <nav style={{ flex: 1 }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => setPage(item.id)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 12,
              padding: "11px 12px", borderRadius: 9, border: "none",
              background: page === item.id ? `${COLORS.accent}22` : "transparent",
              color: page === item.id ? COLORS.accent : COLORS.textMuted,
              cursor: "pointer", fontSize: 14, fontWeight: page === item.id ? 700 : 400,
              marginBottom: 4, textAlign: "left",
              borderLeft: page === item.id ? `3px solid ${COLORS.accent}` : "3px solid transparent",
              transition: "all 0.15s",
            }}>
              <span style={{ fontSize: 17 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div style={{ padding: "16px 12px", background: COLORS.bg, borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accent2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#000" }}>E</div>
            <div>
              <div style={{ color: COLORS.text, fontSize: 13, fontWeight: 600 }}>EngageWorx Admin</div>
              <div style={{ color: COLORS.textMuted, fontSize: 11 }}>engwx.com</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, marginLeft: 240, minHeight: "100vh", overflowY: "auto" }}>
        {pageMap[page]}
      </div>
    </div>
  );
}
