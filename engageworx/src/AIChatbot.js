import { useState, useEffect, useRef } from "react";

const PERSONALITIES = [
  { id: "professional", name: "Professional", icon: "👔", desc: "Formal, business-appropriate tone", temp: 0.3, greeting: "Hello! Thank you for reaching out. How may I assist you today?" },
  { id: "friendly", name: "Friendly", icon: "😊", desc: "Warm, conversational, approachable", temp: 0.6, greeting: "Hey there! 👋 Great to hear from you! What can I help with?" },
  { id: "concise", name: "Concise", icon: "⚡", desc: "Brief, direct, efficient responses", temp: 0.2, greeting: "Hi! How can I help?" },
  { id: "empathetic", name: "Empathetic", icon: "💙", desc: "Understanding, supportive, patient", temp: 0.5, greeting: "Hi there! I'm here to help and happy to take as much time as you need. What's on your mind?" },
  { id: "sales", name: "Sales-Driven", icon: "🎯", desc: "Persuasive, benefit-focused, conversion-oriented", temp: 0.7, greeting: "Welcome! I'd love to help you find the perfect solution. What are you looking for today?" },
  { id: "technical", name: "Technical", icon: "🔧", desc: "Detailed, precise, documentation-style", temp: 0.2, greeting: "Hello. I'm your technical support assistant. Please describe your issue and I'll help troubleshoot." },
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
    { role: "bot", text: "The Growth plan is $249/month and includes up to 5,000 SMS messages, 3 phone numbers, AI bot included, and advanced analytics.\n\nWould you like me to compare it with our other plans, or help you get started with a free trial?" },
    { role: "user", text: "What about the Enterprise plan?" },
    { role: "bot", text: "Our Enterprise plan offers custom pricing based on your needs. It includes unlimited messages, all channels, white-label branding, custom integrations, and a dedicated account manager.\n\nI can connect you with our sales team for a personalized quote. Would you like that?" },
  ]},
  { persona: "Technical support inquiry", messages: [
    { role: "user", text: "My API calls are returning 429 errors" },
    { role: "bot", text: "A 429 error means you've hit our rate limit. Here's how to resolve it:\n\n1. Check your current limits in Settings → API\n2. Implement exponential backoff — Wait 1s, then 2s, then 4s between retries\n3. Use batch endpoints to send multiple messages per call\n\nWould you like me to show you a code example?" },
  ]},
  { persona: "Angry customer complaint", messages: [
    { role: "user", text: "I've been waiting 3 days for a response! This is unacceptable." },
    { role: "bot", text: "I completely understand your frustration, and I sincerely apologize for the delay. A 3-day wait is not the level of service we aim to provide.\n\nLet me escalate this immediately. Could you share your ticket number?" },
  ]},
  { persona: "Product recommendation", messages: [
    { role: "user", text: "We send about 100K SMS messages a month. Which plan?" },
    { role: "bot", text: "For 100K SMS messages monthly, I'd recommend our Pro plan at $499/month. It includes 20,000 SMS (with overage at $0.025/SMS), all channels, API access, and white-label branding.\n\nWant me to set up a free trial?" },
  ]},
];

const BOT_ANALYTICS = {
  totalConversations: 12847,
  avgResolutionTime: "1.8 min",
  satisfactionScore: 94.2,
  escalationRate: 8.7,
  containmentRate: 91.3,
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

export default function AIChatbot({ C, tenants, viewLevel = "tenant", currentTenantId, demoMode = true }) {
  const [activeTab, setActiveTab] = useState("configure");
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
  const [aiConfig, setAiConfig] = useState({ agentName: "Aria", businessInfo: "", aiEnabled: true, channels: { sms: true, whatsapp: true, email: true, voice: true } });
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [configError, setConfigError] = useState(null);
  const [kbUploadState, setKbUploadState] = useState("idle");
  const [kbUploadMsg, setKbUploadMsg] = useState("");
  const [kbUrlInput, setKbUrlInput] = useState("");
  const [showKbUrl, setShowKbUrl] = useState(false);
  const [kbSources, setKbSources] = useState([]);
  const kbFileRef = useRef(null);
  const [previewMessages, setPreviewMessages] = useState([]);
  const [previewInput, setPreviewInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [selectedDemo, setSelectedDemo] = useState(null);
  const [escRules, setEscRules] = useState([]);
  const [escLoading, setEscLoading] = useState(false);
  const [escSaving, setEscSaving] = useState(null);
  const [escModal, setEscModal] = useState(null);
  const [escError, setEscError] = useState(null);
  const previewEndRef = useRef(null);

  // Email signatures (per-tenant, stored on chatbot_configs)
  const [sigFromName, setSigFromName] = useState('Rob Mumby');
  const [sigFirst, setSigFirst] = useState('');
  const [sigReply, setSigReply] = useState('');
  const [teamSigFromName, setTeamSigFromName] = useState('The EngageWorx Team');
  const [teamSigFirst, setTeamSigFirst] = useState('');
  const [teamSigReply, setTeamSigReply] = useState('');
  const [sigSaving, setSigSaving] = useState(false);
  const [sigSaved, setSigSaved] = useState(false);

  useEffect(() => {
    if (!currentTenantId || demoMode) return;
    (async () => {
      try {
        const { supabase } = await import('./supabaseClient');
        const { data } = await supabase.from('chatbot_configs').select('email_from_name, email_signature_first, email_signature_reply, email_team_from_name, email_team_signature_first, email_team_signature_reply').eq('tenant_id', currentTenantId).maybeSingle();
        if (data) {
          if (data.email_from_name) setSigFromName(data.email_from_name);
          if (data.email_signature_first) setSigFirst(data.email_signature_first);
          if (data.email_signature_reply) setSigReply(data.email_signature_reply);
          if (data.email_team_from_name) setTeamSigFromName(data.email_team_from_name);
          if (data.email_team_signature_first) setTeamSigFirst(data.email_team_signature_first);
          if (data.email_team_signature_reply) setTeamSigReply(data.email_team_signature_reply);
        }
      } catch (e) {}
    })();
  }, [currentTenantId, demoMode]);

  const saveSignatures = async () => {
    if (!currentTenantId) { alert('No tenant context.'); return; }
    setSigSaving(true);
    try {
      const { supabase } = await import('./supabaseClient');
      await supabase.from('chatbot_configs').upsert({
        tenant_id: currentTenantId,
        email_from_name: sigFromName || null,
        email_signature_first: sigFirst || null,
        email_signature_reply: sigReply || null,
        email_team_from_name: teamSigFromName || null,
        email_team_signature_first: teamSigFirst || null,
        email_team_signature_reply: teamSigReply || null,
      }, { onConflict: 'tenant_id' });
      setSigSaved(true);
      setTimeout(() => setSigSaved(false), 2000);
    } catch (e) { alert('Error: ' + e.message); }
    setSigSaving(false);
  };

  async function loadEscalationRules() {
    if (!currentTenantId || demoMode) return;
    setEscLoading(true);
    try {
      var r = await fetch('/api/escalation-rules?tenantId=' + currentTenantId);
      var d = await r.json();
      if (d.rules) setEscRules(d.rules);
    } catch (e) { console.warn('Escalation rules load error:', e.message); }
    setEscLoading(false);
  }
  useEffect(function() { loadEscalationRules(); }, [currentTenantId, demoMode]); // eslint-disable-line

  useEffect(() => {
    if (!currentTenantId || demoMode) return;
    (async () => {
      setConfigLoading(true);
      try {
        const { supabase } = await import('./supabaseClient');
        // Load from chatbot_configs first (primary source for bot name/prompt/kb)
        var cbBotName = null;
        try {
          var cbR = await supabase.from('chatbot_configs').select('bot_name, system_prompt, knowledge_base').eq('tenant_id', currentTenantId).maybeSingle();
          if (cbR.data) {
            if (cbR.data.bot_name) { cbBotName = cbR.data.bot_name; setBotName(cbR.data.bot_name); }
            if (cbR.data.system_prompt) setSystemPrompt(cbR.data.system_prompt);
          }
        } catch (e) {}
        // Load channel configs for per-channel settings
        const { data, error } = await supabase.from('channel_configs').select('channel, config_encrypted, enabled').eq('tenant_id', currentTenantId);
        if (!error && data && data.length > 0) {
          var merged = { agentName: cbBotName || "Aria", businessInfo: "", kbSources: [], aiEnabled: true, channels: { sms: false, whatsapp: false, email: false, voice: false } };
          data.forEach(function(cfg) {
            var c = cfg.config_encrypted || {};
            if (c.ai_agent_name && !cbBotName) merged.agentName = c.ai_agent_name;
            if (c.ai_business_info && c.ai_business_info.length > (merged.businessInfo || '').length) merged.businessInfo = c.ai_business_info;
            if (c.kb_sources) merged.kbSources = c.kb_sources;
            if (c.ai_enabled !== undefined) merged.aiEnabled = c.ai_enabled;
            if (cfg.channel && cfg.enabled) merged.channels[cfg.channel] = true;
          });
          setAiConfig(merged);
          setBotName(merged.agentName);
          if (merged.kbSources && merged.kbSources.length > 0) setKbSources(merged.kbSources);
        }
      } catch (err) { console.error('AI config load error:', err); }
      setConfigLoading(false);
    })();
  }, [currentTenantId, demoMode]);

  useEffect(() => {
    if (previewEndRef.current) previewEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [previewMessages, isTyping]);

  async function saveAIConfig(overrideKbSources) {
  if (overrideKbSources && !Array.isArray(overrideKbSources)) overrideKbSources = undefined;
  if (!currentTenantId) { setConfigError("No tenant selected — please log in to save."); return; }
    setConfigSaved(false);
    setConfigError(null);
    try {
      const { supabase } = await import('./supabaseClient');
      var channelList = ['sms', 'email', 'voice'];
      for (var i = 0; i < channelList.length; i++) {
        var ch = channelList[i];
        // Read existing config first — never overwrite credentials
const existingRow = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', currentTenantId).eq('channel', ch).maybeSingle();
const existingEncrypted = existingRow.data?.config_encrypted || {};
const configData = { 
  ...existingEncrypted,
  ai_enabled: aiConfig.aiEnabled && aiConfig.channels[ch], 
  ai_agent_name: aiConfig.agentName, 
  ai_business_info: aiConfig.businessInfo, 
  kb_sources: overrideKbSources || kbSources 
};
var existing = await supabase.from('channel_configs').select('id').eq('tenant_id', currentTenantId).eq('channel', ch).maybeSingle();
if (existing.data) {
  await supabase.from('channel_configs').update({ config_encrypted: configData, enabled: aiConfig.channels[ch] }).eq('id', existing.data.id);
} else if (aiConfig.channels[ch]) {
  await supabase.from('channel_configs').insert({ tenant_id: currentTenantId, channel: ch, config_encrypted: configData, enabled: true, provider: ch, status: 'connected' });
}
      }
      // Sync to chatbot_configs so message handlers pick up business knowledge
      var cbPayload = {
        tenant_id: currentTenantId,
        bot_name: aiConfig.agentName,
        system_prompt: systemPrompt,
        knowledge_base: aiConfig.businessInfo,
        channels_active: Object.keys(aiConfig.channels).filter(k => aiConfig.channels[k]),
      };
      console.log('[AIChatbot] saving chatbot_configs:', JSON.stringify(cbPayload));
      await supabase.from('chatbot_configs').upsert(cbPayload, { onConflict: 'tenant_id' });
      setBotName(aiConfig.agentName);
      setConfigSaved(true);
      setKbUploadState("idle");
      setTimeout(function() { setConfigSaved(false); }, 3000);
    } catch (err) { setConfigError(err.message); }
  }

  async function handleKbFileUpload(e) {
    var file = e.target.files[0];
    if (!file) return;
    setKbUploadState("uploading");
    setKbUploadMsg("");
    try {
      var text = "";
      if (file.type === "text/plain" || file.name.endsWith(".md") || file.name.endsWith(".csv")) {
        text = await new Promise(function(resolve, reject) {
          var reader = new FileReader();
          reader.onload = function(ev) { resolve(ev.target.result); };
          reader.onerror = function() { reject(new Error("Failed to read file")); };
          reader.readAsText(file);
        });
      } else if (file.name.endsWith(".pdf")) {
        throw new Error("PDFs can't be extracted in the browser. Please save your content as a .txt file and upload that, or use Connect URL to fetch your website content automatically.");
      } else {
        text = await new Promise(function(resolve, reject) {
          var reader = new FileReader();
          reader.onload = function(ev) { resolve(ev.target.result || ""); };
          reader.onerror = function() { reject(new Error("Failed to read file")); };
          reader.readAsBinaryString(file);
        });
        text = text.replace(/[^\x20-\x7E\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);
      }
      if (!text || text.trim().length < 10) throw new Error("Could not extract text. Try a .txt or .md file.");
      var currentInfo = aiConfig.businessInfo || "";
      var separator = currentInfo.trim() ? "\n\n---\n" : "";
      var newInfo = currentInfo + separator + "Source: " + file.name + "\n" + text.trim();
      setAiConfig(Object.assign({}, aiConfig, { businessInfo: newInfo.slice(0, 10000) }));
      setKbUploadState("done");
      setKbUploadMsg("Content from " + file.name + " added. Click Save below to update your AI agent.");
      var newSources = kbSources.concat([{ type: "file", name: file.name, addedAt: new Date().toLocaleTimeString() }]);
setKbSources(newSources);
saveAIConfig(newSources);
    } catch (err) {
      setKbUploadState("error");
      setKbUploadMsg(err.message || "Failed to extract text.");
    }
    if (kbFileRef.current) kbFileRef.current.value = "";
  }

  async function handleKbUrlFetch() {
    if (!kbUrlInput.trim()) return;
    setKbUploadState("fetching");
    setKbUploadMsg("");
    try {
      var res = await fetch("/api/detect-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: kbUrlInput.trim() }),
      });
      var data = await res.json();
      if (!data.success || !data.brand) throw new Error(data.error || "Failed to fetch website");
      var brand = data.brand;
      var content = [];
      if (brand.name) content.push("Business Name: " + brand.name);
      if (brand.description) content.push("\n" + brand.description);
      if (brand.vertical) content.push("\nIndustry: " + brand.vertical);
      if (brand.phone) content.push("Phone: " + brand.phone);
      if (brand.email) content.push("Email: " + brand.email);
      if (brand.address) content.push("Address: " + brand.address);
      if (brand.tagline) content.push("Tagline: " + brand.tagline);
      var extracted = content.join("\n").trim();
      var currentInfo = aiConfig.businessInfo || "";
      var separator = currentInfo.trim() ? "\n\n---\n" : "";
      var newInfo = currentInfo + separator + "Source: " + kbUrlInput.trim() + "\n" + extracted;
      setAiConfig(Object.assign({}, aiConfig, { businessInfo: newInfo.slice(0, 10000) }));
      setKbUploadState("done");
      setKbUploadMsg("Content from " + (brand.name || kbUrlInput) + " added. Click Save below to update your AI agent.");
      var newSources = kbSources.concat([{ type: "url", name: brand.name || kbUrlInput, url: kbUrlInput, addedAt: new Date().toLocaleTimeString() }]);
setKbSources(newSources);
saveAIConfig(newSources);
      setKbUrlInput("");
    } catch (err) {
      setKbUploadState("error");
      setKbUploadMsg(err.message || "Could not fetch website. Please try again.");
    }
  }

  const personality = PERSONALITIES.find(p => p.id === selectedPersonality);
  const inputStyle = { width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" };
  const btnPrimary = { background: `linear-gradient(135deg, ${C.primary}, ${C.accent || C.primary})`, border: "none", borderRadius: 10, padding: "10px 20px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  const btnSecondary = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 20px", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  const card = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 22 };
  const badge = (color) => ({ display: "inline-block", background: color + "18", color, border: `1px solid ${color}44`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 });
  const label = { color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, display: "block", fontWeight: 700 };

  const handleSelectPersonality = (p) => { setSelectedPersonality(p.id); setGreeting(p.greeting); setTemperature(p.temp); };

  const handlePreviewSend = () => {
    if (!previewInput.trim()) return;
    setPreviewMessages(prev => [...prev, { role: "user", text: previewInput }]);
    setPreviewInput("");
    setIsTyping(true);
    setTimeout(() => {
      const responses = [
        `Great question! Based on our knowledge base, I can help with that. ${enableEmoji ? "😊" : ""}\n\nLet me pull up the relevant information for you...`,
        `I'd be happy to assist! Our platform supports SMS, Email, WhatsApp, RCS, MMS, and Voice channels. Each can be configured independently.\n\nWould you like more details on any specific channel?`,
        `Thanks for reaching out! ${enableEmoji ? "👋" : ""} You can manage this through Settings → Channels → Configuration. The changes take effect immediately.\n\nAnything else I can help with?`,
      ];
      setPreviewMessages(prev => [...prev, { role: "bot", text: responses[Math.floor(Math.random() * responses.length)] }]);
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
        if (i < demo.messages.length - 1 && demo.messages[i + 1].role === "bot") setIsTyping(true);
      }, delay);
      if (msg.role === "user" && i < demo.messages.length - 1) setTimeout(() => setIsTyping(true), delay + 200);
    });
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'DM Sans', sans-serif", overflow: "hidden" }}>
      {/* LEFT: Configuration Panel */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        <div style={{ maxWidth: 900 }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>🤖 {aiConfig.agentName || botName || 'Aria'} <span style={{ color: C.muted, fontSize: 14, fontWeight: 500 }}>· AI assistant</span></h1>
              <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>Configure personality, knowledge, and escalation rules</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={badge("#00E676")}>● Bot Active</span>
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
              { id: "configure", label: "Agent Settings", icon: "⚙️" },
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

          {/* CONFIGURE TAB */}
          {activeTab === "configure" && (
            <div>
              {configLoading ? (
                <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Loading AI configuration...</div>
              ) : (
                <div style={{ display: "grid", gap: 20 }}>
                  <div style={card}>
                    <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 16 }}>Agent Name & Status</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: 700 }}>Agent Name</div>
                        <input value={aiConfig.agentName} onChange={function(e) { setAiConfig(Object.assign({}, aiConfig, { agentName: e.target.value })); }} placeholder="Aria" style={inputStyle} />
                        <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>This is what your AI agent calls itself on calls and in messages</div>
                      </div>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: 700 }}>AI Enabled</div>
                        <div onClick={function() { setAiConfig(Object.assign({}, aiConfig, { aiEnabled: !aiConfig.aiEnabled })); }} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 14px", background: aiConfig.aiEnabled ? C.primary + "15" : "rgba(255,255,255,0.03)", border: "1px solid " + (aiConfig.aiEnabled ? C.primary + "44" : "rgba(255,255,255,0.1)"), borderRadius: 10 }}>
                          <div style={{ width: 40, height: 22, borderRadius: 11, background: aiConfig.aiEnabled ? C.primary : "rgba(255,255,255,0.15)", position: "relative", transition: "background 0.2s" }}>
                            <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 2, left: aiConfig.aiEnabled ? 20 : 2, transition: "left 0.2s" }} />
                          </div>
                          <span style={{ color: aiConfig.aiEnabled ? "#fff" : C.muted, fontWeight: 600, fontSize: 13 }}>{aiConfig.aiEnabled ? "AI is active" : "AI is disabled"}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={card}>
                    <h3 style={{ color: "#fff", margin: "0 0 6px", fontSize: 16 }}>Active Channels</h3>
                    <div style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>Toggle which channels the AI agent responds on</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                      {[
                        { id: "sms", label: "SMS", icon: "📱", color: "#00C9FF" },
                        { id: "whatsapp", label: "WhatsApp", icon: "📲", color: "#25D366" },
                        { id: "email", label: "Email", icon: "📧", color: "#FF6B35" },
                        { id: "voice", label: "Voice", icon: "📞", color: "#7C4DFF" },
                      ].map(function(ch) {
                        var enabled = aiConfig.channels[ch.id];
                        return (
                          <div key={ch.id} onClick={function() { var newChannels = Object.assign({}, aiConfig.channels); newChannels[ch.id] = !newChannels[ch.id]; setAiConfig(Object.assign({}, aiConfig, { channels: newChannels })); }} style={{ textAlign: "center", padding: 16, borderRadius: 12, cursor: "pointer", background: enabled ? ch.color + "12" : "rgba(255,255,255,0.02)", border: "1px solid " + (enabled ? ch.color + "44" : "rgba(255,255,255,0.06)"), transition: "all 0.2s" }}>
                            <div style={{ fontSize: 28, marginBottom: 6 }}>{ch.icon}</div>
                            <div style={{ color: enabled ? "#fff" : C.muted, fontWeight: 700, fontSize: 13 }}>{ch.label}</div>
                            <div style={{ color: enabled ? ch.color : C.muted, fontSize: 11, marginTop: 4, fontWeight: 600 }}>{enabled ? "● Active" : "○ Off"}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={card}>
                    <h3 style={{ color: "#fff", margin: "0 0 6px", fontSize: 16 }}>Business Knowledge</h3>
                    <div style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>Provide information your AI agent needs to answer customer questions accurately. Include products/services, pricing, hours, policies, FAQ — anything a customer might ask.</div>
                    <textarea value={aiConfig.businessInfo} onChange={function(e) { setAiConfig(Object.assign({}, aiConfig, { businessInfo: e.target.value })); }} placeholder={"Example:\nWe are ABC Dental, a family dentistry practice.\nHours: Mon-Fri 8am-5pm, Sat 9am-1pm\nServices: cleanings, fillings, crowns, whitening, implants\nNew patient appointments: call or book online at abcdental.com"} rows={12} style={Object.assign({}, inputStyle, { resize: "vertical", lineHeight: 1.6 })} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                      <span style={{ color: C.muted, fontSize: 11 }}>{(aiConfig.businessInfo || "").length} characters</span>
                      <span style={{ color: C.muted, fontSize: 11 }}>Used across all channels — voice, WhatsApp, SMS, and email</span>
                    </div>
                  </div>

                  <div style={card}>
                    <h3 style={{ color: "#fff", margin: "0 0 6px", fontSize: 16 }}>✉️ Email Signatures</h3>
                    <div style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>Used in every outbound email. <strong>First</strong> signature is used for new outreach / sequence step 1. <strong>Reply</strong> signature is used for replies and sequence steps 2+. Claude adds a contextual closing line (e.g. "Looking forward to connecting!") above the signature HTML automatically.</div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      {/* Personal */}
                      <div style={{ background: "rgba(0,201,255,0.04)", border: "1px solid rgba(0,201,255,0.2)", borderRadius: 10, padding: 14 }}>
                        <div style={{ color: "#00C9FF", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>🧑 Personal</div>
                        <label style={label}>From name</label>
                        <input value={sigFromName} onChange={e => setSigFromName(e.target.value)} style={inputStyle} />
                        <label style={Object.assign({}, label, { marginTop: 12, display: 'block' })}>First email signature (HTML)</label>
                        <textarea value={sigFirst} onChange={e => setSigFirst(e.target.value)} rows={8} style={Object.assign({}, inputStyle, { fontFamily: 'monospace', fontSize: 11, resize: 'vertical' })} />
                        <div style={{ marginTop: 6, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' }}>
                          <iframe title="sig-first" srcDoc={sigFirst} style={{ width: '100%', height: 200, border: 0, background: '#fff' }} />
                        </div>
                        <label style={Object.assign({}, label, { marginTop: 12, display: 'block' })}>Reply signature (HTML)</label>
                        <textarea value={sigReply} onChange={e => setSigReply(e.target.value)} rows={6} style={Object.assign({}, inputStyle, { fontFamily: 'monospace', fontSize: 11, resize: 'vertical' })} />
                        <div style={{ marginTop: 6, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' }}>
                          <iframe title="sig-reply" srcDoc={sigReply} style={{ width: '100%', height: 120, border: 0, background: '#fff' }} />
                        </div>
                      </div>

                      {/* Team / AI */}
                      <div style={{ background: "rgba(224,64,251,0.04)", border: "1px solid rgba(224,64,251,0.2)", borderRadius: 10, padding: 14 }}>
                        <div style={{ color: "#E040FB", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>{'🤖 Team / ' + (botName || 'AI')}</div>
                        <label style={label}>From name</label>
                        <input value={teamSigFromName} onChange={e => setTeamSigFromName(e.target.value)} style={inputStyle} />
                        <label style={Object.assign({}, label, { marginTop: 12, display: 'block' })}>First email signature (HTML)</label>
                        <textarea value={teamSigFirst} onChange={e => setTeamSigFirst(e.target.value)} rows={8} style={Object.assign({}, inputStyle, { fontFamily: 'monospace', fontSize: 11, resize: 'vertical' })} />
                        <div style={{ marginTop: 6, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' }}>
                          <iframe title="team-sig-first" srcDoc={teamSigFirst} style={{ width: '100%', height: 200, border: 0, background: '#fff' }} />
                        </div>
                        <label style={Object.assign({}, label, { marginTop: 12, display: 'block' })}>Reply signature (HTML)</label>
                        <textarea value={teamSigReply} onChange={e => setTeamSigReply(e.target.value)} rows={6} style={Object.assign({}, inputStyle, { fontFamily: 'monospace', fontSize: 11, resize: 'vertical' })} />
                        <div style={{ marginTop: 6, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' }}>
                          <iframe title="team-sig-reply" srcDoc={teamSigReply} style={{ width: '100%', height: 120, border: 0, background: '#fff' }} />
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14 }}>
                      <button onClick={saveSignatures} disabled={sigSaving || !currentTenantId} style={Object.assign({}, btnPrimary, { opacity: (sigSaving || !currentTenantId) ? 0.5 : 1 })}>{sigSaving ? 'Saving…' : 'Save Signatures'}</button>
                      {sigSaved && <span style={{ color: "#00E676", fontSize: 13, fontWeight: 600 }}>✓ Saved — will be used on next outbound email</span>}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <button onClick={function() { if (!currentTenantId) { alert("Please log in to save your configuration."); return; } saveAIConfig(); }} style={btnPrimary}>Save Configuration</button>
                    {configSaved && <span style={{ color: "#00E676", fontSize: 13, fontWeight: 600 }}>✓ Saved successfully — your AI agent is updated across all channels</span>}
                    {configError && <span style={{ color: "#FF3B30", fontSize: 13 }}>{configError}</span>}
                    {demoMode && <span style={{ color: C.muted, fontSize: 12 }}>Demo mode — changes won't be saved</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PERSONALITY TAB */}
          {activeTab === "personality" && (
            <div>
              <div style={{ ...card, marginBottom: 20 }}>
                <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 16 }}>Personality Preset</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {PERSONALITIES.map(p => (
                    <button key={p.id} onClick={() => handleSelectPersonality(p)} style={{ background: selectedPersonality === p.id ? `${C.primary}15` : "rgba(255,255,255,0.03)", border: `2px solid ${selectedPersonality === p.id ? C.primary : "rgba(255,255,255,0.06)"}`, borderRadius: 12, padding: "16px", cursor: "pointer", textAlign: "left", transition: "all 0.2s", fontFamily: "'DM Sans', sans-serif" }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>{p.icon}</div>
                      <div style={{ color: selectedPersonality === p.id ? C.primary : "#fff", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{p.name}</div>
                      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, lineHeight: 1.3 }}>{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ ...card, marginBottom: 20 }}>
                <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 16 }}>Fine-Tuning</h3>
                <div style={{ display: "grid", gap: 20 }}>
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
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <label style={{ ...label, margin: 0 }}>Max Response Length</label>
                      <span style={{ color: C.primary, fontSize: 14, fontWeight: 700 }}>{maxTokens} tokens</span>
                    </div>
                    <input type="range" min="100" max="2000" step="50" value={maxTokens} onChange={e => setMaxTokens(parseInt(e.target.value))} style={{ width: "100%", accentColor: C.primary }} />
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <label style={{ ...label, margin: 0 }}>Simulated Typing Delay</label>
                      <span style={{ color: C.primary, fontSize: 14, fontWeight: 700 }}>{responseDelay}s</span>
                    </div>
                    <input type="range" min="0" max="5" step="0.1" value={responseDelay} onChange={e => setResponseDelay(parseFloat(e.target.value))} style={{ width: "100%", accentColor: C.primary }} />
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    {[
                      { label: "Emoji", value: enableEmoji, setter: setEnableEmoji, icon: "😊" },
                      { label: "Code Blocks", value: enableCodeBlocks, setter: setEnableCodeBlocks, icon: "💻" },
                      { label: "Rich Formatting", value: enableMarkdown, setter: setEnableMarkdown, icon: "✨" },
                    ].map(toggle => (
                      <button key={toggle.label} onClick={() => toggle.setter(!toggle.value)} style={{ flex: 1, background: toggle.value ? `${C.primary}15` : "rgba(255,255,255,0.03)", border: `1px solid ${toggle.value ? C.primary + "44" : "rgba(255,255,255,0.06)"}`, borderRadius: 10, padding: "12px", cursor: "pointer", textAlign: "center", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{toggle.icon}</div>
                        <div style={{ color: toggle.value ? C.primary : "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 600 }}>{toggle.label}</div>
                        <div style={{ color: toggle.value ? "#00E676" : "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 2 }}>{toggle.value ? "Enabled" : "Disabled"}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={card}>
                <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 16 }}>Fallback & Instructions</h3>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Fallback Message</label>
                  <textarea value={fallbackMsg} onChange={e => setFallbackMsg(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
                </div>
                <div>
                  <label style={label}>System Prompt</label>
                  <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} />
                </div>
              </div>
            </div>
          )}

          {/* KNOWLEDGE BASE TAB */}
          {activeTab === "knowledge" && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ color: "#fff", fontSize: 18, margin: 0 }}>Knowledge Base</h2>
                <p style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Upload documents or connect your website to build your AI knowledge base</p>
              </div>

              {kbSources.length > 0 && (
                <div style={{ ...card, marginBottom: 16 }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12, fontWeight: 700 }}>Added This Session</div>
                  {kbSources.map(function(src, i) {
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < kbSources.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                        <span style={{ fontSize: 16 }}>{src.type === "file" ? "📄" : "🔗"}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{src.name}</div>
                          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>{src.type === "file" ? "File upload" : src.url} · {src.addedAt}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
  <span style={{ color: "#00E676", fontSize: 11, fontWeight: 700 }}>✓ Saved</span>
  <button onClick={function() {
    var newSources = kbSources.filter(function(_, j) { return j !== i; });
    setKbSources(newSources);
    saveAIConfig(newSources);
  }} style={{ background: "rgba(255,59,48,0.1)", border: "1px solid rgba(255,59,48,0.3)", borderRadius: 6, padding: "2px 8px", color: "#FF3B30", fontSize: 10, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Remove</button>
</div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ ...card, border: "2px dashed rgba(255,255,255,0.1)", padding: 28 }}>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>📁</div>
                  <div style={{ color: "#fff", fontWeight: 600, marginBottom: 4 }}>Add Knowledge Source</div>
                  <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>Upload a document or connect your website to auto-fill your AI's knowledge base</div>
                </div>

                {kbUploadState !== "idle" && (
                  <div style={{ background: kbUploadState === "error" ? "rgba(255,59,48,0.1)" : kbUploadState === "done" ? "rgba(0,230,118,0.1)" : "rgba(0,201,255,0.08)", border: `1px solid ${kbUploadState === "error" ? "rgba(255,59,48,0.3)" : kbUploadState === "done" ? "rgba(0,230,118,0.3)" : "rgba(0,201,255,0.2)"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, color: kbUploadState === "error" ? "#FF3B30" : kbUploadState === "done" ? "#00E676" : C.primary, fontSize: 13, textAlign: "center" }}>
                    {kbUploadState === "uploading" && "⏳ Extracting text from document..."}
                    {kbUploadState === "fetching" && "⏳ Fetching website content..."}
                    {kbUploadState === "done" && "✓ " + kbUploadMsg}
                    {kbUploadState === "error" && "✕ " + kbUploadMsg}
                  </div>
                )}

                {showKbUrl && (
                  <div style={{ marginBottom: 16, background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 16 }}>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, fontWeight: 700 }}>Website URL</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={kbUrlInput} onChange={function(e) { setKbUrlInput(e.target.value); }} onKeyDown={function(e) { if (e.key === "Enter") handleKbUrlFetch(); }} placeholder="https://yourwebsite.com" style={{ flex: 1, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
                      <button onClick={handleKbUrlFetch} disabled={!kbUrlInput.trim() || kbUploadState === "fetching"} style={{ background: kbUrlInput.trim() ? `linear-gradient(135deg, ${C.primary}, ${C.accent || C.primary})` : "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, padding: "10px 16px", color: kbUrlInput.trim() ? "#000" : "rgba(255,255,255,0.2)", fontWeight: 700, cursor: kbUrlInput.trim() ? "pointer" : "not-allowed", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{kbUploadState === "fetching" ? "..." : "Fetch"}</button>
                      <button onClick={function() { setShowKbUrl(false); setKbUrlInput(""); setKbUploadState("idle"); }} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "10px 12px", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>✕</button>
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginTop: 6 }}>Claude will fetch your website and extract business info into the knowledge base</div>
                  </div>
                )}

                <input ref={kbFileRef} type="file" accept=".pdf,.doc,.docx,.txt,.md,.csv" style={{ display: "none" }} onChange={handleKbFileUpload} />
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button style={btnSecondary} onClick={function() { if (kbFileRef.current) kbFileRef.current.click(); }}>📄 Upload Files</button>
                  <button style={{ ...btnSecondary, background: showKbUrl ? `${C.primary}22` : undefined, borderColor: showKbUrl ? `${C.primary}44` : undefined, color: showKbUrl ? C.primary : undefined }} onClick={function() { setShowKbUrl(!showKbUrl); setKbUploadState("idle"); }}>🔗 Connect URL</button>
                  <button style={btnSecondary} onClick={function() { alert("🔌 API import coming soon."); }}>🔌 API Import</button>
                </div>
                <div style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 11, marginTop: 10 }}>Supported: TXT, Markdown, CSV (use Connect URL for websites)</div>

                <div style={{ marginTop: 20, textAlign: "center" }}>
  <button onClick={saveAIConfig} style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent || C.primary})`, border: "none", borderRadius: 10, padding: "12px 28px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>💾 Save to AI Knowledge Base</button>
  {configSaved && <div style={{ color: "#00E676", fontSize: 13, fontWeight: 600, marginTop: 8 }}>✓ Saved — your AI agent has been updated</div>}
  {configError && <div style={{ color: "#FF3B30", fontSize: 13, marginTop: 8 }}>{configError}</div>}
</div>
              </div>
            </div>
          )}

          {/* ESCALATION RULES TAB */}
          {activeTab === "escalation" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <h2 style={{ color: "#fff", fontSize: 18, margin: 0 }}>Escalation Rules</h2>
                  <p style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Define when the bot should hand off to a human agent</p>
                </div>
                <button onClick={function() { setEscModal({ rule_name: '', description: '', trigger_type: 'keyword', trigger_config: { keywords: [] }, action_type: 'notify_admin', action_config: {}, priority: 10, active: true, _isNew: true }); }} style={btnPrimary}>+ Add Rule</button>
              </div>
              {escError && <div style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 8, padding: '8px 12px', color: '#FF3B30', fontSize: 12, marginBottom: 12 }}>{escError}</div>}
              {escLoading ? <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Loading rules...</div> : (
              <div style={{ display: "grid", gap: 10 }}>
                {escRules.length === 0 && <div style={{ color: C.muted, textAlign: 'center', padding: 30 }}>No escalation rules configured. Click "+ Add Rule" to create one.</div>}
                {escRules.map(function(rule) {
                  var pColor = rule.priority <= 3 ? '#FF3B30' : rule.priority <= 7 ? '#FFD600' : '#6B8BAE';
                  var triggerLabel = rule.trigger_type === 'keyword' ? 'Keywords: ' + ((rule.trigger_config && rule.trigger_config.keywords) || []).join(', ') : rule.trigger_type === 'sentiment' ? 'Negative sentiment' : rule.trigger_type === 'vip_match' ? 'VIP contact' : rule.trigger_type;
                  var actionLabel = (rule.action_type || '').replace(/_/g, ' ');
                  return (
                  <div key={rule.id} style={{ ...card, display: "grid", gridTemplateColumns: "1fr 180px 80px 60px 60px", alignItems: "center", gap: 14, opacity: rule.active ? 1 : 0.5, borderLeft: '4px solid ' + pColor }}>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{rule.rule_name}</div>
                      {rule.description && <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{rule.description}</div>}
                      <div style={{ color: C.muted, fontSize: 11, marginTop: 2, fontFamily: "monospace" }}>{triggerLabel}</div>
                    </div>
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{actionLabel}</div>
                      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 2 }}>Priority: {rule.priority}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div onClick={async function() {
                        setEscSaving(rule.id);
                        try {
                          var r = await fetch('/api/escalation-rules', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rule.id, tenant_id: currentTenantId, active: !rule.active }) });
                          if (r.ok) { setEscRules(function(prev) { return prev.map(function(x) { return x.id === rule.id ? Object.assign({}, x, { active: !x.active }) : x; }); }); }
                          else { var d = await r.json(); setEscError(d.error || 'Toggle failed'); }
                        } catch (e) { setEscError(e.message); }
                        setEscSaving(null);
                      }} style={{ width: 40, height: 22, borderRadius: 11, cursor: escSaving === rule.id ? 'wait' : 'pointer', position: "relative", background: rule.active ? C.primary : "rgba(255,255,255,0.1)", transition: "all 0.2s" }}>
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: rule.active ? 20 : 2, transition: "all 0.2s" }} />
                      </div>
                    </div>
                    <button onClick={function() { setEscModal(Object.assign({}, rule, { _isNew: false })); }} style={{ ...btnSecondary, padding: "6px 10px", fontSize: 11 }}>Edit</button>
                    <button onClick={async function() {
                      if (!window.confirm('Delete rule "' + rule.rule_name + '"?')) return;
                      try {
                        await fetch('/api/escalation-rules', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rule.id, tenant_id: currentTenantId }) });
                        setEscRules(function(prev) { return prev.filter(function(x) { return x.id !== rule.id; }); });
                      } catch (e) { setEscError(e.message); }
                    }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                  </div>
                  );
                })}
              </div>
              )}
              {/* Edit/Add Modal */}
              {escModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={function() { setEscModal(null); }}>
                  <div onClick={function(e) { e.stopPropagation(); }} style={{ background: '#0d1425', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16, padding: 28, width: 480, maxHeight: '80vh', overflowY: 'auto' }}>
                    <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 16 }}>{escModal._isNew ? 'Add Escalation Rule' : 'Edit Rule'}</h3>
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div><label style={{ color: C.muted, fontSize: 11, display: 'block', marginBottom: 4 }}>Rule Name *</label><input value={escModal.rule_name} onChange={function(e) { setEscModal(Object.assign({}, escModal, { rule_name: e.target.value })); }} style={inputStyle} /></div>
                      <div><label style={{ color: C.muted, fontSize: 11, display: 'block', marginBottom: 4 }}>Description</label><input value={escModal.description || ''} onChange={function(e) { setEscModal(Object.assign({}, escModal, { description: e.target.value })); }} style={inputStyle} /></div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div><label style={{ color: C.muted, fontSize: 11, display: 'block', marginBottom: 4 }}>Trigger Type</label><select value={escModal.trigger_type} onChange={function(e) { setEscModal(Object.assign({}, escModal, { trigger_type: e.target.value })); }} style={inputStyle}><option value="keyword">Keyword match</option><option value="sentiment">Negative sentiment</option><option value="vip_match">VIP contact</option><option value="custom">Custom</option></select></div>
                        <div><label style={{ color: C.muted, fontSize: 11, display: 'block', marginBottom: 4 }}>Action</label><select value={escModal.action_type} onChange={function(e) { setEscModal(Object.assign({}, escModal, { action_type: e.target.value })); }} style={inputStyle}><option value="notify_admin">Notify admin</option><option value="escalate_human">Escalate to human</option><option value="tag_conversation">Tag conversation</option><option value="create_ticket">Create ticket</option></select></div>
                      </div>
                      {escModal.trigger_type === 'keyword' && (
                        <div><label style={{ color: C.muted, fontSize: 11, display: 'block', marginBottom: 4 }}>Keywords (comma-separated)</label><input value={((escModal.trigger_config && escModal.trigger_config.keywords) || []).join(', ')} onChange={function(e) { setEscModal(Object.assign({}, escModal, { trigger_config: { keywords: e.target.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean) } })); }} placeholder="lawyer, lawsuit, legal action" style={inputStyle} /></div>
                      )}
                      <div><label style={{ color: C.muted, fontSize: 11, display: 'block', marginBottom: 4 }}>Priority (1=highest, 10=default)</label><input type="number" min="1" max="99" value={escModal.priority} onChange={function(e) { setEscModal(Object.assign({}, escModal, { priority: parseInt(e.target.value) || 10 })); }} style={inputStyle} /></div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
                      <button onClick={function() { setEscModal(null); }} style={btnSecondary}>Cancel</button>
                      <button onClick={async function() {
                        if (!escModal.rule_name) { setEscError('Rule name is required'); return; }
                        setEscSaving('modal');
                        try {
                          var payload = { tenant_id: currentTenantId, rule_name: escModal.rule_name, description: escModal.description, trigger_type: escModal.trigger_type, trigger_config: escModal.trigger_config || {}, action_type: escModal.action_type, action_config: escModal.action_config || {}, priority: escModal.priority, active: escModal.active !== false };
                          var method = escModal._isNew ? 'POST' : 'PATCH';
                          if (!escModal._isNew) payload.id = escModal.id;
                          var r = await fetch('/api/escalation-rules', { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                          var d = await r.json();
                          if (!r.ok) { setEscError(d.error || 'Save failed'); setEscSaving(null); return; }
                          setEscModal(null);
                          setEscError(null);
                          loadEscalationRules();
                        } catch (e) { setEscError(e.message); }
                        setEscSaving(null);
                      }} disabled={escSaving === 'modal'} style={Object.assign({}, btnPrimary, { opacity: escSaving === 'modal' ? 0.6 : 1 })}>{escSaving === 'modal' ? 'Saving...' : escModal._isNew ? 'Create Rule' : 'Save Changes'}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ANALYTICS TAB */}
          {activeTab === "analytics" && (
            <div>
              <h2 style={{ color: "#fff", fontSize: 18, margin: "0 0 20px" }}>Bot Performance Analytics</h2>
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
              <div style={{ ...card, marginBottom: 20 }}>
                <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Daily Conversation Volume</h3>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, padding: "0 10px" }}>
                  {BOT_ANALYTICS.dailyVolume.map((d, i) => {
                    const maxVal = Math.max(...BOT_ANALYTICS.dailyVolume.map(x => x.count));
                    const h = (d.count / maxVal) * 120;
                    return (
                      <div key={i} style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ color: "#fff", fontSize: 10, fontWeight: 700, marginBottom: 4 }}>{d.count.toLocaleString()}</div>
                        <div style={{ height: h, background: `linear-gradient(180deg, ${C.primary}, ${C.primary}44)`, borderRadius: "6px 6px 0 0" }} />
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 6 }}>{d.day}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ADVANCED TAB */}
          {activeTab === "advanced" && (
            <div>
              <h2 style={{ color: "#fff", fontSize: 18, margin: "0 0 20px" }}>Advanced Configuration</h2>
              <div style={{ display: "grid", gap: 16 }}>
                <div style={card}>
                  <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Model Settings</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <label style={label}>AI Model</label>
                      <select style={inputStyle}>
                        <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (Recommended)</option>
                        <option value="claude-haiku-4-5">Claude Haiku 4.5 (Fast)</option>
                        <option value="claude-opus-4-7">Claude Opus 4.7 (Most Capable)</option>
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
                      </select>
                    </div>
                    <div>
                      <label style={label}>Confidence Threshold</label>
                      <input type="number" min="0" max="1" step="0.05" defaultValue="0.7" style={inputStyle} />
                    </div>
                  </div>
                </div>
                <div style={card}>
                  <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Safety & Limits</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                    <div><label style={label}>Max Messages/Conversation</label><input type="number" defaultValue="50" style={inputStyle} /></div>
                    <div><label style={label}>Session Timeout (min)</label><input type="number" defaultValue="30" style={inputStyle} /></div>
                    <div><label style={label}>Rate Limit (msg/min)</label><input type="number" defaultValue="10" style={inputStyle} /></div>
                  </div>
                  <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
                    {["PII Detection", "Profanity Filter", "Content Moderation", "Audit Logging"].map(s => (
                      <div key={s} style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "10px", textAlign: "center" }}>
                        <div style={{ color: "#00E676", fontSize: 12, fontWeight: 600 }}>{s}</div>
                        <div style={{ color: "#00E676", fontSize: 10, marginTop: 2 }}>● Enabled</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Live Preview Simulator */}
      <div style={{ width: 380, borderLeft: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.15)", flexShrink: 0 }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ color: "#fff", margin: 0, fontSize: 15 }}>💬 Live Preview</h3>
            <button onClick={() => { setPreviewMessages([]); setSelectedDemo(null); }} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 10px", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>Clear</button>
          </div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginBottom: 10 }}>Test your bot configuration in real-time</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {DEMO_CONVERSATIONS.map((demo, i) => (
              <button key={i} onClick={() => loadDemoConversation(demo)} style={{ background: selectedDemo === demo ? `${C.primary}22` : "rgba(255,255,255,0.04)", border: `1px solid ${selectedDemo === demo ? C.primary + "44" : "rgba(255,255,255,0.06)"}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", color: selectedDemo === demo ? C.primary : "rgba(255,255,255,0.35)", fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>{demo.persona.split(" ").slice(0, 2).join(" ")}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {previewMessages.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 16px" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: `linear-gradient(135deg, ${C.primary}33, ${C.accent || C.primary}33)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 14px" }}>🤖</div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{botName}</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginBottom: 16 }}>{personality?.name} mode · {temperature} temp</div>
              <div style={{ background: `${C.primary}15`, border: `1px solid ${C.primary}33`, borderRadius: "14px 14px 14px 4px", padding: "12px 16px", color: "rgba(255,255,255,0.7)", fontSize: 13, textAlign: "left", maxWidth: 280, margin: "0 auto" }}>{greeting}</div>
              <div style={{ color: "rgba(255,255,255,0.15)", fontSize: 10, marginTop: 12 }}>Type a message or try a demo scenario</div>
            </div>
          )}

          {previewMessages.map((msg, i) => (
            <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 10, gap: 8, alignItems: "flex-end" }}>
              {msg.role !== "user" && <div style={{ width: 26, height: 26, borderRadius: "50%", background: `${C.primary}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>🤖</div>}
              <div style={{ maxWidth: "80%", background: msg.role === "user" ? "rgba(255,255,255,0.08)" : `${C.primary}15`, border: `1px solid ${msg.role === "user" ? "rgba(255,255,255,0.1)" : C.primary + "33"}`, borderRadius: msg.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px", padding: "10px 14px", color: "rgba(255,255,255,0.8)", fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {msg.role !== "user" && <div style={{ color: C.primary, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>🤖 {botName}</div>}
                {msg.text}
              </div>
            </div>
          ))}

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

        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={previewInput} onChange={e => setPreviewInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handlePreviewSend(); }} placeholder="Type a test message..." style={{ ...inputStyle, flex: 1, borderRadius: 10, padding: "10px 14px" }} />
            <button onClick={handlePreviewSend} disabled={!previewInput.trim()} style={{ background: previewInput.trim() ? `linear-gradient(135deg, ${C.primary}, ${C.accent || C.primary})` : "rgba(255,255,255,0.06)", border: "none", borderRadius: 10, padding: "0 16px", color: previewInput.trim() ? "#000" : "rgba(255,255,255,0.2)", fontWeight: 700, cursor: previewInput.trim() ? "pointer" : "not-allowed", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>Send</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "center" }}>
            <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>Model: Claude Sonnet</span>
            <span style={{ color: "rgba(255,255,255,0.08)" }}>·</span>
            <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>Temp: {temperature}</span>
            <span style={{ color: "rgba(255,255,255,0.08)" }}>·</span>
            <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>KB: Agent Settings</span>
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
