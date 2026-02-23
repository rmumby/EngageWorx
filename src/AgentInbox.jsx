import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const COLORS = {
  bg: "#0A0E1A",
  surface: "#111827",
  border: "#1e2d45",
  accent: "#00C9FF",
  accent2: "#E040FB",
  accent3: "#00E676",
  accent4: "#FF6B35",
  text: "#E8F4FD",
  muted: "#6B8BAE",
};

const intentColors = {
  purchase_inquiry: COLORS.accent3,
  support: COLORS.accent,
  complaint: COLORS.accent4,
  opt_out: "#FF4444",
  general: COLORS.muted,
  positive_feedback: COLORS.accent3,
  booking: COLORS.accent2,
};

const sentimentColors = {
  positive: COLORS.accent3,
  neutral: COLORS.muted,
  negative: COLORS.accent4,
  very_negative: "#FF4444",
};

function Badge({ children, color }) {
  return (
    <span style={{
      background: color + "22", color,
      border: `1px solid ${color}44`,
      borderRadius: 4, padding: "2px 8px",
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    }}>{children}</span>
  );
}

// Mock data for demo when Supabase not connected
const MOCK_CONVERSATIONS = [
  {
    id: "1", status: "escalated", channel: "SMS",
    last_message_at: new Date().toISOString(),
    contacts: { first_name: "Sarah", last_name: "Johnson", phone: "+13105551234" },
    lastMessage: "This is absolutely unacceptable, I've been waiting 2 weeks!",
    intent: "complaint", sentiment: "very_negative", messageCount: 4,
  },
  {
    id: "2", status: "open", channel: "WhatsApp",
    last_message_at: new Date(Date.now() - 300000).toISOString(),
    contacts: { first_name: "Marcus", last_name: "Williams", phone: "+14155559876" },
    lastMessage: "Hi, I'd like to know more about your premium plan",
    intent: "purchase_inquiry", sentiment: "positive", messageCount: 2,
  },
  {
    id: "3", status: "open", channel: "SMS",
    last_message_at: new Date(Date.now() - 600000).toISOString(),
    contacts: { first_name: "Emily", last_name: "Chen", phone: "+16505554321" },
    lastMessage: "My order hasn't arrived yet, order #4821",
    intent: "support", sentiment: "neutral", messageCount: 3,
  },
  {
    id: "4", status: "escalated", channel: "WhatsApp",
    last_message_at: new Date(Date.now() - 900000).toISOString(),
    contacts: { first_name: "David", last_name: "Park", phone: "+12125558765" },
    lastMessage: "I want a refund immediately",
    intent: "complaint", sentiment: "very_negative", messageCount: 6,
  },
  {
    id: "5", status: "open", channel: "SMS",
    last_message_at: new Date(Date.now() - 1200000).toISOString(),
    contacts: { first_name: "Lisa", last_name: "Martinez", phone: "+17025556543" },
    lastMessage: "Can I book an appointment for next Tuesday?",
    intent: "booking", sentiment: "positive", messageCount: 1,
  },
];

const MOCK_MESSAGES = {
  "1": [
    { direction: "outbound", content: "Hi Sarah! Thanks for being a customer. How can we help you today?", created_at: new Date(Date.now() - 3600000).toISOString(), intent: null },
    { direction: "inbound", content: "I ordered 2 weeks ago and nothing has arrived", created_at: new Date(Date.now() - 3500000).toISOString(), intent: "support" },
    { direction: "outbound", content: "I'm sorry to hear that! Let me look into your order right away.", created_at: new Date(Date.now() - 3400000).toISOString(), intent: null },
    { direction: "inbound", content: "This is absolutely unacceptable, I've been waiting 2 weeks!", created_at: new Date(Date.now() - 600000).toISOString(), intent: "complaint" },
  ],
  "2": [
    { direction: "inbound", content: "Hi, I'd like to know more about your premium plan", created_at: new Date(Date.now() - 400000).toISOString(), intent: "purchase_inquiry" },
    { direction: "outbound", content: "Hi Marcus! Our premium plan includes unlimited messaging across all channels. Would you like to know more?", created_at: new Date(Date.now() - 350000).toISOString(), intent: null },
  ],
};

export default function AgentInbox() {
  const [conversations, setConversations] = useState(MOCK_CONVERSATIONS);
  const [selected, setSelected] = useState(MOCK_CONVERSATIONS[0]);
  const [messages, setMessages] = useState(MOCK_MESSAGES["1"] || []);
  const [reply, setReply] = useState("");
  const [filter, setFilter] = useState("all");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (selected) {
      setMessages(MOCK_MESSAGES[selected.id] || []);
    }
  }, [selected]);

  const filtered = conversations.filter(c => {
    if (filter === "escalated") return c.status === "escalated";
    if (filter === "open") return c.status === "open";
    return true;
  });

  const handleReply = async () => {
    if (!reply.trim()) return;
    setSending(true);

    const newMsg = {
      direction: "outbound",
      content: reply,
      created_at: new Date().toISOString(),
      intent: null,
    };
    setMessages(m => [...m, newMsg]);

    // Update conversation status
    setConversations(prev => prev.map(c =>
      c.id === selected.id
        ? { ...c, status: "open", lastMessage: reply, last_message_at: new Date().toISOString() }
        : c
    ));

    setReply("");
    setSending(false);
  };

  const handleResolve = () => {
    setConversations(prev => prev.filter(c => c.id !== selected.id));
    setSelected(conversations.find(c => c.id !== selected.id) || null);
  };

  const formatTime = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now - d) / 60000);
    if (diff < 1) return "Just now";
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return d.toLocaleDateString();
  };

  const escalatedCount = conversations.filter(c => c.status === "escalated").length;
  const openCount = conversations.filter(c => c.status === "open").length;

  return (
    <div style={{
      display: "flex", height: "100vh", background: COLORS.bg,
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif", color: COLORS.text,
    }}>

      {/* Left Panel — Conversation List */}
      <div style={{
        width: 340, background: COLORS.surface,
        borderRight: `1px solid ${COLORS.border}`,
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 20px 0" }}>
          <h2 style={{ color: COLORS.text, margin: "0 0 4px", fontSize: 18, fontWeight: 800 }}>
            Agent Inbox
          </h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <Badge color={COLORS.accent4}>🔴 {escalatedCount} Escalated</Badge>
            <Badge color={COLORS.accent}>{openCount} Open</Badge>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 4, background: COLORS.bg, padding: 4, borderRadius: 8, marginBottom: 16 }}>
            {["all", "escalated", "open"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                flex: 1, background: filter === f ? COLORS.accent : "transparent",
                border: "none", borderRadius: 6, padding: "6px",
                color: filter === f ? "#000" : COLORS.muted,
                fontWeight: filter === f ? 700 : 400,
                cursor: "pointer", fontSize: 12, textTransform: "capitalize",
              }}>{f}</button>
            ))}
          </div>
        </div>

        {/* Conversation List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.map(conv => (
            <div key={conv.id} onClick={() => setSelected(conv)} style={{
              padding: "14px 20px",
              background: selected?.id === conv.id ? COLORS.accent + "11" : "transparent",
              borderLeft: selected?.id === conv.id ? `3px solid ${COLORS.accent}` : "3px solid transparent",
              borderBottom: `1px solid ${COLORS.border}`,
              cursor: "pointer", transition: "all 0.15s",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: `linear-gradient(135deg, ${intentColors[conv.intent] || COLORS.accent}, ${COLORS.accent2})`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 800, color: "#000", flexShrink: 0,
                  }}>
                    {conv.contacts?.first_name?.[0]}{conv.contacts?.last_name?.[0]}
                  </div>
                  <div>
                    <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 13 }}>
                      {conv.contacts?.first_name} {conv.contacts?.last_name}
                    </div>
                    <div style={{ color: COLORS.muted, fontSize: 11 }}>{conv.channel}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: COLORS.muted, fontSize: 11 }}>{formatTime(conv.last_message_at)}</div>
                  {conv.status === "escalated" && (
                    <div style={{ color: COLORS.accent4, fontSize: 10, fontWeight: 700, marginTop: 2 }}>● ESCALATED</div>
                  )}
                </div>
              </div>
              <p style={{ color: COLORS.muted, fontSize: 12, margin: "6px 0 6px 40px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {conv.lastMessage}
              </p>
              <div style={{ display: "flex", gap: 6, marginLeft: 40 }}>
                {conv.intent && <Badge color={intentColors[conv.intent] || COLORS.muted}>{conv.intent?.replace("_", " ")}</Badge>}
                {conv.sentiment && <Badge color={sentimentColors[conv.sentiment] || COLORS.muted}>{conv.sentiment}</Badge>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel — Conversation Thread */}
      {selected ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Conversation Header */}
          <div style={{
            padding: "16px 24px", background: COLORS.surface,
            borderBottom: `1px solid ${COLORS.border}`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accent2})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, fontWeight: 800, color: "#000",
              }}>
                {selected.contacts?.first_name?.[0]}{selected.contacts?.last_name?.[0]}
              </div>
              <div>
                <div style={{ color: COLORS.text, fontWeight: 800, fontSize: 16 }}>
                  {selected.contacts?.first_name} {selected.contacts?.last_name}
                </div>
                <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
                  {selected.contacts?.phone} · {selected.channel} · {selected.messageCount} messages
                </div>
              </div>
              <div style={{ marginLeft: 8, display: "flex", gap: 6 }}>
                {selected.intent && <Badge color={intentColors[selected.intent] || COLORS.muted}>{selected.intent?.replace("_", " ")}</Badge>}
                {selected.sentiment && <Badge color={sentimentColors[selected.sentiment] || COLORS.muted}>{selected.sentiment}</Badge>}
                {selected.status === "escalated" && <Badge color={COLORS.accent4}>🔴 Escalated</Badge>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleResolve} style={{
                background: COLORS.accent3 + "22", border: `1px solid ${COLORS.accent3}55`,
                borderRadius: 8, padding: "8px 16px", color: COLORS.accent3,
                fontWeight: 700, cursor: "pointer", fontSize: 13,
              }}>✓ Resolve</button>
              <button style={{
                background: COLORS.accent4 + "22", border: `1px solid ${COLORS.accent4}55`,
                borderRadius: 8, padding: "8px 16px", color: COLORS.accent4,
                fontWeight: 700, cursor: "pointer", fontSize: 13,
              }}>↗ Transfer</button>
            </div>
          </div>

          {/* AI Context Bar */}
          <div style={{
            padding: "10px 24px", background: COLORS.accent + "08",
            borderBottom: `1px solid ${COLORS.accent}22`,
            display: "flex", alignItems: "center", gap: 16,
          }}>
            <span style={{ color: COLORS.accent, fontSize: 12, fontWeight: 700 }}>🤖 AI Context:</span>
            <span style={{ color: COLORS.muted, fontSize: 12 }}>
              {selected.intent === "complaint"
                ? "Customer is frustrated. Recommend empathetic response and offer resolution. Consider compensation."
                : selected.intent === "purchase_inquiry"
                ? "Customer showing buying intent. Good opportunity to convert — highlight key benefits and offer demo."
                : selected.intent === "support"
                ? "Customer needs help. Check order/account status and provide specific resolution steps."
                : selected.intent === "booking"
                ? "Customer wants to book. Confirm availability and provide next steps."
                : "Standard conversation. Bot handled initial exchange — review history for context."}
            </span>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.direction === "outbound" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "65%" }}>
                  <div style={{
                    padding: "12px 16px",
                    background: msg.direction === "outbound" ? COLORS.accent : COLORS.surface,
                    color: msg.direction === "outbound" ? "#000" : COLORS.text,
                    borderRadius: msg.direction === "outbound" ? "14px 14px 0 14px" : "14px 14px 14px 0",
                    fontSize: 14, lineHeight: 1.5,
                    border: msg.direction === "inbound" ? `1px solid ${COLORS.border}` : "none",
                  }}>
                    {msg.content}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, justifyContent: msg.direction === "outbound" ? "flex-end" : "flex-start" }}>
                    <span style={{ color: COLORS.dim, fontSize: 11 }}>{formatTime(msg.created_at)}</span>
                    {msg.intent && <Badge color={intentColors[msg.intent] || COLORS.muted}>{msg.intent.replace("_", " ")}</Badge>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Reply Box */}
          <div style={{ padding: "16px 24px", background: COLORS.surface, borderTop: `1px solid ${COLORS.border}` }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
              {["Apologize & resolve", "Request order number", "Transfer to billing", "Offer 10% discount"].map(s => (
                <button key={s} onClick={() => setReply(s)} style={{
                  background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                  borderRadius: 6, padding: "5px 10px", color: COLORS.muted,
                  cursor: "pointer", fontSize: 11, whiteSpace: "nowrap",
                }}>{s}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleReply())}
                placeholder="Type your reply... (Enter to send)"
                rows={3}
                style={{
                  flex: 1, background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                  borderRadius: 10, padding: "12px 14px", color: COLORS.text,
                  fontSize: 14, resize: "none", outline: "none",
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={handleReply} disabled={sending || !reply.trim()} style={{
                  background: reply.trim() ? `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accent2})` : COLORS.border,
                  border: "none", borderRadius: 10, padding: "12px 20px",
                  color: reply.trim() ? "#000" : COLORS.muted,
                  fontWeight: 800, cursor: reply.trim() ? "pointer" : "not-allowed",
                  fontSize: 14, flex: 1,
                }}>
                  {sending ? "..." : "Send"}
                </button>
                <button style={{
                  background: COLORS.accent2 + "22", border: `1px solid ${COLORS.accent2}44`,
                  borderRadius: 10, padding: "10px",
                  color: COLORS.accent2, cursor: "pointer", fontSize: 12, fontWeight: 700,
                }}>🤖 AI Draft</button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", color: COLORS.muted }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text }}>Select a conversation</div>
            <div style={{ fontSize: 14, marginTop: 8 }}>Choose from the inbox on the left</div>
          </div>
        </div>
      )}
    </div>
  );
}
