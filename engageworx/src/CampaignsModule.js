import { useState, useEffect, useRef } from "react";

// ─── DEMO CAMPAIGN DATA ───────────────────────────────────────────────────────
const CAMPAIGN_STATUSES = ["draft", "scheduled", "active", "paused", "completed"];
const STATUS_COLORS = { draft: "#6B8BAE", scheduled: "#FFD600", active: "#00E676", paused: "#FF9800", completed: "#7C4DFF" };
const STATUS_ICONS = { draft: "📝", scheduled: "⏰", active: "🟢", paused: "⏸️", completed: "✅" };
const CHANNELS = ["SMS", "MMS", "RCS", "WhatsApp", "Email"];
const CHANNEL_COLORS = { SMS: "#00C9FF", MMS: "#7C4DFF", RCS: "#E040FB", WhatsApp: "#25D366", Email: "#FF6B35" };
const CHANNEL_ICONS = { SMS: "💬", MMS: "📷", RCS: "✨", WhatsApp: "📱", Email: "📧" };

const AI_TONES = ["Professional", "Friendly", "Urgent", "Casual", "Promotional", "Empathetic"];
const AI_TEMPLATES = [
  { id: "promo", name: "Promotional Offer", desc: "Drive sales with a limited-time discount", icon: "🏷️" },
  { id: "welcome", name: "Welcome Series", desc: "Onboard new subscribers with a warm intro", icon: "👋" },
  { id: "reminder", name: "Appointment Reminder", desc: "Reduce no-shows with timely reminders", icon: "📅" },
  { id: "survey", name: "Customer Survey", desc: "Gather feedback to improve your service", icon: "📋" },
  { id: "reengagement", name: "Re-engagement", desc: "Win back inactive contacts", icon: "🔄" },
  { id: "announcement", name: "Product Announcement", desc: "Share exciting updates and launches", icon: "🎉" },
  { id: "otp", name: "OTP / Verification", desc: "Send secure one-time passwords", icon: "🔐" },
  { id: "shipping", name: "Shipping Update", desc: "Keep customers informed on delivery", icon: "📦" },
];

function generateDemoCampaigns(tenantId) {
  const now = new Date();
  const campaigns = [
    { id: "c001", name: "Spring Flash Sale", channel: "SMS", status: "active", audience: "All Contacts", audienceSize: 12400, sent: 11800, delivered: 11350, opened: 5890, clicked: 2100, replied: 340, failed: 450, optOut: 28, revenue: 18420, startDate: new Date(now - 2 * 86400000), endDate: null, scheduledDate: null, abTest: true, abVariants: [{ name: "A", subject: "🔥 50% OFF Today Only!", ctr: 18.2, openRate: 52.1 }, { name: "B", subject: "Flash Sale: Save Big This Spring", ctr: 14.8, openRate: 47.3 }], body: "Hey {first_name}! Our biggest sale of the season is HERE. Get 50% off everything for the next 24 hours. Shop now: {link}", tags: ["sale", "spring", "promotional"], aiGenerated: true, tone: "Urgent" },
    { id: "c002", name: "Welcome Series - Day 1", channel: "Email", status: "active", audience: "New Subscribers", audienceSize: 3200, sent: 3180, delivered: 3120, opened: 2340, clicked: 890, replied: 0, failed: 60, optOut: 5, revenue: 4200, startDate: new Date(now - 14 * 86400000), endDate: null, scheduledDate: null, abTest: false, body: "Welcome to {brand_name}! We're thrilled to have you. Here's what you can expect...", tags: ["welcome", "onboarding", "automated"], aiGenerated: true, tone: "Friendly" },
    { id: "c003", name: "Monthly Newsletter - March", channel: "Email", status: "completed", audience: "Newsletter List", audienceSize: 28500, sent: 28200, delivered: 27800, opened: 11120, clicked: 3340, replied: 0, failed: 400, optOut: 82, revenue: 12800, startDate: new Date(now - 10 * 86400000), endDate: new Date(now - 3 * 86400000), scheduledDate: null, abTest: false, body: "Hi {first_name}, here's your monthly roundup of the latest news, features, and tips...", tags: ["newsletter", "monthly"], aiGenerated: false, tone: "Professional" },
    { id: "c004", name: "Cart Abandonment Reminder", channel: "SMS", status: "active", audience: "Cart Abandoners", audienceSize: 4800, sent: 4650, delivered: 4500, opened: 3600, clicked: 1620, replied: 210, failed: 150, optOut: 12, revenue: 22300, startDate: new Date(now - 30 * 86400000), endDate: null, scheduledDate: null, abTest: false, body: "Hey {first_name}, you left something behind! Complete your order and get free shipping: {link}", tags: ["cart", "recovery", "automated"], aiGenerated: true, tone: "Casual" },
    { id: "c005", name: "VIP Early Access", channel: "WhatsApp", status: "scheduled", audience: "VIP Segment", audienceSize: 1850, sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, failed: 0, optOut: 0, revenue: 0, startDate: null, endDate: null, scheduledDate: new Date(now.getTime() + 2 * 86400000), abTest: true, abVariants: [{ name: "A", subject: "🌟 Exclusive: You're invited", ctr: 0, openRate: 0 }, { name: "B", subject: "VIP Access: New Collection", ctr: 0, openRate: 0 }], body: "Hi {first_name}! As a valued VIP, you get early access to our new collection. Browse now before anyone else: {link}", tags: ["vip", "exclusive", "early-access"], aiGenerated: true, tone: "Professional" },
    { id: "c006", name: "Appointment Reminders", channel: "SMS", status: "active", audience: "Upcoming Appointments", audienceSize: 620, sent: 580, delivered: 572, opened: 520, clicked: 310, replied: 145, failed: 8, optOut: 2, revenue: 0, startDate: new Date(now - 60 * 86400000), endDate: null, scheduledDate: null, abTest: false, body: "Reminder: Your appointment is tomorrow at {time}. Reply YES to confirm or RESCHEDULE to change. See you soon!", tags: ["appointment", "reminder", "automated"], aiGenerated: false, tone: "Friendly" },
    { id: "c007", name: "Product Launch - Summer '26", channel: "RCS", status: "draft", audience: "All Contacts", audienceSize: 15200, sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, failed: 0, optOut: 0, revenue: 0, startDate: null, endDate: null, scheduledDate: null, abTest: false, body: "", tags: ["product", "launch"], aiGenerated: false, tone: "Promotional" },
    { id: "c008", name: "Customer Satisfaction Survey", channel: "Email", status: "paused", audience: "Recent Purchasers", audienceSize: 6200, sent: 3100, delivered: 3050, opened: 1220, clicked: 488, replied: 0, failed: 50, optOut: 18, revenue: 0, startDate: new Date(now - 5 * 86400000), endDate: null, scheduledDate: null, abTest: false, body: "Hi {first_name}, we'd love to hear about your recent experience. Take our quick 2-minute survey: {link}", tags: ["survey", "feedback"], aiGenerated: true, tone: "Empathetic" },
    { id: "c009", name: "Holiday Promo - Presidents Day", channel: "MMS", status: "completed", audience: "All Contacts", audienceSize: 14800, sent: 14500, delivered: 14100, opened: 7050, clicked: 2820, replied: 0, failed: 400, optOut: 45, revenue: 31200, startDate: new Date(now - 20 * 86400000), endDate: new Date(now - 17 * 86400000), scheduledDate: null, abTest: true, abVariants: [{ name: "A", subject: "Presidents Day Sale", ctr: 20.1, openRate: 49.2 }, { name: "B", subject: "🇺🇸 Save Up To 60%!", ctr: 19.4, openRate: 48.8 }], body: "Presidents Day deals are HERE! Save up to 60% on everything. Limited time only.", tags: ["holiday", "sale", "promotional"], aiGenerated: false, tone: "Promotional" },
    { id: "c010", name: "Win-Back: 30-Day Inactive", channel: "SMS", status: "active", audience: "Inactive 30+ Days", audienceSize: 2100, sent: 1980, delivered: 1900, opened: 760, clicked: 228, replied: 95, failed: 80, optOut: 42, revenue: 3400, startDate: new Date(now - 7 * 86400000), endDate: null, scheduledDate: null, abTest: false, body: "We miss you, {first_name}! It's been a while. Here's 20% off to welcome you back: {link}", tags: ["winback", "reengagement", "automated"], aiGenerated: true, tone: "Friendly" },
  ];
  return campaigns;
}

// ─── AI COPY GENERATOR (simulated) ────────────────────────────────────────────
function generateAICopy(template, tone, channel, brandName) {
  const copies = {
    promo: {
      Professional: `Dear valued customer, we're pleased to offer you an exclusive discount as part of our latest promotion from ${brandName}. Use code SAVE25 at checkout for 25% off your next order. This offer expires in 48 hours.`,
      Friendly: `Hey there! 🎉 We've got something special just for you — 25% OFF everything at ${brandName}! Use code SAVE25 before it's gone. Happy shopping!`,
      Urgent: `⚡ FLASH SALE — 25% OFF for the next 24 HOURS ONLY! Don't miss out. Use code SAVE25 at ${brandName}. Shop NOW before it ends!`,
      Casual: `Psst... ${brandName} is having a sale 😎 25% off with code SAVE25. Just saying... you might wanna check it out.`,
      Promotional: `🏷️ SPECIAL OFFER from ${brandName}! Save 25% on your entire order with code SAVE25. Limited time — shop the sale today!`,
      Empathetic: `We know things have been busy lately. Here's a little treat from ${brandName} — 25% off your next order with code SAVE25. You deserve something nice!`,
    },
    welcome: {
      Professional: `Welcome to ${brandName}. We're glad to have you on board. In the coming days, you'll receive tips, exclusive offers, and updates tailored to your interests.`,
      Friendly: `Welcome to the ${brandName} family! 🎊 We're so excited you're here. Get ready for exclusive deals, helpful tips, and more!`,
      Urgent: `You're in! Welcome to ${brandName}. Act fast — new members get an exclusive welcome offer. Check your inbox for details!`,
      Casual: `Hey! Welcome to ${brandName} 👋 We're pretty cool, if we say so ourselves. Stick around — good stuff is coming your way.`,
      Promotional: `🎁 Welcome aboard! As a new ${brandName} member, enjoy 15% off your first order. Use code WELCOME15 at checkout!`,
      Empathetic: `Thank you for joining ${brandName}. We're here to make your experience wonderful. If you ever need anything, just reach out — we're always happy to help.`,
    },
    reminder: {
      Professional: `This is a reminder from ${brandName}: your appointment is scheduled for {date} at {time}. Please reply to confirm or contact us to reschedule.`,
      Friendly: `Just a friendly heads up from ${brandName}! 📅 Your appointment is coming up on {date} at {time}. See you then! Reply YES to confirm.`,
      Urgent: `⏰ REMINDER: Your ${brandName} appointment is TOMORROW at {time}. Please confirm ASAP. Reply YES to confirm or call us to reschedule.`,
      Casual: `Hey! Quick reminder — you've got an appointment with ${brandName} on {date} at {time}. Reply YES if you're good to go 👍`,
      Promotional: `Your ${brandName} appointment is on {date} at {time}. While you're here, ask about our latest offers! Reply YES to confirm.`,
      Empathetic: `We're looking forward to seeing you! Your ${brandName} appointment is on {date} at {time}. If anything has come up and you need to reschedule, no worries — just let us know.`,
    },
  };
  const templateCopies = copies[template] || copies.promo;
  return templateCopies[tone] || templateCopies.Professional;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function CampaignsModule({ C, tenants, viewLevel = "tenant", currentTenantId }) {
  const [view, setView] = useState("list"); // list, detail, create
  const [campaigns, setCampaigns] = useState(() => generateDemoCampaigns(currentTenantId));
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterChannel, setFilterChannel] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("date"); // date, name, performance

  // Create campaign state
  const [createStep, setCreateStep] = useState(1); // 1: basics, 2: content, 3: audience, 4: schedule, 5: review
  const [newCampaign, setNewCampaign] = useState({
    name: "", channel: "SMS", audience: "All Contacts", audienceSize: 12400,
    body: "", subject: "", abTest: false, abVariantB: "",
    scheduledDate: "", scheduledTime: "", sendNow: false,
    tags: [], tone: "Professional", aiTemplate: null,
    useAI: false,
  });
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);

  const brandName = currentTenantId
    ? (tenants[currentTenantId]?.brand?.name || "Your Brand")
    : "EngageWorx";

  // ─── FILTERS ──────────────────────────────────────────────────────────────
  const filteredCampaigns = campaigns.filter(c => {
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    if (filterChannel !== "all" && c.channel !== filterChannel) return false;
    if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "performance") return (b.clicked / (b.sent || 1)) - (a.clicked / (a.sent || 1));
    return (b.startDate || b.scheduledDate || 0) - (a.startDate || a.scheduledDate || 0);
  });

  // ─── AI GENERATE ──────────────────────────────────────────────────────────
  const handleAIGenerate = () => {
    setAiGenerating(true);
    setTimeout(() => {
      const template = newCampaign.aiTemplate || "promo";
      const suggestions = AI_TONES.slice(0, 3).map(tone => ({
        tone,
        text: generateAICopy(template, tone, newCampaign.channel, brandName),
      }));
      setAiSuggestions(suggestions);
      setAiGenerating(false);
    }, 1200);
  };

  // ─── STATS HELPERS ────────────────────────────────────────────────────────
  const totalSent = campaigns.reduce((s, c) => s + c.sent, 0);
  const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
  const activeCampaigns = campaigns.filter(c => c.status === "active").length;
  const avgOpenRate = campaigns.filter(c => c.sent > 0).reduce((s, c) => s + (c.opened / c.sent) * 100, 0) / (campaigns.filter(c => c.sent > 0).length || 1);
  const avgClickRate = campaigns.filter(c => c.sent > 0).reduce((s, c) => s + (c.clicked / c.sent) * 100, 0) / (campaigns.filter(c => c.sent > 0).length || 1);

  // ─── STYLES ───────────────────────────────────────────────────────────────
  const card = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 };
  const inputStyle = { width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" };
  const btnPrimary = { background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, border: "none", borderRadius: 10, padding: "12px 24px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif" };
  const btnSecondary = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 24px", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif" };
  const badge = (color) => ({ background: color + "18", color, border: `1px solid ${color}44`, borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700 });

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE CAMPAIGN VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "create") {
    const steps = [
      { num: 1, label: "Basics" },
      { num: 2, label: "Content" },
      { num: 3, label: "Audience" },
      { num: 4, label: "Schedule" },
      { num: 5, label: "Review" },
    ];

    return (
      <div style={{ padding: "32px 40px", maxWidth: 900 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <button onClick={() => { setView("list"); setCreateStep(1); setNewCampaign({ name: "", channel: "SMS", audience: "All Contacts", audienceSize: 12400, body: "", subject: "", abTest: false, abVariantB: "", scheduledDate: "", scheduledTime: "", sendNow: false, tags: [], tone: "Professional", aiTemplate: null, useAI: false }); setAiSuggestions([]); }} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>← Back</button>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", margin: 0 }}>Create Campaign</h1>
        </div>

        {/* Step Indicator */}
        <div style={{ display: "flex", gap: 4, marginBottom: 32 }}>
          {steps.map(s => (
            <div key={s.num} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700,
                background: createStep >= s.num ? C.primary : "rgba(255,255,255,0.06)",
                color: createStep >= s.num ? "#000" : C.muted,
                transition: "all 0.3s",
              }}>{s.num}</div>
              <span style={{ fontSize: 13, color: createStep >= s.num ? "#fff" : C.muted, fontWeight: createStep === s.num ? 700 : 400 }}>{s.label}</span>
              {s.num < 5 && <div style={{ flex: 1, height: 2, background: createStep > s.num ? C.primary : "rgba(255,255,255,0.06)", borderRadius: 1, transition: "all 0.3s" }} />}
            </div>
          ))}
        </div>

        {/* Step 1: Basics */}
        {createStep === 1 && (
          <div style={card}>
            <h2 style={{ color: "#fff", margin: "0 0 24px", fontSize: 18 }}>Campaign Basics</h2>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Campaign Name</label>
              <input value={newCampaign.name} onChange={e => setNewCampaign({ ...newCampaign, name: e.target.value })} placeholder="e.g. Spring Flash Sale" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Channel</label>
              <div style={{ display: "flex", gap: 10 }}>
                {CHANNELS.map(ch => (
                  <button key={ch} onClick={() => setNewCampaign({ ...newCampaign, channel: ch })} style={{
                    flex: 1, padding: "14px 8px", borderRadius: 10, cursor: "pointer", textAlign: "center",
                    background: newCampaign.channel === ch ? CHANNEL_COLORS[ch] + "22" : "rgba(255,255,255,0.03)",
                    border: `2px solid ${newCampaign.channel === ch ? CHANNEL_COLORS[ch] : "rgba(255,255,255,0.08)"}`,
                    color: newCampaign.channel === ch ? CHANNEL_COLORS[ch] : C.muted,
                    transition: "all 0.2s",
                  }}>
                    <div style={{ fontSize: 22, marginBottom: 4 }}>{CHANNEL_ICONS[ch]}</div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{ch}</div>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Tags</label>
              <input value={newCampaign.tags.join(", ")} onChange={e => setNewCampaign({ ...newCampaign, tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean) })} placeholder="e.g. sale, spring, promotional" style={inputStyle} />
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 4 }}>Separate with commas</div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 28 }}>
              <button onClick={() => newCampaign.name && setCreateStep(2)} disabled={!newCampaign.name} style={{ ...btnPrimary, opacity: newCampaign.name ? 1 : 0.4 }}>Next: Content →</button>
            </div>
          </div>
        )}

        {/* Step 2: Content */}
        {createStep === 2 && (
          <div style={card}>
            <h2 style={{ color: "#fff", margin: "0 0 24px", fontSize: 18 }}>Campaign Content</h2>

            {/* AI Toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, padding: "16px 20px", background: `${C.accent}11`, border: `1px solid ${C.accent}33`, borderRadius: 12 }}>
              <span style={{ fontSize: 24 }}>🤖</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>AI Copy Assistant</div>
                <div style={{ color: C.muted, fontSize: 12 }}>Let AI generate message copy based on your goals</div>
              </div>
              <button onClick={() => setNewCampaign({ ...newCampaign, useAI: !newCampaign.useAI })} style={{
                width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
                background: newCampaign.useAI ? C.primary : "rgba(255,255,255,0.15)",
                position: "relative", transition: "all 0.3s",
              }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: newCampaign.useAI ? 25 : 3, transition: "all 0.3s" }} />
              </button>
            </div>

            {newCampaign.useAI && (
              <>
                {/* Template Selection */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Choose Template</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                    {AI_TEMPLATES.map(t => (
                      <button key={t.id} onClick={() => setNewCampaign({ ...newCampaign, aiTemplate: t.id })} style={{
                        padding: "14px 10px", borderRadius: 10, cursor: "pointer", textAlign: "center",
                        background: newCampaign.aiTemplate === t.id ? `${C.primary}22` : "rgba(255,255,255,0.03)",
                        border: `2px solid ${newCampaign.aiTemplate === t.id ? C.primary : "rgba(255,255,255,0.06)"}`,
                        color: newCampaign.aiTemplate === t.id ? C.primary : C.muted,
                        transition: "all 0.2s",
                      }}>
                        <div style={{ fontSize: 20, marginBottom: 6 }}>{t.icon}</div>
                        <div style={{ fontSize: 11, fontWeight: 700 }}>{t.name}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tone Selection */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Tone</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {AI_TONES.map(t => (
                      <button key={t} onClick={() => setNewCampaign({ ...newCampaign, tone: t })} style={{
                        padding: "8px 16px", borderRadius: 8, cursor: "pointer",
                        background: newCampaign.tone === t ? C.primary : "rgba(255,255,255,0.04)",
                        border: `1px solid ${newCampaign.tone === t ? C.primary : "rgba(255,255,255,0.08)"}`,
                        color: newCampaign.tone === t ? "#000" : C.muted,
                        fontSize: 13, fontWeight: newCampaign.tone === t ? 700 : 400, transition: "all 0.2s",
                      }}>{t}</button>
                    ))}
                  </div>
                </div>

                {/* Generate Button */}
                <button onClick={handleAIGenerate} disabled={!newCampaign.aiTemplate} style={{ ...btnPrimary, width: "100%", marginBottom: 20, opacity: newCampaign.aiTemplate ? 1 : 0.4, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {aiGenerating ? (
                    <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⚡</span> Generating...</>
                  ) : (
                    <>🤖 Generate AI Copy</>
                  )}
                </button>

                {/* AI Suggestions */}
                {aiSuggestions.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>AI Suggestions — Click to Use</label>
                    <div style={{ display: "grid", gap: 10 }}>
                      {aiSuggestions.map((s, i) => (
                        <button key={i} onClick={() => setNewCampaign({ ...newCampaign, body: s.text, tone: s.tone })} style={{
                          padding: "16px 18px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                          background: newCampaign.body === s.text ? `${C.primary}15` : "rgba(255,255,255,0.02)",
                          border: `1px solid ${newCampaign.body === s.text ? C.primary : "rgba(255,255,255,0.06)"}`,
                          color: "#fff", transition: "all 0.2s",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <span style={badge(C.primary)}>{s.tone}</span>
                            {newCampaign.body === s.text && <span style={{ color: C.primary, fontSize: 12, fontWeight: 700 }}>✓ Selected</span>}
                          </div>
                          <div style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.75)" }}>{s.text}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Message Body */}
            {(newCampaign.channel === "Email") && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Subject Line</label>
                <input value={newCampaign.subject} onChange={e => setNewCampaign({ ...newCampaign, subject: e.target.value })} placeholder="e.g. Your exclusive offer awaits!" style={inputStyle} />
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Message Body</label>
              <textarea value={newCampaign.body} onChange={e => setNewCampaign({ ...newCampaign, body: e.target.value })} rows={5} placeholder="Write your message... Use {first_name}, {brand_name}, {link} for personalization" style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>Merge tags: {"{first_name}"} {"{brand_name}"} {"{link}"}</div>
                <div style={{ color: C.muted, fontSize: 11 }}>{newCampaign.body.length} chars{newCampaign.channel === "SMS" && ` · ${Math.ceil(newCampaign.body.length / 160) || 0} segment${Math.ceil(newCampaign.body.length / 160) !== 1 ? "s" : ""}`}</div>
              </div>
            </div>

            {/* A/B Test Toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, marginBottom: newCampaign.abTest ? 16 : 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>A/B Testing</div>
                <div style={{ color: C.muted, fontSize: 12 }}>Test two variants and let the winner reach the rest</div>
              </div>
              <button onClick={() => setNewCampaign({ ...newCampaign, abTest: !newCampaign.abTest })} style={{
                width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
                background: newCampaign.abTest ? "#00E676" : "rgba(255,255,255,0.15)",
                position: "relative", transition: "all 0.3s",
              }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: newCampaign.abTest ? 25 : 3, transition: "all 0.3s" }} />
              </button>
            </div>
            {newCampaign.abTest && (
              <div style={{ marginTop: 0 }}>
                <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Variant B Message</label>
                <textarea value={newCampaign.abVariantB} onChange={e => setNewCampaign({ ...newCampaign, abVariantB: e.target.value })} rows={3} placeholder="Write an alternative version to test against..." style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
              <button onClick={() => setCreateStep(1)} style={btnSecondary}>← Back</button>
              <button onClick={() => newCampaign.body && setCreateStep(3)} disabled={!newCampaign.body} style={{ ...btnPrimary, opacity: newCampaign.body ? 1 : 0.4 }}>Next: Audience →</button>
            </div>
          </div>
        )}

        {/* Step 3: Audience */}
        {createStep === 3 && (
          <div style={card}>
            <h2 style={{ color: "#fff", margin: "0 0 24px", fontSize: 18 }}>Select Audience</h2>
            <div style={{ display: "grid", gap: 12 }}>
              {[
                { name: "All Contacts", size: 12400, desc: "Every contact in your database", icon: "👥" },
                { name: "New Subscribers", size: 3200, desc: "Joined in the last 30 days", icon: "🆕" },
                { name: "VIP Segment", size: 1850, desc: "High-value repeat customers", icon: "⭐" },
                { name: "Cart Abandoners", size: 4800, desc: "Left items in cart in the last 7 days", icon: "🛒" },
                { name: "Inactive 30+ Days", size: 2100, desc: "No activity in the last month", icon: "😴" },
                { name: "Recent Purchasers", size: 6200, desc: "Purchased in the last 14 days", icon: "🛍️" },
                { name: "Newsletter List", size: 28500, desc: "Opted in to your newsletter", icon: "📰" },
                { name: "Upcoming Appointments", size: 620, desc: "Appointments in the next 7 days", icon: "📅" },
              ].map(seg => (
                <button key={seg.name} onClick={() => setNewCampaign({ ...newCampaign, audience: seg.name, audienceSize: seg.size })} style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                  background: newCampaign.audience === seg.name ? `${C.primary}15` : "rgba(255,255,255,0.02)",
                  border: `2px solid ${newCampaign.audience === seg.name ? C.primary : "rgba(255,255,255,0.06)"}`,
                  transition: "all 0.2s",
                }}>
                  <span style={{ fontSize: 24 }}>{seg.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{seg.name}</div>
                    <div style={{ color: C.muted, fontSize: 12 }}>{seg.desc}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{seg.size.toLocaleString()}</div>
                    <div style={{ color: C.muted, fontSize: 11 }}>contacts</div>
                  </div>
                  {newCampaign.audience === seg.name && <span style={{ color: C.primary, fontSize: 18, marginLeft: 4 }}>✓</span>}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
              <button onClick={() => setCreateStep(2)} style={btnSecondary}>← Back</button>
              <button onClick={() => setCreateStep(4)} style={btnPrimary}>Next: Schedule →</button>
            </div>
          </div>
        )}

        {/* Step 4: Schedule */}
        {createStep === 4 && (
          <div style={card}>
            <h2 style={{ color: "#fff", margin: "0 0 24px", fontSize: 18 }}>Schedule Delivery</h2>
            <div style={{ display: "grid", gap: 14 }}>
              <button onClick={() => setNewCampaign({ ...newCampaign, sendNow: true })} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "20px 24px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                background: newCampaign.sendNow ? `${C.primary}15` : "rgba(255,255,255,0.02)",
                border: `2px solid ${newCampaign.sendNow ? C.primary : "rgba(255,255,255,0.06)"}`,
              }}>
                <span style={{ fontSize: 28 }}>🚀</span>
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>Send Now</div>
                  <div style={{ color: C.muted, fontSize: 13 }}>Send immediately to {newCampaign.audienceSize.toLocaleString()} contacts</div>
                </div>
                {newCampaign.sendNow && <span style={{ marginLeft: "auto", color: C.primary, fontSize: 20 }}>✓</span>}
              </button>
              <button onClick={() => setNewCampaign({ ...newCampaign, sendNow: false })} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "20px 24px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                background: !newCampaign.sendNow ? `${C.primary}15` : "rgba(255,255,255,0.02)",
                border: `2px solid ${!newCampaign.sendNow ? C.primary : "rgba(255,255,255,0.06)"}`,
              }}>
                <span style={{ fontSize: 28 }}>⏰</span>
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>Schedule for Later</div>
                  <div style={{ color: C.muted, fontSize: 13 }}>Pick a specific date and time</div>
                </div>
                {!newCampaign.sendNow && <span style={{ marginLeft: "auto", color: C.primary, fontSize: 20 }}>✓</span>}
              </button>
            </div>
            {!newCampaign.sendNow && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
                <div>
                  <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Date</label>
                  <input type="date" value={newCampaign.scheduledDate} onChange={e => setNewCampaign({ ...newCampaign, scheduledDate: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Time</label>
                  <input type="time" value={newCampaign.scheduledTime} onChange={e => setNewCampaign({ ...newCampaign, scheduledTime: e.target.value })} style={inputStyle} />
                </div>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
              <button onClick={() => setCreateStep(3)} style={btnSecondary}>← Back</button>
              <button onClick={() => setCreateStep(5)} style={btnPrimary}>Next: Review →</button>
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {createStep === 5 && (
          <div style={card}>
            <h2 style={{ color: "#fff", margin: "0 0 24px", fontSize: 18 }}>Review Campaign</h2>
            <div style={{ display: "grid", gap: 16 }}>
              {[
                { label: "Campaign Name", value: newCampaign.name, icon: "📋" },
                { label: "Channel", value: newCampaign.channel, icon: CHANNEL_ICONS[newCampaign.channel] },
                { label: "Audience", value: `${newCampaign.audience} (${newCampaign.audienceSize.toLocaleString()} contacts)`, icon: "👥" },
                { label: "A/B Testing", value: newCampaign.abTest ? "Enabled (2 variants)" : "Disabled", icon: "🧪" },
                { label: "AI Generated", value: newCampaign.useAI ? `Yes (${newCampaign.tone} tone)` : "No — manual copy", icon: "🤖" },
                { label: "Delivery", value: newCampaign.sendNow ? "Send immediately" : `Scheduled: ${newCampaign.scheduledDate} at ${newCampaign.scheduledTime}`, icon: newCampaign.sendNow ? "🚀" : "⏰" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  <span style={{ color: C.muted, fontSize: 13, width: 140 }}>{item.label}</span>
                  <span style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{item.value}</span>
                </div>
              ))}
            </div>

            {/* Message Preview */}
            <div style={{ marginTop: 24 }}>
              <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Message Preview</label>
              <div style={{ padding: "16px 20px", background: "rgba(0,0,0,0.3)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
                {newCampaign.subject && <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{newCampaign.subject}</div>}
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{newCampaign.body || "(no content)"}</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
              <button onClick={() => setCreateStep(4)} style={btnSecondary}>← Back</button>
              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={() => {
                  const newC = {
                    id: "c" + Date.now(), name: newCampaign.name, channel: newCampaign.channel,
                    status: newCampaign.sendNow ? "active" : "scheduled",
                    audience: newCampaign.audience, audienceSize: newCampaign.audienceSize,
                    sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, failed: 0, optOut: 0, revenue: 0,
                    startDate: newCampaign.sendNow ? new Date() : null,
                    scheduledDate: !newCampaign.sendNow ? new Date(`${newCampaign.scheduledDate}T${newCampaign.scheduledTime}`) : null,
                    endDate: null, abTest: newCampaign.abTest,
                    abVariants: newCampaign.abTest ? [{ name: "A", subject: newCampaign.body.slice(0, 40), ctr: 0, openRate: 0 }, { name: "B", subject: newCampaign.abVariantB.slice(0, 40), ctr: 0, openRate: 0 }] : undefined,
                    body: newCampaign.body, tags: newCampaign.tags, aiGenerated: newCampaign.useAI, tone: newCampaign.tone,
                  };
                  setCampaigns([newC, ...campaigns]);
                  setView("list"); setCreateStep(1);
                  setNewCampaign({ name: "", channel: "SMS", audience: "All Contacts", audienceSize: 12400, body: "", subject: "", abTest: false, abVariantB: "", scheduledDate: "", scheduledTime: "", sendNow: false, tags: [], tone: "Professional", aiTemplate: null, useAI: false });
                  setAiSuggestions([]);
                }} style={btnPrimary}>
                  {newCampaign.sendNow ? "🚀 Launch Campaign" : "⏰ Schedule Campaign"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CAMPAIGN DETAIL VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "detail" && selectedCampaign) {
    const c = selectedCampaign;
    const deliveryRate = c.sent > 0 ? ((c.delivered / c.sent) * 100).toFixed(1) : "0.0";
    const openRate = c.sent > 0 ? ((c.opened / c.sent) * 100).toFixed(1) : "0.0";
    const clickRate = c.sent > 0 ? ((c.clicked / c.sent) * 100).toFixed(1) : "0.0";
    const replyRate = c.sent > 0 ? ((c.replied / c.sent) * 100).toFixed(1) : "0.0";

    return (
      <div style={{ padding: "32px 40px", maxWidth: 1200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button onClick={() => { setView("list"); setSelectedCampaign(null); }} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>← Back to Campaigns</button>
        </div>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: 0 }}>{c.name}</h1>
              <span style={badge(STATUS_COLORS[c.status])}>{STATUS_ICONS[c.status]} {c.status.charAt(0).toUpperCase() + c.status.slice(1)}</span>
              <span style={badge(CHANNEL_COLORS[c.channel])}>{CHANNEL_ICONS[c.channel]} {c.channel}</span>
              {c.aiGenerated && <span style={badge(C.accent)}>🤖 AI</span>}
              {c.abTest && <span style={badge("#FFD600")}>🧪 A/B</span>}
            </div>
            <div style={{ color: C.muted, fontSize: 13 }}>
              {c.audience} · {c.audienceSize.toLocaleString()} contacts
              {c.startDate && ` · Started ${c.startDate.toLocaleDateString()}`}
              {c.tags && c.tags.length > 0 && ` · ${c.tags.join(", ")}`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {c.status === "active" && <button style={{ ...btnSecondary, fontSize: 13, padding: "10px 18px" }}>⏸️ Pause</button>}
            {c.status === "paused" && <button style={{ ...btnPrimary, fontSize: 13, padding: "10px 18px" }}>▶️ Resume</button>}
            <button style={{ ...btnSecondary, fontSize: 13, padding: "10px 18px" }}>📋 Duplicate</button>
          </div>
        </div>

        {/* KPI Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Sent", value: c.sent.toLocaleString(), color: C.primary },
            { label: "Delivered", value: `${deliveryRate}%`, color: "#00E676" },
            { label: "Opened", value: `${openRate}%`, color: "#00C9FF" },
            { label: "Clicked", value: `${clickRate}%`, color: C.accent },
            { label: "Replied", value: `${replyRate}%`, color: "#FF6B35" },
            { label: "Revenue", value: `$${c.revenue.toLocaleString()}`, color: "#00E676" },
          ].map((kpi, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.04)", borderTop: `3px solid ${kpi.color}`, borderRadius: 10, padding: "16px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{kpi.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{kpi.value}</div>
            </div>
          ))}
        </div>

        {/* Engagement Funnel */}
        <div style={{ ...card, marginBottom: 20 }}>
          <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 16 }}>Engagement Funnel</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {[
              { label: "Sent", value: c.sent, color: C.primary },
              { label: "Delivered", value: c.delivered, color: "#00C9FF" },
              { label: "Opened", value: c.opened, color: "#00E676" },
              { label: "Clicked", value: c.clicked, color: C.accent },
              { label: "Replied", value: c.replied, color: "#FF6B35" },
            ].map((step, i) => {
              const maxVal = c.sent || 1;
              const pct = (step.value / maxVal) * 100;
              return (
                <div key={i} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ height: 120, display: "flex", alignItems: "flex-end", justifyContent: "center", marginBottom: 8 }}>
                    <div style={{ width: "70%", height: `${Math.max(pct, 3)}%`, background: `linear-gradient(180deg, ${step.color}, ${step.color}66)`, borderRadius: "6px 6px 0 0", transition: "height 0.5s" }} />
                  </div>
                  <div style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>{step.value.toLocaleString()}</div>
                  <div style={{ color: C.muted, fontSize: 11 }}>{step.label}</div>
                  <div style={{ color: step.color, fontSize: 11, fontWeight: 600 }}>{pct.toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* A/B Test Results */}
          {c.abTest && c.abVariants && (
            <div style={card}>
              <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 16 }}>🧪 A/B Test Results</h3>
              <div style={{ display: "grid", gap: 12 }}>
                {c.abVariants.map((v, i) => {
                  const isWinner = c.status === "completed" && v.ctr >= Math.max(...c.abVariants.map(x => x.ctr));
                  return (
                    <div key={i} style={{ padding: "16px 18px", borderRadius: 10, background: isWinner ? `${C.primary}10` : "rgba(255,255,255,0.02)", border: `2px solid ${isWinner ? C.primary : "rgba(255,255,255,0.06)"}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ ...badge(isWinner ? "#00E676" : C.muted), fontSize: 12 }}>Variant {v.name}</span>
                        {isWinner && <span style={{ color: "#00E676", fontSize: 12, fontWeight: 700 }}>🏆 Winner</span>}
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 10 }}>"{v.subject}"</div>
                      <div style={{ display: "flex", gap: 20 }}>
                        <div><span style={{ color: C.muted, fontSize: 11 }}>Open Rate</span><div style={{ color: "#fff", fontWeight: 700 }}>{v.openRate}%</div></div>
                        <div><span style={{ color: C.muted, fontSize: 11 }}>Click Rate</span><div style={{ color: "#fff", fontWeight: 700 }}>{v.ctr}%</div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Message Preview */}
          <div style={card}>
            <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 16 }}>Message Preview</h3>
            <div style={{ padding: "20px", background: "rgba(0,0,0,0.3)", borderRadius: 12, border: `1px solid ${CHANNEL_COLORS[c.channel]}33` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 16 }}>{CHANNEL_ICONS[c.channel]}</span>
                <span style={{ color: CHANNEL_COLORS[c.channel], fontWeight: 700, fontSize: 13 }}>{c.channel} Message</span>
                {c.tone && <span style={{ color: C.muted, fontSize: 11 }}>· {c.tone} tone</span>}
              </div>
              <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{c.body || "(no content)"}</div>
            </div>
          </div>

          {/* Delivery Breakdown */}
          <div style={card}>
            <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 16 }}>Delivery Breakdown</h3>
            {[
              { label: "Delivered", value: c.delivered, pct: deliveryRate, color: "#00E676" },
              { label: "Failed", value: c.failed, pct: c.sent > 0 ? ((c.failed / c.sent) * 100).toFixed(1) : "0.0", color: "#FF3B30" },
              { label: "Opt-Outs", value: c.optOut, pct: c.sent > 0 ? ((c.optOut / c.sent) * 100).toFixed(2) : "0.0", color: "#FF9800" },
            ].map((item, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{item.label}</span>
                  <span style={{ color: item.color, fontSize: 13, fontWeight: 700 }}>{item.value.toLocaleString()} ({item.pct}%)</span>
                </div>
                <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3 }}>
                  <div style={{ height: "100%", width: `${parseFloat(item.pct)}%`, background: item.color, borderRadius: 3, minWidth: parseFloat(item.pct) > 0 ? 4 : 0 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CAMPAIGN LIST VIEW (default)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ padding: "32px 40px", maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>Campaigns</h1>
          <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>Create, manage, and track your messaging campaigns</p>
        </div>
        <button onClick={() => setView("create")} style={btnPrimary}>+ New Campaign</button>
      </div>

      {/* KPI Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Campaigns", value: campaigns.length, color: C.primary, icon: "🚀" },
          { label: "Active Now", value: activeCampaigns, color: "#00E676", icon: "🟢" },
          { label: "Messages Sent", value: totalSent.toLocaleString(), color: "#00C9FF", icon: "📨" },
          { label: "Avg Open Rate", value: `${avgOpenRate.toFixed(1)}%`, color: C.accent, icon: "👁️" },
          { label: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, color: "#00E676", icon: "💰" },
        ].map((kpi, i) => (
          <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderTop: `3px solid ${kpi.color}`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>{kpi.label}</span>
              <span style={{ fontSize: 16 }}>{kpi.icon}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search campaigns..." style={{ ...inputStyle, width: 280, padding: "10px 16px" }} />
        <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", padding: 4, borderRadius: 8 }}>
          {["all", ...CAMPAIGN_STATUSES].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{
              background: filterStatus === s ? (s === "all" ? C.primary : STATUS_COLORS[s]) : "transparent",
              border: "none", borderRadius: 6, padding: "6px 12px",
              color: filterStatus === s ? "#000" : C.muted,
              cursor: "pointer", fontSize: 12, fontWeight: filterStatus === s ? 700 : 400, textTransform: "capitalize",
            }}>{s === "all" ? "All" : s}</button>
          ))}
        </div>
        <select value={filterChannel} onChange={e => setFilterChannel(e.target.value)} style={{ ...inputStyle, width: 140, padding: "10px 12px" }}>
          <option value="all">All Channels</option>
          {CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}
        </select>
        <div style={{ marginLeft: "auto", color: C.muted, fontSize: 13 }}>{filteredCampaigns.length} campaign{filteredCampaigns.length !== 1 ? "s" : ""}</div>
      </div>

      {/* Campaign List */}
      <div style={{ display: "grid", gap: 8 }}>
        {/* Table Header */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 100px 100px 120px 90px 90px 90px 90px 100px", gap: 12, padding: "8px 20px", alignItems: "center" }}>
          {["Campaign", "Channel", "Status", "Audience", "Sent", "Opened", "Clicked", "Revenue", ""].map((h, i) => (
            <div key={i} style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>{h}</div>
          ))}
        </div>

        {filteredCampaigns.map(c => {
          const openPct = c.sent > 0 ? ((c.opened / c.sent) * 100).toFixed(1) : "—";
          const clickPct = c.sent > 0 ? ((c.clicked / c.sent) * 100).toFixed(1) : "—";
          return (
            <div key={c.id} onClick={() => { setSelectedCampaign(c); setView("detail"); }} style={{
              display: "grid", gridTemplateColumns: "2fr 100px 100px 120px 90px 90px 90px 90px 100px", gap: 12,
              padding: "16px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 10, cursor: "pointer", alignItems: "center", transition: "all 0.2s",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = C.primary + "44"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)"; }}
            >
              {/* Name */}
              <div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  {c.aiGenerated && <span style={{ ...badge(C.accent), padding: "1px 6px", fontSize: 9 }}>AI</span>}
                  {c.abTest && <span style={{ ...badge("#FFD600"), padding: "1px 6px", fontSize: 9 }}>A/B</span>}
                  {c.tags && c.tags.slice(0, 2).map(t => <span key={t} style={{ ...badge("rgba(255,255,255,0.3)"), padding: "1px 6px", fontSize: 9 }}>{t}</span>)}
                </div>
              </div>

              {/* Channel */}
              <div><span style={badge(CHANNEL_COLORS[c.channel])}>{CHANNEL_ICONS[c.channel]} {c.channel}</span></div>

              {/* Status */}
              <div><span style={badge(STATUS_COLORS[c.status])}>{STATUS_ICONS[c.status]} {c.status.charAt(0).toUpperCase() + c.status.slice(1)}</span></div>

              {/* Audience */}
              <div style={{ color: C.muted, fontSize: 13 }}>{c.audienceSize.toLocaleString()}</div>

              {/* Sent */}
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{c.sent > 0 ? c.sent.toLocaleString() : "—"}</div>

              {/* Opened */}
              <div style={{ color: openPct !== "—" ? "#00E676" : C.muted, fontSize: 14, fontWeight: 600 }}>{openPct}{openPct !== "—" ? "%" : ""}</div>

              {/* Clicked */}
              <div style={{ color: clickPct !== "—" ? C.accent : C.muted, fontSize: 14, fontWeight: 600 }}>{clickPct}{clickPct !== "—" ? "%" : ""}</div>

              {/* Revenue */}
              <div style={{ color: c.revenue > 0 ? "#00E676" : C.muted, fontSize: 14, fontWeight: 700 }}>{c.revenue > 0 ? `$${c.revenue.toLocaleString()}` : "—"}</div>

              {/* Action */}
              <div style={{ textAlign: "right" }}>
                <span style={{ color: C.primary, fontSize: 13, fontWeight: 600 }}>View →</span>
              </div>
            </div>
          );
        })}

        {filteredCampaigns.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 4 }}>No campaigns found</div>
            <div style={{ fontSize: 14 }}>Try adjusting your filters or create a new campaign</div>
          </div>
        )}
      </div>
    </div>
  );
}
