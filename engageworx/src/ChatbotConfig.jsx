import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const C = {
  bg: "#0A0E1A",
  surface: "#111827",
  surfaceAlt: "#1a2235",
  border: "#1e2d45",
  accent: "#00C9FF",
  accent2: "#E040FB",
  accent3: "#00E676",
  accent4: "#FF6B35",
  warning: "#FFD600",
  text: "#E8F4FD",
  muted: "#6B8BAE",
  dim: "#3A5068",
};

const TONE_OPTIONS = [
  { id: "professional", label: "Professional", emoji: "👔", desc: "Formal, business-appropriate language" },
  { id: "friendly", label: "Friendly", emoji: "😊", desc: "Warm, conversational, approachable" },
  { id: "casual", label: "Casual", emoji: "🤙", desc: "Relaxed, informal, like texting a friend" },
  { id: "witty", label: "Witty", emoji: "😎", desc: "Clever, engaging, with light humor" },
  { id: "empathetic", label: "Empathetic", emoji: "💛", desc: "Caring, understanding, supportive" },
  { id: "concise", label: "Concise", emoji: "⚡", desc: "Short, direct, no fluff" },
];

const ESCALATION_TRIGGERS = [
  { id: "angry", label: "Angry/Frustrated", emoji: "😡" },
  { id: "billing", label: "Billing Issues", emoji: "💳" },
  { id: "cancel", label: "Cancellation Request", emoji: "🚫" },
  { id: "human", label: "Asks for Human", emoji: "👤" },
  { id: "legal", label: "Legal/Compliance", emoji: "⚖️" },
  { id: "emergency", label: "Emergency/Urgent", emoji: "🚨" },
  { id: "repeat", label: "Repeated Questions", emoji: "🔄" },
  { id: "negative", label: "Negative Sentiment", emoji: "😟" },
];

const CHANNEL_OPTIONS = [
  { id: "sms", label: "SMS", emoji: "💬", enabled: true },
  { id: "whatsapp", label: "WhatsApp", emoji: "📱", enabled: false },
  { id: "rcs", label: "RCS", emoji: "✨", enabled: false },
  { id: "email", label: "Email", emoji: "📧", enabled: false },
  { id: "webchat", label: "Web Chat", emoji: "🌐", enabled: false },
];

function Toggle({ on, onChange, label, desc }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0" }}>
      <div>
        <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{label}</div>
        {desc && <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{desc}</div>}
      </div>
      <div onClick={onChange} style={{
        width: 44, height: 24, borderRadius: 12,
        background: on ? C.accent3 : C.border,
        cursor: "pointer", position: "relative",
        transition: "background 0.2s",
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: "50%",
          background: "#fff", position: "absolute",
          top: 3, left: on ? 23 : 3,
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }} />
      </div>
    </div>
  );
}

function Section({ title, icon, children, delay = 0 }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 14, padding: 24, marginBottom: 16,
      animation: `slideUp 0.5s ease ${delay}s both`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <h3 style={{ color: C.text, fontSize: 17, fontWeight: 800, margin: 0 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function PhonePreview({ config }) {
  const messages = [
    { sender: "customer", text: "Hi, I have a question about my order" },
    { sender: "bot", text: config.welcomeMessage || "Hi there! 👋 How can I help you today?" },
    { sender: "customer", text: "When will my package arrive?" },
    { sender: "bot", text: config.tone === "casual" ? "Let me check that for you real quick! 📦" : config.tone === "professional" ? "I'd be happy to look into that for you. Could you provide your order number?" : config.tone === "witty" ? "Great question! Let me track that down faster than your package is traveling 🚀" : "I understand you're waiting for your package. Let me look into that right away!" },
  ];

  return (
    <div style={{
      background: "#000", borderRadius: 28, padding: "12px",
      width: 280, boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      border: "2px solid #333",
    }}>
      {/* Phone notch */}
      <div style={{ width: 80, height: 4, background: "#333", borderRadius: 2, margin: "0 auto 10px" }} />

      {/* Header */}
      <div style={{ background: C.surface, borderRadius: "16px 16px 0 0", padding: "12px 14px", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14,
        }}>🤖</div>
        <div>
          <div style={{ color: C.text, fontSize: 12, fontWeight: 700 }}>{config.botName || "AI Assistant"}</div>
          <div style={{ color: C.accent3, fontSize: 9 }}>● Online</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ background: C.bg, padding: "10px 10px", minHeight: 220, maxHeight: 220, overflow: "hidden" }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            display: "flex",
            justifyContent: m.sender === "customer" ? "flex-end" : "flex-start",
            marginBottom: 8,
          }}>
            <div style={{
              maxWidth: "80%",
              background: m.sender === "customer" ? C.accent + "22" : C.surface,
              border: `1px solid ${m.sender === "customer" ? C.accent + "33" : C.border}`,
              borderRadius: m.sender === "customer" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
              padding: "8px 11px",
              color: C.text, fontSize: 11, lineHeight: 1.5,
            }}>
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{
        background: C.surface, borderRadius: "0 0 16px 16px",
        padding: "10px 12px", display: "flex", alignItems: "center", gap: 8,
      }}>
        <div style={{
          flex: 1, background: C.bg, borderRadius: 16,
          padding: "6px 12px", color: C.dim, fontSize: 11,
        }}>Type a message...</div>
        <div style={{
          width: 26, height: 26, borderRadius: "50%",
          background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12,
        }}>↑</div>
      </div>

      {/* Home bar */}
      <div style={{ width: 100, height: 4, background: "#444", borderRadius: 2, margin: "10px auto 0" }} />
    </div>
  );
}

export default function ChatbotConfig({ tenantId }) {
  const [config, setConfig] = useState({
    botEnabled: true,
    botName: "AI Assistant",
    tone: "friendly",
    welcomeMessage: "Hi there! 👋 How can I help you today?",
    awayMessage: "Thanks for reaching out! We're currently outside business hours. We'll get back to you first thing in the morning.",
    businessHoursEnabled: false,
    businessHoursStart: "09:00",
    businessHoursEnd: "17:00",
    businessDays: ["mon", "tue", "wed", "thu", "fri"],
    escalationTriggers: ["angry", "human", "billing"],
    escalationMessage: "I'm connecting you with a team member who can better assist you. Please hold on!",
    maxBotTurns: 5,
    channels: ["sms"],
    customInstructions: "",
    collectInfo: true,
    collectFields: ["name", "email"],
    language: "en",
    responseLength: "medium",
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [testPrompt, setTestPrompt] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => { loadConfig(); }, [tenantId]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadConfig = async () => {
    try {
      const { data } = await supabase
        .from("chatbot_config")
        .select("*")
        .limit(1)
        .single();
      if (data?.config) {
        setConfig(prev => ({ ...prev, ...data.config }));
      }
    } catch (err) {
      // No config yet — use defaults
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      // Upsert config
      const { data: existing } = await supabase
        .from("chatbot_config")
        .select("id")
        .limit(1)
        .single();

      if (existing) {
        await supabase.from("chatbot_config")
          .update({ config, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase.from("chatbot_config")
          .insert({ tenant_id: null, config });
      }
      showToast("Chatbot configuration saved!");
    } catch (err) {
      showToast("Error saving: " + err.message, "error");
    }
    setSaving(false);
  };

  const testBot = async () => {
    if (!testPrompt.trim()) return;
    setTesting(true);
    setTestResponse("");

    try {
      const response = await fetch("/api/generate-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `You are a customer service chatbot with these settings:
- Name: ${config.botName}
- Tone: ${config.tone}
- Custom instructions: ${config.customInstructions || "None"}
- Response length: ${config.responseLength}

A customer just sent this message: "${testPrompt}"

Respond as this chatbot would. Keep it ${config.responseLength === "short" ? "under 30 words" : config.responseLength === "medium" ? "under 60 words" : "under 100 words"}. Do NOT include any JSON or formatting — just the plain text response.`
        }),
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || "Sorry, I couldn't generate a response.";
      setTestResponse(text);
    } catch (err) {
      setTestResponse("Error testing: " + err.message);
    }
    setTesting(false);
  };

  const update = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));
  const toggleArrayItem = (key, item) => {
    setConfig(prev => ({
      ...prev,
      [key]: prev[key].includes(item)
        ? prev[key].filter(i => i !== item)
        : [...prev[key], item],
    }));
  };

  const inputStyle = {
    width: "100%", background: C.bg, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: "10px 14px", color: C.text, fontSize: 14,
    boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", outline: "none",
  };

  const days = [
    { id: "mon", label: "M" }, { id: "tue", label: "T" }, { id: "wed", label: "W" },
    { id: "thu", label: "T" }, { id: "fri", label: "F" }, { id: "sat", label: "S" }, { id: "sun", label: "S" },
  ];

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      color: C.text,
    }}>
      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes toastIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        input:focus, textarea:focus, select:focus { outline: none; border-color: ${C.accent} !important; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 2000,
          background: toast.type === "error" ? "#FF000022" : C.accent3 + "22",
          border: `1px solid ${toast.type === "error" ? "#FF000044" : C.accent3 + "44"}`,
          borderRadius: 10, padding: "12px 20px",
          color: toast.type === "error" ? "#FF6B6B" : C.accent3,
          fontSize: 14, fontWeight: 600, animation: "toastIn 0.3s ease",
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
        }}>
          {toast.type === "error" ? "❌ " : "✅ "}{toast.msg}
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, animation: "slideUp 0.4s ease both" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.accent2 + "15", border: `1px solid ${C.accent2}33`, borderRadius: 20, padding: "5px 14px", marginBottom: 12 }}>
              <span style={{ fontSize: 14 }}>🤖</span>
              <span style={{ color: C.accent2, fontSize: 12, fontWeight: 700 }}>AI Chatbot</span>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: config.botEnabled ? C.accent3 : "#FF6B6B",
              }} />
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, color: C.text }}>Chatbot Configuration</h1>
            <p style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>Customize your AI chatbot's personality, behavior, and escalation rules</p>
          </div>
          <button onClick={saveConfig} disabled={saving} style={{
            background: saving ? C.border : `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
            border: "none", borderRadius: 10, padding: "12px 28px",
            color: saving ? C.muted : "#000", fontWeight: 800, cursor: saving ? "not-allowed" : "pointer",
            fontSize: 14,
          }}>
            {saving ? "Saving..." : "💾 Save Configuration"}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "start" }}>
          {/* Main Settings */}
          <div>
            {/* Bot Identity */}
            <Section title="Bot Identity" icon="🤖" delay={0.05}>
              <Toggle on={config.botEnabled} onChange={() => update("botEnabled", !config.botEnabled)} label="Enable AI Chatbot" desc="Automatically respond to incoming messages" />

              <div style={{ marginTop: 14 }}>
                <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Bot Name</label>
                <input style={inputStyle} value={config.botName} onChange={e => update("botName", e.target.value)} placeholder="AI Assistant" />
              </div>

              <div style={{ marginTop: 14 }}>
                <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Welcome Message</label>
                <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} value={config.welcomeMessage} onChange={e => update("welcomeMessage", e.target.value)} placeholder="Hi there! How can I help?" />
              </div>

              <div style={{ marginTop: 14 }}>
                <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Away / After-Hours Message</label>
                <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} value={config.awayMessage} onChange={e => update("awayMessage", e.target.value)} />
              </div>
            </Section>

            {/* Personality & Tone */}
            <Section title="Personality & Tone" icon="🎭" delay={0.1}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {TONE_OPTIONS.map(t => (
                  <div key={t.id} onClick={() => update("tone", t.id)} style={{
                    background: config.tone === t.id ? C.accent + "15" : C.bg,
                    border: `1px solid ${config.tone === t.id ? C.accent + "55" : C.border}`,
                    borderRadius: 10, padding: "14px 12px", cursor: "pointer",
                    transition: "all 0.2s", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>{t.emoji}</div>
                    <div style={{ color: config.tone === t.id ? C.accent : C.text, fontSize: 13, fontWeight: 700 }}>{t.label}</div>
                    <div style={{ color: C.muted, fontSize: 10, marginTop: 4 }}>{t.desc}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16 }}>
                <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Response Length</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["short", "medium", "long"].map(len => (
                    <button key={len} onClick={() => update("responseLength", len)} style={{
                      flex: 1, background: config.responseLength === len ? C.accent + "22" : C.bg,
                      border: `1px solid ${config.responseLength === len ? C.accent + "55" : C.border}`,
                      borderRadius: 8, padding: "8px 12px", cursor: "pointer",
                      color: config.responseLength === len ? C.accent : C.muted,
                      fontSize: 13, fontWeight: 700, textTransform: "capitalize",
                    }}>{len === "short" ? "⚡ Short" : len === "medium" ? "📝 Medium" : "📄 Detailed"}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Custom Instructions</label>
                <textarea
                  style={{ ...inputStyle, resize: "vertical", minHeight: 80 }}
                  value={config.customInstructions}
                  onChange={e => update("customInstructions", e.target.value)}
                  placeholder="e.g., Always mention our 30-day money-back guarantee. Never discuss competitor products. If asked about pricing, direct them to our website..."
                />
                <div style={{ color: C.dim, fontSize: 11, marginTop: 4 }}>These instructions guide how the AI responds to customers</div>
              </div>
            </Section>

            {/* Business Hours */}
            <Section title="Business Hours" icon="🕐" delay={0.15}>
              <Toggle on={config.businessHoursEnabled} onChange={() => update("businessHoursEnabled", !config.businessHoursEnabled)} label="Enable Business Hours" desc="Send away message outside these hours" />

              {config.businessHoursEnabled && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Start Time</label>
                      <input type="time" style={inputStyle} value={config.businessHoursStart} onChange={e => update("businessHoursStart", e.target.value)} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>End Time</label>
                      <input type="time" style={inputStyle} value={config.businessHoursEnd} onChange={e => update("businessHoursEnd", e.target.value)} />
                    </div>
                  </div>

                  <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}>Active Days</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {days.map(d => (
                      <div key={d.id} onClick={() => toggleArrayItem("businessDays", d.id)} style={{
                        width: 36, height: 36, borderRadius: "50%",
                        background: config.businessDays.includes(d.id) ? C.accent + "22" : C.bg,
                        border: `1px solid ${config.businessDays.includes(d.id) ? C.accent : C.border}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: config.businessDays.includes(d.id) ? C.accent : C.dim,
                        fontSize: 13, fontWeight: 700, cursor: "pointer",
                        transition: "all 0.2s",
                      }}>{d.label}</div>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            {/* Escalation Rules */}
            <Section title="Escalation Rules" icon="🚨" delay={0.2}>
              <p style={{ color: C.muted, fontSize: 13, marginTop: 0, marginBottom: 14 }}>
                When these triggers are detected, the bot will escalate to a human agent
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                {ESCALATION_TRIGGERS.map(t => (
                  <div key={t.id} onClick={() => toggleArrayItem("escalationTriggers", t.id)} style={{
                    background: config.escalationTriggers.includes(t.id) ? C.accent4 + "15" : C.bg,
                    border: `1px solid ${config.escalationTriggers.includes(t.id) ? C.accent4 + "55" : C.border}`,
                    borderRadius: 8, padding: "10px 8px", cursor: "pointer",
                    textAlign: "center", transition: "all 0.2s",
                  }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{t.emoji}</div>
                    <div style={{ color: config.escalationTriggers.includes(t.id) ? C.accent4 : C.muted, fontSize: 10, fontWeight: 700 }}>{t.label}</div>
                  </div>
                ))}
              </div>

              <div>
                <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Escalation Message</label>
                <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 50 }} value={config.escalationMessage} onChange={e => update("escalationMessage", e.target.value)} />
              </div>

              <div style={{ marginTop: 14 }}>
                <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Max Bot Turns Before Escalation</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input type="range" min="2" max="15" value={config.maxBotTurns} onChange={e => update("maxBotTurns", parseInt(e.target.value))}
                    style={{ flex: 1, accentColor: C.accent }} />
                  <span style={{ color: C.accent, fontSize: 16, fontWeight: 800, minWidth: 30, textAlign: "center" }}>{config.maxBotTurns}</span>
                </div>
                <div style={{ color: C.dim, fontSize: 11, marginTop: 4 }}>After {config.maxBotTurns} bot responses without resolution, escalate to agent</div>
              </div>
            </Section>

            {/* Channels */}
            <Section title="Active Channels" icon="📡" delay={0.25}>
              <div style={{ display: "grid", gap: 8 }}>
                {CHANNEL_OPTIONS.map(ch => (
                  <div key={ch.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: C.bg, border: `1px solid ${C.border}`,
                    borderRadius: 10, padding: "12px 16px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18 }}>{ch.emoji}</span>
                      <span style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{ch.label}</span>
                      {!ch.enabled && ch.id !== "sms" && (
                        <span style={{
                          background: C.dim + "22", border: `1px solid ${C.dim}33`,
                          borderRadius: 4, padding: "1px 6px", fontSize: 9, color: C.dim, fontWeight: 700,
                        }}>COMING SOON</span>
                      )}
                    </div>
                    <div onClick={() => ch.enabled || ch.id === "sms" ? toggleArrayItem("channels", ch.id) : null} style={{
                      width: 44, height: 24, borderRadius: 12,
                      background: config.channels.includes(ch.id) ? C.accent3 : C.border,
                      cursor: ch.enabled || ch.id === "sms" ? "pointer" : "not-allowed",
                      position: "relative", transition: "background 0.2s",
                      opacity: ch.enabled || ch.id === "sms" ? 1 : 0.4,
                    }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%",
                        background: "#fff", position: "absolute",
                        top: 3, left: config.channels.includes(ch.id) ? 23 : 3,
                        transition: "left 0.2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Data Collection */}
            <Section title="Data Collection" icon="📋" delay={0.3}>
              <Toggle on={config.collectInfo} onChange={() => update("collectInfo", !config.collectInfo)} label="Collect Customer Info" desc="Bot will ask for name/email if not already known" />

              {config.collectInfo && (
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["name", "email", "phone", "company", "order_number"].map(field => (
                    <div key={field} onClick={() => toggleArrayItem("collectFields", field)} style={{
                      background: config.collectFields.includes(field) ? C.accent + "15" : C.bg,
                      border: `1px solid ${config.collectFields.includes(field) ? C.accent + "44" : C.border}`,
                      borderRadius: 6, padding: "6px 12px", cursor: "pointer",
                      color: config.collectFields.includes(field) ? C.accent : C.muted,
                      fontSize: 12, fontWeight: 600, textTransform: "capitalize",
                      transition: "all 0.2s",
                    }}>{field.replace("_", " ")}</div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          {/* Right Sidebar - Preview & Test */}
          <div style={{ position: "sticky", top: 24 }}>
            {/* Phone Preview */}
            <div style={{ marginBottom: 16, animation: "slideUp 0.5s ease 0.1s both" }}>
              <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, textAlign: "center" }}>
                Live Preview
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <PhonePreview config={config} />
              </div>
            </div>

            {/* Test Bot */}
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: 18,
              animation: "slideUp 0.5s ease 0.35s both",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 16 }}>🧪</span>
                <span style={{ color: C.text, fontSize: 14, fontWeight: 800 }}>Test Your Bot</span>
              </div>
              <input
                value={testPrompt}
                onChange={e => setTestPrompt(e.target.value)}
                onKeyDown={e => e.key === "Enter" && testBot()}
                placeholder="Type a test message..."
                style={{ ...inputStyle, marginBottom: 8, fontSize: 13 }}
              />
              <button onClick={testBot} disabled={testing || !testPrompt.trim()} style={{
                width: "100%",
                background: testing || !testPrompt.trim() ? C.border : C.accent + "22",
                border: `1px solid ${testing || !testPrompt.trim() ? C.border : C.accent + "44"}`,
                borderRadius: 8, padding: "8px 14px",
                color: testing || !testPrompt.trim() ? C.dim : C.accent,
                fontWeight: 700, cursor: testing || !testPrompt.trim() ? "not-allowed" : "pointer",
                fontSize: 12,
              }}>
                {testing ? "Thinking..." : "Send Test Message"}
              </button>

              {testResponse && (
                <div style={{
                  marginTop: 10, background: C.bg, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: 12,
                }}>
                  <div style={{ color: C.muted, fontSize: 10, marginBottom: 4 }}>🤖 Bot Response:</div>
                  <div style={{ color: C.text, fontSize: 12, lineHeight: 1.6 }}>{testResponse}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
