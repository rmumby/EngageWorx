import { useState, useEffect, useRef } from "react";

// ─── DEMO DATA ────────────────────────────────────────────────────────────────
const CHANNELS = {
  sms: { label: "SMS", icon: "💬", color: "#00C9FF" },
  email: { label: "Email", icon: "📧", color: "#FF6B35" },
  whatsapp: { label: "WhatsApp", icon: "📱", color: "#25D366" },
  rcs: { label: "RCS", icon: "✨", color: "#7C4DFF" },
  mms: { label: "MMS", icon: "📷", color: "#E040FB" },
  voice: { label: "Voice", icon: "📞", color: "#FFD600" },
};

const AGENTS = [
  { id: "a1", name: "Sarah M.", avatar: "SM", status: "online" },
  { id: "a2", name: "James K.", avatar: "JK", status: "online" },
  { id: "a3", name: "Priya R.", avatar: "PR", status: "away" },
  { id: "a4", name: "Alex D.", avatar: "AD", status: "offline" },
  { id: "bot", name: "AI Bot", avatar: "🤖", status: "online" },
];

const CANNED_RESPONSES = [
  { id: "cr1", label: "Greeting", text: "Hi there! Thanks for reaching out. How can I help you today?" },
  { id: "cr2", label: "Hold", text: "Let me look into that for you. One moment please!" },
  { id: "cr3", label: "Transfer", text: "I'm going to connect you with a specialist who can better assist you." },
  { id: "cr4", label: "Hours", text: "Our support hours are Monday–Friday, 9 AM – 6 PM EST." },
  { id: "cr5", label: "Thank You", text: "Thank you for contacting us! Is there anything else I can help with?" },
  { id: "cr6", label: "Follow Up", text: "Just following up on our previous conversation. Has the issue been resolved?" },
  { id: "cr7", label: "Promo", text: "Great news! You're eligible for our current promotion — 20% off your next order with code SAVE20." },
  { id: "cr8", label: "Escalate", text: "I understand your frustration. Let me escalate this to our senior team for immediate attention." },
];

const TAGS = ["VIP", "Urgent", "New", "Returning", "Complaint", "Sales", "Support", "Billing"];
const TAG_COLORS = { VIP: "#FFD600", Urgent: "#FF3B30", New: "#00E676", Returning: "#00C9FF", Complaint: "#FF6B35", Sales: "#E040FB", Support: "#7C4DFF", Billing: "#6B8BAE" };

function generateConversations() {
  const contacts = [
    { name: "Sarah Johnson", phone: "+1 (555) 234-5678", email: "sarah.j@techflow.com", company: "TechFlow Inc", avatar: "SJ", channel: "sms", tags: ["VIP", "Returning"] },
    { name: "Marcus Chen", phone: "+1 (555) 876-5432", email: "m.chen@apex.co", company: "Apex Retail", avatar: "MC", channel: "whatsapp", tags: ["New", "Sales"] },
    { name: "Emma Rodriguez", phone: "+1 (555) 345-6789", email: "emma.r@meridian.health", company: "Meridian Health", avatar: "ER", channel: "email", tags: ["Support"] },
    { name: "David Kim", phone: "+1 (555) 456-7890", email: "d.kim@pinnacle.fin", company: "Pinnacle Finance", avatar: "DK", channel: "sms", tags: ["Urgent", "Complaint"] },
    { name: "Olivia Patel", phone: "+1 (555) 567-8901", email: "o.patel@verde.com", company: "Verde Foods", avatar: "OP", channel: "rcs", tags: ["VIP"] },
    { name: "James Wilson", phone: "+1 (555) 678-9012", email: "j.wilson@novatech.io", company: "NovaTech", avatar: "JW", channel: "whatsapp", tags: ["Returning", "Support"] },
    { name: "Sophia Taylor", phone: "+1 (555) 789-0123", email: "s.taylor@bright.edu", company: "Bright Horizons", avatar: "ST", channel: "email", tags: ["New"] },
    { name: "Ryan Murphy", phone: "+1 (555) 890-1234", email: "r.murphy@summit.media", company: "Summit Media", avatar: "RM", channel: "sms", tags: ["Sales", "VIP"] },
    { name: "Aisha Brown", phone: "+1 (555) 901-2345", email: "a.brown@atlas.log", company: "Atlas Logistics", avatar: "AB", channel: "mms", tags: ["Billing"] },
    { name: "Noah Garcia", phone: "+1 (555) 012-3456", email: "n.garcia@bluepeak.co", company: "BluePeak", avatar: "NG", channel: "whatsapp", tags: ["Support", "Returning"] },
    { name: "Luna Martinez", phone: "+1 (555) 111-2233", email: "luna.m@corestaff.com", company: "CoreStaff", avatar: "LM", channel: "sms", tags: ["New", "Sales"] },
    { name: "Ben Wright", phone: "+1 (555) 222-3344", email: "ben.w@datawave.io", company: "DataWave", avatar: "BW", channel: "email", tags: ["Support", "Urgent"] },
    { name: "Chloe Adams", phone: "+1 (555) 333-4455", email: "c.adams@ecov.com", company: "EcoVentures", avatar: "CA", channel: "whatsapp", tags: ["VIP", "Returning"] },
    { name: "Tyler Scott", phone: "+1 (555) 444-5566", email: "t.scott@flexport.co", company: "FlexPort", avatar: "TS", channel: "rcs", tags: ["Billing"] },
  ];

  const messageTemplates = [
    // Conversation 0: Sarah Johnson (VIP, order tracking)
    [
      { from: "contact", text: "Hi, I placed an order last week and haven't received a tracking number yet. Order #EW-4521.", time: 45 },
      { from: "agent", text: "Hi Sarah! Let me pull up your order right away.", time: 42, agent: "a1" },
      { from: "agent", text: "I found it — your order #EW-4521 shipped yesterday. Tracking: 1Z999AA10123456784. Expected delivery is Thursday.", time: 40, agent: "a1" },
      { from: "contact", text: "Perfect, thank you! Can I also add another item to a new order?", time: 35 },
      { from: "agent", text: "Of course! What would you like to add?", time: 33, agent: "a1" },
      { from: "contact", text: "The premium package — same as last time. And can you apply my VIP discount?", time: 5 },
    ],
    // Conversation 1: Marcus Chen (new lead)
    [
      { from: "contact", text: "Hey, I saw your ad on Instagram. What kind of plans do you offer?", time: 120 },
      { from: "bot", text: "Hi Marcus! Thanks for your interest 👋 We have 3 plans: Starter ($299/mo), Growth ($799/mo), and Enterprise (custom pricing). Would you like details on any specific plan?", time: 118 },
      { from: "contact", text: "The Growth plan looks interesting. What channels does it include?", time: 90 },
      { from: "bot", text: "Great choice! The Growth plan includes SMS, Email, WhatsApp, and MMS — up to 250,000 messages/month with advanced analytics. Want me to connect you with a sales specialist?", time: 88 },
      { from: "contact", text: "Yes please, and can you send me a comparison sheet?", time: 15 },
    ],
    // Conversation 2: Emma Rodriguez (support ticket)
    [
      { from: "contact", text: "Subject: API Integration Failing\n\nHi team, our webhook endpoint has been returning 502 errors since this morning. We're using the v2 API with Node.js SDK. Error code: GATEWAY_TIMEOUT.", time: 180 },
      { from: "agent", text: "Hi Emma, I'm sorry to hear that. Let me check the status of our API endpoints. Can you share your API key prefix (first 8 characters)?", time: 175, agent: "a2" },
      { from: "contact", text: "It starts with ewx_live_8f3k. We're seeing about 40% of requests failing.", time: 170 },
      { from: "agent", text: "Thank you. I can see there was a brief issue with our US-East gateway between 3:00-4:15 AM UTC. It's been resolved. If you're still seeing errors, please try flushing your DNS cache and restarting the SDK client.", time: 160, agent: "a2" },
      { from: "contact", text: "Restarted and it's working again. Thanks for the quick response!", time: 30 },
    ],
    // Conversation 3: David Kim (urgent complaint)
    [
      { from: "contact", text: "I've been charged twice for the same invoice #INV-2024-887. This is the THIRD time I've had billing issues. I need this resolved NOW.", time: 60 },
      { from: "agent", text: "David, I sincerely apologize for this recurring issue. I'm escalating this to our billing manager immediately. Let me verify — you're seeing two charges of $799 from Feb 20th?", time: 55, agent: "a1" },
      { from: "contact", text: "Yes. $799 x 2. I should only have one charge.", time: 50 },
      { from: "agent", text: "Confirmed. I've initiated a refund of $799 to your card ending in 4821. You'll see it within 3-5 business days. I've also flagged your account to prevent this from happening again.", time: 45, agent: "a1" },
      { from: "contact", text: "Fine. But if this happens again I'm switching providers.", time: 8 },
    ],
    // Conversation 4: Olivia Patel (VIP engagement)
    [
      { from: "agent", text: "Hi Olivia! Just wanted to follow up on the enterprise proposal we sent over last week. Have you had a chance to review it?", time: 200, agent: "a3" },
      { from: "contact", text: "Yes! Our team loved the custom channel routing feature. We have a few questions about the SLA guarantees though.", time: 150 },
      { from: "agent", text: "Great to hear! I'd be happy to walk through the SLAs. We guarantee 99.99% uptime, <200ms message delivery for SMS, and 24/7 priority support for Enterprise plans.", time: 145, agent: "a3" },
      { from: "contact", text: "That sounds solid. Can we schedule a call with your technical team for next Tuesday?", time: 70 },
      { from: "agent", text: "Absolutely! I'll send over a calendar invite. Does 2 PM EST work for your team?", time: 65, agent: "a3" },
      { from: "contact", text: "2 PM works. Please include our CTO — cto@verde.com", time: 3 },
    ],
    // Conversation 5: James Wilson (tech support)
    [
      { from: "contact", text: "Quick question — is there a way to bulk import contacts via the WhatsApp API? Our current process is manual and taking forever.", time: 300 },
      { from: "agent", text: "Hi James! Yes, you can use our POST /v1/contacts/import endpoint with a CSV payload. The WhatsApp channel will automatically validate numbers. Want me to share the documentation?", time: 295, agent: "a2" },
      { from: "contact", text: "That would be great. Also, what's the rate limit on imports?", time: 250 },
      { from: "agent", text: "Here's the docs link: docs.engwx.com/api/contacts/import. Rate limit is 10,000 contacts per batch, up to 100 batches per hour. For larger imports, use our async job endpoint.", time: 245, agent: "a2" },
      { from: "contact", text: "Perfect. One more thing — can we set up a webhook to trigger a welcome message when a contact is imported?", time: 20 },
    ],
    // Conversation 6: Sophia Taylor (new customer onboarding)
    [
      { from: "contact", text: "Subject: Getting Started\n\nHi! We just signed up for the Growth plan. Where do we start with setting up our first campaign?", time: 90 },
      { from: "bot", text: "Welcome to EngageWorx, Sophia! 🎉 Here's your getting started checklist:\n\n1. Set up your sender profile\n2. Import your contacts\n3. Create your first campaign\n4. Configure analytics tracking\n\nWould you like a guided walkthrough?", time: 88 },
      { from: "contact", text: "A walkthrough would be amazing, yes please!", time: 60 },
      { from: "agent", text: "Hi Sophia! I'm James, your onboarding specialist. I'd love to schedule a 30-minute walkthrough. When works best for you this week?", time: 55, agent: "a2" },
      { from: "contact", text: "Thursday afternoon would be ideal!", time: 12 },
    ],
    // Conversation 7: Ryan Murphy (sales, VIP)
    [
      { from: "contact", text: "Hey team, we're looking to upgrade from Growth to Enterprise. We're sending about 500K messages a month now and need dedicated IPs.", time: 480 },
      { from: "agent", text: "Ryan! Exciting to hear about your growth 🚀 Enterprise includes dedicated IPs, custom routing, and a dedicated account manager. Let me prepare a custom proposal based on your usage.", time: 475, agent: "a3" },
      { from: "contact", text: "Sounds good. We'd also need custom SMTP and dedicated short codes.", time: 440 },
      { from: "agent", text: "Noted! I'll include dedicated short code provisioning and custom SMTP relay in the proposal. For your volume, I can offer a very competitive per-message rate. I'll have the proposal to you by EOD tomorrow.", time: 430, agent: "a3" },
      { from: "contact", text: "Looking forward to it. Also loop in my CFO — cfo@summit.media", time: 25 },
    ],
    // Conversation 8: Aisha Brown (billing, MMS)
    [
      { from: "contact", text: "[Image attached: invoice_screenshot.png]\n\nHi, the MMS charges on our latest invoice seem higher than expected. Can you break down the per-message cost?", time: 360 },
      { from: "agent", text: "Hi Aisha! Let me pull up your billing details. One moment please.", time: 355, agent: "a1" },
      { from: "agent", text: "Here's the breakdown: Your plan includes 50,000 MMS messages at $0.03 each. You sent 67,400 MMS messages this month, so the overage of 17,400 messages was billed at $0.05 each ($870 overage).", time: 350, agent: "a1" },
      { from: "contact", text: "Got it. Can we increase our MMS allocation to avoid overage charges?", time: 100 },
    ],
    // Conversation 9: Noah Garcia (support)
    [
      { from: "contact", text: "Is the dashboard loading slow for anyone else? It's taking 10+ seconds for us since yesterday.", time: 75 },
      { from: "bot", text: "Hi Noah! I'm checking the system status for you. One moment please.", time: 73 },
      { from: "bot", text: "Our monitoring shows normal response times. This might be a local issue. Could you try clearing your browser cache and cookies? Also, which browser are you using?", time: 71 },
      { from: "contact", text: "Chrome on Mac. I'll try clearing cache.", time: 40 },
      { from: "contact", text: "That fixed it! Thanks.", time: 2 },
    ],
    // Conversation 10: Luna Martinez
    [
      { from: "contact", text: "Hi! Interested in your SMS marketing tools. Do you support A/B testing?", time: 30 },
      { from: "bot", text: "Hi Luna! Yes, we have built-in A/B testing for campaigns! You can test subject lines, message body, send times, and more. Want to see a demo?", time: 28 },
      { from: "contact", text: "Yes! Can someone walk me through it?", time: 1 },
    ],
    // Conversation 11: Ben Wright (urgent support)
    [
      { from: "contact", text: "Subject: CRITICAL - Messages not delivering\n\nNone of our scheduled campaigns sent out this morning. 50,000 messages stuck in queue. This is affecting our product launch!", time: 15 },
      { from: "agent", text: "Ben, I'm on it right now. Let me check your message queue status immediately.", time: 13, agent: "a2" },
      { from: "agent", text: "I see the issue — your sending domain verification expired overnight. I'm re-verifying it now. Messages should start flowing within 5 minutes.", time: 10, agent: "a2" },
      { from: "contact", text: "Ok please hurry. We have a launch event in 2 hours.", time: 4 },
    ],
    // Conversation 12: Chloe Adams
    [
      { from: "agent", text: "Hi Chloe! Your quarterly business review is coming up next week. Here's a preview of your performance metrics:", time: 500, agent: "a3" },
      { from: "agent", text: "📊 Q4 Highlights:\n• Messages sent: 124,500 (+23% QoQ)\n• Open rate: 58.2% (industry avg: 38%)\n• Revenue attributed: $89,200\n• Best performing campaign: Holiday Flash Sale (72% open rate)", time: 495, agent: "a3" },
      { from: "contact", text: "These numbers look amazing! Can we discuss expanding to the RCS channel in Q1?", time: 200 },
      { from: "agent", text: "Absolutely! RCS would be a great fit for your audience. I'll prepare a channel expansion proposal for our QBR.", time: 195, agent: "a3" },
      { from: "contact", text: "Sounds good. See you Tuesday!", time: 50 },
    ],
    // Conversation 13: Tyler Scott
    [
      { from: "contact", text: "Can you update our billing contact to accounting@flexport.co? The current one is outdated.", time: 400 },
      { from: "agent", text: "Sure thing, Tyler! I've updated your billing contact to accounting@flexport.co. They'll receive all future invoices and payment confirmations.", time: 395, agent: "a1" },
      { from: "contact", text: "Thanks! Also, when does our plan renew?", time: 350 },
      { from: "agent", text: "Your plan renews on March 15th. You're currently on the Growth plan at $799/month. Want me to send a renewal reminder to the new billing contact?", time: 345, agent: "a1" },
      { from: "contact", text: "Yes please. That would be helpful.", time: 120 },
    ],
  ];

  return contacts.map((contact, i) => {
    const msgs = messageTemplates[i] || messageTemplates[0];
    const now = Date.now();
    return {
      id: `conv_${String(i + 1).padStart(3, "0")}`,
      contact,
      channel: contact.channel,
      messages: msgs.map((m, mi) => ({
        id: `msg_${i}_${mi}`,
        from: m.from,
        text: m.text,
        time: new Date(now - m.time * 60000),
        agent: m.agent ? AGENTS.find(a => a.id === m.agent) : m.from === "bot" ? AGENTS.find(a => a.id === "bot") : null,
        read: m.time > 10,
        delivered: true,
      })),
      status: i === 3 || i === 11 ? "urgent" : i === 10 || i === 5 ? "waiting" : i === 9 || i === 13 ? "resolved" : "active",
      assignedTo: msgs[msgs.length - 1].agent ? AGENTS.find(a => a.id === msgs[msgs.length - 1].agent) : AGENTS.find(a => a.id === "bot"),
      unread: i < 4 ? (i === 0 ? 1 : i === 1 ? 1 : 0) : 0,
      lastActivity: new Date(now - msgs[msgs.length - 1].time * 60000),
      isTyping: i === 0,
      priority: i === 3 || i === 11 ? "high" : i === 4 || i === 7 ? "medium" : "normal",
    };
  });
}

function timeAgo(date) {
  const mins = Math.floor((Date.now() - date) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function LiveInbox({ C, tenants, viewLevel = "tenant", currentTenantId }) {
  const [conversations] = useState(() => generateConversations());
  const [selectedConv, setSelectedConv] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterChannel, setFilterChannel] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTag, setFilterTag] = useState("all");
  const [composeText, setComposeText] = useState("");
  const [showCanned, setShowCanned] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(true);
  const [sortBy, setSortBy] = useState("recent");
  const messagesEndRef = useRef(null);
  const composeRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedConv]);

  const filtered = conversations.filter(conv => {
    if (filterChannel !== "all" && conv.channel !== filterChannel) return false;
    if (filterStatus !== "all" && conv.status !== filterStatus) return false;
    if (filterTag !== "all" && !conv.contact.tags.includes(filterTag)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return conv.contact.name.toLowerCase().includes(q) || conv.contact.email.toLowerCase().includes(q) || conv.contact.company.toLowerCase().includes(q) || conv.messages.some(m => m.text.toLowerCase().includes(q));
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === "unread") return b.unread - a.unread || b.lastActivity - a.lastActivity;
    if (sortBy === "priority") { const p = { high: 3, medium: 2, normal: 1 }; return (p[b.priority] || 0) - (p[a.priority] || 0); }
    return b.lastActivity - a.lastActivity;
  });

  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);
  const activeCount = conversations.filter(c => c.status === "active" || c.status === "urgent").length;
  const waitingCount = conversations.filter(c => c.status === "waiting").length;

  const inputStyle = { background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" };

  const handleSend = () => {
    if (!composeText.trim()) return;
    setComposeText("");
    if (composeRef.current) composeRef.current.focus();
  };

  const handleCannedSelect = (text) => {
    setComposeText(text);
    setShowCanned(false);
    if (composeRef.current) composeRef.current.focus();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN LAYOUT: 3-column (list | chat | contact info)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'DM Sans', sans-serif", overflow: "hidden" }}>
      {/* ═══════════ LEFT: Conversation List ═══════════ */}
      <div style={{ width: 340, borderRight: `1px solid rgba(255,255,255,0.06)`, display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.15)", flexShrink: 0 }}>
        {/* Header */}
        <div style={{ padding: "18px 16px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ color: "#fff", margin: 0, fontSize: 18, fontWeight: 800 }}>Live Inbox</h2>
            <div style={{ display: "flex", gap: 6 }}>
              {totalUnread > 0 && <span style={{ background: "#FF3B30", color: "#fff", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{totalUnread}</span>}
              <span style={{ background: `${C.primary}22`, color: C.primary, borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{activeCount} active</span>
            </div>
          </div>

          {/* Search */}
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search conversations..." style={{ ...inputStyle, width: "100%", marginBottom: 8 }} />

          {/* Quick Filters */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[
              { id: "all", label: "All", count: conversations.length },
              { id: "active", label: "Active", count: activeCount },
              { id: "waiting", label: "Waiting", count: waitingCount },
              { id: "urgent", label: "Urgent", count: conversations.filter(c => c.status === "urgent").length },
              { id: "resolved", label: "Resolved", count: conversations.filter(c => c.status === "resolved").length },
            ].map(f => (
              <button key={f.id} onClick={() => setFilterStatus(f.id === "all" ? "all" : f.id)} style={{
                background: filterStatus === (f.id === "all" ? "all" : f.id) ? `${C.primary}22` : "rgba(255,255,255,0.04)",
                border: `1px solid ${filterStatus === (f.id === "all" ? "all" : f.id) ? C.primary + "66" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 6, padding: "4px 8px", fontSize: 10, fontWeight: 600, cursor: "pointer",
                color: filterStatus === (f.id === "all" ? "all" : f.id) ? C.primary : "rgba(255,255,255,0.4)",
                fontFamily: "'DM Sans', sans-serif",
              }}>{f.label} {f.count > 0 && <span style={{ opacity: 0.6 }}>({f.count})</span>}</button>
            ))}
          </div>

          {/* Channel Filter */}
          <div style={{ display: "flex", gap: 3, marginTop: 8 }}>
            <button onClick={() => setFilterChannel("all")} style={{
              background: filterChannel === "all" ? `${C.primary}22` : "transparent", border: "none",
              borderRadius: 4, padding: "3px 6px", fontSize: 10, cursor: "pointer",
              color: filterChannel === "all" ? C.primary : "rgba(255,255,255,0.3)", fontWeight: 600,
            }}>All</button>
            {Object.entries(CHANNELS).map(([key, ch]) => (
              <button key={key} onClick={() => setFilterChannel(key)} title={ch.label} style={{
                background: filterChannel === key ? `${ch.color}22` : "transparent", border: "none",
                borderRadius: 4, padding: "3px 6px", fontSize: 12, cursor: "pointer",
                opacity: filterChannel === key ? 1 : 0.4,
              }}>{ch.icon}</button>
            ))}
          </div>
        </div>

        {/* Conversation List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.map(conv => {
            const lastMsg = conv.messages[conv.messages.length - 1];
            const ch = CHANNELS[conv.channel];
            const isSelected = selectedConv?.id === conv.id;

            return (
              <div key={conv.id} onClick={() => setSelectedConv(conv)} style={{
                padding: "12px 16px", cursor: "pointer", transition: "background 0.15s",
                background: isSelected ? `${C.primary}15` : "transparent",
                borderLeft: isSelected ? `3px solid ${C.primary}` : "3px solid transparent",
                borderBottom: "1px solid rgba(255,255,255,0.03)",
              }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  {/* Avatar */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: `linear-gradient(135deg, ${ch.color}44, ${ch.color}22)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: ch.color }}>{conv.contact.avatar}</div>
                    <div style={{ position: "absolute", bottom: -1, right: -1, fontSize: 12 }}>{ch.icon}</div>
                    {conv.unread > 0 && <div style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "#FF3B30", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff" }}>{conv.unread}</div>}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                      <span style={{ color: "#fff", fontWeight: conv.unread > 0 ? 700 : 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.contact.name}</span>
                      <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, flexShrink: 0, marginLeft: 6 }}>{timeAgo(conv.lastActivity)}</span>
                    </div>
                    <div style={{ color: conv.unread > 0 ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
                      {conv.isTyping ? <span style={{ color: C.primary, fontStyle: "italic" }}>typing...</span> : (lastMsg.from === "contact" ? "" : `${lastMsg.agent?.name || "You"}: `)}
                      {!conv.isTyping && lastMsg.text.slice(0, 60)}{!conv.isTyping && lastMsg.text.length > 60 ? "..." : ""}
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                      {conv.priority === "high" && <span style={{ background: "#FF3B3022", color: "#FF3B30", border: "1px solid #FF3B3044", borderRadius: 4, padding: "0 5px", fontSize: 9, fontWeight: 700 }}>URGENT</span>}
                      {conv.contact.tags.slice(0, 2).map(t => (
                        <span key={t} style={{ background: `${TAG_COLORS[t] || "#6B8BAE"}15`, color: TAG_COLORS[t] || "#6B8BAE", borderRadius: 4, padding: "0 5px", fontSize: 9, fontWeight: 600 }}>{t}</span>
                      ))}
                      {conv.assignedTo && <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 9 }}>→ {conv.assignedTo.name}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
              <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>No conversations found</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 4 }}>Try adjusting your filters</div>
            </div>
          )}
        </div>

        {/* Bottom Stats */}
        <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>{filtered.length} conversations</span>
          <div style={{ display: "flex", gap: 6 }}>
            {AGENTS.filter(a => a.status === "online").slice(0, 3).map(a => (
              <div key={a.id} title={`${a.name} (online)`} style={{ width: 22, height: 22, borderRadius: "50%", background: `${C.primary}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: C.primary, border: "2px solid #00E67633" }}>{a.avatar}</div>
            ))}
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, lineHeight: "22px" }}>online</span>
          </div>
        </div>
      </div>

      {/* ═══════════ CENTER: Chat View ═══════════ */}
      {selectedConv ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Chat Header */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 14, background: "rgba(0,0,0,0.1)" }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: `linear-gradient(135deg, ${CHANNELS[selectedConv.channel].color}44, ${CHANNELS[selectedConv.channel].color}22)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: CHANNELS[selectedConv.channel].color }}>{selectedConv.contact.avatar}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{selectedConv.contact.name}</span>
                <span style={{ fontSize: 12 }}>{CHANNELS[selectedConv.channel].icon}</span>
                <span style={{ color: CHANNELS[selectedConv.channel].color, fontSize: 11 }}>{CHANNELS[selectedConv.channel].label}</span>
                {selectedConv.priority === "high" && <span style={{ background: "#FF3B3022", color: "#FF3B30", border: "1px solid #FF3B3044", borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>URGENT</span>}
              </div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{selectedConv.contact.company} · {selectedConv.contact.phone}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {selectedConv.assignedTo && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "6px 10px" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: `${C.primary}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: C.primary }}>{selectedConv.assignedTo.avatar}</div>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{selectedConv.assignedTo.name}</span>
                </div>
              )}
              <select style={{ ...inputStyle, width: 120, padding: "6px 8px", fontSize: 11 }}>
                <option>Reassign...</option>
                {AGENTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button onClick={() => setShowContactInfo(!showContactInfo)} style={{ background: showContactInfo ? `${C.primary}22` : "rgba(255,255,255,0.04)", border: `1px solid ${showContactInfo ? C.primary + "44" : "rgba(255,255,255,0.08)"}`, borderRadius: 8, padding: "6px 12px", color: showContactInfo ? C.primary : "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>ℹ️ Info</button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
            {/* Date separator */}
            <div style={{ textAlign: "center", margin: "12px 0 20px" }}>
              <span style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "4px 14px", fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Today</span>
            </div>

            {selectedConv.messages.map((msg, i) => {
              const isContact = msg.from === "contact";
              const isBot = msg.from === "bot";
              const showAvatar = i === 0 || selectedConv.messages[i - 1].from !== msg.from;

              return (
                <div key={msg.id} style={{ display: "flex", justifyContent: isContact ? "flex-start" : "flex-end", marginBottom: showAvatar ? 12 : 4, gap: 8, alignItems: "flex-end" }}>
                  {/* Contact avatar */}
                  {isContact && showAvatar && (
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${CHANNELS[selectedConv.channel].color}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: CHANNELS[selectedConv.channel].color, flexShrink: 0 }}>{selectedConv.contact.avatar}</div>
                  )}
                  {isContact && !showAvatar && <div style={{ width: 28, flexShrink: 0 }} />}

                  {/* Message Bubble */}
                  <div style={{ maxWidth: "65%" }}>
                    {showAvatar && !isContact && msg.agent && (
                      <div style={{ textAlign: "right", marginBottom: 2 }}>
                        <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>{msg.agent.name}</span>
                      </div>
                    )}
                    <div style={{
                      background: isContact ? "rgba(255,255,255,0.06)" : isBot ? `${C.accent || C.primary}22` : `${C.primary}22`,
                      border: `1px solid ${isContact ? "rgba(255,255,255,0.08)" : isBot ? `${C.accent || C.primary}33` : `${C.primary}33`}`,
                      borderRadius: isContact ? "14px 14px 14px 4px" : "14px 14px 4px 14px",
                      padding: "10px 14px", color: "rgba(255,255,255,0.85)", fontSize: 13, lineHeight: 1.5,
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}>
                      {isBot && <div style={{ color: C.accent || C.primary, fontSize: 9, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>🤖 AI Assistant</div>}
                      {msg.text}
                    </div>
                    <div style={{ display: "flex", justifyContent: isContact ? "flex-start" : "flex-end", gap: 6, marginTop: 2, alignItems: "center" }}>
                      <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 9 }}>{msg.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      {!isContact && msg.delivered && <span style={{ color: msg.read ? C.primary : "rgba(255,255,255,0.2)", fontSize: 10 }}>{msg.read ? "✓✓" : "✓"}</span>}
                    </div>
                  </div>

                  {/* Agent avatar */}
                  {!isContact && showAvatar && msg.agent && (
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: isBot ? `${C.accent || C.primary}33` : `${C.primary}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: isBot ? 12 : 9, fontWeight: 800, color: C.primary, flexShrink: 0 }}>{msg.agent.avatar}</div>
                  )}
                  {!isContact && !showAvatar && <div style={{ width: 28, flexShrink: 0 }} />}
                </div>
              );
            })}

            {/* Typing indicator */}
            {selectedConv.isTyping && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${CHANNELS[selectedConv.channel].color}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: CHANNELS[selectedConv.channel].color }}>{selectedConv.contact.avatar}</div>
                <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px 14px 14px 4px", padding: "12px 18px" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[0, 1, 2].map(dot => (
                      <div key={dot} style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.3)", animation: `typing 1.4s infinite ${dot * 0.2}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Compose Area */}
          <div style={{ padding: "12px 20px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.1)" }}>
            {/* Canned Responses */}
            {showCanned && (
              <div style={{ marginBottom: 10, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 10, maxHeight: 180, overflowY: "auto" }}>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Quick Responses</div>
                <div style={{ display: "grid", gap: 4 }}>
                  {CANNED_RESPONSES.map(cr => (
                    <button key={cr.id} onClick={() => handleCannedSelect(cr.text)} style={{
                      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 6, padding: "8px 10px", cursor: "pointer", textAlign: "left",
                      color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "'DM Sans', sans-serif",
                      transition: "all 0.15s",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.background = `${C.primary}15`; e.currentTarget.style.borderColor = `${C.primary}33`; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
                    >
                      <span style={{ color: C.primary, fontWeight: 700, fontSize: 10, marginRight: 8 }}>{cr.label}</span>
                      {cr.text.slice(0, 70)}{cr.text.length > 70 ? "..." : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button onClick={() => setShowCanned(!showCanned)} style={{ background: showCanned ? `${C.primary}22` : "rgba(255,255,255,0.04)", border: `1px solid ${showCanned ? C.primary + "44" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, padding: "4px 8px", color: showCanned ? C.primary : "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>⚡ Quick</button>
              <button style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 8px", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>📎 Attach</button>
              <button style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 8px", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>😊 Emoji</button>
              <button style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 8px", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>🤖 AI Suggest</button>
              <div style={{ flex: 1 }} />
              <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10, lineHeight: "24px" }}>via {CHANNELS[selectedConv.channel].label}</span>
            </div>

            {/* Input */}
            <div style={{ display: "flex", gap: 8 }}>
              <textarea ref={composeRef} value={composeText} onChange={e => setComposeText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder={`Reply via ${CHANNELS[selectedConv.channel].label}...`} rows={2} style={{ ...inputStyle, flex: 1, borderRadius: 12, resize: "none", lineHeight: 1.4, padding: "10px 14px" }} />
              <button onClick={handleSend} disabled={!composeText.trim()} style={{
                background: composeText.trim() ? `linear-gradient(135deg, ${C.primary}, ${C.accent || C.primary})` : "rgba(255,255,255,0.06)",
                border: "none", borderRadius: 12, padding: "0 20px", color: composeText.trim() ? "#000" : "rgba(255,255,255,0.2)",
                fontWeight: 700, cursor: composeText.trim() ? "pointer" : "not-allowed", fontSize: 14,
                fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s", alignSelf: "stretch",
              }}>Send</button>
            </div>
          </div>
        </div>
      ) : (
        /* Empty State */
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>💬</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 20, marginBottom: 6 }}>Select a conversation</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Choose from the inbox to start messaging</div>
            <div style={{ display: "flex", gap: 20, justifyContent: "center", marginTop: 28 }}>
              {[
                { label: "Active", value: activeCount, color: C.primary },
                { label: "Waiting", value: waitingCount, color: "#FFD600" },
                { label: "Unread", value: totalUnread, color: "#FF3B30" },
              ].map(s => (
                <div key={s.label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ RIGHT: Contact Info Sidebar ═══════════ */}
      {selectedConv && showContactInfo && (
        <div style={{ width: 280, borderLeft: "1px solid rgba(255,255,255,0.06)", overflowY: "auto", background: "rgba(0,0,0,0.1)", flexShrink: 0 }}>
          <div style={{ padding: "20px 16px" }}>
            {/* Contact Card */}
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: `linear-gradient(135deg, ${CHANNELS[selectedConv.channel].color}44, ${CHANNELS[selectedConv.channel].color}22)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: CHANNELS[selectedConv.channel].color, margin: "0 auto 10px" }}>{selectedConv.contact.avatar}</div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{selectedConv.contact.name}</div>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 2 }}>{selectedConv.contact.company}</div>
              <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 8 }}>
                {selectedConv.contact.tags.map(t => (
                  <span key={t} style={{ background: `${TAG_COLORS[t] || "#6B8BAE"}18`, color: TAG_COLORS[t] || "#6B8BAE", border: `1px solid ${TAG_COLORS[t] || "#6B8BAE"}33`, borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 700 }}>{t}</span>
                ))}
              </div>
            </div>

            {/* Contact Details */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Contact Info</div>
              {[
                { icon: "📧", value: selectedConv.contact.email },
                { icon: "📞", value: selectedConv.contact.phone },
                { icon: "🏢", value: selectedConv.contact.company },
                { icon: "📱", value: CHANNELS[selectedConv.channel].label + " channel" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.03)" : "none" }}>
                  <span style={{ fontSize: 11 }}>{item.icon}</span>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, wordBreak: "break-all" }}>{item.value}</span>
                </div>
              ))}
            </div>

            {/* Conversation Status */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Conversation</div>
              {[
                { label: "Status", value: selectedConv.status.charAt(0).toUpperCase() + selectedConv.status.slice(1), color: selectedConv.status === "urgent" ? "#FF3B30" : selectedConv.status === "active" ? "#00E676" : selectedConv.status === "waiting" ? "#FFD600" : "#6B8BAE" },
                { label: "Priority", value: selectedConv.priority.charAt(0).toUpperCase() + selectedConv.priority.slice(1), color: selectedConv.priority === "high" ? "#FF3B30" : selectedConv.priority === "medium" ? "#FFD600" : "#00E676" },
                { label: "Agent", value: selectedConv.assignedTo?.name || "Unassigned", color: "rgba(255,255,255,0.5)" },
                { label: "Messages", value: selectedConv.messages.length, color: "rgba(255,255,255,0.5)" },
                { label: "Started", value: selectedConv.messages[0].time.toLocaleDateString(), color: "rgba(255,255,255,0.5)" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{item.label}</span>
                  <span style={{ color: item.color, fontSize: 11, fontWeight: 600 }}>{item.value}</span>
                </div>
              ))}
            </div>

            {/* Quick Actions */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Actions</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[
                  { label: "Close", icon: "✅" },
                  { label: "Snooze", icon: "⏰" },
                  { label: "Tag", icon: "🏷️" },
                  { label: "Transfer", icon: "↗️" },
                  { label: "Block", icon: "🚫" },
                  { label: "Add Note", icon: "📝" },
                ].map(action => (
                  <button key={action.label} style={{
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 6, padding: "8px", cursor: "pointer", color: "rgba(255,255,255,0.4)",
                    fontSize: 11, fontFamily: "'DM Sans', sans-serif", textAlign: "center", transition: "all 0.15s",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = `${C.primary}15`; e.currentTarget.style.color = C.primary; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
                  >{action.icon} {action.label}</button>
                ))}
              </div>
            </div>

            {/* Previous Conversations */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 12 }}>
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>History</div>
              {[
                { date: "Feb 14", channel: "SMS", summary: "Order inquiry — resolved" },
                { date: "Jan 28", channel: "Email", summary: "Account setup — resolved" },
                { date: "Jan 15", channel: "WhatsApp", summary: "Product question — resolved" },
              ].map((h, i) => (
                <div key={i} style={{ padding: "6px 0", borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.03)" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{h.channel}</span>
                    <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>{h.date}</span>
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 2 }}>{h.summary}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CSS Animation for typing dots */}
      <style>{`
        @keyframes typing {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
