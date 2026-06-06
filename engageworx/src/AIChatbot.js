import { useState, useEffect, useRef } from "react";
import { useTranslation } from 'react-i18next';
import { ChatThread, ChatInput } from "./components/chat";
import { Toggle, Card } from './components/ui';
import EscalationRulesSettings from './admin/EscalationRulesSettings';
import EscalationRulesConfig from './EscalationRulesConfig';
import KBArticleEditor from "./admin/KBArticleEditor";
var CD = require('./lib/candidacyDefaults');
var { ROUTABLE_INBOUND_SURFACES } = require('./lib/routableSurfaces');

var LANGUAGE_OPTIONS = [
  { id: 'en_auto', name: 'English (auto-detect non-English)' },
  { id: 'en', name: 'English (always)' },
  { id: 'es', name: 'Spanish' },
  { id: 'pt', name: 'Portuguese' },
  { id: 'fr', name: 'French' },
  { id: 'multi', name: 'Multilingual (match user)' },
];

// Personality presets — shared with backend (api/_lib/personalities.js)
// Frontend copy kept in sync via same structure. Backend is the source of truth for prompt composition.
var PERSONALITIES = [
  { id: 'professional', name: 'Professional', icon: '👔', desc: 'Formal, business-appropriate tone', temp: 0.3 },
  { id: 'friendly', name: 'Friendly', icon: '😊', desc: 'Warm, conversational, approachable', temp: 0.6 },
  { id: 'concise', name: 'Concise', icon: '⚡', desc: 'Brief, direct, efficient responses', temp: 0.2 },
  { id: 'empathetic', name: 'Empathetic', icon: '💙', desc: 'Understanding, supportive, patient', temp: 0.5 },
  { id: 'sales', name: 'Sales-Driven', icon: '🎯', desc: 'Persuasive, benefit-focused, conversion-oriented', temp: 0.7 },
  { id: 'technical', name: 'Technical', icon: '🔧', desc: 'Detailed, precise, documentation-style', temp: 0.2 },
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
    { role: "user", content: "How much does the Growth plan cost?" },
    { role: "assistant", content: "The Growth plan is $249/month and includes up to 5,000 SMS messages, 3 phone numbers, AI bot included, and advanced analytics.\n\nWould you like me to compare it with our other plans, or help you get started with a free trial?" },
    { role: "user", content: "What about the Enterprise plan?" },
    { role: "assistant", content: "Our Enterprise plan offers custom pricing based on your needs. It includes unlimited messages, all channels, white-label branding, custom integrations, and a dedicated account manager.\n\nI can connect you with our sales team for a personalized quote. Would you like that?" },
  ]},
  { persona: "Technical support inquiry", messages: [
    { role: "user", content: "My API calls are returning 429 errors" },
    { role: "assistant", content: "A 429 error means you've hit our rate limit. Here's how to resolve it:\n\n1. Check your current limits in Settings → API\n2. Implement exponential backoff — Wait 1s, then 2s, then 4s between retries\n3. Use batch endpoints to send multiple messages per call\n\nWould you like me to show you a code example?" },
  ]},
  { persona: "Angry customer complaint", messages: [
    { role: "user", content: "I've been waiting 3 days for a response! This is unacceptable." },
    { role: "assistant", content: "I completely understand your frustration, and I sincerely apologize for the delay. A 3-day wait is not the level of service we aim to provide.\n\nLet me escalate this immediately. Could you share your ticket number?" },
  ]},
  { persona: "Product recommendation", messages: [
    { role: "user", content: "We send about 100K SMS messages a month. Which plan?" },
    { role: "assistant", content: "For 100K SMS messages monthly, I'd recommend our Pro plan at $499/month. It includes 20,000 SMS (with overage at $0.025/SMS), all channels, API access, and white-label branding.\n\nWant me to set up a free trial?" },
  ]},
];

// BOT_ANALYTICS removed — was hardcoded mock data (audit May 2026).
// Real analytics will query conversations + messages tables scoped by tenant_id.

export default function AIChatbot({ C, tenants, viewLevel = "tenant", currentTenantId, demoMode = false, onNavigate }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("configure");
  const [selectedPersonality, setSelectedPersonality] = useState("friendly");
  const [selectedLanguage, setSelectedLanguage] = useState("en_auto");
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
  const [escWizardOpen, setEscWizardOpen] = useState(false);
  const [escWizardEditRule, setEscWizardEditRule] = useState(null);


  // Email signatures (per-surface, stored on chatbot_configs)
  var SIG_SURFACES = [
    { id: 'wedding_concierge', label: 'Concierge' },
    { id: 'wedding_enquiry', label: 'Enquiry' },
    { id: 'wedding_supplier', label: 'Supplier' },
  ];
  const [sigSurface, setSigSurface] = useState('wedding_concierge');
  const [sigFromName, setSigFromName] = useState('');
  const [sigFirst, setSigFirst] = useState('');
  const [sigReply, setSigReply] = useState('');
  const [teamSigFromName, setTeamSigFromName] = useState('');
  const [teamSigFirst, setTeamSigFirst] = useState('');
  const [teamSigReply, setTeamSigReply] = useState('');
  const [sigSaving, setSigSaving] = useState(false);
  const [sigSaved, setSigSaved] = useState(false);

  // AI Reply Mode (per-surface, stored on chatbot_configs.ai_reply_mode)
  const [aiReplyMode, setAiReplyMode] = useState('auto_send');
  const [surfaceConfigId, setSurfaceConfigId] = useState(null); // PK of the active surface's chatbot_configs row
  const [tenantSurfaces, setTenantSurfaces] = useState([]); // [{id, surface, label}] loaded from chatbot_configs

  // Candidacy Messages state
  const [candidacyEnabled, setCandidacyEnabled] = useState(false);
  const [candidacyAck, setCandidacyAck] = useState('');
  const [candidacyApprove, setCandidacyApprove] = useState('');
  const [candidacyReject, setCandidacyReject] = useState('');
  const [candidacyNameAsk, setCandidacyNameAsk] = useState('');
  const [candidacyComplete, setCandidacyComplete] = useState('');

  // Load signature fields for the selected surface
  useEffect(() => {
    if (!currentTenantId || demoMode) return;
    (async () => {
      try {
        const { supabase } = await import('./supabaseClient');
        var { data } = await supabase.from('chatbot_configs').select('id, email_from_name, email_signature_first, email_signature_reply, email_team_from_name, email_team_signature_first, email_team_signature_reply, ai_reply_mode').eq('tenant_id', currentTenantId).eq('surface', sigSurface).maybeSingle();
        if (!data) { var fallback = await supabase.from('chatbot_configs').select('id, email_from_name, email_signature_first, email_signature_reply, email_team_from_name, email_team_signature_first, email_team_signature_reply, ai_reply_mode').eq('tenant_id', currentTenantId).limit(1).maybeSingle(); data = fallback.data; }
        setSurfaceConfigId((data && data.id) || null);
        setSigFromName((data && data.email_from_name) || '');
        setSigFirst((data && data.email_signature_first) || '');
        setSigReply((data && data.email_signature_reply) || '');
        setTeamSigFromName((data && data.email_team_from_name) || '');
        setTeamSigFirst((data && data.email_team_signature_first) || '');
        setTeamSigReply((data && data.email_team_signature_reply) || '');
        setAiReplyMode((data && data.ai_reply_mode) || 'auto_send');
      } catch (e) {}
    })();
  }, [currentTenantId, demoMode, sigSurface]);

  // Load tenant's chatbot_configs surfaces for Reply Mode tabs
  useEffect(() => {
    if (!currentTenantId || demoMode) return;
    (async () => {
      try {
        const { supabase } = await import('./supabaseClient');
        var { data } = await supabase.from('chatbot_configs').select('id, surface').eq('tenant_id', currentTenantId);
        if (data && data.length > 0) {
          var SURFACE_LABELS = { wedding_concierge: 'Concierge', wedding_enquiry: 'Enquiry', wedding_supplier: 'Supplier', helpdesk: 'Helpdesk' };
          var surfaces = data.map(function(row) {
            return { id: row.id, surface: row.surface, label: SURFACE_LABELS[row.surface] || row.surface };
          });
          setTenantSurfaces(surfaces);
          // Default sigSurface to first routable surface if current isn't in list
          var surfaceIds = surfaces.map(function(s) { return s.surface; });
          if (surfaceIds.indexOf(sigSurface) === -1 && surfaces.length > 0) {
            var firstRoutable = surfaces.find(function(s) { return ROUTABLE_INBOUND_SURFACES.indexOf(s.surface) !== -1; });
            setSigSurface(firstRoutable ? firstRoutable.surface : surfaces[0].surface);
          }
        }
      } catch (e) {}
    })();
  }, [currentTenantId, demoMode]);

  // loadEscalationRules removed — managed via Settings → Escalation Rules tab

  useEffect(() => {
    if (!currentTenantId || demoMode) return;
    (async () => {
      setConfigLoading(true);
      try {
        const { supabase } = await import('./supabaseClient');
        // Load from chatbot_configs first (primary source for bot name/prompt/kb)
        var cbBotName = null;
        try {
          var cbR = await supabase.from('chatbot_configs').select('bot_name, system_prompt, knowledge_base, personality_preset, temperature, language, candidacy_gate_enabled, candidacy_ack_template, candidacy_approve_template, candidacy_reject_template, candidacy_name_ask_template, candidacy_complete_template').eq('tenant_id', currentTenantId).maybeSingle();
          var cbKnowledgeBase = null;
          if (cbR.data) {
            if (cbR.data.bot_name) { cbBotName = cbR.data.bot_name; setBotName(cbR.data.bot_name); }
            if (cbR.data.system_prompt) setSystemPrompt(cbR.data.system_prompt);
            if (cbR.data.knowledge_base) cbKnowledgeBase = cbR.data.knowledge_base;
            if (cbR.data.personality_preset) setSelectedPersonality(cbR.data.personality_preset);
            if (cbR.data.temperature !== null && cbR.data.temperature !== undefined) setTemperature(cbR.data.temperature);
            if (cbR.data.language) setSelectedLanguage(cbR.data.language);
            // Candidacy fields
            if (cbR.data.candidacy_gate_enabled) setCandidacyEnabled(true);
            if (cbR.data.candidacy_ack_template) setCandidacyAck(cbR.data.candidacy_ack_template);
            if (cbR.data.candidacy_approve_template) setCandidacyApprove(cbR.data.candidacy_approve_template);
            if (cbR.data.candidacy_reject_template) setCandidacyReject(cbR.data.candidacy_reject_template);
            if (cbR.data.candidacy_name_ask_template) setCandidacyNameAsk(cbR.data.candidacy_name_ask_template);
            if (cbR.data.candidacy_complete_template) setCandidacyComplete(cbR.data.candidacy_complete_template);
          }
        } catch (e) {}
        // Load channel configs for per-channel settings
        const { data, error } = await supabase.from('channel_configs').select('channel, config_encrypted, enabled').eq('tenant_id', currentTenantId);
        if (!error && data && data.length > 0) {
          var merged = { agentName: cbBotName || "Aria", businessInfo: cbKnowledgeBase || "", kbSources: [], aiEnabled: true, channels: { sms: false, whatsapp: false, email: false, voice: false } };
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
      var presetObj = PERSONALITIES.find(function(p) { return p.id === selectedPersonality; });
      var cbPayload = {
        tenant_id: currentTenantId,
        bot_name: aiConfig.agentName,
        system_prompt: systemPrompt,
        knowledge_base: aiConfig.businessInfo,
        channels_active: Object.keys(aiConfig.channels).filter(k => aiConfig.channels[k]),
        personality_preset: selectedPersonality,
        temperature: presetObj ? presetObj.temp : temperature,
        language: selectedLanguage,
        // Candidacy fields — empty string saves as NULL (code falls back to shared defaults)
        candidacy_gate_enabled: candidacyEnabled,
        candidacy_ack_template: candidacyAck.trim() || null,
        candidacy_approve_template: candidacyApprove.trim() || null,
        candidacy_reject_template: candidacyReject.trim() || null,
        candidacy_name_ask_template: candidacyNameAsk.trim() || null,
        candidacy_complete_template: candidacyComplete.trim() || null,
      };
      // TODO: migrate the whole chatbot_configs save to a SECURITY DEFINER RPC
      // scoped to auth.uid(). Currently safe via RLS (WITH CHECK defaults to USING),
      // but a raw client upsert with tenant_id in the payload is not ideal long-term.
      console.log('[AIChatbot] saving chatbot_configs:', JSON.stringify(cbPayload));
      await supabase.from('chatbot_configs').upsert(cbPayload, { onConflict: 'tenant_id' });
      // Also persist signatures for the selected surface
      var sigUpdate = {
        email_from_name: sigFromName || null,
        email_signature_first: sigFirst || null,
        email_signature_reply: sigReply || null,
        email_team_from_name: teamSigFromName || null,
        email_team_signature_first: teamSigFirst || null,
        email_team_signature_reply: teamSigReply || null,
        ai_reply_mode: aiReplyMode,
      };
      if (surfaceConfigId) {
        await supabase.from('chatbot_configs').update(sigUpdate).eq('id', surfaceConfigId);
      } else {
        await supabase.from('chatbot_configs').update(sigUpdate).eq('tenant_id', currentTenantId).eq('surface', sigSurface).limit(1);
      }
      setBotName(aiConfig.agentName);
      setConfigSaved(true);
      setSigSaved(true);
      setKbUploadState("idle");
      setTimeout(function() { setConfigSaved(false); setSigSaved(false); }, 3000);
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
  const inputStyle = { width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: C.text, fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" };
  const btnPrimary = { background: `linear-gradient(135deg, ${C.primary}, ${C.accent || C.primary})`, border: "none", borderRadius: 10, padding: "10px 20px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  const btnSecondary = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 20px", color: C.text, fontWeight: 600, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  const card = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 22 };
  const badge = (color) => ({ display: "inline-block", background: color + "18", color, border: `1px solid ${color}44`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 });
  const label = { color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, display: "block", fontWeight: 700 };

  const handleSelectPersonality = (p) => { setSelectedPersonality(p.id); setGreeting(p.greeting); setTemperature(p.temp); };

  const handlePreviewSend = () => {
    if (!previewInput.trim()) return;
    setPreviewMessages(prev => [...prev, { role: "user", content: previewInput }]);
    setPreviewInput("");
    setIsTyping(true);
    setTimeout(() => {
      const responses = [
        `Great question! Based on our knowledge base, I can help with that. ${enableEmoji ? "😊" : ""}\n\nLet me pull up the relevant information for you...`,
        `I'd be happy to assist! Our platform supports SMS, Email, WhatsApp, RCS, MMS, and Voice channels. Each can be configured independently.\n\nWould you like more details on any specific channel?`,
        `Thanks for reaching out! ${enableEmoji ? "👋" : ""} You can manage this through Settings → Channels → Configuration. The changes take effect immediately.\n\nAnything else I can help with?`,
      ];
      setPreviewMessages(prev => [...prev, { role: "assistant", content: responses[Math.floor(Math.random() * responses.length)] }]);
      setIsTyping(false);
    }, responseDelay * 1000);
  };

  const loadDemoConversation = (demo) => {
    setSelectedDemo(demo);
    setPreviewMessages([]);
    let delay = 0;
    demo.messages.forEach((msg, i) => {
      delay += i === 0 ? 300 : msg.role === "assistant" ? responseDelay * 1000 : 800;
      setTimeout(() => {
        if (msg.role === "assistant") setIsTyping(false);
        setPreviewMessages(prev => [...prev, msg]);
        if (i < demo.messages.length - 1 && demo.messages[i + 1].role === "assistant") setIsTyping(true);
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
              <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: 0 }}>🤖 AI Chatbot</h1>
              <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>Configure personality, knowledge, and escalation rules</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={badge("#00E676")}>● Bot Active</span>
            </div>
          </div>

          {/* KPI Row — will be populated from real queries when analytics are wired */}

          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, marginBottom: 24 }}>
            {[
              { id: "configure", label: "Agent Settings", icon: "⚙️" },
              { id: "personality", label: "Personality", icon: "🎭" },
              { id: "candidacy", label: "Candidacy", icon: "📋" },
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
                    <h3 style={{ color: C.text, margin: "0 0 16px", fontSize: 16 }}>Agent Name & Status</h3>
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
                    <h3 style={{ color: C.text, margin: "0 0 6px", fontSize: 16 }}>Active Channels</h3>
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
                    <h3 style={{ color: C.text, margin: "0 0 6px", fontSize: 16 }}>Business Knowledge</h3>
                    <div style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>Provide information your AI agent needs to answer customer questions accurately. Include products/services, pricing, hours, policies, FAQ — anything a customer might ask.</div>
                    <textarea value={aiConfig.businessInfo} onChange={function(e) { setAiConfig(Object.assign({}, aiConfig, { businessInfo: e.target.value })); }} placeholder={"Example:\nWe are ABC Dental, a family dentistry practice.\nHours: Mon-Fri 8am-5pm, Sat 9am-1pm\nServices: cleanings, fillings, crowns, whitening, implants\nNew patient appointments: call or book online at abcdental.com"} rows={12} style={Object.assign({}, inputStyle, { resize: "vertical", lineHeight: 1.6 })} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                      <span style={{ color: C.muted, fontSize: 11 }}>{(aiConfig.businessInfo || "").length} characters</span>
                      <span style={{ color: C.muted, fontSize: 11 }}>Used across all channels — voice, WhatsApp, SMS, and email</span>
                    </div>
                  </div>

                  <Card style={{ borderColor: C.border, background: C.surface }}>
                    <h3 style={{ color: C.text, margin: "0 0 6px", fontSize: 16 }}>{t('aiChatbot.replyMode.title')}</h3>
                    <div style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>{t('aiChatbot.replyMode.description')}</div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 3 }}>
                      {tenantSurfaces.map(function(s) {
                        var isRoutable = ROUTABLE_INBOUND_SURFACES.indexOf(s.surface) !== -1;
                        var isActive = sigSurface === s.surface;
                        return <button key={s.surface} onClick={isRoutable ? function() { setSigSurface(s.surface); } : undefined} disabled={!isRoutable} title={!isRoutable ? 'Not yet active — coming soon' : ''} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "none", cursor: isRoutable ? "pointer" : "default", fontSize: 12, fontWeight: 700, fontFamily: "inherit", opacity: isRoutable ? 1 : 0.4, background: isActive && isRoutable ? (C.primary + "22") : "transparent", color: isActive && isRoutable ? C.primary : "rgba(255,255,255,0.4)" }}>{s.label}{!isRoutable ? ' ·\u00A0soon' : ''}</button>;
                      })}
                    </div>
                    <div style={{ display: 'grid', gap: 12 }}>
                      <Toggle
                        checked={aiReplyMode !== 'off'}
                        onChange={function(on) { setAiReplyMode(on ? 'draft_review' : 'off'); }}
                        label={t('aiChatbot.replyMode.masterLabel')}
                        description={t('aiChatbot.replyMode.masterDescription')}
                      />
                      {aiReplyMode !== 'off' && (
                        <Toggle
                          checked={aiReplyMode === 'draft_review'}
                          onChange={function(on) { setAiReplyMode(on ? 'draft_review' : 'auto_send'); }}
                          label={t('aiChatbot.replyMode.reviewLabel')}
                          description={t('aiChatbot.replyMode.reviewDescription')}
                        />
                      )}
                    </div>
                    <div style={{ color: C.muted, fontSize: 12, marginTop: 12, fontStyle: 'italic' }}>
                      {aiReplyMode === 'off' && t('aiChatbot.replyMode.summaryOff')}
                      {aiReplyMode === 'auto_send' && t('aiChatbot.replyMode.summaryAutoSend')}
                      {aiReplyMode === 'draft_review' && t('aiChatbot.replyMode.summaryDraftReview')}
                    </div>
                  </Card>

                  <div style={card}>
                    <h3 style={{ color: C.text, margin: "0 0 6px", fontSize: 16 }}>✉️ Email Signatures</h3>
                    <div style={{ color: C.muted, fontSize: 12, marginBottom: 12 }}>Per-surface signatures. Select a surface below to edit its signature independently.</div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 3 }}>
                      {SIG_SURFACES.map(function(s) {
                        return <button key={s.id} onClick={function() { setSigSurface(s.id); }} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", background: sigSurface === s.id ? (C.primary + "22") : "transparent", color: sigSurface === s.id ? C.primary : "rgba(255,255,255,0.4)" }}>{s.label}</button>;
                      })}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      {/* Personal */}
                      <div style={{ background: "rgba(0,201,255,0.04)", border: "1px solid rgba(0,201,255,0.2)", borderRadius: 10, padding: 14 }}>
                        <div style={{ color: "#00C9FF", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>🧑 Personal</div>
                        <label style={label}>From name</label>
                        <input value={sigFromName} onChange={e => setSigFromName(e.target.value)} placeholder="Your name" style={inputStyle} />
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
                        <input value={teamSigFromName} onChange={e => setTeamSigFromName(e.target.value)} placeholder="Your team name" style={inputStyle} />
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

                    {sigSaved && <div style={{ color: "#00E676", fontSize: 12, fontWeight: 600, marginTop: 8 }}>✓ Signatures saved for {SIG_SURFACES.find(function(s) { return s.id === sigSurface; })?.label || sigSurface}</div>}
                  </div>

                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <button onClick={function() { if (!currentTenantId) { alert("Please log in to save your configuration."); return; } saveAIConfig(); }} style={btnPrimary}>Save changes</button>
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
                <h3 style={{ color: C.text, margin: "0 0 16px", fontSize: 16 }}>Personality Preset</h3>
                <p style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>Choose how your AI agent communicates. This affects tone, temperature, and response style across all channels.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {PERSONALITIES.map(p => (
                    <button key={p.id} onClick={() => { setSelectedPersonality(p.id); setTemperature(p.temp); }} style={{ background: selectedPersonality === p.id ? `${C.primary}15` : "rgba(255,255,255,0.03)", border: `2px solid ${selectedPersonality === p.id ? C.primary : "rgba(255,255,255,0.06)"}`, borderRadius: 12, padding: "16px", cursor: "pointer", textAlign: "left", transition: "all 0.2s", fontFamily: "'DM Sans', sans-serif" }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>{p.icon}</div>
                      <div style={{ color: selectedPersonality === p.id ? C.primary : "#fff", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{p.name}</div>
                      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, lineHeight: 1.3 }}>{p.desc}</div>
                      <div style={{ color: selectedPersonality === p.id ? C.primary : "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 6 }}>Temperature: {p.temp}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ ...card, marginBottom: 20 }}>
                <h3 style={{ color: C.text, margin: "0 0 12px", fontSize: 16 }}>Response Language</h3>
                <p style={{ color: C.muted, fontSize: 13, marginBottom: 14 }}>Choose which language your AI agent responds in across all channels.</p>
                <select value={selectedLanguage} onChange={function(e) { setSelectedLanguage(e.target.value); }} style={{ ...inputStyle, maxWidth: 360 }}>
                  {LANGUAGE_OPTIONS.map(function(l) { return <option key={l.id} value={l.id}>{l.name}</option>; })}
                </select>
              </div>

              {/* TODO: hidden until tone/temperature/length/toggles are read by build-system-prompt.js
                  See AI Chatbot audit (May 2026). Re-enable after config table consolidation. */}
              {false && (
              <div style={{ ...card, marginBottom: 20 }}>
                <h3 style={{ color: C.text, margin: "0 0 16px", fontSize: 16 }}>Fine-Tuning</h3>
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
              )}

              <div style={card}>
                <h3 style={{ color: C.text, margin: "0 0 16px", fontSize: 16 }}>Bot Identity & Instructions</h3>
                {/* TODO: hidden until fallback message is read by build-system-prompt.js
                    See AI Chatbot audit (May 2026). Re-enable after config table consolidation. */}
                {false && (
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Fallback Message</label>
                  <textarea value={fallbackMsg} onChange={e => setFallbackMsg(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
                </div>
                )}
                <div>
                  <label style={label}>System Prompt</label>
                  <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={18} style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} />
                </div>
              </div>
            </div>
          )}

          {/* CANDIDACY TAB */}
          {activeTab === "candidacy" && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ color: C.text, fontSize: 18, margin: 0 }}>Candidacy Messages</h2>
                <p style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Configure the photo screening flow and templated messages sent during candidacy evaluation</p>
              </div>

              <div style={card}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: candidacyEnabled ? 24 : 0 }}>
                  <div>
                    <h3 style={{ color: C.text, margin: 0, fontSize: 16 }}>Enable Candidacy Gate</h3>
                    <p style={{ color: C.muted, fontSize: 12, margin: "4px 0 0" }}>When enabled, inbound photos trigger a review flow before the AI responds</p>
                  </div>
                  <div onClick={function() { setCandidacyEnabled(!candidacyEnabled); }} style={{ width: 44, height: 24, borderRadius: 12, background: candidacyEnabled ? C.primary : "rgba(255,255,255,0.15)", position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 10, background: "#fff", position: "absolute", top: 2, left: candidacyEnabled ? 22 : 2, transition: "left 0.2s" }} />
                  </div>
                </div>

                {candidacyEnabled && (
                <div style={{ display: "grid", gap: 20 }}>
                  <div>
                    <h4 style={{ color: C.text, margin: "0 0 12px", fontSize: 14, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 8 }}>Photo & Verdict</h4>
                    <div style={{ display: "grid", gap: 16 }}>
                      {[
                        { label: 'Photo Acknowledgment', value: candidacyAck, setter: setCandidacyAck, placeholder: CD.CANDIDACY_ACK, desc: 'Sent when a photo is received, before human review' },
                        { label: 'Approval + Name Ask', value: candidacyApprove, setter: setCandidacyApprove, placeholder: CD.CANDIDACY_APPROVE, desc: 'Sent when the candidate is approved — include a name request' },
                        { label: 'Rejection', value: candidacyReject, setter: setCandidacyReject, placeholder: CD.CANDIDACY_REJECT, desc: 'Sent when the candidate is not a fit' },
                      ].map(function(field) {
                        var len = (field.value || '').length;
                        var segs = len > 0 ? Math.ceil(len / 160) : 0;
                        return (
                          <div key={field.label}>
                            <label style={label}>{field.label}</label>
                            <textarea value={field.value} onChange={function(e) { field.setter(e.target.value); }} placeholder={field.placeholder} rows={3} style={Object.assign({}, inputStyle, { resize: "vertical", lineHeight: 1.6, opacity: candidacyEnabled ? 1 : 0.4 })} />
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                              <span style={{ color: C.muted, fontSize: 11 }}>{field.desc}</span>
                              <span style={{ color: C.muted, fontSize: 11, flexShrink: 0 }}>{len > 0 ? len + ' chars \u00B7 ~' + segs + ' SMS' : 'Using default'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h4 style={{ color: C.text, margin: "0 0 12px", fontSize: 14, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 8 }}>Name Capture</h4>
                    <div style={{ display: "grid", gap: 16 }}>
                      {[
                        { label: 'Name Re-ask', value: candidacyNameAsk, setter: setCandidacyNameAsk, placeholder: CD.CANDIDACY_NAME_ASK, desc: 'AI uses this as a guide when the candidate\u2019s reply didn\u2019t include a name' },
                        { label: 'Completion', value: candidacyComplete, setter: setCandidacyComplete, placeholder: CD.CANDIDACY_COMPLETE, desc: 'Sent verbatim after the candidate\u2019s name is captured' },
                      ].map(function(field) {
                        var len = (field.value || '').length;
                        var segs = len > 0 ? Math.ceil(len / 160) : 0;
                        return (
                          <div key={field.label}>
                            <label style={label}>{field.label}</label>
                            <textarea value={field.value} onChange={function(e) { field.setter(e.target.value); }} placeholder={field.placeholder} rows={3} style={Object.assign({}, inputStyle, { resize: "vertical", lineHeight: 1.6, opacity: candidacyEnabled ? 1 : 0.4 })} />
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                              <span style={{ color: C.muted, fontSize: 11 }}>{field.desc}</span>
                              <span style={{ color: C.muted, fontSize: 11, flexShrink: 0 }}>{len > 0 ? len + ' chars \u00B7 ~' + segs + ' SMS' : 'Using default'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                )}
              </div>
            </div>
          )}

          {/* KNOWLEDGE BASE TAB */}
          {activeTab === "knowledge" && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ color: C.text, fontSize: 18, margin: 0 }}>Knowledge Base</h2>
                <p style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Manage the documents and articles your AI concierge uses to answer questions</p>
              </div>

              <div style={{ ...card, marginBottom: 20, border: "1px solid rgba(0,201,255,0.2)", background: "rgba(0,201,255,0.04)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>ℹ️</span>
                  <div>
                    <div style={{ color: C.text, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Knowledge Documents</div>
                    <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.6 }}>
                      Upload documents below to build your AI concierge's knowledge base. Uploaded files are processed by AI into structured articles that your concierge uses to answer questions accurately.
                    </div>
                    <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, marginTop: 6 }}>
                      Supported formats: PDF, Word (.docx), plain text, Markdown, HTML, and email (.eml) files.
                    </div>
                  </div>
                </div>
              </div>

              <KBArticleEditor tenantId={currentTenantId} C={C} />
            </div>
          )}

          {/* ESCALATION RULES TAB */}
          {activeTab === "escalation" && (
            <div>
              {escWizardOpen ? (
                <div>
                  <button onClick={function() { setEscWizardOpen(false); setEscWizardEditRule(null); }} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", marginBottom: 12, padding: 0 }}>← Back to rules list</button>
                  <EscalationRulesConfig
                    tenantId={currentTenantId}
                    colors={C}
                    initialConfig={escWizardEditRule || null}
                    initialNLDescription={escWizardEditRule ? escWizardEditRule.description : null}
                    onSave={async function(nlSummary, structuredConfig) {
                      try {
                        var { supabase } = await import('./supabaseClient');
                        var session = await supabase.auth.getSession();
                        var token = session.data?.session?.access_token || '';
                        var rulePayload = Object.assign({}, structuredConfig, { tenant_id: currentTenantId, description: nlSummary });
                        var method = escWizardEditRule && escWizardEditRule.id ? 'PUT' : 'POST';
                        if (escWizardEditRule && escWizardEditRule.id) rulePayload.id = escWizardEditRule.id;
                        await fetch('/api/escalation-rules', {
                          method: method,
                          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                          body: JSON.stringify(rulePayload),
                        });
                      } catch (e) { console.error('[EscalationWizard] save error:', e.message); }
                      setEscWizardOpen(false);
                      setEscWizardEditRule(null);
                    }}
                    onCancel={function() { setEscWizardOpen(false); setEscWizardEditRule(null); }}
                  />
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div>
                      <h2 style={{ color: C.text, fontSize: 18, margin: 0 }}>Escalation Rules</h2>
                      <p style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Define when the AI should hand off to a human, notify your team, or pause the conversation</p>
                    </div>
                    <button onClick={function() { setEscWizardOpen(true); setEscWizardEditRule(null); }} style={{ background: "linear-gradient(135deg, " + C.primary + ", " + (C.accent || C.primary) + ")", border: "none", borderRadius: 10, padding: "10px 20px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>+ AI Wizard</button>
                  </div>
                  <EscalationRulesSettings tenantId={currentTenantId} C={C} />
                </div>
              )}
            </div>
          )}

          {/* ANALYTICS TAB */}
          {activeTab === "analytics" && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', minHeight: '420px' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'linear-gradient(135deg, rgba(0,191,255,0.07), rgba(168,85,247,0.07))', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              </div>
              <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '18px', fontWeight: 600, color: C.text, margin: '0 0 8px' }}>Analytics will appear here soon</h3>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '14px', lineHeight: 1.6, color: 'rgba(255,255,255,0.4)', maxWidth: '420px', margin: '0 0 1.5rem' }}>Once your bot starts handling conversations across SMS, WhatsApp, and email, you'll see volume, resolution time, satisfaction, and escalation metrics here.</p>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', fontWeight: 500, color: C.primary, cursor: 'pointer' }} onClick={function() { window.location.hash = ''; }}>View live inbox →</span>
            </div>
          )}

          {/* ADVANCED TAB */}
          {activeTab === "advanced" && (
            <div>
              <h2 style={{ color: C.text, fontSize: 18, margin: "0 0 20px" }}>Advanced Configuration</h2>
              <div style={{ display: "grid", gap: 16 }}>
                <div style={card}>
                  <h3 style={{ color: C.text, margin: "0 0 16px", fontSize: 15 }}>Model Settings</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <label style={label}>AI Model</label>
                      <select style={inputStyle}>
                        <option value="claude-sonnet-4-6">AI Standard (Recommended)</option>
                        <option value="claude-haiku-4-5">AI Fast</option>
                        <option value="claude-opus-4-7">AI Advanced (Most Capable)</option>
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
                  <h3 style={{ color: C.text, margin: "0 0 16px", fontSize: 15 }}>Safety & Limits</h3>
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
            <h3 style={{ color: C.text, margin: 0, fontSize: 15 }}>💬 Live Preview</h3>
            <button onClick={() => { setPreviewMessages([]); setSelectedDemo(null); }} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 10px", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>Clear</button>
          </div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginBottom: 10 }}>Test your bot configuration in real-time</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {DEMO_CONVERSATIONS.map((demo, i) => (
              <button key={i} onClick={() => loadDemoConversation(demo)} style={{ background: selectedDemo === demo ? `${C.primary}22` : "rgba(255,255,255,0.04)", border: `1px solid ${selectedDemo === demo ? C.primary + "44" : "rgba(255,255,255,0.06)"}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", color: selectedDemo === demo ? C.primary : "rgba(255,255,255,0.35)", fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>{demo.persona.split(" ").slice(0, 2).join(" ")}</button>
            ))}
          </div>
        </div>

        <ChatThread
          messages={previewMessages}
          isTyping={isTyping}
          typingAvatar="🤖"
          colors={C}
          botName={botName}
          showAvatars={true}
          maxWidth="80%"
          emptyState={
            <div style={{ textAlign: "center", padding: "40px 16px" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: `linear-gradient(135deg, ${C.primary}33, ${C.accent || C.primary}33)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 14px" }}>🤖</div>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{botName}</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginBottom: 16 }}>{personality?.name} mode · {temperature} temp</div>
              <div style={{ background: `${C.primary}15`, border: `1px solid ${C.primary}33`, borderRadius: "14px 14px 14px 4px", padding: "12px 16px", color: "rgba(255,255,255,0.7)", fontSize: 13, textAlign: "left", maxWidth: 280, margin: "0 auto" }}>{greeting}</div>
              <div style={{ color: "rgba(255,255,255,0.15)", fontSize: 10, marginTop: 12 }}>Type a message or try a demo scenario</div>
            </div>
          }
        />

        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <ChatInput
            value={previewInput}
            onChange={setPreviewInput}
            onSend={handlePreviewSend}
            placeholder="Type a test message..."
            submitMode="enter"
            rows={1}
            colors={C}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "center" }}>
            <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>Model: AI Standard</span>
            <span style={{ color: "rgba(255,255,255,0.08)" }}>·</span>
            <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>Temp: {temperature}</span>
            <span style={{ color: "rgba(255,255,255,0.08)" }}>·</span>
            <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>KB: Agent Settings</span>
          </div>
        </div>
      </div>
    </div>
  );
}
