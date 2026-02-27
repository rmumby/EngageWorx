import { useState, useEffect, useRef } from "react";

// ─── DEMO DATA ────────────────────────────────────────────────────────────────
const PERSONALITIES = [
  { id: "professional", name: "Professional", icon: "👔", desc: "Formal, business-appropriate tone", temp: 0.3, greeting: "Hello! Thank you for reaching out. How may I assist you today?" },
  { id: "friendly", name: "Friendly", icon: "😊", desc: "Warm, conversational, approachable", temp: 0.6, greeting: "Hey there! 👋 Great to hear from you! What can I help with?" },
  { id: "concise", name: "Concise", icon: "⚡", desc: "Brief, direct, efficient responses", temp: 0.2, greeting: "Hi! How can I help?" },
  { id: "empathetic", name: "Empathetic", icon: "💙", desc: "Understanding, supportive, patient", temp: 0.5, greeting: "Hi there! I'm here to help and happy to take as much time as you need. What's on your mind?" },
  { id: "sales", name: "Sales-Driven", icon: "🎯", desc: "Persuasive, benefit-focused, conversion-oriented", temp: 0.7, greeting: "Welcome! I'd love to help you find the perfect solution. What are you looking for today?" },
  { id: "technical", name: "Technical", icon: "🔧", desc: "Detailed, precise, documentation-style", temp: 0.2, greeting: "Hello. I'm your technical support assistant. Please describe your issue and I'll help troubleshoot." },
];

const KNOWLEDGE_SOURCES = [
  { id: "kb1", name: "Product Documentation", type: "docs", entries: 847, lastUpdated: "2 hours ago", status: "synced", size: "12.4 MB", icon: "📄" },
  { id: "kb2", name: "FAQ Database", type: "faq", entries: 234, lastUpdated: "1 day ago", status: "synced", size: "2.1 MB", icon: "❓" },
  { id: "kb3", name: "Pricing & Plans", type: "docs", entries: 45, lastUpdated: "3 days ago", status: "synced", size: "890 KB", icon: "💰" },
  { id: "kb4", name: "API Reference", type: "api", entries: 312, lastUpdated: "5 hours ago", status: "synced", size: "8.7 MB", icon: "🔌" },
  { id: "kb5", name: "Troubleshooting Guides", type: "docs", entries: 156, lastUpdated: "12 hours ago", status: "synced", size: "4.2 MB", icon: "🔧" },
  { id: "kb6", name: "Company Policies", type: "docs", entries: 28, lastUpdated: "1 week ago", status: "outdated", size: "1.3 MB", icon: "📋" },
  { id: "kb7", name: "Training Transcripts", type: "training", entries: 1240, lastUpdated: "6 hours ago", status: "synced", size: "34.8 MB", icon: "🎓" },
  { id: "kb8", name: "Customer Feedback", type: "feedback", entries: 3400, lastUpdated: "Real-time", status: "live", size: "18.2 MB", icon: "💬" },
];

const ESCALATION_RULES = [
  { id: "er1", name: "Negative Sentiment", trigger: "sentiment_score < -0.6", action: "Transfer to live agent", priority: "high", channel: "Any", enabled: true, icon: "😠" },
  { id: "er2", name: "Billing Issues", trigger: "intent = billing_dispute", action: "Transfer to billing team", priority: "high", channel: "Any", enabled: true, icon: "💳" },
  { id: "er3", name: "Repeated Questions", trigger: "same_question_count >= 3", action: "Transfer to specialist", priority: "medium", channel: "Any", enabled: true, icon: "🔄" },
  { id: "er4", name: "VIP Customer", trigger: "customer_tag = VIP", action: "Priority queue + notify manager", priority: "high", channel: "Any", enabled: true, icon: "⭐" },
  { id: "er5", name: "Complex Technical", trigger: "confidence < 0.4 AND intent = technical", action: "Transfer to Tier 2 support", priority: "medium", channel: "Any", enabled: true, icon: "🔧" },
  { id: "er6", name: "Purchase Intent", trigger: "intent = purchase AND value > $500", action: "Transfer to sales team", priority: "medium", channel: "SMS, WhatsApp", enabled: true, icon: "🛒" },
  { id: "er7", name: "After Hours", trigger: "time NOT IN business_hours", action: "Collect info + create ticket", priority: "low", channel: "Any", enabled: false, icon: "🌙" },
  { id: "er8", name: "Language Barrier", trigger: "detected_language != en", action: "Transfer to multilingual agent", priority: "medium", channel: "Any", enabled: true, icon: "🌍" },
];

const DEMO_CONVERSATIONS = [
  { persona: "Customer asking about pricing", messages: [
    { role: "user", text: "How much does the Growth plan cost?" },
    { role: "bot", text: "The Growth plan is $799/month and includes up to 250,000 messages, 4 channels (SMS, Email, WhatsApp, MMS), 10 user seats, advanced analytics, and A/B testing.\n\nWould you like me to compare it with our other plans, or help you get started with a free trial?" },
    { role: "user", text: "What about the Enterprise plan?" },
    { role: "bot", text: "Our Enterprise plan offers custom pricing based on your needs. It includes unlimited messages, all 6 channels, unlimited users, dedicated IPs, custom SMTP, priority 24/7 support, and a dedicated account manager.\n\nI can connect you with our sales team for a personalized quote. Would you like that?" },
  ]},
  { persona: "Technical support inquiry", messages: [
    { role: "user", text: "My API calls are returning 429 errors" },
    { role: "bot", text: "A 429 error means you've hit our rate limit. Here's how to resolve it:\n\n1. **Check your current limits** — Growth plans allow 100 requests/second\n2. **Implement exponential backoff** — Wait 1s, then 2s, then 4s between retries\n3. **Use batch endpoints** — Send up to 1,000 messages per API call\n\nWould you like me to show you a code example for implementing backoff, or would you prefer to discuss upgrading your rate limits?" },
    { role: "user", text: "Show me the code example" },
    { role: "bot", text: "Here's a retry handler with exponential backoff:\n\n```javascript\nasync function sendWithRetry(payload, maxRetries = 3) {\n  for (let i = 0; i < maxRetries; i++) {\n    const res = await fetch('/v1/messages', {\n      method: 'POST',\n      body: JSON.stringify(payload)\n    });\n    if (res.status !== 429) return res;\n    await new Promise(r => \n      setTimeout(r, Math.pow(2, i) * 1000)\n    );\n  }\n  throw new Error('Rate limit exceeded');\n}\n```\n\nThis will automatically retry up to 3 times with increasing delays. Need any other help?" },
  ]},
  { persona: "Angry customer complaint", messages: [
    { role: "user", text: "I've been waiting 3 days for a response to my support ticket! This is unacceptable." },
    { role: "bot", text: "I completely understand your frustration, and I sincerely apologize for the delay. A 3-day wait is not the level of service we aim to provide.\n\nLet me look into your ticket right away. Could you share your ticket number so I can escalate this immediately?" },
    { role: "user", text: "Ticket #SUP-4892. And I want to speak to a manager." },
    { role: "bot", text: "Thank you. I've flagged ticket #SUP-4892 as urgent and I'm connecting you with a senior support manager right now.\n\n⚡ **Escalating to live agent...**\n\nA manager will be with you within the next 2 minutes. I've briefed them on your situation so you won't need to repeat yourself. Again, I'm sorry for the experience." },
  ]},
  { persona: "Product recommendation", messages: [
    { role: "user", text: "We send about 100K SMS messages a month. Which plan do you recommend?" },
    { role: "bot", text: "For 100K SMS messages monthly, I'd recommend our **Growth plan** at $799/month. Here's why it's the best fit:\n\n✅ Includes 250K messages (plenty of room to grow)\n✅ SMS + 3 additional channels\n✅ A/B testing to optimize your campaigns\n✅ Advanced analytics dashboard\n\nYou'd be using about 40% of your message allowance, giving you headroom to scale without upgrading.\n\nWant me to set up a free trial so you can test it out?" },
  ]},
];

const BOT_ANALYTICS = {
  totalConversations: 12847,
  avgResolutionTime: "1.8 min",
  satisfactionScore: 94.2,
  escalationRate: 8.7,
  containmentRate: 91.3,
  avgMessagesPerConv: 4.2,
  topIntents: [
    { name: "Pricing inquiry", pct: 28, count: 3597 },
    { name: "Technical support", pct: 22, count: 2826 },
    { name: "Account management", pct: 18, count: 2312 },
    { name: "Product features", pct: 15, count: 1927 },
    { name: "Billing questions", pct: 10, count: 1285 },
    { name: "Other", pct: 7, count: 900 },
  ],
  dailyVolume: [
    { day: "Mon", count: 2100 }, { day: "Tue", count: 2340 },
    { day: "Wed", count: 1980 }, { day: "Thu", count: 2560 },
    { day: "Fri", count: 2150 }, { day: "Sat", count: 890 },
    { day: "Sun", count: 827 },
  ],
};

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function AIChatbot({ C, tenants, viewLevel = "tenant", currentTenantId }) {
  const [activeTab, setActiveTab] = useState("personality");
  const [selectedPersonality, setSelectedPersonality] = useState("friendly");
  const [botName, setBotName] = useState("EngageBot");
  const [greeting, setGreeting] = useState(PERSONALITIES[1].greeting);
  const [temperature, setTemperature] = useState(0.6);
  const [maxTokens, setMaxTokens] = useState(500);
  const [responseDelay, setResponseDelay] = useState(1.2);
  const [enableEmoji, setEnableEmoji] = useState(true);
  const [enableCodeBlocks, setEnableCodeBlocks] = useState(true);
  const [enableMarkdown, setEnableMarkdown] = useState(true);
  const [fallbackMsg, setFallbackMsg] = useState("I'm not sure I understand. Let me connect you with a human agent who can help.");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful customer support assistant for EngageWorx, a multi-channel communications platform. Be friendly, accurate, and concise. Always try to resolve the customer's issue, and escalate to a human agent if needed.");

  // Preview simulator
  const [previewMessages, setPreviewMessages] = useState([]);
  const [previewInput, setPreviewInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [selectedDemo, setSelectedDemo] = useState(null);
  const previewEndRef = useRef(null);

  useEffect(() => {
    if (previewEndRef.current) previewEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [previewMessages, isTyping]);

  const personality = PERSONALITIES.find(p => p.id === selectedPersonality);

  const inputStyle = { width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" };
  const btnPrimary = { background: `linear-gradient(135deg, ${C.primary}, ${C.accent || C.primary})`, border: "none", borderRadius: 10, padding: "10px 20px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  const btnSecondary = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 20px", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  const card = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 22 };
  const badge = (color) => ({ display: "inline-block", background: color + "18", color, border: `1px solid ${color}44`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 });
  const label = { color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, display: "block", fontWeight: 700 };

  const handleSelectPersonality = (p) => {
    setSelectedPersonality(p.id);
    setGreeting(p.greeting);
    setTemperature(p.temp);
  };

  const handlePreviewSend = () => {
    if (!previewInput.trim()) return;
    const userMsg = { role: "user", text: previewInput };
    setPreviewMessages(prev => [...prev, userMsg]);
    setPreviewInput("");
    setIsTyping(true);

    setTimeout(() => {
      const responses = [
        `Great question! Based on our knowledge base, I can help with that. ${enableEmoji ? "😊" : ""}\n\nLet me pull up the relevant information for you...`,
        `I'd be happy to assist! Here's what I found:\n\nOur platform supports SMS, Email, WhatsApp, RCS, MMS, and Voice channels. Each can be configured independently per campaign.\n\nWould you like more details on any specific channel?`,
        `Thanks for reaching out! ${enableEmoji ? "👋" : ""} I've checked our documentation and here's the answer:\n\nYou can manage this through Settings → Channels → Configuration. The changes take effect immediately.\n\nAnything else I can help with?`,
        `I understand your concern. Let me look into this right away.\n\nBased on your account, I can see the issue and here's the recommended solution:\n\n1. Navigate to your dashboard\n2. Click on the affected campaign\n3. Update the settings and save\n\nThis should resolve the issue. ${enableEmoji ? "✅" : ""}`,
      ];
      const botMsg = { role: "bot", text: responses[Math.floor(Math.random() * responses.length)] };
      setPreviewMessages(prev => [...prev, botMsg]);
      setIsTyping(false);
    }, responseDelay * 1000);
  };

  const loadDemoConversation = (demo) => {
    setSelectedDemo(demo);
    setPreviewMessages([]);
    let delay = 0;
    demo.messages.forEach((msg, i) => {
      delay += i === 0 ? 300 : msg.role === "bot" ? responseDelay * 1000 : 800;
      setTimeout(() => {
        if (msg.role === "bot") setIsTyping(false);
        setPreviewMessages(prev => [...prev, msg]);
        if (i < demo.messages.length - 1 && demo.messages[i + 1].role === "bot") {
          setIsTyping(true);
        }
      }, delay);
      if (msg.role === "user" && i < demo.messages.length - 1) {
        setTimeout(() => setIsTyping(true), delay + 200);
      }
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'DM Sans', sans-serif", overflow: "hidden" }}>
      {/* ═══════════ LEFT: Configuration Panel ═══════════ */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        <div style={{ maxWidth: 900 }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>AI Chatbot</h1>
              <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>Configure personality, knowledge, and escalation rules</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={badge("#00E676")}>● Bot Active</span>
              <button style={btnPrimary}>Save & Deploy</button>
            </div>
          </div>

          {/* KPI Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Conversations", value: BOT_ANALYTICS.totalConversations.toLocaleString(), color: C.primary, icon: "💬" },
              { label: "Avg Resolution", value: BOT_ANALYTICS.avgResolutionTime, color: "#00E676", icon: "⏱️" },
              { label: "Satisfaction", value: `${BOT_ANALYTICS.satisfactionScore}%`, color: "#FFD600", icon: "😊" },
              { label: "Containment", value: `${BOT_ANALYTICS.containmentRate}%`, color: "#7C4DFF", icon: "🤖" },
              { label: "Escalation Rate", value: `${BOT_ANALYTICS.escalationRate}%`, color: "#FF6B35", icon: "↗️" },
            ].map((kpi, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.04)", borderTop: `3px solid ${kpi.color}`, borderRadius: 10, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 0.8 }}>{kpi.label}</span>
                  <span style={{ fontSize: 14 }}>{kpi.icon}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginTop: 6 }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, marginBottom: 24 }}>
            {[
              { id: "personality", label: "Personality", icon: "🎭" },
              { id: "knowledge", label: "Knowledge Base", icon: "📚" },
              { id: "escalation", label: "Escalation Rules", icon: "↗️" },
              { id: "analytics", label: "Analytics", icon: "📊" },
              { id: "advanced", label: "Advanced", icon: "⚙️" },
            ].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                background: activeTab === t.id ? C.primary : "rgba(255,255,255,0.04)",
                border: activeTab === t.id ? "none" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8, padding: "8px 16px", color: activeTab === t.id ? "#000" : C.muted,
                fontWeight: activeTab === t.id ? 700 : 400, cursor: "pointer", fontSize: 13,
                fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s",
              }}>{t.icon} {t.label}</button>
            ))}
          </div>

          {/* ═══════════ PERSONALITY TAB ═══════════ */}
          {activeTab === "personality" && (
            <div>
              {/* Bot Identity */}
              <div style={{ ...card, marginBottom: 20 }}>
                <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 16 }}>Bot Identity</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <label style={label}>Bot Name</label>
                    <input value={botName} onChange={e => setBotName(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={label}>Greeting Message</label>
                    <input value={greeting} onChange={e => setGreeting(e.target.value)} style={inputStyle} />
                  </div>
                </div>
              </div>

              {/* Personality Presets */}
              <div style={{ ...card, marginBottom: 20 }}>
                <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 16 }}>Personality Preset</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {PERSONALITIES.map(p => (
                    <button key={p.id} onClick={() => handleSelectPersonality(p)} style={{
                      background: selectedPersonality === p.id ? `${C.primary}15` : "rgba(255,255,255,0.03)",
                      border: `2px solid ${selectedPersonality === p.id ? C.primary : "rgba(255,255,255,0.06)"}`,
                      borderRadius: 12, padding: "16px", cursor: "pointer", textAlign: "left",
                      transition: "all 0.2s", fontFamily: "'DM Sans', sans-serif",
                    }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>{p.icon}</div>
                      <div style={{ color: selectedPersonality === p.id ? C.primary : "#fff", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{p.name}</div>
                      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, lineHeight: 1.3 }}>{p.desc}</div>
                      {selectedPersonality === p.id && <div style={{ color: C.primary, fontSize: 16, position: "absolute", top: 10, right: 12 }}>✓</div>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fine-Tuning Controls */}
              <div style={{ ...card, marginBottom: 20 }}>
                <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 16 }}>Fine-Tuning</h3>
                <div style={{ display: "grid", gap: 20 }}>
                  {/* Temperature */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <label style={{ ...label, margin: 0 }}>Creativity (Temperature)</label>
                      <span style={{ color: C.primary, fontSize: 14, fontWeight: 700 }}>{temperature.toFixed(1)}</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} style={{ width: "100%", accentColor: C.primary }} />
                    <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.2)", fontSize: 10 }}>
                      <span>Precise & Consistent</span><span>Creative & Varied</span>
                    </div>
                  </div>

                  {/* Max Tokens */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <label style={{ ...label, margin: 0 }}>Max Response Length</label>
                      <span style={{ color: C.primary, fontSize: 14, fontWeight: 700 }}>{maxTokens} tokens</span>
                    </div>
                    <input type="range" min="100" max="2000" step="50" value={maxTokens} onChange={e => setMaxTokens(parseInt(e.target.value))} style={{ width: "100%", accentColor: C.primary }} />
                    <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.2)", fontSize: 10 }}>
                      <span>Short (~50 words)</span><span>Long (~1000 words)</span>
                    </div>
                  </div>

                  {/* Response Delay */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <label style={{ ...label, margin: 0 }}>Simulated Typing Delay</label>
                      <span style={{ color: C.primary, fontSize: 14, fontWeight: 700 }}>{responseDelay}s</span>
                    </div>
                    <input type="range" min="0" max="5" step="0.1" value={responseDelay} onChange={e => setResponseDelay(parseFloat(e.target.value))} style={{ width: "100%", accentColor: C.primary }} />
                    <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.2)", fontSize: 10 }}>
                      <span>Instant</span><span>Feels human</span>
                    </div>
                  </div>

                  {/* Toggles */}
                  <div style={{ display: "flex", gap: 16 }}>
                    {[
                      { label: "Emoji", value: enableEmoji, setter: setEnableEmoji, icon: "😊" },
                      { label: "Code Blocks", value: enableCodeBlocks, setter: setEnableCodeBlocks, icon: "💻" },
                      { label: "Rich Formatting", value: enableMarkdown, setter: setEnableMarkdown, icon: "✨" },
                    ].map(toggle => (
                      <button key={toggle.label} onClick={() => toggle.setter(!toggle.value)} style={{
                        flex: 1, background: toggle.value ? `${C.primary}15` : "rgba(255,255,255,0.03)",
                        border: `1px solid ${toggle.value ? C.primary + "44" : "rgba(255,255,255,0.06)"}`,
                        borderRadius: 10, padding: "12px", cursor: "pointer", textAlign: "center",
                        fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s",
                      }}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{toggle.icon}</div>
                        <div style={{ color: toggle.value ? C.primary : "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 600 }}>{toggle.label}</div>
                        <div style={{ color: toggle.value ? "#00E676" : "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 2 }}>{toggle.value ? "Enabled" : "Disabled"}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Fallback & System Prompt */}
              <div style={{ ...card }}>
                <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 16 }}>Fallback & Instructions</h3>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Fallback Message (when bot can't answer)</label>
                  <textarea value={fallbackMsg} onChange={e => setFallbackMsg(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
                </div>
                <div>
                  <label style={label}>System Prompt (instructions for the AI)</label>
                  <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} />
                </div>
              </div>
            </div>
          )}

          {/* ═══════════ KNOWLEDGE BASE TAB ═══════════ */}
          {activeTab === "knowledge" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <h2 style={{ color: "#fff", fontSize: 18, margin: 0 }}>Knowledge Base</h2>
                  <p style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{KNOWLEDGE_SOURCES.reduce((s, k) => s + k.entries, 0).toLocaleString()} total entries across {KNOWLEDGE_SOURCES.length} sources</p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button style={btnSecondary}>🔄 Sync All</button>
                  <button style={btnPrimary}>+ Add Source</button>
                </div>
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {KNOWLEDGE_SOURCES.map(kb => (
                  <div key={kb.id} style={{
                    ...card, display: "grid", gridTemplateColumns: "50px 1fr 100px 100px 100px 120px",
                    alignItems: "center", gap: 16,
                    borderLeft: `4px solid ${kb.status === "synced" ? "#00E676" : kb.status === "live" ? C.primary : "#FF9800"}`,
                  }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{kb.icon}</div>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{kb.name}</div>
                      <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Updated {kb.lastUpdated}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>{kb.entries.toLocaleString()}</div>
                      <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>entries</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{kb.size}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <span style={badge(kb.status === "synced" ? "#00E676" : kb.status === "live" ? C.primary : "#FF9800")}>
                        {kb.status === "synced" ? "● Synced" : kb.status === "live" ? "◉ Live" : "⚠ Outdated"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={{ ...btnSecondary, padding: "6px 10px", fontSize: 11 }}>Edit</button>
                      <button style={{ ...btnSecondary, padding: "6px 10px", fontSize: 11 }}>🔄</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Upload New */}
              <div style={{ ...card, marginTop: 16, textAlign: "center", padding: 32, border: `2px dashed rgba(255,255,255,0.1)` }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📁</div>
                <div style={{ color: "#fff", fontWeight: 600, marginBottom: 4 }}>Add Knowledge Source</div>
                <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>Upload documents, connect URLs, or import from APIs</div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button style={btnSecondary}>📄 Upload Files</button>
                  <button style={btnSecondary}>🔗 Connect URL</button>
                  <button style={btnSecondary}>🔌 API Import</button>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════ ESCALATION RULES TAB ═══════════ */}
          {activeTab === "escalation" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <h2 style={{ color: "#fff", fontSize: 18, margin: 0 }}>Escalation Rules</h2>
                  <p style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Define when the bot should hand off to a human agent</p>
                </div>
                <button style={btnPrimary}>+ Add Rule</button>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {ESCALATION_RULES.map(rule => (
                  <div key={rule.id} style={{
                    ...card, display: "grid", gridTemplateColumns: "40px 1fr 180px 100px 80px 80px",
                    alignItems: "center", gap: 14, opacity: rule.enabled ? 1 : 0.5,
                    borderLeft: `4px solid ${rule.priority === "high" ? "#FF3B30" : rule.priority === "medium" ? "#FFD600" : "#6B8BAE"}`,
                  }}>
                    <div style={{ fontSize: 24, textAlign: "center" }}>{rule.icon}</div>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{rule.name}</div>
                      <div style={{ color: C.muted, fontSize: 11, marginTop: 2, fontFamily: "monospace" }}>{rule.trigger}</div>
                    </div>
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{rule.action}</div>
                      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 2 }}>Channel: {rule.channel}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <span style={badge(rule.priority === "high" ? "#FF3B30" : rule.priority === "medium" ? "#FFD600" : "#6B8BAE")}>
                        {rule.priority}
                      </span>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{
                        width: 40, height: 22, borderRadius: 11, cursor: "pointer", position: "relative",
                        background: rule.enabled ? C.primary : "rgba(255,255,255,0.1)", transition: "all 0.2s",
                      }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute",
                          top: 2, left: rule.enabled ? 20 : 2, transition: "all 0.2s",
                        }} />
                      </div>
                    </div>
                    <button style={{ ...btnSecondary, padding: "6px 10px", fontSize: 11 }}>Edit</button>
                  </div>
                ))}
              </div>

              {/* Flow Diagram */}
              <div style={{ ...card, marginTop: 20 }}>
                <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Escalation Flow</h3>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "20px 0", overflowX: "auto" }}>
                  {[
                    { label: "Incoming\nMessage", icon: "📩", color: C.primary },
                    { label: "→", icon: "", color: "" },
                    { label: "AI Bot\nProcesses", icon: "🤖", color: "#7C4DFF" },
                    { label: "→", icon: "", color: "" },
                    { label: "Check\nRules", icon: "⚖️", color: "#FFD600" },
                    { label: "→", icon: "", color: "" },
                    { label: "Auto-\nResolve", icon: "✅", color: "#00E676" },
                    { label: "↗", icon: "", color: "" },
                    { label: "Escalate\nto Agent", icon: "👤", color: "#FF6B35" },
                  ].map((step, i) => (
                    step.icon ? (
                      <div key={i} style={{ background: `${step.color}15`, border: `1px solid ${step.color}33`, borderRadius: 12, padding: "14px 18px", textAlign: "center", minWidth: 80 }}>
                        <div style={{ fontSize: 24, marginBottom: 6 }}>{step.icon}</div>
                        <div style={{ color: step.color, fontSize: 10, fontWeight: 700, whiteSpace: "pre-line", lineHeight: 1.3 }}>{step.label}</div>
                      </div>
                    ) : (
                      <div key={i} style={{ color: "rgba(255,255,255,0.15)", fontSize: 18, padding: "0 4px" }}>{step.label}</div>
                    )
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════ ANALYTICS TAB ═══════════ */}
          {activeTab === "analytics" && (
            <div>
              <h2 style={{ color: "#fff", fontSize: 18, margin: "0 0 20px" }}>Bot Performance Analytics</h2>

              {/* Top Intents */}
              <div style={{ ...card, marginBottom: 20 }}>
                <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Top Intents</h3>
                {BOT_ANALYTICS.topIntents.map((intent, i) => (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{intent.name}</span>
                      <span style={{ color: C.primary, fontSize: 12, fontWeight: 700 }}>{intent.pct}% ({intent.count.toLocaleString()})</span>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3 }}>
                      <div style={{ height: "100%", width: `${intent.pct}%`, background: `linear-gradient(90deg, ${C.primary}, ${C.accent || C.primary})`, borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Daily Volume */}
              <div style={{ ...card, marginBottom: 20 }}>
                <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Daily Conversation Volume</h3>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, padding: "0 10px" }}>
                  {BOT_ANALYTICS.dailyVolume.map((d, i) => {
                    const maxVal = Math.max(...BOT_ANALYTICS.dailyVolume.map(x => x.count));
                    const h = (d.count / maxVal) * 120;
                    return (
                      <div key={i} style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ color: "#fff", fontSize: 10, fontWeight: 700, marginBottom: 4 }}>{d.count.toLocaleString()}</div>
                        <div style={{ height: h, background: `linear-gradient(180deg, ${C.primary}, ${C.primary}44)`, borderRadius: "6px 6px 0 0", transition: "height 0.3s" }} />
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 6 }}>{d.day}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Performance Metrics */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={card}>
                  <h3 style={{ color: "#fff", margin: "0 0 14px", fontSize: 15 }}>Response Quality</h3>
                  {[
                    { label: "First Contact Resolution", value: "87.3%", color: "#00E676" },
                    { label: "Avg Confidence Score", value: "0.89", color: C.primary },
                    { label: "Hallucination Rate", value: "0.4%", color: "#00E676" },
                    { label: "Avg Response Time", value: "1.2s", color: "#FFD600" },
                    { label: "Knowledge Base Hits", value: "94.1%", color: "#7C4DFF" },
                  ].map((m, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>{m.label}</span>
                      <span style={{ color: m.color, fontSize: 13, fontWeight: 700 }}>{m.value}</span>
                    </div>
                  ))}
                </div>

                <div style={card}>
                  <h3 style={{ color: "#fff", margin: "0 0 14px", fontSize: 15 }}>Customer Satisfaction</h3>
                  <div style={{ textAlign: "center", padding: "20px 0" }}>
                    <div style={{ fontSize: 48, fontWeight: 800, color: C.primary }}>{BOT_ANALYTICS.satisfactionScore}%</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 4 }}>Overall CSAT Score</div>
                    <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 16 }}>
                      {["😍", "😊", "😐", "😕", "😠"].map((emoji, i) => (
                        <div key={i} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 24 }}>{emoji}</div>
                          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 4 }}>{[52, 32, 9, 4, 3][i]}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════ ADVANCED TAB ═══════════ */}
          {activeTab === "advanced" && (
            <div>
              <h2 style={{ color: "#fff", fontSize: 18, margin: "0 0 20px" }}>Advanced Configuration</h2>

              <div style={{ display: "grid", gap: 16 }}>
                {/* Model Settings */}
                <div style={card}>
                  <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Model Settings</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <label style={label}>AI Model</label>
                      <select style={inputStyle}>
                        <option>Claude 3.5 Sonnet (Recommended)</option>
                        <option>Claude 3.5 Haiku (Fast)</option>
                        <option>Claude 3 Opus (Most Capable)</option>
                        <option>GPT-4o</option>
                        <option>Custom Fine-tuned Model</option>
                      </select>
                    </div>
                    <div>
                      <label style={label}>Context Window</label>
                      <select style={inputStyle}>
                        <option>Last 10 messages</option>
                        <option>Last 25 messages</option>
                        <option>Full conversation</option>
                      </select>
                    </div>
                    <div>
                      <label style={label}>Language</label>
                      <select style={inputStyle}>
                        <option>English (Auto-detect others)</option>
                        <option>Multi-language (Full support)</option>
                        <option>English Only</option>
                      </select>
                    </div>
                    <div>
                      <label style={label}>Confidence Threshold</label>
                      <input type="number" min="0" max="1" step="0.05" defaultValue="0.7" style={inputStyle} />
                    </div>
                  </div>
                </div>

                {/* Channel Activation */}
                <div style={card}>
                  <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Active Channels</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                    {[
                      { ch: "SMS", icon: "💬", color: "#00C9FF", active: true },
                      { ch: "WhatsApp", icon: "📱", color: "#25D366", active: true },
                      { ch: "Email", icon: "📧", color: "#FF6B35", active: true },
                      { ch: "RCS", icon: "✨", color: "#7C4DFF", active: false },
                      { ch: "MMS", icon: "📷", color: "#E040FB", active: false },
                      { ch: "Web Widget", icon: "🌐", color: "#00E676", active: true },
                    ].map(c => (
                      <div key={c.ch} style={{
                        background: c.active ? `${c.color}10` : "rgba(255,255,255,0.02)",
                        border: `1px solid ${c.active ? c.color + "44" : "rgba(255,255,255,0.06)"}`,
                        borderRadius: 10, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 18 }}>{c.icon}</span>
                          <span style={{ color: c.active ? c.color : "rgba(255,255,255,0.3)", fontSize: 13, fontWeight: 600 }}>{c.ch}</span>
                        </div>
                        <div style={{
                          width: 36, height: 20, borderRadius: 10, cursor: "pointer",
                          background: c.active ? c.color : "rgba(255,255,255,0.1)", position: "relative",
                        }}>
                          <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: c.active ? 18 : 2, transition: "all 0.2s" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rate Limits */}
                <div style={card}>
                  <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Safety & Limits</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                    <div>
                      <label style={label}>Max Messages/Conversation</label>
                      <input type="number" defaultValue="50" style={inputStyle} />
                    </div>
                    <div>
                      <label style={label}>Session Timeout (min)</label>
                      <input type="number" defaultValue="30" style={inputStyle} />
                    </div>
                    <div>
                      <label style={label}>Rate Limit (msg/min)</label>
                      <input type="number" defaultValue="10" style={inputStyle} />
                    </div>
                  </div>
                  <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
                    {[
                      { label: "PII Detection", enabled: true },
                      { label: "Profanity Filter", enabled: true },
                      { label: "Content Moderation", enabled: true },
                      { label: "Audit Logging", enabled: true },
                    ].map(s => (
                      <div key={s.label} style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "10px", textAlign: "center" }}>
                        <div style={{ color: s.enabled ? "#00E676" : "rgba(255,255,255,0.3)", fontSize: 12, fontWeight: 600 }}>{s.label}</div>
                        <div style={{ color: s.enabled ? "#00E676" : "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 2 }}>{s.enabled ? "● Enabled" : "○ Disabled"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════ RIGHT: Live Preview Simulator ═══════════ */}
      <div style={{ width: 380, borderLeft: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.15)", flexShrink: 0 }}>
        {/* Preview Header */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ color: "#fff", margin: 0, fontSize: 15 }}>💬 Live Preview</h3>
            <button onClick={() => { setPreviewMessages([]); setSelectedDemo(null); }} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 10px", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>Clear</button>
          </div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginBottom: 10 }}>Test your bot configuration in real-time</div>

          {/* Demo Scenarios */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {DEMO_CONVERSATIONS.map((demo, i) => (
              <button key={i} onClick={() => loadDemoConversation(demo)} style={{
                background: selectedDemo === demo ? `${C.primary}22` : "rgba(255,255,255,0.04)",
                border: `1px solid ${selectedDemo === demo ? C.primary + "44" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 6, padding: "3px 8px", cursor: "pointer",
                color: selectedDemo === demo ? C.primary : "rgba(255,255,255,0.35)", fontSize: 10,
                fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
              }}>{demo.persona.split(" ").slice(0, 2).join(" ")}</button>
            ))}
          </div>
        </div>

        {/* Chat Simulator */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {/* Bot greeting */}
          {previewMessages.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 16px" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: `linear-gradient(135deg, ${C.primary}33, ${C.accent || C.primary}33)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 14px" }}>🤖</div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{botName}</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginBottom: 16 }}>{personality?.name} mode · {temperature} temp</div>
              <div style={{
                background: `${C.primary}15`, border: `1px solid ${C.primary}33`, borderRadius: "14px 14px 14px 4px",
                padding: "12px 16px", color: "rgba(255,255,255,0.7)", fontSize: 13, textAlign: "left", maxWidth: 280, margin: "0 auto",
              }}>{greeting}</div>
              <div style={{ color: "rgba(255,255,255,0.15)", fontSize: 10, marginTop: 12 }}>Type a message or try a demo scenario</div>
            </div>
          )}

          {previewMessages.map((msg, i) => (
            <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 10, gap: 8, alignItems: "flex-end" }}>
              {msg.role !== "user" && (
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: `${C.primary}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>🤖</div>
              )}
              <div style={{
                maxWidth: "80%",
                background: msg.role === "user" ? "rgba(255,255,255,0.08)" : `${C.primary}15`,
                border: `1px solid ${msg.role === "user" ? "rgba(255,255,255,0.1)" : C.primary + "33"}`,
                borderRadius: msg.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                padding: "10px 14px", color: "rgba(255,255,255,0.8)", fontSize: 12.5, lineHeight: 1.5,
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {msg.role !== "user" && <div style={{ color: C.primary, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>🤖 {botName}</div>}
                {msg.text}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 4 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: `${C.primary}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>🤖</div>
              <div style={{ background: `${C.primary}15`, border: `1px solid ${C.primary}33`, borderRadius: "12px 12px 12px 4px", padding: "12px 16px" }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {[0, 1, 2].map(d => <div key={d} style={{ width: 6, height: 6, borderRadius: "50%", background: C.primary, opacity: 0.5, animation: `typingDot 1.4s infinite ${d * 0.2}s` }} />)}
                </div>
              </div>
            </div>
          )}
          <div ref={previewEndRef} />
        </div>

        {/* Compose */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={previewInput} onChange={e => setPreviewInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handlePreviewSend(); }} placeholder="Type a test message..." style={{ ...inputStyle, flex: 1, borderRadius: 10, padding: "10px 14px" }} />
            <button onClick={handlePreviewSend} disabled={!previewInput.trim()} style={{
              background: previewInput.trim() ? `linear-gradient(135deg, ${C.primary}, ${C.accent || C.primary})` : "rgba(255,255,255,0.06)",
              border: "none", borderRadius: 10, padding: "0 16px", color: previewInput.trim() ? "#000" : "rgba(255,255,255,0.2)",
              fontWeight: 700, cursor: previewInput.trim() ? "pointer" : "not-allowed", fontSize: 12, fontFamily: "'DM Sans', sans-serif",
            }}>Send</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "center" }}>
            <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>Model: Claude 3.5 Sonnet</span>
            <span style={{ color: "rgba(255,255,255,0.08)" }}>·</span>
            <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>Temp: {temperature}</span>
            <span style={{ color: "rgba(255,255,255,0.08)" }}>·</span>
            <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>KB: {KNOWLEDGE_SOURCES.length} sources</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes typingDot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
