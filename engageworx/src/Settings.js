import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

// ─── DEMO DATA ────────────────────────────────────────────────────────────────
// API keys loaded from Supabase — see liveApiKeys state

// Webhooks are loaded from Supabase — see liveWebhooks state

// Team members loaded from Supabase — see liveTeam state
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
export default function Settings({ C, tenants, viewLevel = "tenant", currentTenantId, demoMode = true }) {
  const [activeTab, setActiveTab] = useState("api");
  const [topupLoading, setTopupLoading] = useState(null);
  const [userEmail, setUserEmail] = useState("");
  const [stripePlan, setStripePlan] = useState(null);
  const [stripeStatus, setStripeStatus] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setUserEmail(data.user.email);
        // Fetch subscription status from Stripe
        fetch(`/api/billing?action=status&email=${encodeURIComponent(data.user.email)}`)
          .then(r => r.json())
          .then(status => {
            if (status.plan) setStripePlan(status.plan);
            if (status.status) setStripeStatus(status.status);
          })
          .catch(() => {});
      }
    });
  }, []);

  const SMS_TOPUPS = [
    { id: "topup_500", name: "500 SMS", credits: 500, price: "$15.00", priceId: "price_1T4OfbPEs1sluBAUCYOGvoDQ", perSms: "$0.03" },
    { id: "topup_2000", name: "2,000 SMS", credits: 2000, price: "$45.00", priceId: "price_1T6x6sPEs1sluBAUwaBzwHxA", perSms: "$0.0225", savings: "10% off" },
    { id: "topup_5000", name: "5,000 SMS", credits: 5000, price: "$100.00", priceId: "price_1T4OgUPEs1sluBAUZ24cjbfP", perSms: "$0.02", savings: "20% off" },
  ];

  const handleTopup = async (topup) => {
    setTopupLoading(topup.id);
    try {
      const response = await fetch("/api/billing?action=checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId: topup.priceId,
          email: userEmail,
          mode: "payment",
          successUrl: window.location.href + "?topup=success",
          cancelUrl: window.location.href,
        }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Error creating checkout session");
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setTopupLoading(null);
    }
  };
  const [upgradeLoading, setUpgradeLoading] = useState(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const PLANS = [
    { id: "starter", name: "Starter", price: "$99", priceId: "price_1T4OeIPEs1sluBAUuRIaD8Cq", features: ["1 phone number", "1,000 SMS/month", "AI bot included", "Overage: $0.025/SMS"] },
    { id: "growth", name: "Growth", price: "$249", priceId: "price_1T4OefPEs1sluBAUuZVAaBJ3", features: ["3 phone numbers", "5,000 SMS/month", "AI bot included", "Overage: $0.025/SMS"], popular: true },
    { id: "pro", name: "Pro", price: "$499", priceId: "price_1T4Of6PEs1sluBAURFjaViRv", features: ["10 phone numbers", "20,000 SMS/month", "AI bot included", "Overage: $0.025/SMS"] },
  ];

  // Determine current plan — prefer live Stripe data, fall back to tenant data
  const tenantsArray = Array.isArray(tenants) ? tenants : Object.values(tenants || {});
  const currentTenant = tenantsArray.find(t => t.id === currentTenantId) || tenantsArray[0];
  const currentPlanId = stripePlan || currentTenant?.plan || currentTenant?.billing_plan || "starter";
  const currentPlanInfo = PLANS.find(p => p.id === currentPlanId.toLowerCase()) || PLANS[0];
  const planStatus = stripeStatus === "trialing" ? "Trial" : stripeStatus === "active" ? "Active" : stripePlan ? "Active" : "Active";

  const handleUpgrade = async (plan) => {
    setUpgradeLoading(plan.id);
    try {
      const response = await fetch("/api/billing?action=checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: plan.id,
          email: userEmail,
          successUrl: window.location.href + "?upgrade=success",
          cancelUrl: window.location.href,
        }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Error: " + (data.error || "Could not create checkout session"));
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setUpgradeLoading(null);
    }
  };

  const handleManageBilling = async () => {
    try {
      const response = await fetch("/api/billing?action=portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Error: " + (data.error || "Could not open billing portal"));
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const [showNewKey, setShowNewKey] = useState(false);
  const [showNewWebhook, setShowNewWebhook] = useState(false);
  const [notifications, setNotifications] = useState(NOTIFICATION_PREFS);

  // ── API Keys: live Supabase data ──
  const [liveApiKeys, setLiveApiKeys] = useState([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(true);
  const [newKeyData, setNewKeyData] = useState({ name: "", environment: "production", permissions: ["messages"] });
  const [generatedKey, setGeneratedKey] = useState(null);

  const ALL_PERMISSIONS = ["messages", "contacts", "campaigns", "analytics", "webhooks", "flows", "settings"];

  const loadApiKeys = async () => {
    setApiKeysLoading(true);
    try {
      const { data, error } = await supabase.from("api_keys").select("*").order("created_at", { ascending: false });
      if (!error && data) setLiveApiKeys(data);
    } catch (err) { console.error("Failed to load API keys:", err); }
    setApiKeysLoading(false);
  };

  useEffect(() => { if (activeTab === "api") loadApiKeys(); }, [activeTab]);

  const generateApiKey = async () => {
    if (!newKeyData.name) return alert("Key name is required");
    const tenantRow = await supabase.from("tenants").select("id").limit(1);
    const tenantId = currentTenantId || tenantRow?.data?.[0]?.id;
    if (!tenantId) return alert("No tenant found");
    const envPrefix = newKeyData.environment === "production" ? "ewx_live_" : newKeyData.environment === "staging" ? "ewx_test_" : "ewx_dev_";
    const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(36)).join("").slice(0, 32);
    const fullKey = envPrefix + randomPart;
    const keyPrefix = fullKey.slice(0, 12);
    const { error } = await supabase.from("api_keys").insert({
      tenant_id: tenantId, name: newKeyData.name, key_prefix: keyPrefix,
      key_hash: fullKey, environment: newKeyData.environment, permissions: newKeyData.permissions,
    });
    if (error) return alert("Error creating key: " + error.message);
    setGeneratedKey(fullKey);
    setNewKeyData({ name: "", environment: "production", permissions: ["messages"] });
    setShowNewKey(false);
    loadApiKeys();
  };

  const revokeApiKey = async (id) => {
    if (!window.confirm("Revoke this API key? Any integrations using it will stop working.")) return;
    const { error } = await supabase.from("api_keys").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) return alert("Error revoking key: " + error.message);
    loadApiKeys();
  };

  const deleteApiKey = async (id) => {
    if (!window.confirm("Permanently delete this API key?")) return;
    const { error } = await supabase.from("api_keys").delete().eq("id", id);
    if (error) return alert("Error deleting: " + error.message);
    loadApiKeys();
  };

  // ── Team: live Supabase data ──
  const [liveTeam, setLiveTeam] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteData, setInviteData] = useState({ email: "", role: "member" });

  const ROLE_MAP = { admin: "Admin", campaign_manager: "Campaign Manager", analyst: "Analyst", support_agent: "Support Agent", member: "Member", read_only: "Read Only" };
  const ROLE_MAP_REV = Object.fromEntries(Object.entries(ROLE_MAP).map(([k, v]) => [v, k]));

  const loadTeam = async () => {
    setTeamLoading(true);
    try {
      const { data, error } = await supabase.from("tenant_members").select("*, user:user_id(email, raw_user_meta_data)").order("created_at", { ascending: true });
      if (!error && data) setLiveTeam(data);
    } catch (err) { console.error("Failed to load team:", err); }
    setTeamLoading(false);
  };

  useEffect(() => { if (activeTab === "team") loadTeam(); }, [activeTab]);

  const inviteMember = async () => {
    if (!inviteData.email) return alert("Email is required");
    const tenantRow = await supabase.from("tenants").select("id").limit(1);
    const tenantId = currentTenantId || tenantRow?.data?.[0]?.id;
    if (!tenantId) return alert("No tenant found");
    const { error } = await supabase.from("tenant_members").insert({
      tenant_id: tenantId, user_id: (await supabase.auth.getUser()).data.user.id,
      role: ROLE_MAP_REV[inviteData.role] || inviteData.role, status: "invited",
    });
    if (error) return alert("Error inviting: " + error.message);
    setShowInvite(false);
    setInviteData({ email: "", role: "member" });
    loadTeam();
  };

  const updateMemberRole = async (memberId, newRole) => {
    const { error } = await supabase.from("tenant_members").update({ role: ROLE_MAP_REV[newRole] || newRole }).eq("id", memberId);
    if (error) alert("Error: " + error.message);
    else loadTeam();
  };

  const removeMember = async (memberId) => {
    if (!window.confirm("Remove this team member?")) return;
    const { error } = await supabase.from("tenant_members").delete().eq("id", memberId);
    if (error) alert("Error: " + error.message);
    else loadTeam();
  };

  // ── Audit Log: live Supabase data ──
  const [auditLog, setAuditLog] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);

  const loadAuditLog = async () => {
    setAuditLoading(true);
    try {
      const { data, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(20);
      if (!error && data) setAuditLog(data);
    } catch (err) { console.error("Failed to load audit log:", err); }
    setAuditLoading(false);
  };

  useEffect(() => { if (activeTab === "security") loadAuditLog(); }, [activeTab]);

  const AUDIT_ICONS = { "api_key.created": "🔑", "api_key.revoked": "🔑", "team.invited": "👤", "team.removed": "👤", "password.changed": "🔒", "2fa.enabled": "🛡️", "2fa.disabled": "🛡️", "login.success": "✅", "login.failed": "🚫", "webhook.created": "🔗", "channel.updated": "📡", "campaign.created": "📣", default: "📋" };

  // ── Channel Configs: live Supabase data ──
  const [channelConfigs, setChannelConfigs] = useState({});
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelSaving, setChannelSaving] = useState(null);

  const CHANNEL_DEFS = [
    { id: "sms", label: "SMS", icon: "💬", color: "#00C9FF", fields: [
      { key: "account_sid", label: "Account SID", type: "password" },
      { key: "auth_token", label: "Auth Token", type: "password" },
      { key: "phone_number", label: "Phone Number", placeholder: "+1 (xxx) xxx-xxxx" },
      { key: "messaging_service_sid", label: "Messaging Service SID", type: "text" },
    ]},
    { id: "email", label: "Email", icon: "📧", color: "#FF6B35", fields: [
      { key: "api_key", label: "API Key", type: "password" },
      { key: "from_email", label: "From Email", placeholder: "noreply@yourdomain.com" },
      { key: "from_name", label: "From Name", placeholder: "Your Brand" },
      { key: "domain", label: "Domain", placeholder: "mail.yourdomain.com" },
    ]},
    { id: "whatsapp", label: "WhatsApp Business API", icon: "📱", color: "#25D366", fields: [
      { key: "business_account_id", label: "Business Account ID" },
      { key: "phone_number_id", label: "Phone Number ID" },
      { key: "access_token", label: "Access Token", type: "password" },
    ]},
    { id: "rcs", label: "RCS Business Messaging", icon: "✨", color: "#7C4DFF", fields: [
      { key: "agent_id", label: "Agent ID", placeholder: "brands/your-brand/agents/engage" },
      { key: "service_account", label: "Service Account Email" },
    ]},
    { id: "voice", label: "Voice", icon: "📞", color: "#FFD600", fields: [
      { key: "phone_country", label: "Country", type: "select", options: ["🇬🇧 UK (+44)", "🇺🇸 US (+1)", "🇨🇦 Canada (+1)", "🇦🇺 Australia (+61)", "🇩🇪 Germany (+49)", "🇫🇷 France (+33)", "🇪🇸 Spain (+34)", "🇮🇪 Ireland (+353)"] },
      { key: "phone_number", label: "Phone Number (without country code)", placeholder: "7700 900000" },
      { key: "ai_agent_name", label: "AI Agent Name", placeholder: "Eva" },
      { key: "tts_voice", label: "TTS Voice", type: "select", options: ["Polly.Joanna (US Female)", "Polly.Joanna-Neural (US Female Natural)", "Polly.Salli (US Female)", "Polly.Amy (UK Female)", "Polly.Amy-Neural (UK Female Natural)", "Polly.Emma (UK Female)", "Polly.Matthew (US Male)", "Polly.Matthew-Neural (US Male Natural)", "Polly.Joey (US Male)", "Polly.Brian (UK Male)", "Polly.Brian-Neural (UK Male Natural)", "Polly.Olivia-Neural (AU Female)", "Polly.Kajal-Neural (Indian English Female)"] },
      { key: "greeting", label: "During-Hours Greeting", placeholder: "Thank you for calling [Business]. " },
      { key: "after_hours_greeting", label: "After-Hours Greeting", placeholder: "Our office is currently closed. Please leave a message..." },
      { key: "timezone", label: "Timezone", type: "select", options: ["Europe/London", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"] },
      { key: "business_hours_start", label: "Open (e.g. 9.5 = 9:30)", placeholder: "9.5" },
      { key: "business_hours_end", label: "Close (e.g. 17.5 = 5:30)", placeholder: "17.5" },
      { key: "recording_enabled", label: "Call Recording", type: "select", options: ["Enabled", "Disabled"] },
    ]},
    { id: "mms", label: "MMS", icon: "📷", color: "#E040FB", fields: [
      { key: "max_media_size", label: "Max Media Size", type: "select", options: ["1 MB", "5 MB (default)", "10 MB"] },
    ]},
  ];

  const loadChannelConfigs = async () => {
    setChannelsLoading(true);
    try {
      const { data, error } = await supabase.from("channel_configs").select("*");
      if (!error && data) {
        const map = {};
        data.forEach(c => { map[c.channel] = c; });
        setChannelConfigs(map);
      }
    } catch (err) { console.error("Failed to load channel configs:", err); }
    setChannelsLoading(false);
  };

  useEffect(() => { if (activeTab === "channels") loadChannelConfigs(); }, [activeTab]);

  const saveChannelConfig = async (channelId, config, enabled) => {
    setChannelSaving(channelId);
    const tenantRow = await supabase.from("tenants").select("id").limit(1);
    const tenantId = currentTenantId || tenantRow?.data?.[0]?.id;
    if (!tenantId) { setChannelSaving(null); return alert("No tenant found"); }

    const existing = channelConfigs[channelId];
    const payload = {
      tenant_id: tenantId, channel: channelId, enabled: enabled !== undefined ? enabled : (existing?.enabled || false),
      config_encrypted: config || existing?.config_encrypted || {},
      status: enabled ? "connected" : "disconnected",
      updated_at: new Date().toISOString(),
    };

    let error;
    if (existing) {
      ({ error } = await supabase.from("channel_configs").update(payload).eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("channel_configs").insert(payload));
    }
    if (error) alert("Error saving: " + error.message);
    else loadChannelConfigs();
    setChannelSaving(null);
  };

  const updateChannelField = (channelId, key, value) => {
    setChannelConfigs(prev => {
      const existing = prev[channelId] || { config_encrypted: {} };
      return { ...prev, [channelId]: { ...existing, config_encrypted: { ...existing.config_encrypted, [key]: value } } };
    });
  };
  const [liveWebhooks, setLiveWebhooks] = useState([]);
  const [webhooksLoading, setWebhooksLoading] = useState(true);
  const [editingWebhook, setEditingWebhook] = useState(null); // null = not editing, object = editing
  const [newWebhookData, setNewWebhookData] = useState({ name: "", url: "", events: [], secret: "", retry_policy: "3_exponential" });
  const [webhookTestResult, setWebhookTestResult] = useState({});

  const ALL_EVENTS = ["message.sent", "message.delivered", "message.failed", "message.replied", "contact.created", "contact.updated", "contact.deleted", "campaign.started", "campaign.completed", "campaign.paused", "invoice.created", "payment.received"];

  const loadWebhooks = async () => {
    setWebhooksLoading(true);
    try {
      const { data, error } = await supabase.from("webhooks").select("*").order("created_at", { ascending: false });
      if (!error && data) setLiveWebhooks(data);
    } catch (err) { console.error("Failed to load webhooks:", err); }
    setWebhooksLoading(false);
  };

  useEffect(() => { if (activeTab === "webhooks") loadWebhooks(); }, [activeTab]);

  const generateSecret = () => "whsec_" + Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, "0")).join("");

  const createWebhook = async () => {
    if (!newWebhookData.name || !newWebhookData.url) return alert("Name and URL are required");
    if (!newWebhookData.url.startsWith("https://")) return alert("Webhook URL must use HTTPS");
    if (newWebhookData.events.length === 0) return alert("Select at least one event");
    const secret = newWebhookData.secret || generateSecret();
    const { data: userData } = await supabase.auth.getUser();
    const tenantRow = await supabase.from("tenants").select("id").limit(1);
    const tenantId = currentTenantId || tenantRow?.data?.[0]?.id;
    if (!tenantId) return alert("No tenant found");
    const { error } = await supabase.from("webhooks").insert({
      tenant_id: tenantId, name: newWebhookData.name, url: newWebhookData.url,
      events: newWebhookData.events, secret, retry_policy: newWebhookData.retry_policy, status: "active",
    });
    if (error) return alert("Error creating webhook: " + error.message);
    setNewWebhookData({ name: "", url: "", events: [], secret: "", retry_policy: "3_exponential" });
    setShowNewWebhook(false);
    loadWebhooks();
  };

  const updateWebhook = async () => {
    if (!editingWebhook) return;
    const { error } = await supabase.from("webhooks").update({
      name: editingWebhook.name, url: editingWebhook.url,
      events: editingWebhook.events, retry_policy: editingWebhook.retry_policy,
    }).eq("id", editingWebhook.id);
    if (error) return alert("Error updating webhook: " + error.message);
    setEditingWebhook(null);
    loadWebhooks();
  };

  const deleteWebhook = async (id) => {
    if (!window.confirm("Delete this webhook? This cannot be undone.")) return;
    const { error } = await supabase.from("webhooks").delete().eq("id", id);
    if (error) return alert("Error deleting webhook: " + error.message);
    loadWebhooks();
  };

  const toggleWebhookStatus = async (wh) => {
    const newStatus = wh.status === "active" ? "paused" : "active";
    const { error } = await supabase.from("webhooks").update({ status: newStatus }).eq("id", wh.id);
    if (error) return alert("Error updating status: " + error.message);
    loadWebhooks();
  };

  const testWebhook = async (wh) => {
    setWebhookTestResult({ ...webhookTestResult, [wh.id]: "testing" });
    try {
      const res = await fetch(wh.url, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": wh.secret || "" },
        body: JSON.stringify({ event: "test.ping", timestamp: new Date().toISOString(), data: { message: "EngageWorx webhook test" } }),
      });
      setWebhookTestResult({ ...webhookTestResult, [wh.id]: res.ok ? "success" : `failed (${res.status})` });
    } catch (err) {
      setWebhookTestResult({ ...webhookTestResult, [wh.id]: "failed (network)" });
    }
    setTimeout(() => setWebhookTestResult(prev => { const n = { ...prev }; delete n[wh.id]; return n; }), 5000);
  };

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
            <button onClick={() => { setShowNewKey(!showNewKey); setGeneratedKey(null); }} style={btnPrimary}>+ Generate Key</button>
          </div>

          {/* Generated key banner */}
          {generatedKey && (
            <div style={{ ...card, marginBottom: 16, border: "1px solid #00E67644", background: "#00E67608" }}>
              <div style={{ color: "#00E676", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>✓ API Key Generated — Copy it now! It won't be shown again.</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code style={{ flex: 1, background: "rgba(0,0,0,0.4)", padding: "10px 14px", borderRadius: 8, color: C.primary, fontSize: 13, fontFamily: "monospace", wordBreak: "break-all" }}>{generatedKey}</code>
                <button onClick={() => { navigator.clipboard.writeText(generatedKey); }} style={{ ...btnPrimary, padding: "10px 16px", whiteSpace: "nowrap" }}>Copy</button>
              </div>
              <button onClick={() => setGeneratedKey(null)} style={{ background: "none", border: "none", color: C.muted, fontSize: 11, cursor: "pointer", marginTop: 8 }}>Dismiss</button>
            </div>
          )}

          {showNewKey && (
            <div style={{ ...card, marginBottom: 16, border: `1px solid ${C.primary}44` }}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Generate New API Key</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div><label style={label}>Key Name</label><input value={newKeyData.name} onChange={e => setNewKeyData({ ...newKeyData, name: e.target.value })} placeholder="e.g. Production API Key" style={inputStyle} /></div>
                <div><label style={label}>Environment</label><select value={newKeyData.environment} onChange={e => setNewKeyData({ ...newKeyData, environment: e.target.value })} style={inputStyle}><option value="production">Production</option><option value="staging">Staging</option><option value="development">Development</option></select></div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={label}>Permissions</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {ALL_PERMISSIONS.map(p => (
                    <label key={p} onClick={() => {
                      const perms = newKeyData.permissions.includes(p) ? newKeyData.permissions.filter(x => x !== p) : [...newKeyData.permissions, p];
                      setNewKeyData({ ...newKeyData, permissions: perms });
                    }} style={{
                      display: "flex", alignItems: "center", gap: 4, borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 11,
                      background: newKeyData.permissions.includes(p) ? `${C.primary}22` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${newKeyData.permissions.includes(p) ? C.primary : "rgba(255,255,255,0.08)"}`,
                      color: newKeyData.permissions.includes(p) ? C.primary : "rgba(255,255,255,0.5)",
                    }}>{newKeyData.permissions.includes(p) ? "✓" : "○"} {p}</label>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={generateApiKey} style={btnPrimary}>Generate Key</button>
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
                  <button onClick={() => navigator.clipboard.writeText("https://api.engwx.com/v1")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 11 }}>Copy</button>
                </div>
              </div>
              <div>
                <label style={label}>API Version</label>
                <div style={{ ...inputStyle, background: "rgba(0,0,0,0.4)", color: "rgba(255,255,255,0.5)" }}>v1 (Latest)</div>
              </div>
            </div>
          </div>

          {/* Key List */}
          {apiKeysLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Loading API keys...</div>
          ) : liveApiKeys.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔑</div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No API keys yet</div>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>Generate your first API key to start integrating with EngageWorx.</div>
              <button onClick={() => setShowNewKey(true)} style={btnPrimary}>Generate Key</button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {liveApiKeys.map(key => (
                <div key={key.id} style={{
                  ...card, display: "grid", gridTemplateColumns: "1fr 160px 140px 100px auto",
                  alignItems: "center", gap: 14, opacity: key.status === "revoked" ? 0.5 : 1,
                  borderLeft: `4px solid ${key.status === "active" ? "#00E676" : "#FF3B30"}`,
                }}>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{key.name}</div>
                    <div style={{ fontFamily: "monospace", color: C.primary, fontSize: 12, marginTop: 2 }}>{key.key_prefix}...••••••</div>
                    <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 2 }}>{key.environment} · Created {new Date(key.created_at).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(key.permissions || []).map(p => (
                      <span key={p} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 4, padding: "1px 6px", fontSize: 9, color: "rgba(255,255,255,0.4)" }}>{p}</span>
                    ))}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>Used: {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : "Never"}</div>
                  <div><span style={badge(key.status === "active" ? "#00E676" : "#FF3B30")}>{key.status === "active" ? "● Active" : "● Revoked"}</span></div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {key.status === "active" && <button onClick={() => revokeApiKey(key.id)} style={{ ...btnSec, padding: "6px 10px", fontSize: 11 }}>Revoke</button>}
                    {key.status === "revoked" && <button onClick={() => deleteApiKey(key.id)} style={{ ...btnSec, padding: "6px 10px", fontSize: 11, color: "#FF3B30" }}>Delete</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ WEBHOOKS TAB ═══════════ */}
      {activeTab === "webhooks" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ color: "#fff", fontSize: 18, margin: 0 }}>Webhooks</h2>
            <button onClick={() => { setShowNewWebhook(!showNewWebhook); setEditingWebhook(null); }} style={btnPrimary}>+ Add Webhook</button>
          </div>

          {/* Create / Edit Form */}
          {(showNewWebhook || editingWebhook) && (() => {
            const isEdit = !!editingWebhook;
            const data = isEdit ? editingWebhook : newWebhookData;
            const setData = isEdit
              ? (updates) => setEditingWebhook({ ...editingWebhook, ...updates })
              : (updates) => setNewWebhookData({ ...newWebhookData, ...updates });
            const toggleEvent = (ev) => {
              const events = data.events.includes(ev) ? data.events.filter(e => e !== ev) : [...data.events, ev];
              setData({ events });
            };
            return (
              <div style={{ ...card, marginBottom: 16, border: `1px solid ${C.primary}44` }}>
                <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>{isEdit ? "Edit Webhook" : "New Webhook Endpoint"}</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <div><label style={label}>Name</label><input value={data.name} onChange={e => setData({ name: e.target.value })} placeholder="e.g. CRM Sync" style={inputStyle} /></div>
                  <div><label style={label}>URL (HTTPS required)</label><input value={data.url} onChange={e => setData({ url: e.target.value })} placeholder="https://your-domain.com/webhook" style={inputStyle} /></div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Events</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {ALL_EVENTS.map(ev => (
                      <label key={ev} onClick={() => toggleEvent(ev)} style={{
                        display: "flex", alignItems: "center", gap: 4, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontFamily: "monospace",
                        background: data.events.includes(ev) ? `${C.primary}22` : "rgba(255,255,255,0.04)",
                        border: `1px solid ${data.events.includes(ev) ? C.primary : "rgba(255,255,255,0.08)"}`,
                        color: data.events.includes(ev) ? C.primary : "rgba(255,255,255,0.5)",
                      }}>
                        {data.events.includes(ev) ? "✓" : "○"} {ev}
                      </label>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={() => setData({ events: [...ALL_EVENTS] })} style={{ background: "none", border: "none", color: C.primary, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>Select All</button>
                    <button onClick={() => setData({ events: [] })} style={{ background: "none", border: "none", color: C.muted, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>Clear</button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={label}>Signing Secret</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={data.secret || ""} onChange={e => setData({ secret: e.target.value })} placeholder="Auto-generated on create" style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12 }} />
                      {!isEdit && <button onClick={() => setData({ secret: generateSecret() })} style={{ ...btnSec, padding: "8px 12px", fontSize: 11, whiteSpace: "nowrap" }}>Generate</button>}
                    </div>
                  </div>
                  <div>
                    <label style={label}>Retry Policy</label>
                    <select value={data.retry_policy || "3_exponential"} onChange={e => setData({ retry_policy: e.target.value })} style={inputStyle}>
                      <option value="3_exponential">3 retries with exponential backoff</option>
                      <option value="5_linear">5 retries with linear backoff</option>
                      <option value="none">No retries</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={isEdit ? updateWebhook : createWebhook} style={btnPrimary}>{isEdit ? "Save Changes" : "Create Webhook"}</button>
                  <button onClick={() => { setShowNewWebhook(false); setEditingWebhook(null); }} style={btnSec}>Cancel</button>
                  {isEdit && <button onClick={() => { deleteWebhook(editingWebhook.id); setEditingWebhook(null); }} style={{ ...btnSec, color: "#FF3B30", borderColor: "#FF3B3044" }}>Delete</button>}
                </div>
              </div>
            );
          })()}

          {/* Webhook List */}
          {webhooksLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Loading webhooks...</div>
          ) : liveWebhooks.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No webhooks configured</div>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>Webhooks let you receive real-time notifications when events happen in your account.</div>
              <button onClick={() => setShowNewWebhook(true)} style={btnPrimary}>Create Your First Webhook</button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {liveWebhooks.map(wh => {
                const successRate = wh.total_deliveries > 0 ? Math.round((wh.successful_deliveries / wh.total_deliveries) * 1000) / 10 : null;
                const lastTriggered = wh.last_triggered_at ? new Date(wh.last_triggered_at).toLocaleString() : "Never";
                const testStatus = webhookTestResult[wh.id];
                return (
                  <div key={wh.id} style={{
                    ...card, display: "grid", gridTemplateColumns: "1fr 120px 140px 80px auto",
                    alignItems: "center", gap: 14,
                    borderLeft: `4px solid ${wh.status === "active" ? "#00E676" : wh.status === "failed" ? "#FF3B30" : "#FFD600"}`,
                  }}>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{wh.name}</div>
                      <div style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wh.url}</div>
                      <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                        {(wh.events || []).map(ev => <span key={ev} style={{ background: `${C.primary}12`, color: C.primary, borderRadius: 4, padding: "1px 6px", fontSize: 9, fontFamily: "monospace" }}>{ev}</span>)}
                      </div>
                    </div>
                    <div>
                      {successRate !== null ? (
                        <>
                          <div style={{ color: successRate >= 99 ? "#00E676" : successRate >= 95 ? "#FFD600" : "#FF3B30", fontSize: 16, fontWeight: 700 }}>{successRate}%</div>
                          <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>{wh.total_deliveries} deliveries</div>
                        </>
                      ) : (
                        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>No data yet</div>
                      )}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{lastTriggered}</div>
                    <div>
                      <button onClick={() => toggleWebhookStatus(wh)} style={{ ...badge(wh.status === "active" ? "#00E676" : wh.status === "failed" ? "#FF3B30" : "#FFD600"), cursor: "pointer", border: "none", background: (wh.status === "active" ? "#00E676" : wh.status === "failed" ? "#FF3B30" : "#FFD600") + "18" }}>
                        {wh.status}
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => testWebhook(wh)} disabled={testStatus === "testing"} style={{
                        ...btnSec, padding: "6px 10px", fontSize: 11,
                        color: testStatus === "success" ? "#00E676" : testStatus && testStatus.startsWith("failed") ? "#FF3B30" : "#fff",
                      }}>{testStatus === "testing" ? "..." : testStatus === "success" ? "✓ OK" : testStatus ? "✗ Fail" : "Test"}</button>
                      <button onClick={() => { setEditingWebhook({ ...wh }); setShowNewWebhook(false); }} style={{ ...btnSec, padding: "6px 10px", fontSize: 11 }}>Edit</button>
                      <button onClick={() => deleteWebhook(wh.id)} style={{ ...btnSec, padding: "6px 10px", fontSize: 11, color: "#FF3B30" }}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ CHANNELS TAB ═══════════ */}
      {activeTab === "channels" && (
        <div>
          <h2 style={{ color: "#fff", fontSize: 18, margin: "0 0 20px" }}>Channel Configuration</h2>
          {channelsLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Loading channels...</div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {CHANNEL_DEFS.map(ch => {
                const config = channelConfigs[ch.id] || {};
                const configData = config.config_encrypted || {};
                const isEnabled = config.enabled || false;
                const status = config.status || "disconnected";
                const isSaving = channelSaving === ch.id;
                return (
                  <div key={ch.id} style={{ ...card, borderLeft: `4px solid ${isEnabled ? ch.color : "rgba(255,255,255,0.15)"}`, opacity: isEnabled ? 1 : 0.7 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 24 }}>{ch.icon}</span>
                        <div>
                          <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{ch.label}</div>
                          <div style={{ color: status === "connected" ? "#00E676" : status === "error" ? "#FF3B30" : status === "pending" ? "#FFD600" : C.muted, fontSize: 11 }}>
                            {status === "connected" ? "● Connected" : status === "error" ? "● Error" : status === "pending" ? "◉ Pending" : "○ Not configured"}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => saveChannelConfig(ch.id, configData, !isEnabled)} style={{
                        width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", position: "relative",
                        background: isEnabled ? ch.color : "rgba(255,255,255,0.15)", transition: "background 0.2s",
                      }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3,
                          left: isEnabled ? 23 : 3, transition: "left 0.2s",
                        }} />
                      </button>
                    </div>

                    {isEnabled && (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: ch.fields.length > 2 ? "1fr 1fr 1fr" : "1fr 1fr", gap: 14 }}>
                          {ch.fields.map(f => (
                            <div key={f.key}>
                              <label style={label}>{f.label}</label>
                              {f.type === "select" ? (
                                <select value={configData[f.key] || f.options?.[0] || ""} onChange={e => updateChannelField(ch.id, f.key, e.target.value)} style={inputStyle}>
                                  {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                              ) : (
                                <input
                                  type={f.type || "text"}
                                  value={configData[f.key] || ""}
                                  onChange={e => updateChannelField(ch.id, f.key, e.target.value)}
                                  placeholder={f.placeholder || ""}
                                  style={inputStyle}
                                />
                              )}
                            </div>
                          ))}
                        </div>

                        {/* ── Voice-only: IVR Department Routing ── */}
                        {ch.id === "voice" && (() => {
                          const depts = configData.departments || [
                            { digit: "1", name: "", number: "" },
                            { digit: "2", name: "", number: "" },
                            { digit: "3", name: "", number: "" },
                          ];
                          const updateDept = (idx, field, value) => {
                            const updated = [...depts];
                            updated[idx] = { ...updated[idx], [field]: value };
                            updateChannelField(ch.id, "departments", updated);
                          };
                          const addDept = () => {
                            if (depts.length >= 9) return;
                            const nextDigit = String(depts.length + 1);
                            updateChannelField(ch.id, "departments", [...depts, { digit: nextDigit, name: "", number: "" }]);
                          };
                          const removeDept = (idx) => {
                            const updated = depts.filter((_, i) => i !== idx);
                            updateChannelField(ch.id, "departments", updated);
                          };

                          return (
                            <div style={{ marginTop: 18, padding: 16, background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.15)", borderRadius: 12 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                <div>
                                  <div style={{ color: "#FFD600", fontWeight: 700, fontSize: 14 }}>📋 IVR Department Routing</div>
                                  <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Configure "Press 1 for Sales, Press 2 for Support..." menu</div>
                                </div>
                                <button onClick={addDept} disabled={depts.length >= 9} style={{ ...btnSec, padding: "6px 12px", fontSize: 11, opacity: depts.length >= 9 ? 0.4 : 1 }}>+ Add</button>
                              </div>
                              <div style={{ display: "grid", gap: 8 }}>
                                {depts.map((d, i) => (
                                  <div key={i} style={{ display: "grid", gridTemplateColumns: "50px 1fr 1fr 32px", gap: 8, alignItems: "center" }}>
                                    <div style={{ background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.3)", borderRadius: 8, textAlign: "center", padding: "8px 0", color: "#FFD600", fontWeight: 800, fontSize: 16 }}>
                                      {d.digit}
                                    </div>
                                    <input
                                      value={d.name}
                                      onChange={e => updateDept(i, "name", e.target.value)}
                                      placeholder="Department name"
                                      style={{ ...inputStyle, fontSize: 12 }}
                                    />
                                    <div style={{ display: "flex", gap: 4 }}>
                                      <select
                                        value={d.country || "+44"}
                                        onChange={e => updateDept(i, "country", e.target.value)}
                                        style={{ ...inputStyle, fontSize: 11, width: 72, padding: "6px 4px", flexShrink: 0 }}
                                      >
                                        <option value="+44">🇬🇧 +44</option>
                                        <option value="+1">🇺🇸 +1</option>
                                        <option value="+61">🇦🇺 +61</option>
                                        <option value="+49">🇩🇪 +49</option>
                                        <option value="+33">🇫🇷 +33</option>
                                        <option value="+34">🇪🇸 +34</option>
                                        <option value="+353">🇮🇪 +353</option>
                                      </select>
                                      <input
                                        value={d.number}
                                        onChange={e => updateDept(i, "number", e.target.value)}
                                        placeholder="7700 900000"
                                        style={{ ...inputStyle, fontSize: 12, fontFamily: "monospace", flex: 1 }}
                                      />
                                    </div>
                                    <button onClick={() => removeDept(i)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 16, padding: 4 }}>✕</button>
                                  </div>
                                ))}
                              </div>
                              {depts.length === 0 && (
                                <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: "12px 0" }}>No departments configured. Calls will go directly to voicemail.</div>
                              )}
                            </div>
                          );
                        })()}

                        {/* ── Voice-only: Working Days ── */}
                        {ch.id === "voice" && (() => {
                          const workDays = configData.work_days || [1, 2, 3, 4, 5];
                          const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                          return (
                            <div style={{ marginTop: 14, padding: 14, background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.15)", borderRadius: 12 }}>
                              <div style={{ color: "#FFD600", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>📅 Working Days</div>
                              <div style={{ display: "flex", gap: 6 }}>
                                {dayNames.map((d, i) => (
                                  <button key={i} onClick={() => {
                                    const updated = workDays.includes(i) ? workDays.filter(x => x !== i) : [...workDays, i].sort();
                                    updateChannelField(ch.id, "work_days", updated);
                                  }} style={{
                                    flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                                    fontFamily: "'DM Sans', sans-serif", border: "1px solid",
                                    background: workDays.includes(i) ? "rgba(255,215,0,0.15)" : "rgba(255,255,255,0.03)",
                                    borderColor: workDays.includes(i) ? "rgba(255,215,0,0.4)" : "rgba(255,255,255,0.08)",
                                    color: workDays.includes(i) ? "#FFD600" : "rgba(255,255,255,0.3)",
                                  }}>{d}</button>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* ── Voice-only: Hours Overrides (weddings, events, holidays) ── */}
                        {ch.id === "voice" && (() => {
                          const overrides = configData.hours_overrides || [];
                          const addOverride = () => {
                            const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
                            updateChannelField(ch.id, "hours_overrides", [...overrides, { date: tomorrow, closed: false, open: "10", close: "22" }]);
                          };
                          const updateOverride = (idx, field, value) => {
                            const updated = [...overrides];
                            updated[idx] = { ...updated[idx], [field]: value };
                            updateChannelField(ch.id, "hours_overrides", updated);
                          };
                          const removeOverride = (idx) => updateChannelField(ch.id, "hours_overrides", overrides.filter((_, i) => i !== idx));

                          return (
                            <div style={{ marginTop: 14, padding: 14, background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.15)", borderRadius: 12 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                <div>
                                  <div style={{ color: "#FFD600", fontWeight: 700, fontSize: 13 }}>🗓️ Hours Overrides</div>
                                  <div style={{ color: C.muted, fontSize: 11 }}>Set custom hours for weddings, events, holidays, etc.</div>
                                </div>
                                <button onClick={addOverride} style={{ ...btnSec, padding: "5px 10px", fontSize: 11 }}>+ Add Date</button>
                              </div>
                              {overrides.length === 0 ? (
                                <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: "8px 0" }}>No overrides set. Default hours will apply every working day.</div>
                              ) : (
                                <div style={{ display: "grid", gap: 8 }}>
                                  {overrides.map((o, i) => (
                                    <div key={i} style={{ display: "grid", gridTemplateColumns: "140px auto 70px 70px 32px", gap: 8, alignItems: "center" }}>
                                      <input type="date" value={o.date} onChange={e => updateOverride(i, "date", e.target.value)}
                                        style={{ ...inputStyle, fontSize: 12, padding: "6px 8px" }} />
                                      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: o.closed ? "#FF3B30" : C.muted, fontSize: 12 }}>
                                        <input type="checkbox" checked={o.closed || false} onChange={e => updateOverride(i, "closed", e.target.checked)} />
                                        Closed all day
                                      </label>
                                      {!o.closed && <>
                                        <input value={o.open || "10"} onChange={e => updateOverride(i, "open", e.target.value)}
                                          placeholder="Open" style={{ ...inputStyle, fontSize: 12, padding: "6px 8px", textAlign: "center" }} />
                                        <input value={o.close || "17"} onChange={e => updateOverride(i, "close", e.target.value)}
                                          placeholder="Close" style={{ ...inputStyle, fontSize: 12, padding: "6px 8px", textAlign: "center" }} />
                                      </>}
                                      {o.closed && <><span /><span /></>}
                                      <button onClick={() => removeOverride(i)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 16, padding: 4 }}>✕</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                          <button onClick={() => saveChannelConfig(ch.id, channelConfigs[ch.id]?.config_encrypted || configData)} disabled={isSaving} style={{ ...btnPrimary, padding: "8px 14px", fontSize: 11, opacity: isSaving ? 0.6 : 1 }}>
                            {isSaving ? "Saving..." : "Save Configuration"}
                          </button>
                          <button style={{ ...btnSec, padding: "8px 14px", fontSize: 11 }} onClick={() => {
                            saveChannelConfig(ch.id, configData, isEnabled).then(() => {
                              supabase.from("channel_configs").update({ last_tested_at: new Date().toISOString() }).eq("channel", ch.id).then(() => loadChannelConfigs());
                            });
                          }}>Test Connection</button>
                        </div>
                      </>
                    )}

                    {!isEnabled && (
                      <div style={{ color: C.muted, fontSize: 12, padding: "8px 0" }}>
                        Enable this channel to configure your {ch.label} integration.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
                  <span style={{ color: C.primary, fontSize: 22, fontWeight: 800 }}>{currentPlanInfo.name} Plan</span>
                  <span style={badge(stripeStatus === "trialing" ? "#FFD600" : "#00E676")}>● {planStatus}</span>
                </div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{currentPlanInfo.price}/month · Billed monthly</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "#fff", fontSize: 28, fontWeight: 800 }}>{currentPlanInfo.price}<span style={{ color: C.muted, fontSize: 14, fontWeight: 400 }}>/mo</span></div>
                <button onClick={() => setShowUpgradeModal(true)} style={{ ...btnSec, padding: "6px 14px", fontSize: 11, marginTop: 6 }}>Upgrade Plan</button>
                <button onClick={handleManageBilling} style={{ ...btnSec, padding: "6px 14px", fontSize: 11, marginTop: 6, marginLeft: 6, background: "transparent", border: "1px solid rgba(255,255,255,0.15)" }}>Manage Billing</button>
              </div>
            </div>
          </div>

          {/* Usage — live from Supabase */}
          {(() => {
            const [usageData, setUsageData] = React.useState(null);
            React.useEffect(() => {
              (async () => {
                try {
                  const [msgs, contacts, campaigns, members, apiKeys] = await Promise.all([
                    supabase.from("messages").select("id", { count: "exact", head: true }),
                    supabase.from("contacts").select("id", { count: "exact", head: true }),
                    supabase.from("campaigns").select("id", { count: "exact", head: true }),
                    supabase.from("tenant_members").select("id", { count: "exact", head: true }),
                    supabase.from("api_keys").select("id", { count: "exact", head: true }).eq("status", "active"),
                  ]);
                  setUsageData({
                    messages: msgs.count || 0,
                    contacts: contacts.count || 0,
                    campaigns: campaigns.count || 0,
                    members: members.count || 0,
                    apiKeys: apiKeys.count || 0,
                  });
                } catch (err) {
                  setUsageData({ messages: 0, contacts: 0, campaigns: 0, members: 0, apiKeys: 0 });
                }
              })();
            }, []);

            const planLimits = stripePlan?.includes("Pro") ? { messages: 500000, contacts: 500000, campaigns: 200, users: 50 }
              : stripePlan?.includes("Growth") ? { messages: 250000, contacts: 100000, campaigns: 50, users: 10 }
              : { messages: 50000, contacts: 10000, campaigns: 10, users: 3 };

            const items = usageData ? [
              { label: "Messages", used: usageData.messages, limit: planLimits.messages, color: C.primary },
              { label: "Contacts", used: usageData.contacts, limit: planLimits.contacts, color: "#00E676" },
              { label: "Campaigns", used: usageData.campaigns, limit: planLimits.campaigns, color: "#FFD600" },
              { label: "Team Members", used: usageData.members, limit: planLimits.users, color: "#E040FB" },
            ] : null;

            return (
              <div style={{ ...card, marginBottom: 20 }}>
                <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Current Usage</h3>
                {!items ? (
                  <div style={{ color: C.muted, fontSize: 13 }}>Loading usage data...</div>
                ) : (
                  <div style={{ display: "grid", gap: 14 }}>
                    {items.map((u, i) => {
                      const pct = u.limit > 0 ? Math.round((u.used / u.limit) * 100) : 0;
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
                )}
              </div>
            );
          })()}

          {/* SMS Top-Ups */}
          <div style={{ ...card, marginBottom: 20, borderLeft: "4px solid #FFD600" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h3 style={{ color: "#fff", margin: 0, fontSize: 15 }}>SMS Top-Up Credits</h3>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Purchase additional SMS credits when you need more</div>
              </div>
              <span style={{ fontSize: 24 }}>📲</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {SMS_TOPUPS.map(t => (
                <div key={t.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "20px 16px", textAlign: "center", position: "relative" }}>
                  {t.savings && <div style={{ position: "absolute", top: -8, right: 12, background: "linear-gradient(135deg, #FFD600, #FF6B35)", color: "#000", padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 800 }}>{t.savings}</div>}
                  <div style={{ color: "#fff", fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{t.name}</div>
                  <div style={{ color: C.primary, fontSize: 24, fontWeight: 900, marginBottom: 4 }}>{t.price}</div>
                  <div style={{ color: C.muted, fontSize: 11, marginBottom: 12 }}>{t.perSms}/SMS</div>
                  <button onClick={() => handleTopup(t)} disabled={topupLoading === t.id} style={{ width: "100%", background: topupLoading === t.id ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #00C9FF, #E040FB)", border: "none", borderRadius: 8, padding: "10px", color: topupLoading === t.id ? C.muted : "#000", fontWeight: 700, cursor: topupLoading === t.id ? "wait" : "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
                    {topupLoading === t.id ? "Loading..." : "Buy Now"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Payment Method — managed via Stripe */}
          <div style={{ ...card, marginBottom: 20 }}>
            <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Payment Method</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 28 }}>💳</div>
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Managed by Stripe</div>
                  <div style={{ color: C.muted, fontSize: 12 }}>View and update your payment details securely</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={handleManageBilling} style={btnSec}>Update Payment Method</button>
                <button onClick={handleManageBilling} style={btnSec}>View Invoices</button>
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
            <button onClick={() => setShowInvite(!showInvite)} style={btnPrimary}>+ Invite Member</button>
          </div>

          {showInvite && (
            <div style={{ ...card, marginBottom: 16, border: `1px solid ${C.primary}44` }}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Invite Team Member</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div><label style={label}>Email Address</label><input value={inviteData.email} onChange={e => setInviteData({ ...inviteData, email: e.target.value })} placeholder="colleague@company.com" style={inputStyle} /></div>
                <div><label style={label}>Role</label><select value={inviteData.role} onChange={e => setInviteData({ ...inviteData, role: e.target.value })} style={inputStyle}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select></div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={inviteMember} style={btnPrimary}>Send Invitation</button>
                <button onClick={() => setShowInvite(false)} style={btnSec}>Cancel</button>
              </div>
            </div>
          )}

          {teamLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Loading team...</div>
          ) : liveTeam.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No team members yet</div>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>Invite your team to collaborate on campaigns, manage contacts, and view analytics.</div>
              <button onClick={() => setShowInvite(true)} style={btnPrimary}>Invite Your First Member</button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {liveTeam.map(tm => {
                const email = tm.user?.email || "Unknown";
                const name = tm.user?.raw_user_meta_data?.full_name || tm.user?.raw_user_meta_data?.name || email.split("@")[0];
                const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                const roleName = ROLE_MAP[tm.role] || tm.role;
                return (
                  <div key={tm.id} style={{
                    ...card, display: "grid", gridTemplateColumns: "1fr 160px 80px auto",
                    alignItems: "center", gap: 14,
                    borderLeft: `4px solid ${tm.status === "active" ? "#00E676" : "#FFD600"}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: `linear-gradient(135deg, ${C.primary}44, ${C.primary}22)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: C.primary }}>{initials}</div>
                      <div>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{name}</div>
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>{email}</div>
                        <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>Joined {tm.joined_at ? new Date(tm.joined_at).toLocaleDateString() : "Pending"}</div>
                      </div>
                    </div>
                    <div>
                      <select value={roleName} onChange={e => updateMemberRole(tm.id, e.target.value)} style={{ ...inputStyle, padding: "6px 10px", fontSize: 12 }}>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div><span style={badge(tm.status === "active" ? "#00E676" : "#FFD600")}>{tm.status}</span></div>
                    <div>
                      <button onClick={() => removeMember(tm.id)} style={{ ...btnSec, padding: "6px 10px", fontSize: 11, color: "#FF3B30" }}>Remove</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ UPGRADE MODAL ═══════════ */}
      {showUpgradeModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }} onClick={() => setShowUpgradeModal(false)}>
          <div style={{ background: "#1A1D2E", borderRadius: 16, padding: 32, maxWidth: 720, width: "90%", maxHeight: "90vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ color: "#fff", margin: 0, fontSize: 20 }}>Choose Your Plan</h2>
              <button onClick={() => setShowUpgradeModal(false)} style={{ background: "none", border: "none", color: C.muted, fontSize: 24, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              {PLANS.map(plan => (
                <div key={plan.id} style={{ background: "rgba(255,255,255,0.04)", border: plan.popular ? `2px solid ${C.primary}` : "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20, position: "relative" }}>
                  {plan.popular && <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: C.primary, color: "#000", fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 10 }}>POPULAR</div>}
                  <div style={{ color: "#fff", fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{plan.name}</div>
                  <div style={{ color: C.primary, fontSize: 28, fontWeight: 800, marginBottom: 12 }}>{plan.price}<span style={{ color: C.muted, fontSize: 13, fontWeight: 400 }}>/mo</span></div>
                  <div style={{ marginBottom: 16 }}>
                    {plan.features.map((f, i) => (
                      <div key={i} style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, padding: "4px 0", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "#00E676" }}>✓</span> {f}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => handleUpgrade(plan)}
                    disabled={upgradeLoading === plan.id}
                    style={{
                      width: "100%",
                      background: upgradeLoading === plan.id ? "rgba(255,255,255,0.1)" : plan.popular ? "linear-gradient(135deg, #00C9FF, #E040FB)" : "rgba(255,255,255,0.1)",
                      border: "none", borderRadius: 8, padding: "10px", color: plan.popular ? "#000" : "#fff",
                      fontWeight: 700, cursor: upgradeLoading === plan.id ? "wait" : "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif"
                    }}
                  >
                    {upgradeLoading === plan.id ? "Redirecting..." : "Select Plan"}
                  </button>
                </div>
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button onClick={handleManageBilling} style={{ background: "none", border: "none", color: C.primary, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
                Or manage your existing subscription →
              </button>
            </div>
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
              {auditLoading ? (
                <div style={{ color: C.muted, fontSize: 13, padding: "12px 0" }}>Loading audit log...</div>
              ) : auditLog.length === 0 ? (
                <div style={{ color: C.muted, fontSize: 13, padding: "12px 0" }}>No security events recorded yet.</div>
              ) : (
                auditLog.map((ev, i) => {
                  const icon = AUDIT_ICONS[ev.action] || AUDIT_ICONS.default;
                  const timeAgo = (() => {
                    const diff = Date.now() - new Date(ev.created_at).getTime();
                    const mins = Math.floor(diff / 60000);
                    if (mins < 60) return `${mins} min ago`;
                    const hrs = Math.floor(mins / 60);
                    if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
                    const days = Math.floor(hrs / 24);
                    return `${days} day${days > 1 ? "s" : ""} ago`;
                  })();
                  return (
                    <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < auditLog.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>{icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{ev.action.replace(/\./g, " → ")}</div>
                        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>{ev.details?.email || ev.details?.user_email || ev.resource_type || ""}</div>
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>{timeAgo}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
