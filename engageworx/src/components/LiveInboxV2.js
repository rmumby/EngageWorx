import { useState, useEffect, useRef, memo } from "react";
import { useTranslation } from 'react-i18next';
import { DEMO_CONVERSATIONS } from '../demoFixtures';
import { ChatThread, ChatInput } from './chat';
// supabase is passed as a prop from App.jsx to avoid duplicate GoTrueClient instances

function dedupConversations(convos, contactMap, msgMap) {
  // First pass: deduplicate by conversation id (prevents poll duplication)
  var byId = {};
  convos.forEach(function(conv) {
    var existing = byId[conv.id];
    if (!existing) { byId[conv.id] = conv; return; }
    var ts = conv.last_message_at || conv.created_at || '';
    var existTs = existing.last_message_at || existing.created_at || '';
    if (ts > existTs) byId[conv.id] = conv;
  });
  var uniqueConvos = Object.values(byId);

  // Second pass: group by contact_id+channel (only for conversations that have a contact_id)
  var groupKey = {};
  var dedupList = [];
  uniqueConvos.forEach(function(conv) {
    if (!conv.contact_id) {
      dedupList.push(conv);
      return;
    }
    var key = conv.contact_id + '::' + (conv.channel || 'email');
    var ts = conv.last_message_at || conv.created_at || '';
    if (!groupKey[key]) {
      groupKey[key] = { idx: dedupList.length, ts: ts };
      dedupList.push(conv);
    } else {
      if (ts > groupKey[key].ts) {
        groupKey[key].ts = ts;
        dedupList[groupKey[key].idx] = conv;
      }
    }
  });

  return dedupList.map(function(conv) {
    var c = contactMap ? contactMap[conv.contact_id] : null;
    var name = c
      ? ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || c.email || c.phone || 'Unknown'
      : (conv.subject ? conv.subject.replace('Re: ', '').split('<')[0].trim() : conv.channel === 'email' ? 'Email Conversation' : 'Unknown');
    var initials = name.split(' ').map(function(w) { return (w || '')[0]; }).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?';
    var allMsgs = [];
    if (msgMap) {
      // Collect messages from all conversations in this group
      var groupConvIds = conv.contact_id
        ? uniqueConvos.filter(function(cv) { return cv.contact_id === conv.contact_id && (cv.channel || 'email') === (conv.channel || 'email'); }).map(function(cv) { return cv.id; })
        : [conv.id];
      groupConvIds.forEach(function(cid) {
        var msgs = msgMap[cid] || [];
        allMsgs = allMsgs.concat(msgs);
      });
      allMsgs.sort(function(a, b) { return (a.time || 0) - (b.time || 0); });
    }
    if (allMsgs.length === 0) {
      allMsgs = [{ id: 'ph_' + conv.id, from: 'contact', text: conv.subject || 'New conversation', time: conv.last_message_at ? new Date(conv.last_message_at) : new Date(), agent: null, read: true, delivered: true }];
    }
    var totalUnread = conv.contact_id
      ? uniqueConvos.filter(function(cv) { return cv.contact_id === conv.contact_id && (cv.channel || 'email') === (conv.channel || 'email'); }).reduce(function(sum, cv) { return sum + (cv.unread_count || 0); }, 0)
      : (conv.unread_count || 0);
    return {
      id: conv.id,
      contact: { name: name, phone: c ? c.phone || '' : '', email: c ? c.email || '' : '', company: c ? c.company || '' : '', avatar: initials, channel: conv.channel || 'email', tags: c ? c.tags || [] : [] },
      channel: (conv.channel || 'email').toLowerCase(),
      messages: allMsgs,
      status: conv.status || 'active',
      assignedTo: null,
      unread: totalUnread,
      lastActivity: conv.last_message_at ? new Date(conv.last_message_at) : new Date(),
      isTyping: false,
      priority: conv.priority || 'normal',
      subject: conv.subject || '',
      tenant_id: conv.tenant_id,
      contact_id: conv.contact_id,
    };
  });
}

function groupCallsByNumber(callData) {
  var callsByNumber = {};
  callData.forEach(function(call) {
    var num = call.from_number || 'Unknown';
    if (!callsByNumber[num]) callsByNumber[num] = [];
    callsByNumber[num].push(call);
  });
  return Object.keys(callsByNumber).map(function(callerNum) {
    var calls = callsByNumber[callerNum];
    var allCallMsgs = [];
    var hasVoicemail = false;
    calls.forEach(function(call) {
      if (call.transcript) {
        allCallMsgs.push({ id: 'tx_' + call.id, from: 'contact', text: call.transcript, time: call.started_at ? new Date(call.started_at) : new Date(), agent: null, read: true, delivered: true });
      }
      if (call.recording_url) {
        allCallMsgs.push({ id: 'rec_' + call.id, from: 'bot', text: '\ud83c\udf99\ufe0f Voicemail recording available', time: call.started_at ? new Date(call.started_at) : new Date(), agent: { id: 'bot', name: 'Voice System', avatar: '\ud83d\udcde', status: 'online' }, read: true, delivered: true });
        hasVoicemail = true;
      }
      if (!call.transcript && !call.recording_url) {
        allCallMsgs.push({ id: 'ph_' + call.id, from: 'contact', text: 'Voice call (' + (call.status || 'unknown') + ') \u2014 ' + (call.disposition || 'no voicemail'), time: call.started_at ? new Date(call.started_at) : new Date(), agent: null, read: true, delivered: true });
      }
    });
    allCallMsgs.sort(function(a, b) { return (a.time || 0) - (b.time || 0); });
    var latestCall = calls[0];
    return {
      id: 'call_' + latestCall.id,
      contact: { name: callerNum, phone: callerNum, email: '', company: '', avatar: '\ud83d\udcde', channel: 'voice', tags: hasVoicemail ? ['Voicemail'] : [] },
      channel: 'voice',
      messages: allCallMsgs,
      status: 'active',
      assignedTo: null,
      unread: calls.filter(function(c) { return c.status !== 'completed'; }).length,
      lastActivity: latestCall.started_at ? new Date(latestCall.started_at) : new Date(),
      isTyping: false,
      priority: 'normal',
      subject: calls.length > 1 ? calls.length + ' calls from ' + callerNum : 'Voice call from ' + callerNum,
      tenant_id: latestCall.tenant_id,
      contact_id: null,
    };
  });
}

const AGENTS = [
  { id: "a1", name: "Sarah M.", avatar: "SM", status: "online" },
  { id: "a2", name: "James K.", avatar: "JK", status: "online" },
  { id: "a3", name: "Priya R.", avatar: "PR", status: "away" },
  { id: "a4", name: "Alex D.", avatar: "AD", status: "offline" },
  { id: "bot", name: "AI Bot", avatar: "🤖", status: "online" },
];

// ─── DEMO DATA ────────────────────────────────────────────────────────────────
const CHANNELS = {
  sms: { label: "SMS", icon: "💬", color: "#00C9FF" },
  email: { label: "Email", icon: "📧", color: "#FF6B35" },
  whatsapp: { label: "WhatsApp", icon: "📱", color: "#25D366" },
  rcs: { label: "RCS", icon: "✨", color: "#7C4DFF" },
  mms: { label: "MMS", icon: "📷", color: "#E040FB" },
  voice: { label: "Voice", icon: "📞", color: "#FFD600" },
};

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
var LI_SP_TENANT_ID = process.env.REACT_APP_SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387';

function LiveInboxInner({ C: rawC, tenants, viewLevel = "tenant", currentTenantId, demoMode = true, supabase, userProfile }) {
  const { t } = useTranslation();
  var resolvedTenantId = currentTenantId || LI_SP_TENANT_ID;
  var isSPorCSP = viewLevel === 'sp' || viewLevel === 'csp';
  var scopeStorageKey = 'ew_inbox_scope_' + (userProfile && userProfile.id || 'anon');
  var [scopeOwnOnly, setScopeOwnOnly] = useState(function() { try { return localStorage.getItem(scopeStorageKey) === 'own'; } catch(e) { return false; } });
  var [tenantBrandName, setTenantBrandName] = useState('');
  useEffect(function() {
    if (!isSPorCSP || !supabase || !resolvedTenantId) return;
    (async function() { try { var r = await supabase.from('tenants').select('brand_name, name').eq('id', resolvedTenantId).maybeSingle(); if (r.data) setTenantBrandName(r.data.brand_name || r.data.name || ''); } catch(e) {} })();
  }, [resolvedTenantId, isSPorCSP, supabase]);
  function toggleScope() {
    var next = !scopeOwnOnly;
    setScopeOwnOnly(next);
    try { localStorage.setItem(scopeStorageKey, next ? 'own' : 'all'); } catch(e) {}
  }
  // Effective viewLevel: if SP/CSP toggled to "own only", treat as tenant-scoped
  var effectiveViewLevel = (isSPorCSP && scopeOwnOnly) ? 'tenant' : viewLevel;
  console.log('🔵 LiveInbox v7 loaded, demoMode:', demoMode, 'supabase:', !!supabase);
  const C = {
    primary: '#00C9FF', accent: '#E040FB', bg: '#080d1a', surface: '#0d1425',
    border: '#182440', text: '#E8F4FD', muted: '#6B8BAE',
    ...(rawC || {}),
  };

  // ALL hooks must be declared before any conditional return (React rules)
  const [conversations, setConversations] = useState(() => demoMode ? DEMO_CONVERSATIONS : []);
  const [selectedConv, setSelectedConv] = useState(null);
  const [liveError, setLiveError] = useState(null);
  const [liveReady, setLiveReady] = useState(demoMode);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterChannel, setFilterChannel] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  var hideResolvedKey = 'ew_inbox_hide_resolved_' + (userProfile && userProfile.id || 'anon');
  var [hideResolved, setHideResolved] = useState(function() { try { return localStorage.getItem(hideResolvedKey) !== 'false'; } catch(e) { return true; } });
  function toggleHideResolved() { var next = !hideResolved; setHideResolved(next); try { localStorage.setItem(hideResolvedKey, next ? 'true' : 'false'); } catch(e) {} }
  const [filterTag, setFilterTag] = useState("all");
  const [tenantFromEmail, setTenantFromEmail] = useState('');
  useEffect(function() {
    if (demoMode || !supabase || !currentTenantId) return;
    (async function() {
      try {
        var r = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', resolvedTenantId).eq('channel', 'email').maybeSingle();
        if (r.data && r.data.config_encrypted && r.data.config_encrypted.from_email) setTenantFromEmail(r.data.config_encrypted.from_email);
      } catch (e) {}
    })();
  }, [currentTenantId, demoMode, supabase]);
  const [composeText, setComposeText] = useState("");
  const [showCanned, setShowCanned] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(true);
  const [sortBy, setSortBy] = useState("recent");
  const [inboxTab, setInboxTab] = useState("messages");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  useEffect(function() {
    var handler = function() { setIsMobile(window.innerWidth < 768); };
    window.addEventListener("resize", handler);
    return function() { window.removeEventListener("resize", handler); };
  }, []);
  const [liveMessages, setLiveMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [calls, setCalls] = useState([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [selectedCall, setSelectedCall] = useState(null);
  const [fromEmail, setFromEmail] = useState('');
  const [senderEmails, setSenderEmails] = useState([]);
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [newConvSearch, setNewConvSearch] = useState('');
  const [newConvResults, setNewConvResults] = useState([]);
  const [newConvSearching, setNewConvSearching] = useState(false);
  const [newConvContact, setNewConvContact] = useState(null);
  const [newConvManual, setNewConvManual] = useState('');
  const [newConvChannel, setNewConvChannel] = useState('sms');
  const [newConvBody, setNewConvBody] = useState('');
  const [newConvSending, setNewConvSending] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedConvIds, setSelectedConvIds] = useState([]);
  const [bulkActing, setBulkActing] = useState(false);
  const composeRef = useRef(null);
  const openedConvIdsRef = useRef(new Set());

  // Load sender email options — admin sees all, reps see only their own
  var currentUserId = userProfile && userProfile.id;
  var currentUserRole = userProfile && userProfile.role;
  var isAdmin = currentUserRole === 'admin' || currentUserRole === 'superadmin' || currentUserRole === 'owner';
  useEffect(function() {
    if (demoMode || !supabase) return;
    (async function() {
      try {
        var emails = [
          { email: 'rob@engwx.com', label: 'Rob', type: 'default' },
          { email: 'hello@engwx.com', label: 'Hello', type: 'default' },
        ];
        // Tenant's configured from_email
        try {
          var chR = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', resolvedTenantId).eq('channel', 'email').maybeSingle();
          if (chR.data && chR.data.config_encrypted && chR.data.config_encrypted.from_email) {
            var tenantEmail = chR.data.config_encrypted.from_email;
            if (!emails.find(function(e) { return e.email === tenantEmail; })) {
              emails.unshift({ email: tenantEmail, label: 'Tenant default', type: 'tenant' });
            }
          }
        } catch (e) {}
        // Team member emails
        try {
          var tmR = await supabase.from('user_profiles').select('id, email, full_name, role, sender_email').eq('tenant_id', resolvedTenantId);
          (tmR.data || []).forEach(function(p) {
            var senderAddr = p.sender_email || p.email;
            if (!senderAddr) return;
            if (emails.find(function(e) { return e.email === senderAddr; })) return;
            if (isAdmin || p.id === currentUserId) {
              emails.push({ email: senderAddr, label: p.full_name || senderAddr.split('@')[0], type: 'team', profileId: p.id, role: p.role });
            }
          });
        } catch (e) {}
        setSenderEmails(emails);
        if (!fromEmail) setFromEmail('rob@engwx.com');
      } catch (e) { console.warn('[Inbox] sender emails load error:', e.message); }
    })();
  }, [resolvedTenantId, demoMode, supabase]);

  // Empty useEffects for live mode (must run every render to maintain hook count)
  useEffect(() => { if (demoMode) { setConversations(DEMO_CONVERSATIONS); } }, [demoMode]);
  useEffect(() => {
    // Load messages when conversation selected in live mode
    var convId = selectedConv ? selectedConv.id : null;
    if (demoMode || !supabase || !convId) return;
    (async function loadMsgs() {
      try {
        var result = await supabase.from('messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: true });
        var data = result.data;
        console.log('📩 Loaded', (data || []).length, 'messages for conversation', convId);
        if (data && data.length > 0) {
          var mapped = data.map(function(m) {
            return {
              id: m.id,
              from: m.sender_type === 'contact' ? 'contact' : (m.sender_type === 'ai' || m.sender_type === 'bot') ? 'bot' : 'agent',
              text: m.body || '',
              time: m.created_at ? new Date(m.created_at) : new Date(),
              agent: (m.sender_type === 'ai' || m.sender_type === 'bot') ? { id: 'bot', name: 'AI Assistant', avatar: '🤖', status: 'online' } : null,
              read: true,
              delivered: true,
            };
          });
          setSelectedConv(function(prev) { return prev && prev.id === convId ? Object.assign({}, prev, { messages: mapped }) : prev; });
        }
      } catch (e) { console.warn('Message load error:', e.message); }
    })();
  }, [demoMode, selectedConv?.id]);
  // Poll for new conversations every 15 seconds in live mode
  useEffect(() => {
    if (demoMode || !supabase) return;
    if (effectiveViewLevel === 'tenant' && !resolvedTenantId) return;
    var pollInterval = setInterval(function() {
      (async function pollFetch() {
        try {
          var convQuery = effectiveViewLevel === 'tenant'
            ? supabase.from('conversations').select('*').eq('tenant_id', resolvedTenantId)
            : supabase.from('conversations').select('*');
          var convResult = await convQuery;
          var convos = (convResult.data || []).sort(function(a, b) { return (b.last_message_at || b.created_at || '').localeCompare(a.last_message_at || a.created_at || ''); });
          
          var cIds = convos.map(function(c) { return c.contact_id; }).filter(Boolean);
          var uniqueCIds = [...new Set(cIds)];
          var cMap = {};
          if (uniqueCIds.length > 0) {
            var cResult = await supabase.from('contacts').select('id, first_name, last_name, email, phone, company, tags').in('id', uniqueCIds);
            if (cResult.data) cResult.data.forEach(function(c) { cMap[c.id] = c; });
          }
          
          var mMap = {};
          if (convos.length > 0) {
            var mResult = await supabase.from('messages').select('*').in('conversation_id', convos.map(function(c) { return c.id; })).order('created_at', { ascending: true });
            if (mResult.data) mResult.data.forEach(function(m) {
              if (!mMap[m.conversation_id]) mMap[m.conversation_id] = [];
              mMap[m.conversation_id].push({
                id: m.id,
                from: m.sender_type === 'contact' ? 'contact' : (m.sender_type === 'ai' || m.sender_type === 'bot') ? 'bot' : 'agent',
                text: m.body || '',
                time: m.created_at ? new Date(m.created_at) : new Date(),
                agent: (m.sender_type === 'ai' || m.sender_type === 'bot') ? { id: 'bot', name: 'AI Assistant', avatar: '🤖', status: 'online' } : null,
                read: true, delivered: true,
              });
            });
          }
          
          var assembled = dedupConversations(convos, cMap, mMap);

          // Also fetch calls for polling
          try {
            var pollCallQuery = effectiveViewLevel === 'tenant'
              ? supabase.from('calls').select('*').eq('tenant_id', resolvedTenantId).order('started_at', { ascending: false }).limit(50)
              : supabase.from('calls').select('*').order('started_at', { ascending: false }).limit(50);
            var pollCallResult = await pollCallQuery;
            var pollCalls = groupCallsByNumber(pollCallResult.data || []);
            assembled = assembled.concat(pollCalls);
            assembled.sort(function(a, b) { return b.lastActivity - a.lastActivity; });
          } catch (e) { /* silent */ }

          // Preserve locally-read state for opened conversations
          var openedIds = openedConvIdsRef.current;
          if (openedIds.size > 0) {
            assembled = assembled.map(function(c) {
              return openedIds.has(c.id) ? Object.assign({}, c, { unread: 0 }) : c;
            });
          }
          setConversations(assembled);

          // Also refresh selected conversation messages
          if (selectedConv) {
            var selMsgs = mMap[selectedConv.id];
            if (selMsgs && selMsgs.length > (selectedConv.messages || []).length) {
              setSelectedConv(function(prev) { return prev ? Object.assign({}, prev, { messages: selMsgs }) : prev; });
            }
          }
        } catch (e) { /* silent poll error */ }
      })();
    }, 15000);
    return function() { clearInterval(pollInterval); };
  }, [demoMode, supabase, currentTenantId, viewLevel, scopeOwnOnly]);
  useEffect(() => {}, [demoMode, selectedConv?.id, inboxTab]);
  // Scroll handled by ChatThread

  // In live mode, fetch conversations using supabase prop
  const [liveLoading, setLiveLoading] = useState(!demoMode);
useEffect(function() {
  if (demoMode || !supabase) return;
  if (effectiveViewLevel === 'tenant' && !resolvedTenantId) return;
  (async function() {
    try {
      var tmQuery = supabase.from('tenant_members').select('user_id, role').eq('status', 'active');
      if (effectiveViewLevel === 'tenant') tmQuery = tmQuery.eq('tenant_id', resolvedTenantId);
      var tmRes = await tmQuery;
      var memberData = tmRes.data || [];
      if (memberData.length === 0) return;
      var userIds = memberData.map(function(m) { return m.user_id; }).filter(Boolean);
      var profRes = await supabase.from('user_profiles').select('id, full_name, email').in('id', userIds);
      var profMap = {};
      (profRes.data || []).forEach(function(p) { profMap[p.id] = p; });
      memberData.forEach(function(m) {
        var p = profMap[m.user_id] || {};
        var name = p.full_name || (p.email ? p.email.split('@')[0] : 'Team Member');
        var avatar = name.split(' ').map(function(n) { return n[0] || ''; }).join('').toUpperCase().slice(0, 2);
      });
    } catch (e) {}
  })();
}, [demoMode, supabase, currentTenantId, viewLevel, scopeOwnOnly]);
  useEffect(() => {
    if (demoMode || !supabase) { setLiveLoading(false); return; }
    if (effectiveViewLevel === 'tenant' && !resolvedTenantId) { setLiveLoading(false); setConversations([]); return; }

    async function fetchAll() {
      try {
        console.log('🟡 Starting fetch...');
        console.log('🟡 currentTenantId:', currentTenantId, 'viewLevel:', viewLevel);
        // 1. Conversations
        const convQuery = effectiveViewLevel === 'tenant'
          ? supabase.from('conversations').select('*').eq('tenant_id', resolvedTenantId)
          : supabase.from('conversations').select('*');
        const { data: convData, error: convError } = await convQuery;
        if (convError) { console.warn('Conv error:', convError.message); setLiveLoading(false); return; }
        const convos = (convData || []).sort((a, b) => (b.last_message_at || b.created_at || '').localeCompare(a.last_message_at || a.created_at || ''));
        console.log('🟡 Found', convos.length, 'conversations');

        // 2. Contacts
        const cIds = convos.map(c => c.contact_id).filter(Boolean);
        const uniqueCIds = [...new Set(cIds)];
        var contactMap = {};
        if (uniqueCIds.length > 0) {
          const { data: cData } = await supabase.from('contacts').select('id, first_name, last_name, email, phone, company, tags').in('id', uniqueCIds);
          if (cData) cData.forEach(function(c) { contactMap[c.id] = c; });
        }

        // 3. Messages
        var msgMap = {};
        if (convos.length > 0) {
          const { data: mData } = await supabase.from('messages').select('*').in('conversation_id', convos.map(function(c) { return c.id; })).order('created_at', { ascending: true });
          if (mData) mData.forEach(function(m) {
            if (!msgMap[m.conversation_id]) msgMap[m.conversation_id] = [];
            msgMap[m.conversation_id].push({
              id: m.id,
              from: m.sender_type === 'contact' ? 'contact' : (m.sender_type === 'ai' || m.sender_type === 'bot') ? 'bot' : 'agent',
              text: m.body || '',
              time: m.created_at ? new Date(m.created_at) : new Date(),
              agent: (m.sender_type === 'ai' || m.sender_type === 'bot') ? { id: 'bot', name: 'AI Assistant', avatar: '🤖', status: 'online' } : null,
              read: true,
              delivered: true,
            });
          });
        }

        // 4. Deduplicate and assemble
        var result = dedupConversations(convos, contactMap, msgMap);
        console.log('🟢 Assembled', result.length, 'deduped conversations from', convos.length, 'raw');

        // 5. Fetch calls and add as grouped voice conversations
        try {
          var callQuery = effectiveViewLevel === 'tenant'
            ? supabase.from('calls').select('*').eq('tenant_id', resolvedTenantId).order('started_at', { ascending: false }).limit(50)
            : supabase.from('calls').select('*').order('started_at', { ascending: false }).limit(50);
          var callResult = await callQuery;
          var callData = callResult.data || [];
          console.log('📞 Found', callData.length, 'calls');
          var callConvos = groupCallsByNumber(callData);
          result = result.concat(callConvos);
          result.sort(function(a, b) { return b.lastActivity - a.lastActivity; });
        } catch (callErr) {
          console.warn('Calls fetch error:', callErr.message);
        }

        console.log('🟢 Total items (conversations + calls):', result.length);
        setConversations(result);
      } catch (err) {
        console.warn('Live inbox error:', err.message);
      }
      setLiveLoading(false);
    }
    
    fetchAll();
  }, [demoMode, currentTenantId, viewLevel, scopeOwnOnly]); // eslint-disable-line

  // Live mode renders the full inbox immediately - conversations populate async


  async function newConvSearchContacts(query) {
    if (!query.trim() || !supabase || !currentTenantId) return;
    setNewConvSearching(true);
    try {
      var pattern = '%' + query.trim() + '%';
      var r = await supabase.from('contacts').select('id, first_name, last_name, email, phone, mobile_phone, whatsapp_number, company')
        .eq('tenant_id', resolvedTenantId)
        .or('first_name.ilike.' + pattern + ',last_name.ilike.' + pattern + ',email.ilike.' + pattern + ',phone.ilike.' + pattern + ',company.ilike.' + pattern)
        .limit(10);
      setNewConvResults(r.data || []);
    } catch (e) { console.warn('newConv search error:', e); }
    setNewConvSearching(false);
  }

  function toggleConvSelect(id) {
    setSelectedConvIds(function(prev) { return prev.indexOf(id) > -1 ? prev.filter(function(x) { return x !== id; }) : prev.concat([id]); });
  }

  async function bulkUpdateStatus(newStatus) {
    if (selectedConvIds.length === 0) return;
    setBulkActing(true);
    try {
      if (!demoMode && supabase) {
        await supabase.from('conversations').update({ status: newStatus }).in('id', selectedConvIds);
      }
      setConversations(function(prev) { return prev.map(function(c) { return selectedConvIds.indexOf(c.id) > -1 ? Object.assign({}, c, { status: newStatus }) : c; }); });
      setSelectedConvIds([]);
      setSelectMode(false);
    } catch (e) { alert('Bulk update error: ' + e.message); }
    setBulkActing(false);
  }

  async function sendNewConversation() {
    var recipient = '';
    var contactId = null;
    var contactName = '';
    if (newConvContact) {
      contactId = newConvContact.id;
      contactName = ((newConvContact.first_name || '') + ' ' + (newConvContact.last_name || '')).trim();
      if (newConvChannel === 'email') recipient = newConvContact.email || '';
      else if (newConvChannel === 'whatsapp') recipient = newConvContact.whatsapp_number || newConvContact.mobile_phone || newConvContact.phone || '';
      else recipient = newConvContact.mobile_phone || newConvContact.phone || '';
    } else {
      recipient = newConvManual.trim();
      contactName = recipient;
    }
    if (!recipient) { alert('Select a contact or enter a number/email.'); return; }
    if (!newConvBody.trim()) { alert('Write a message.'); return; }
    setNewConvSending(true);
    try {
      // Create or find contact if manual entry
      if (!contactId && supabase) {
        var isEmail = recipient.indexOf('@') > 0;
        console.log('[NewConv] finding/creating contact: recipient=' + recipient + ' isEmail=' + isEmail + ' tenantId=' + resolvedTenantId);
        if (isEmail) {
          var ec = await supabase.from('contacts').select('id, first_name, last_name').eq('email', recipient).eq('tenant_id', resolvedTenantId).maybeSingle();
          if (ec.data) { contactId = ec.data.id; contactName = ((ec.data.first_name || '') + ' ' + (ec.data.last_name || '')).trim() || recipient; }
          else {
            var ins = await supabase.from('contacts').insert({ tenant_id: resolvedTenantId, email: recipient, first_name: recipient.split('@')[0], status: 'active' }).select('id').single();
            if (ins.error) console.error('[NewConv] contact insert error:', ins.error.message);
            if (ins.data) contactId = ins.data.id;
          }
        } else {
          var pc = await supabase.from('contacts').select('id, first_name, last_name').eq('phone', recipient).eq('tenant_id', resolvedTenantId).maybeSingle();
          if (pc.data) { contactId = pc.data.id; contactName = ((pc.data.first_name || '') + ' ' + (pc.data.last_name || '')).trim() || recipient; }
          else {
            var pins = await supabase.from('contacts').insert({ tenant_id: resolvedTenantId, phone: recipient, mobile_phone: recipient, first_name: recipient, status: 'active' }).select('id').single();
            if (pins.error) console.error('[NewConv] contact insert error:', pins.error.message);
            if (pins.data) contactId = pins.data.id;
          }
        }
        console.log('[NewConv] contact resolved: id=' + contactId);
      }
      // Find existing active conversation or create new one
      var existingConvId = null;
      if (contactId && supabase) {
        var existCheck = await supabase.from('conversations').select('id').eq('tenant_id', resolvedTenantId).eq('contact_id', contactId).eq('channel', newConvChannel).in('status', ['active', 'waiting', 'snoozed']).order('last_message_at', { ascending: false }).limit(1).maybeSingle();
        if (existCheck.data) existingConvId = existCheck.data.id;
      }
      var convId;
      if (existingConvId) {
        console.log('[NewConv] reusing existing conversation:', existingConvId);
        await supabase.from('conversations').update({ last_message_at: new Date().toISOString(), status: 'active' }).eq('id', existingConvId);
        convId = existingConvId;
      } else {
        console.log('[NewConv] creating conversation: tenant=' + resolvedTenantId + ' contact=' + contactId + ' channel=' + newConvChannel);
        var convPayload = {
          tenant_id: resolvedTenantId, contact_id: contactId || null,
          channel: newConvChannel, status: 'active',
          subject: 'New: ' + contactName,
          last_message_at: new Date().toISOString(), unread_count: 0,
        };
        var convRes = await supabase.from('conversations').insert(convPayload).select('id').single();
        if (convRes.error) {
          console.error('[NewConv] INSERT ERROR:', convRes.error.message, convRes.error.details, convRes.error.hint, 'payload:', JSON.stringify(convPayload));
          throw new Error('Failed to create conversation: ' + convRes.error.message);
        }
        if (!convRes.data) throw new Error('Failed to create conversation: no data returned');
        convId = convRes.data.id;
      }
      // Insert message
      await supabase.from('messages').insert({
        tenant_id: resolvedTenantId, conversation_id: convId,
        contact_id: contactId, channel: newConvChannel,
        direction: 'outbound', sender_type: 'agent',
        body: newConvBody.trim(), status: 'delivered',
        metadata: fromEmail ? { from_email: fromEmail } : null,
        created_at: new Date().toISOString(),
      });
      // Send via channel API
      if (newConvChannel === 'sms' && recipient) {
        var smsEndpoint = recipient.indexOf('+48') === 0 ? '/api/poland-carrier?action=sms-outbound' : '/api/sms';
        var smsPayload = recipient.indexOf('+48') === 0
          ? { to: recipient, body: newConvBody.trim(), tenant_id: resolvedTenantId }
          : { action: 'send', to: recipient, body: newConvBody.trim(), tenant_id: resolvedTenantId };
        try { await fetch(smsEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(smsPayload) }); } catch (e) {}
      }
      if (newConvChannel === 'email' && recipient) {
        try { await fetch('/api/send-digest-reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: recipient, subject: 'Hello from ' + (contactName || 'us'), body: newConvBody.trim(), from: fromEmail || undefined }) }); } catch (e) {}
      }
      if (newConvChannel === 'whatsapp' && recipient) {
        try {
          var waNewRes = await fetch('/api/whatsapp?action=send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: recipient, body: newConvBody.trim(), tenant_id: resolvedTenantId }),
          });
          if (!waNewRes.ok) {
            var waNewErr = await waNewRes.json().catch(function() { return {}; });
            alert('WhatsApp delivery failed: ' + (waNewErr.error || 'Unknown error'));
          }
        } catch (e) {
          console.warn('WhatsApp new conv send error:', e.message);
        }
      }
      // Reset and close
      setNewConvOpen(false); setNewConvSearch(''); setNewConvResults([]); setNewConvContact(null); setNewConvManual(''); setNewConvBody(''); setNewConvChannel('sms');
      // Reload conversations with dedup
      if (!demoMode) {
        try {
          var reloadConvResult = await supabase.from('conversations').select('*').eq('tenant_id', resolvedTenantId).order('last_message_at', { ascending: false }).limit(200);
          var reloadConvos = reloadConvResult.data || [];
          var reloadCIds = [...new Set(reloadConvos.map(function(c) { return c.contact_id; }).filter(Boolean))];
          var reloadContactMap = {};
          if (reloadCIds.length > 0) {
            var reloadCResult = await supabase.from('contacts').select('id, first_name, last_name, email, phone, company, tags').in('id', reloadCIds);
            if (reloadCResult.data) reloadCResult.data.forEach(function(c) { reloadContactMap[c.id] = c; });
          }
          setConversations(dedupConversations(reloadConvos, reloadContactMap, null));
        } catch (e) {}
      }
    } catch (e) { alert('Error: ' + e.message); }
    setNewConvSending(false);
  }

  const handleSendLive = async () => {
    if (!composeText.trim() || !selectedConv) return;
    setSendingMessage(true);
    try {
      const messageBody = composeText.trim();
      setComposeText("");

      // Insert message into Supabase
      if (!supabase) return;
      var insertResult = await supabase.from('messages').insert({
        tenant_id: selectedConv.tenant_id || currentTenantId,
        conversation_id: selectedConv.id,
        contact_id: selectedConv.contact_id || null,
        direction: 'outbound',
        channel: selectedConv.channel || 'email',
        body: messageBody,
        status: 'delivered',
        sender_type: 'agent',
        metadata: fromEmail ? { from_email: fromEmail } : null,
        created_at: new Date().toISOString(),
      });
      if (insertResult.error) { console.error('Message insert error:', insertResult.error.message); throw insertResult.error; }

      // Update conversation
      await supabase.from('conversations').update({
        last_message_at: new Date().toISOString(),
        status: 'active',
      }).eq('id', selectedConv.id);

      // Send via API based on channel
      if (selectedConv.channel === 'sms' && selectedConv.contact?.phone) {
        try {
          await fetch('/api/sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: selectedConv.contact.phone,
              body: messageBody,
              tenantId: selectedConv.tenant_id || currentTenantId,
            }),
          });
        } catch (smsErr) {
          console.warn('SMS send error:', smsErr.message);
        }
      }
      if (selectedConv.channel === 'email' && selectedConv.contact?.email) {
        try {
          await fetch('/api/send-digest-reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: selectedConv.contact.email,
              subject: selectedConv.subject ? 'Re: ' + selectedConv.subject : 'Re: your message',
              body: messageBody,
              from: fromEmail || undefined,
            }),
          });
        } catch (emailErr) {
          console.warn('Email send error:', emailErr.message);
        }
      }
      if (selectedConv.channel === 'whatsapp' && (selectedConv.contact?.whatsapp_number || selectedConv.contact?.mobile_phone || selectedConv.contact?.phone)) {
        try {
          var waRes = await fetch('/api/whatsapp?action=send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: selectedConv.contact.whatsapp_number || selectedConv.contact.mobile_phone || selectedConv.contact.phone,
              body: messageBody,
              tenant_id: selectedConv.tenant_id || currentTenantId,
            }),
          });
          if (!waRes.ok) {
            var waErrData = await waRes.json().catch(function() { return {}; });
            console.error('WhatsApp send failed:', waErrData.error || waRes.status);
            if (waRes.status === 429) {
              alert('Message limit reached for this tenant. Upgrade or purchase a top-up.');
            } else if (waErrData.error && waErrData.error.indexOf('outside') >= 0) {
              alert('WhatsApp 24-hour window expired. Send a template message instead.');
            } else {
              alert('WhatsApp delivery failed: ' + (waErrData.error || 'Unknown error'));
            }
          }
        } catch (waFetchErr) {
          console.warn('WhatsApp send error:', waFetchErr.message);
        }
      }

      // Optimistically add message to UI
      var optimisticMsg = {
        id: 'temp_' + Date.now(),
        from: 'agent',
        text: messageBody,
        time: new Date(),
        status: 'sent',
        channel: selectedConv.channel,
        sentAt: new Date().toISOString(),
      };
      setSelectedConv(prev => prev ? { ...prev, messages: [...(prev.messages || []), optimisticMsg] } : prev);

      // Auto-update preferred_channel if the channel used differs
      var usedChannel = (selectedConv.channel || '').toLowerCase();
      var contactId = selectedConv.contact_id || null;
      if (contactId && usedChannel) {
        try {
          var prefR = await supabase.from('contacts').select('preferred_channel').eq('id', contactId).maybeSingle();
          if (prefR.data && prefR.data.preferred_channel !== usedChannel) {
            await supabase.from('contacts').update({ preferred_channel: usedChannel }).eq('id', contactId);
          }
        } catch (prefErr) {}
      }
    } catch (err) {
      console.error('Send error:', err);
      setComposeText(composeText); // Restore on error
    }
    setSendingMessage(false);
    if (composeRef.current) composeRef.current.focus();
  };

  // Scroll effect removed - using the one at line 262

  const filtered = conversations.filter(conv => {
    if (filterChannel !== "all" && conv.channel !== filterChannel) return false;
    // Filter by status — "All" uses the hideResolved toggle; specific tabs show only that status
    if (filterStatus === "all") {
      if (hideResolved && conv.status === "resolved") return false;
      if (conv.status === "spam") return false;
    } else if (filterStatus !== "all" && conv.status !== filterStatus) return false;
    if (filterTag !== "all" && !conv.contact.tags.includes(filterTag)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      // Search across ALL conversations including resolved
      return conv.contact.name.toLowerCase().includes(q) || conv.contact.email.toLowerCase().includes(q) || conv.contact.company.toLowerCase().includes(q) || (conv.messages || []).some(m => m.text.toLowerCase().includes(q));
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === "unread") return b.unread - a.unread || b.lastActivity - a.lastActivity;
    if (sortBy === "priority") { const p = { high: 3, medium: 2, normal: 1 }; return (p[b.priority] || 0) - (p[a.priority] || 0); }
    return b.lastActivity - a.lastActivity;
  });

  const totalUnread = conversations.filter(c => c.status !== 'spam' && (!hideResolved || c.status !== 'resolved')).reduce((s, c) => s + c.unread, 0);
  const activeCount = conversations.filter(c => c.status === "active" || c.status === "urgent").length;
  const waitingCount = conversations.filter(c => c.status === "waiting").length;

  const inputStyle = { background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" };

  const handleSend = () => {
    if (!composeText.trim()) return;
    if (!demoMode) {
      handleSendLive();
      return;
    }
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
  // Show loading screen until data is ready (prevents render crashes)
  // Errors shown inline in the conversation list

  return (
    <div style={{ display: "flex", height: isMobile ? "100vh" : "calc(100vh - 32px)", fontFamily: "'DM Sans', sans-serif", overflow: "hidden", position: "relative" }}>
      {/* ═══════════ LEFT: Conversation List ═══════════ */}
      <div style={{ width: isMobile ? "100%" : 320, minWidth: isMobile ? 0 : 280, borderRight: isMobile ? "none" : "1px solid rgba(255,255,255,0.06)", display: isMobile && mobileShowChat ? "none" : "flex", flexDirection: "column", background: "rgba(0,0,0,0.15)", flexShrink: 0 }}>
        {/* Header */}
        <div style={{ padding: "18px 16px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ color: "#fff", margin: 0, fontSize: 18, fontWeight: 800 }}>{t('inbox.title')}</h2>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {totalUnread > 0 && <span style={{ background: "#FF3B30", color: "#fff", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{totalUnread}</span>}
              <span style={{ background: `${C.primary}22`, color: C.primary, borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{activeCount} active</span>
              <button onClick={function() { setSelectMode(!selectMode); if (selectMode) setSelectedConvIds([]); }} style={{ background: selectMode ? C.primary + "22" : "rgba(255,255,255,0.06)", border: "1px solid " + (selectMode ? C.primary : "rgba(255,255,255,0.1)"), borderRadius: 6, height: 26, padding: "0 8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 10, color: selectMode ? C.primary : "rgba(255,255,255,0.4)", fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }} title="Select conversations">{selectMode ? "✕" : "☑"}</button>
              {!demoMode && <button onClick={function() { setNewConvOpen(true); }} style={{ background: C.primary, border: "none", borderRadius: 6, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14, color: "#000", fontWeight: 800, lineHeight: 1, padding: 0 }} title="New Conversation">✏️</button>}
            </div>
          </div>

          {/* Scope toggle — SP/CSP only */}
          {isSPorCSP && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              <button onClick={function() { if (scopeOwnOnly) toggleScope(); }} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", background: !scopeOwnOnly ? C.primary + '22' : 'rgba(255,255,255,0.04)', color: !scopeOwnOnly ? C.primary : 'rgba(255,255,255,0.35)' }}>All tenants</button>
              <button onClick={function() { if (!scopeOwnOnly) toggleScope(); }} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", background: scopeOwnOnly ? C.primary + '22' : 'rgba(255,255,255,0.04)', color: scopeOwnOnly ? C.primary : 'rgba(255,255,255,0.35)' }}>{tenantBrandName || 'Own'} only</button>
            </div>
          )}

          {/* Hide resolved toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div onClick={toggleHideResolved} style={{ width: 32, height: 18, borderRadius: 9, position: 'relative', background: hideResolved ? C.primary : 'rgba(255,255,255,0.15)', cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0 }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: hideResolved ? 16 : 2, transition: 'all 0.2s' }} />
            </div>
            <span style={{ color: hideResolved ? C.primary : 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: 600 }}>Hide resolved</span>
          </div>

          {/* Tab Switcher: Messages | Calls */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10, background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 3 }}>
            {[
              { id: "all", label: "💬 " + t('inbox.all') },
              { id: "messages", label: t('inbox.messages') },
              { id: "calls", label: "📞 " + t('inbox.calls') },
            ].map(tab => (
              <button key={tab.id} onClick={() => setInboxTab(tab.id)} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", background: inboxTab === tab.id ? `${C.primary}22` : "transparent", color: inboxTab === tab.id ? C.primary : "rgba(255,255,255,0.4)", transition: "all 0.2s" }}>{tab.label}</button>
            ))}
          </div>

          {/* Search */}
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={t('inbox.searchPlaceholder')} style={{ ...inputStyle, width: "100%", marginBottom: 8 }} />

          {/* Quick Filters */}
          <div style={{ display: "flex", gap: 4, flexWrap: isMobile ? "nowrap" : "wrap", overflowX: isMobile ? "auto" : "visible" }}>
            {[
              { id: "all", label: t('inbox.all'), count: conversations.filter(c => c.status !== "spam" && (!hideResolved || c.status !== "resolved")).length },
              { id: "active", label: t('inbox.active'), count: activeCount },
              { id: "waiting", label: t('inbox.waiting'), count: waitingCount },
              { id: "urgent", label: t('inbox.urgent'), count: conversations.filter(c => c.status === "urgent").length },
              { id: "resolved", label: t('inbox.resolved'), count: conversations.filter(c => c.status === "resolved").length },
              { id: "spam", label: t('inbox.spam'), count: conversations.filter(c => c.status === "spam").length },
            ].map(f => (
              <button key={f.id} onClick={() => setFilterStatus(f.id === "all" ? "all" : f.id)} style={{
                background: filterStatus === (f.id === "all" ? "all" : f.id) ? `${C.primary}22` : "rgba(255,255,255,0.04)",
                border: `1px solid ${filterStatus === (f.id === "all" ? "all" : f.id) ? C.primary + "66" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 6, padding: "4px 8px", fontSize: 10, fontWeight: 600, cursor: "pointer",
                color: filterStatus === (f.id === "all" ? "all" : f.id) ? C.primary : "rgba(255,255,255,0.4)",
                fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap", flexShrink: 0,
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

        {/* Conversation List (Messages tab) */}
        {(inboxTab === "messages" || inboxTab === "all") && (<div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.map(conv => {
            const msgs = conv.messages || [];
            const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : { from: 'system', text: conv.subject || 'New conversation', agent: null };
            const ch = CHANNELS[conv.channel];
            const isSelected = selectedConv?.id === conv.id;

            return (
              <div key={conv.id} onClick={function() { if (selectMode) { toggleConvSelect(conv.id); return; } setSelectedConv(conv); if (isMobile) setMobileShowChat(true); openedConvIdsRef.current.add(conv.id); if (conv.unread > 0) { setConversations(function(prev) { return prev.map(function(c) { return c.id === conv.id ? Object.assign({}, c, { unread: 0 }) : c; }); }); if (!demoMode && supabase) { supabase.from('conversations').update({ unread_count: 0 }).eq('id', conv.id); supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('conversation_id', conv.id).eq('direction', 'inbound').is('read_at', null); } } }} style={{
                padding: "16px 16px", cursor: "pointer", transition: "background 0.15s",
                background: selectedConvIds.indexOf(conv.id) > -1 ? C.primary + "18" : (isSelected ? C.primary + "15" : "transparent"),
                borderLeft: selectedConvIds.indexOf(conv.id) > -1 ? "3px solid " + C.primary : (isSelected ? "3px solid " + C.primary : "3px solid transparent"),
                borderBottom: "1px solid rgba(255,255,255,0.03)",
              }}
                onMouseEnter={e => { if (!isSelected && selectedConvIds.indexOf(conv.id) < 0) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={e => { if (!isSelected && selectedConvIds.indexOf(conv.id) < 0) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  {selectMode && (
                    <div style={{ paddingTop: 12, flexShrink: 0 }}>
                      <input type="checkbox" checked={selectedConvIds.indexOf(conv.id) > -1} onChange={function() { toggleConvSelect(conv.id); }} onClick={function(e) { e.stopPropagation(); }} style={{ cursor: "pointer", width: 16, height: 16, accentColor: C.primary }} />
                    </div>
                  )}
                  {/* Avatar */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{ width: 46, height: 46, borderRadius: "50%", background: `linear-gradient(135deg, ${ch.color}44, ${ch.color}22)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: ch.color }}>{conv.contact.avatar}</div>
                    <div title={ch.label} style={{ position: "absolute", bottom: -1, right: -1, fontSize: 12 }}>{ch.icon}</div>
                    {conv.unread > 0 && <div style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "#FF3B30", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff" }}>{conv.unread}</div>}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                      <span style={{ color: "#fff", fontWeight: conv.unread > 0 ? 700 : 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {((conv.contact.phone || '').indexOf('+48') === 0 || (conv.metadata && conv.metadata.country === 'PL')) && <span title="Polska" style={{ marginRight: 4 }}>🇵🇱</span>}
                        {conv.contact.name}
                        {((conv.metadata && conv.metadata.language === 'pl') || (conv.contact.phone || '').indexOf('+48') === 0) && <span style={{ marginLeft: 6, background: 'rgba(220,38,38,0.15)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.4)', borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 700 }}>PL</span>}
                      </span>
                      <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>{conv.lastActivity ? (typeof conv.lastActivity.toLocaleDateString === 'function' ? (new Date().toDateString() === conv.lastActivity.toDateString() ? conv.lastActivity.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : conv.lastActivity.toLocaleDateString([], { month: 'short', day: 'numeric' })) : '') : ''}</span>
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
              <div style={{ fontSize: 36, marginBottom: 8 }}>{liveError ? "⚠️" : "🔍"}</div>
              <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{liveError ? "Connection Error" : t('inbox.noConversations')}</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 4 }}>{liveError || (tenantFromEmail ? ("Try adjusting your filters or send an email to " + tenantFromEmail) : "Try adjusting your filters or start a conversation")}</div>
            </div>
          )}
        </div>)}

        {/* Calls/Voicemail Tab */}
        {inboxTab === "calls" && (
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loadingCalls ? (
              <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Loading calls...</div>
            ) : calls.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📞</div>
                <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{t('inbox.noCalls')}</div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 4 }}>{t('inbox.callsHint')}</div>
              </div>
            ) : calls.map(call => {
              const isVoicemail = call.status === 'voicemail' || call.recording_url;
              const time = call.created_at ? new Date(call.created_at) : new Date();
              const dur = call.duration ? `${Math.floor(call.duration / 60)}:${String(call.duration % 60).padStart(2, '0')}` : '';
              return (
                <div key={call.id} onClick={() => setSelectedCall(selectedCall?.id === call.id ? null : call)} style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", background: selectedCall?.id === call.id ? "rgba(0,201,255,0.06)" : "transparent", transition: "background 0.15s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: isVoicemail ? "rgba(255,214,0,0.15)" : "rgba(0,201,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                      {isVoicemail ? "📩" : call.direction === 'inbound' ? "📲" : "📱"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{call.from_number || "Unknown"}</span>
                        <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>{time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
                        <span style={{ color: isVoicemail ? "#FFD600" : "#00C9FF", fontSize: 10, fontWeight: 700 }}>{isVoicemail ? "VOICEMAIL" : call.direction?.toUpperCase() || "INBOUND"}</span>
                        {dur && <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>{dur}</span>}
                        <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>{time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </div>
                    </div>
                  </div>
                  {/* Expanded call details */}
                  {selectedCall?.id === call.id && (
                    <div style={{ marginTop: 10, padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 8, fontSize: 12, lineHeight: 1.7 }}>
                      {call.transcript && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ color: "#FFD600", fontWeight: 700, fontSize: 10, textTransform: "uppercase", marginBottom: 4 }}>Transcript</div>
                          <div style={{ color: "rgba(255,255,255,0.6)" }}>{call.transcript}</div>
                        </div>
                      )}
                      {call.recording_url && (
                        <a href={call.recording_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.primary, textDecoration: "none", fontSize: 11, fontWeight: 600, background: `${C.primary}15`, padding: "6px 12px", borderRadius: 6 }}>
                          🔊 Play Recording
                        </a>
                      )}
                      {!call.transcript && !call.recording_url && (
                        <div style={{ color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>No recording or transcript available</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom — Bulk Actions or Stats */}
        {selectMode && selectedConvIds.length > 0 ? (
          <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.06)", background: C.primary + "08" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ color: C.primary, fontSize: 11, fontWeight: 700 }}>{selectedConvIds.length} selected</span>
              <button onClick={function() { var allIds = filtered.map(function(c) { return c.id; }); setSelectedConvIds(selectedConvIds.length === allIds.length ? [] : allIds); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 10, textDecoration: "underline", fontFamily: "'DM Sans', sans-serif" }}>{selectedConvIds.length === filtered.length ? "Deselect all" : "Select all"}</button>
              <div style={{ flex: 1 }} />
              <button onClick={function() { setSelectedConvIds([]); setSelectMode(false); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 10, fontFamily: "'DM Sans', sans-serif" }}>✕ Clear</button>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {[
                { label: "✅ Resolve", status: "resolved", color: "#10b981" },
                { label: "⏳ Waiting", status: "waiting", color: "#FFD600" },
                { label: "🚨 Urgent", status: "urgent", color: "#FF3B30" },
                { label: "🛡️ Spam", status: "spam", color: "#6B8BAE" },
              ].map(function(a) {
                return <button key={a.status} onClick={function() { bulkUpdateStatus(a.status); }} disabled={bulkActing} style={{ background: a.color + "15", border: "1px solid " + a.color + "44", borderRadius: 6, padding: "4px 8px", color: a.color, cursor: "pointer", fontSize: 10, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", opacity: bulkActing ? 0.5 : 1 }}>{a.label}</button>;
              })}
            </div>
          </div>
        ) : (
          <div style={{ padding: isMobile ? "8px 12px" : "10px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>{filtered.length} conversations</span>
            <div style={{ display: "flex", gap: 6 }}>
              {AGENTS.filter(a => a.status === "online").slice(0, 3).map(a => (
                <div key={a.id} title={`${a.name} (online)`} style={{ width: 22, height: 22, borderRadius: "50%", background: `${C.primary}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: C.primary, border: "2px solid #00E67633" }}>{a.avatar}</div>
              ))}
              <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, lineHeight: "22px" }}>online</span>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════ CENTER: Chat View ═══════════ */}
      {selectedConv && (!isMobile || mobileShowChat) ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, width: isMobile ? "100%" : "auto", position: isMobile ? "absolute" : "relative", inset: isMobile ? 0 : "auto", zIndex: isMobile ? 10 : "auto", background: isMobile ? (C.bg || "#080d1a") : "transparent" }}>
          {/* Chat Header */}
          <div style={{ padding: isMobile ? "10px 12px" : "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: isMobile ? 10 : 14, background: "rgba(0,0,0,0.1)" }}>
            {isMobile && (
              <button onClick={function() { setMobileShowChat(false); }} style={{ background: "none", border: "none", color: C.primary, fontSize: 18, cursor: "pointer", padding: "4px 8px 4px 0", fontWeight: 700, flexShrink: 0 }}>←</button>
            )}
            <div style={{ width: isMobile ? 32 : 38, height: isMobile ? 32 : 38, borderRadius: "50%", background: `linear-gradient(135deg, ${CHANNELS[selectedConv.channel].color}44, ${CHANNELS[selectedConv.channel].color}22)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 11 : 13, fontWeight: 800, color: CHANNELS[selectedConv.channel].color, flexShrink: 0 }}>{selectedConv.contact.avatar}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: isMobile ? "nowrap" : "wrap" }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: isMobile ? 14 : 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedConv.contact.name}</span>
                <span title={CHANNELS[selectedConv.channel].label} style={{ fontSize: 12 }}>{CHANNELS[selectedConv.channel].icon}</span>
                {!isMobile && <span style={{ color: CHANNELS[selectedConv.channel].color, fontSize: 11 }}>{CHANNELS[selectedConv.channel].label}</span>}
                {selectedConv.priority === "high" && <span style={{ background: "#FF3B3022", color: "#FF3B30", border: "1px solid #FF3B3044", borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>URGENT</span>}
              </div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedConv.contact.company}{!isMobile && (" · " + selectedConv.contact.phone)}</div>
            </div>
            {!isMobile && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {selectedConv.assignedTo && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "6px 10px" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: `${C.primary}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: C.primary }}>{selectedConv.assignedTo.avatar}</div>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{selectedConv.assignedTo.name}</span>
                </div>
              )}
             <select style={{ ...inputStyle, width: 120, padding: "6px 8px", fontSize: 11 }}>
  <option value="">Reassign...</option>
  {AGENTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
</select>
              <button onClick={() => setShowContactInfo(!showContactInfo)} style={{ background: showContactInfo ? `${C.primary}22` : "rgba(255,255,255,0.04)", border: `1px solid ${showContactInfo ? C.primary + "44" : "rgba(255,255,255,0.08)"}`, borderRadius: 8, padding: "6px 12px", color: showContactInfo ? C.primary : "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>ℹ️ Info</button>
            </div>}
          </div>

          {/* Messages */}
          <ChatThread
            messages={(selectedConv.messages || []).map(function(msg) {
              var isContact = msg.from === "contact";
              var isBot = msg.from === "bot";
              var isHtml = msg.text && /<[a-z][\s\S]*>/i.test(msg.text);
              return {
                id: msg.id,
                role: isContact ? "user" : isBot ? "assistant" : "agent",
                content: msg.text,
                timestamp: msg.time,
                metadata: {
                  avatar: isContact ? selectedConv.contact.avatar : (msg.agent ? msg.agent.avatar : null),
                  agentName: msg.agent ? msg.agent.name : null,
                  botName: isBot ? "AI Assistant" : null,
                  delivered: msg.delivered,
                  read: msg.read,
                  isHtml: isHtml,
                },
              };
            })}
            isTyping={selectedConv.isTyping}
            typingAvatar={selectedConv.contact.avatar}
            colors={C}
            showAvatars={true}
            maxWidth={isMobile ? "85%" : "65%"}
            dateSeparator={t('inbox.today')}
            style={{ padding: isMobile ? "12px 10px" : "20px 24px" }}
          />

          {/* Compose Area */}
          <div style={{ padding: isMobile ? "10px 10px 16px" : "12px 20px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", background: isMobile ? (C.bg || "#080d1a") : "rgba(0,0,0,0.1)", ...(isMobile ? { position: "sticky", bottom: 0, zIndex: 5 } : {}) }}>
            <ChatInput
              value={composeText}
              onChange={setComposeText}
              onSend={handleSend}
              placeholder={`Reply via ${CHANNELS[selectedConv.channel].label}...`}
              submitMode="enter"
              rows={2}
              sending={sendingMessage}
              sendLabel={t('common.send')}
              colors={C}
              toolbar={<>
                {/* Canned Responses */}
                {showCanned && (
                  <div style={{ marginBottom: 10, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 10, maxHeight: 180, overflowY: "auto" }}>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{t('inbox.quickResponses')}</div>
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
                <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: isMobile ? "nowrap" : "wrap", overflowX: isMobile ? "auto" : "visible" }}>
                  <button onClick={() => setShowCanned(!showCanned)} style={{ background: showCanned ? `${C.primary}22` : "rgba(255,255,255,0.04)", border: `1px solid ${showCanned ? C.primary + "44" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, padding: "4px 8px", color: showCanned ? C.primary : "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>⚡ Quick</button>
                  <button style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 8px", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap", flexShrink: 0 }}>📎 Attach</button>
                  {!isMobile && <button style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 8px", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>😊 Emoji</button>}
                  <button style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 8px", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap", flexShrink: 0 }}>{isMobile ? "🤖" : "🤖 AI Suggest"}</button>
                  {selectedConv.channel === 'email' && senderEmails.length > 0 && (
                    <select value={fromEmail} onChange={function(e) { setFromEmail(e.target.value); }} style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "3px 6px", color: "#fff", fontSize: 10, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", flexShrink: 0, maxWidth: isMobile ? 120 : 200 }}>
                      {senderEmails.map(function(se) { return <option key={se.email} value={se.email}>From: {se.email}</option>; })}
                    </select>
                  )}
                  <div style={{ flex: 1 }} />
                  {!isMobile && <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10, lineHeight: "24px" }}>via {CHANNELS[selectedConv.channel].label}</span>}
                </div>
              </>}
            />
          </div>
        </div>
      ) : !isMobile ? (
        /* Empty State — desktop only */
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>💬</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 20, marginBottom: 6 }}>{t('inbox.selectConversation')}</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>{t('inbox.selectHint')}</div>
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
      ) : null}

      {/* ═══════════ RIGHT: Contact Info Sidebar ═══════════ */}
      {!isMobile && selectedConv && showContactInfo && (
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
                { label: "Messages", value: (selectedConv.messages || []).length, color: "rgba(255,255,255,0.5)" },
                { label: "Started", value: (selectedConv.messages || [])[0]?.time ? new Date((selectedConv.messages || [])[0].time).toLocaleDateString() : 'N/A', color: "rgba(255,255,255,0.5)" },
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
                  { label: selectedConv.status === 'resolved' ? "Reopen" : "Resolve", icon: selectedConv.status === 'resolved' ? "🔄" : "✅", action: function() {
                    var newStatus = selectedConv.status === 'resolved' ? 'active' : 'resolved';
                    if (supabase) {
                      var updateQuery = supabase.from('conversations').update({ status: newStatus });
                      if (selectedConv.contact_id) {
                        updateQuery = updateQuery.eq('contact_id', selectedConv.contact_id).eq('channel', selectedConv.channel).eq('tenant_id', selectedConv.tenant_id);
                      } else {
                        updateQuery = updateQuery.eq('id', selectedConv.id);
                      }
                      updateQuery.then(function() {
                        setConversations(function(prev) { return prev.map(function(c) { return c.id === selectedConv.id ? Object.assign({}, c, { status: newStatus }) : c; }); });
                        if (newStatus === 'resolved') { setSelectedConv(null); }
                        else { setSelectedConv(function(prev) { return prev ? Object.assign({}, prev, { status: newStatus }) : prev; }); }
                      });
                    }
                  }},
                  { label: selectedConv.priority === 'high' ? "Un-Urgent" : "Mark Urgent", icon: selectedConv.priority === 'high' ? "⬇️" : "🔴", action: function() {
                    var newPriority = selectedConv.priority === 'high' ? 'normal' : 'high';
                    var newStatus = newPriority === 'high' ? 'urgent' : 'active';
                    if (supabase) supabase.from('conversations').update({ priority: newPriority, status: newStatus }).eq('id', selectedConv.id).then(function() {
                      setSelectedConv(function(prev) { return prev ? Object.assign({}, prev, { priority: newPriority, status: newStatus }) : prev; });
                      setConversations(function(prev) { return prev.map(function(c) { return c.id === selectedConv.id ? Object.assign({}, c, { priority: newPriority, status: newStatus }) : c; }); });
                    });
                  }},
                  { label: "Assign to AI", icon: "🤖", action: function() {
                    if (supabase) supabase.from('conversations').update({ assigned_to: 'ai' }).eq('id', selectedConv.id).then(function() {
                      setSelectedConv(function(prev) { return prev ? Object.assign({}, prev, { assignedTo: { id: 'bot', name: 'AI Assistant', avatar: '🤖', status: 'online' } }) : prev; });
                    });
                  }},
                  { label: "Assign to Me", icon: "👤", action: function() {
                    if (supabase) supabase.from('conversations').update({ assigned_to: 'rob' }).eq('id', selectedConv.id).then(function() {
                      setSelectedConv(function(prev) { return prev ? Object.assign({}, prev, { assignedTo: { id: 'rob', name: 'Rob Mumby', avatar: 'RM', status: 'online' } }) : prev; });
                    });
                  }},
                  { label: "Block", icon: "🚫", action: function() {
                    if (window.confirm('Block this contact? They will no longer be able to message you.')) {
                      if (supabase) supabase.from('conversations').update({ status: 'blocked' }).eq('id', selectedConv.id).then(function() {
                        setConversations(function(prev) { return prev.filter(function(c) { return c.id !== selectedConv.id; }); });
                        setSelectedConv(null);
                      });
                    }
                  }},
                  { label: "Block Sender", icon: "🛡️", action: function(e) {
                    var senderAddr = ((selectedConv.contact && selectedConv.contact.email) || selectedConv.contact.phone || '').toLowerCase().trim();
                    var domain = senderAddr.indexOf('@') > -1 ? senderAddr.split('@')[1] : '';
                    var useExact = e && e.shiftKey;
                    var blockEntry = useExact ? senderAddr : domain;
                    var tId = selectedConv.tenant_id || currentTenantId;
                    var contactId = selectedConv.contact_id;
                    if (!blockEntry) { alert('No sender address to block.'); return; }
                    if (!window.confirm('Block "' + blockEntry + '"?\n\nThis will:\n• Add to blocked senders list\n• Resolve this conversation\n• Delete the contact\n\n(Hold Shift + click to block exact address instead of domain)')) return;
                    if (!supabase) return;
                    // 1. Add to tenant blocked_domains
                    supabase.from('tenants').select('blocked_domains').eq('id', tId).maybeSingle().then(function(r) {
                      var existing = (r.data && Array.isArray(r.data.blocked_domains)) ? r.data.blocked_domains : [];
                      if (existing.indexOf(blockEntry) === -1) {
                        supabase.from('tenants').update({ blocked_domains: existing.concat([blockEntry]) }).eq('id', tId);
                      }
                    });
                    // 2. Resolve all conversations for this contact
                    if (contactId) {
                      supabase.from('conversations').update({ status: 'resolved' }).eq('contact_id', contactId).eq('tenant_id', tId);
                    } else {
                      supabase.from('conversations').update({ status: 'resolved' }).eq('id', selectedConv.id);
                    }
                    // 3. Delete the contact
                    if (contactId) {
                      supabase.from('contacts').delete().eq('id', contactId).eq('tenant_id', tId);
                    }
                    // 4. Update local state
                    setConversations(function(prev) { return prev.filter(function(c) { return c.id !== selectedConv.id; }); });
                    setSelectedConv(null);
                  }},
                  { label: "Add Note", icon: "📝", action: function() {
                    var note = window.prompt('Add a note to this conversation:');
                    if (note && supabase) {
                      supabase.from('messages').insert({
                        tenant_id: selectedConv.tenant_id || currentTenantId,
                        conversation_id: selectedConv.id,
                        contact_id: selectedConv.contact_id || null,
                        direction: 'outbound',
                        channel: selectedConv.channel || 'email',
                        body: '📝 Note: ' + note,
                        status: 'delivered',
                        sender_type: 'agent',
                        created_at: new Date().toISOString(),
                      }).then(function() {
                        var noteMsg = { id: 'note_' + Date.now(), from: 'agent', text: '📝 Note: ' + note, time: new Date(), agent: null, read: true, delivered: true };
                        setSelectedConv(function(prev) { return prev ? Object.assign({}, prev, { messages: (prev.messages || []).concat([noteMsg]) }) : prev; });
                      });
                    }
                  }},
                ].map(function(action) { return (
                  <button key={action.label} onClick={action.action || undefined} style={{
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 6, padding: "8px", cursor: "pointer", color: "rgba(255,255,255,0.4)",
                    fontSize: 11, fontFamily: "'DM Sans', sans-serif", textAlign: "center", transition: "all 0.15s",
                  }}
                    onMouseEnter={function(e) { e.currentTarget.style.background = C.primary + '15'; e.currentTarget.style.color = C.primary; }}
                    onMouseLeave={function(e) { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
                  >{action.icon} {action.label}</button>
                ); })}
              </div>
            </div>

            {/* Conversation Timeline — real data from messages */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 12 }}>
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Timeline</div>
              {(selectedConv.messages || []).slice(-5).reverse().map(function(m, i) {
                return (
                  <div key={m.id || i} style={{ padding: "6px 0", borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.03)" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{m.from === 'contact' ? '📨 Inbound' : m.from === 'bot' ? '🤖 AI Reply' : '👤 Agent'}</span>
                      <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>{m.time instanceof Date ? m.time.toLocaleDateString() : ''}</span>
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(m.text || '').slice(0, 60)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ New Conversation Modal ═══════════ */}
      {newConvOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={function() { setNewConvOpen(false); }}>
          <div onClick={function(e) { e.stopPropagation(); }} style={{ background: "#0d1425", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 14, padding: 24, width: 480, maxWidth: "90vw", maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ color: "#fff", margin: 0, fontSize: 16, fontWeight: 800 }}>✏️ New Conversation</h3>
              <button onClick={function() { setNewConvOpen(false); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 6, fontWeight: 700 }}>To</label>
              {newConvContact ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: C.primary + "15", border: "1px solid " + C.primary + "44", borderRadius: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{((newConvContact.first_name || '') + ' ' + (newConvContact.last_name || '')).trim()}</div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{newConvContact.email || newConvContact.phone || newConvContact.mobile_phone}</div>
                  </div>
                  <button onClick={function() { setNewConvContact(null); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 14 }}>✕</button>
                </div>
              ) : (<>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input value={newConvSearch} onChange={function(e) { setNewConvSearch(e.target.value); }} onKeyDown={function(e) { if (e.key === 'Enter') newConvSearchContacts(newConvSearch); }} placeholder="Search contacts..." style={{ flex: 1, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
                  <button onClick={function() { newConvSearchContacts(newConvSearch); }} disabled={newConvSearching} style={{ background: C.primary + "22", border: "1px solid " + C.primary + "44", borderRadius: 8, padding: "8px 12px", color: C.primary, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>{newConvSearching ? "..." : "🔍"}</button>
                </div>
                {newConvResults.length > 0 && (
                  <div style={{ maxHeight: 120, overflowY: "auto", marginBottom: 8, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, background: "rgba(0,0,0,0.2)" }}>
                    {newConvResults.map(function(c) {
                      var cName = ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || c.email || c.phone;
                      return (
                        <div key={c.id} onClick={function() { setNewConvContact(c); setNewConvResults([]); setNewConvSearch(''); }} style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", justifyContent: "space-between" }}
                          onMouseEnter={function(e) { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                          onMouseLeave={function(e) { e.currentTarget.style.background = "transparent"; }}>
                          <div><div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{cName}</div><div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{c.email}{c.phone ? ' · ' + c.phone : ''}</div></div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <input value={newConvManual} onChange={function(e) { setNewConvManual(e.target.value); }} placeholder="Or enter phone number / email directly..." style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }} />
              </>)}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 6, fontWeight: 700 }}>Channel</label>
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  { id: "sms", label: "💬 SMS", color: "#00C9FF" },
                  { id: "email", label: "📧 Email", color: "#FF6B35" },
                  { id: "whatsapp", label: "📱 WhatsApp", color: "#25D366" },
                ].map(function(ch) {
                  var active = newConvChannel === ch.id;
                  return <button key={ch.id} onClick={function() { setNewConvChannel(ch.id); }} style={{ flex: 1, padding: "10px 8px", borderRadius: 8, cursor: "pointer", textAlign: "center", background: active ? ch.color + "22" : "rgba(255,255,255,0.03)", border: "2px solid " + (active ? ch.color : "rgba(255,255,255,0.08)"), color: active ? ch.color : "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: active ? 700 : 400, fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}>{ch.label}</button>;
                })}
              </div>
            </div>

            {newConvChannel === 'email' && senderEmails.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 6, fontWeight: 700 }}>From</label>
                <select value={fromEmail} onChange={function(e) { setFromEmail(e.target.value); }} style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }}>
                  {senderEmails.map(function(se) { return <option key={se.email} value={se.email}>{se.email}</option>; })}
                </select>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 6, fontWeight: 700 }}>Message</label>
              <textarea value={newConvBody} onChange={function(e) { setNewConvBody(e.target.value); }} rows={4} placeholder={"Write your " + newConvChannel.toUpperCase() + " message..."} style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", resize: "vertical", lineHeight: 1.5, boxSizing: "border-box" }} />
              {newConvChannel === "sms" && <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, marginTop: 4, textAlign: "right" }}>{newConvBody.length}/160 chars{newConvBody.length > 160 ? " (" + Math.ceil(newConvBody.length / 160) + " segments)" : ""}</div>}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={sendNewConversation} disabled={newConvSending} style={{ flex: 1, background: "linear-gradient(135deg, " + C.primary + ", " + (C.accent || C.primary) + ")", border: "none", borderRadius: 8, padding: "12px", color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: newConvSending ? 0.6 : 1 }}>{newConvSending ? "Sending..." : "🚀 Send"}</button>
              <button onClick={function() { setNewConvOpen(false); }} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "12px 20px", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
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

const LiveInbox = memo(LiveInboxInner, (prev, next) => {
  return prev.demoMode === next.demoMode && prev.currentTenantId === next.currentTenantId && prev.viewLevel === next.viewLevel;
});
export default LiveInbox;
