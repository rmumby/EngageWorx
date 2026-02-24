import { useState, useEffect, useRef } from "react";
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
  dim: "#3a5068",
};

const intentColors = {
  purchase_inquiry: COLORS.accent3,
  support: COLORS.accent,
  complaint: COLORS.accent4,
  opt_out: "#FF4444",
  general: COLORS.muted,
  positive_feedback: COLORS.accent3,
  booking: COLORS.accent2,
  greeting: COLORS.accent,
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

// Mock data as fallback when no live conversations exist
const MOCK_CONVERSATIONS = [
  {
    id: "mock-1", status: "escalated", channel: "SMS",
    last_message_at: new Date().toISOString(),
    contact_phone: "+13105551234", contact_name: "Sarah Johnson",
    lastMessage: "This is absolutely unacceptable, I've been waiting 2 weeks!",
    intent: "complaint", sentiment: "very_negative", messageCount: 4,
  },
  {
    id: "mock-2", status: "open", channel: "SMS",
    last_message_at: new Date(Date.now() - 300000).toISOString(),
    contact_phone: "+14155559876", contact_name: "Marcus Williams",
    lastMessage: "Hi, I'd like to know more about your premium plan",
    intent: "purchase_inquiry", sentiment: "positive", messageCount: 2,
  },
  {
    id: "mock-3", status: "open", channel: "SMS",
    last_message_at: new Date(Date.now() - 600000).toISOString(),
    contact_phone: "+16505554321", contact_name: "Emily Chen",
    lastMessage: "My order hasn't arrived yet, order #4821",
    intent: "support", sentiment: "neutral", messageCount: 3,
  },
  {
    id: "mock-4", status: "escalated", channel: "SMS",
    last_message_at: new Date(Date.now() - 900000).toISOString(),
    contact_phone: "+12125558765", contact_name: "David Park",
    lastMessage: "I want a refund immediately",
    intent: "complaint", sentiment: "very_negative", messageCount: 6,
  },
  {
    id: "mock-5", status: "open", channel: "SMS",
    last_message_at: new Date(Date.now() - 1200000).toISOString(),
    contact_phone: "+17025556543", contact_name: "Lisa Martinez",
    lastMessage: "Can I book an appointment for next Tuesday?",
    intent: "booking", sentiment: "positive", messageCount: 1,
  },
];

const MOCK_MESSAGES = {
  "mock-1": [
    { direction: "outbound", content: "Hi Sarah! Thanks for being a customer. How can we help you today?", created_at: new Date(Date.now() - 3600000).toISOString(), sender: "bot" },
    { direction: "inbound", content: "I ordered 2 weeks ago and nothing has arrived", created_at: new Date(Date.now() - 3500000).toISOString(), sender: "customer" },
    { direction: "outbound", content: "I'm sorry to hear that! Let me look into your order right away.", created_at: new Date(Date.now() - 3400000).toISOString(), sender: "bot" },
    { direction: "inbound", content: "This is absolutely unacceptable, I've been waiting 2 weeks!", created_at: new Date(Date.now() - 600000).toISOString(), sender: "customer" },
  ],
  "mock-2": [
    { direction: "inbound", content: "Hi, I'd like to know more about your premium plan", created_at: new Date(Date.now() - 400000).toISOString(), sender: "customer" },
    { direction: "outbound", content: "Hi Marcus! Our premium plan includes unlimited messaging across all channels. Would you like to know more?", created_at: new Date(Date.now() - 350000).toISOString(), sender: "bot" },
  ],
  "mock-3": [
    { direction: "inbound", content: "My order hasn't arrived yet, order #4821", created_at: new Date(Date.now() - 700000).toISOString(), sender: "customer" },
    { direction: "outbound", content: "I'm sorry about the delay. Let me check the status of order #4821 for you.", created_at: new Date(Date.now() - 650000).toISOString(), sender: "bot" },
    { direction: "inbound", content: "Please hurry, I need it this week", created_at: new Date(Date.now() - 600000).toISOString(), sender: "customer" },
  ],
};

export default function AgentInbox({ tenantId }) {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState("");
  const [filter, setFilter] = useState("all");
  const [sending, setSending] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch conversations from Supabase
  useEffect(() => {
    loadConversations();

    // Real-time subscription for new messages
    const channel = supabase
      .channel("inbox-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_messages" },
        (payload) => {
          handleNewMessage(payload.new);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversations" },
        () => {
          loadConversations();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        () => {
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  const loadConversations = async () => {
    try {
      let query = supabase
        .from("conversations")
        .select(`
          id,
          contact_phone,
          contact_name,
          status,
          channel,
          intent,
          sentiment,
          created_at,
          updated_at,
          tenant_id,
          conversation_messages (
            id,
            content,
            direction,
            created_at,
            sender
          )
        `)
        .order("updated_at", { ascending: false });

      // Filter by tenant if provided
      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data && data.length > 0) {
        // Transform live data
        const transformed = data.map(conv => {
          const msgs = conv.conversation_messages || [];
          const sorted = msgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          const lastMsg = sorted[sorted.length - 1];

          return {
            id: conv.id,
            status: conv.status || "open",
            channel: conv.channel || "SMS",
            last_message_at: conv.updated_at || conv.created_at,
            contact_phone: conv.contact_phone,
            contact_name: conv.contact_name || conv.contact_phone,
            lastMessage: lastMsg?.content || "No messages yet",
            intent: conv.intent || "general",
            sentiment: conv.sentiment || "neutral",
            messageCount: msgs.length,
            tenant_id: conv.tenant_id,
          };
        });

        setConversations(transformed);
        setIsLive(true);

        // Auto-select first conversation if none selected
        if (!selected) {
          setSelected(transformed[0]);
          loadMessages(transformed[0].id);
        }
      } else {
        // Fall back to mock data
        setConversations(MOCK_CONVERSATIONS);
        setIsLive(false);
        if (!selected) {
          setSelected(MOCK_CONVERSATIONS[0]);
          setMessages(MOCK_MESSAGES["mock-1"] || []);
        }
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
      setConversations(MOCK_CONVERSATIONS);
      setIsLive(false);
      if (!selected) {
        setSelected(MOCK_CONVERSATIONS[0]);
        setMessages(MOCK_MESSAGES["mock-1"] || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId) => {
    if (conversationId?.startsWith("mock-")) {
      setMessages(MOCK_MESSAGES[conversationId] || []);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("conversation_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error("Failed to load messages:", err);
      setMessages([]);
    }
  };

  const handleNewMessage = (newMsg) => {
    // If message belongs to currently selected conversation, add it
    if (selected && newMsg.conversation_id === selected.id) {
      setMessages(prev => [...prev, newMsg]);
    }

    // Update conversation list
    setConversations(prev => prev.map(conv => {
      if (conv.id === newMsg.conversation_id) {
        return {
          ...conv,
          lastMessage: newMsg.content,
          last_message_at: newMsg.created_at,
          messageCount: conv.messageCount + 1,
        };
      }
      return conv;
    }));
  };

  // When selecting a conversation, load its messages
  useEffect(() => {
    if (selected) {
      loadMessages(selected.id);
    }
  }, [selected?.id]);

  const filtered = conversations.filter(c => {
    if (filter === "escalated") return c.status === "escalated";
    if (filter === "open") return c.status === "open";
    return true;
  });

  const handleReply = async () => {
    if (!reply.trim() || sending) return;
    setSending(true);

    if (isLive && selected && !selected.id?.startsWith("mock-")) {
      try {
        // Insert message into Supabase
        const { error } = await supabase
          .from("conversation_messages")
          .insert({
            conversation_id: selected.id,
            content: reply,
            direction: "outbound",
            sender: "agent",
          });

        if (error) throw error;

        // Update conversation status
        await supabase
          .from("conversations")
          .update({
            status: "open",
            updated_at: new Date().toISOString(),
          })
          .eq("id", selected.id);

      } catch (err) {
        console.error("Failed to send reply:", err);
      }
    } else {
      // Mock mode — just add to local state
      const newMsg = {
        direction: "outbound",
        content: reply,
        created_at: new Date().toISOString(),
        sender: "agent",
      };
      setMessages(m => [...m, newMsg]);
    }

    // Update local conversation state
    setConversations(prev => prev.map(c =>
      c.id === selected.id
        ? { ...c, status: "open", lastMessage: reply, last_message_at: new Date().toISOString() }
        : c
    ));

    setReply("");
    setSending(false);
  };

  const handleResolve = async () => {
    if (isLive && selected && !selected.id?.startsWith("mock-")) {
      try {
        await supabase
          .from("conversations")
          .update({ status: "resolved" })
          .eq("id", selected.id);
      } catch (err) {
        console.error("Failed to resolve:", err);
      }
    }

    setConversations(prev => prev.filter(c => c.id !== selected.id));
    const remaining = conversations.filter(c => c.id !== selected.id);
    setSelected(remaining[0] || null);
  };

  const handleEscalate = async () => {
    if (isLive && selected && !selected.id?.startsWith("mock-")) {
      try {
        await supabase
          .from("conversations")
          .update({ status: "escalated" })
          .eq("id", selected.id);
      } catch (err) {
        console.error("Failed to escalate:", err);
      }
    }

    setConversations(prev => prev.map(c =>
      c.id === selected.id ? { ...c, status: "escalated" } : c
    ));
    setSelected(prev => prev ? { ...prev, status: "escalated" } : null);
  };

  const formatTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now - d) / 60000);
    if (diff < 1) return "Just now";
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return d.toLocaleDateString();
  };

  const getInitials = (conv) => {
    if (conv.contact_name && conv.contact_name !== conv.contact_phone) {
      const parts = conv.contact_name.split(" ");
      return parts.map(p => p[0]).join("").substring(0, 2).toUpperCase();
    }
    return conv.contact_phone?.slice(-2) || "??";
  };

  const getDisplayName = (conv) => {
    if (conv.contact_name && conv.contact_name !== conv.contact_phone) {
      return conv.contact_name;
    }
    return conv.contact_phone || "Unknown";
  };

  const escalatedCount = conversations.filter(c => c.status === "escalated").length;
  const openCount = conversations.filter(c => c.status === "open").length;

  if (loading) {
    return (
      <div style={{
        display: "flex", height: "100vh", background: COLORS.bg,
        alignItems: "center", justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif", color: COLORS.muted,
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Loading conversations...</div>
        </div>
      </div>
    );
  }

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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <h2 style={{ color: COLORS.text, margin: 0, fontSize: 18, fontWeight: 800 }}>
              Agent Inbox
            </h2>
            {isLive ? (
              <Badge color={COLORS.accent3}>● Live</Badge>
            ) : (
              <Badge color={COLORS.muted}>Demo Mode</Badge>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, marginTop: 8 }}>
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
          {filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: COLORS.muted }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
              <div style={{ fontSize: 13 }}>No conversations found</div>
            </div>
          ) : (
            filtered.map(conv => (
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
                      {getInitials(conv)}
                    </div>
                    <div>
                      <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 13 }}>
                        {getDisplayName(conv)}
                      </div>
                      <div style={{ color: COLORS.muted, fontSize: 11 }}>
                        {conv.channel} · {conv.contact_phone}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ color: COLORS.muted, fontSize: 11 }}>{formatTime(conv.last_message_at)}</div>
                    {conv.status === "escalated" && (
                      <div style={{ color: COLORS.accent4, fontSize: 10, fontWeight: 700, marginTop: 2 }}>● ESCALATED</div>
                    )}
                  </div>
                </div>
                <p style={{
                  color: COLORS.muted, fontSize: 12, margin: "6px 0 6px 40px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {conv.lastMessage}
                </p>
                <div style={{ display: "flex", gap: 6, marginLeft: 40 }}>
                  {conv.intent && conv.intent !== "general" && (
                    <Badge color={intentColors[conv.intent] || COLORS.muted}>
                      {conv.intent?.replace(/_/g, " ")}
                    </Badge>
                  )}
                  {conv.sentiment && conv.sentiment !== "neutral" && (
                    <Badge color={sentimentColors[conv.sentiment] || COLORS.muted}>
                      {conv.sentiment}
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
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
                {getInitials(selected)}
              </div>
              <div>
                <div style={{ color: COLORS.text, fontWeight: 800, fontSize: 16 }}>
                  {getDisplayName(selected)}
                </div>
                <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
                  {selected.contact_phone} · {selected.channel} · {selected.messageCount} messages
                </div>
              </div>
              <div style={{ marginLeft: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {selected.intent && selected.intent !== "general" && (
                  <Badge color={intentColors[selected.intent] || COLORS.muted}>
                    {selected.intent?.replace(/_/g, " ")}
                  </Badge>
                )}
                {selected.sentiment && (
                  <Badge color={sentimentColors[selected.sentiment] || COLORS.muted}>
                    {selected.sentiment}
                  </Badge>
                )}
                {selected.status === "escalated" && <Badge color={COLORS.accent4}>🔴 Escalated</Badge>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleResolve} style={{
                background: COLORS.accent3 + "22", border: `1px solid ${COLORS.accent3}55`,
                borderRadius: 8, padding: "8px 16px", color: COLORS.accent3,
                fontWeight: 700, cursor: "pointer", fontSize: 13,
              }}>✓ Resolve</button>
              <button onClick={handleEscalate} style={{
                background: COLORS.accent4 + "22", border: `1px solid ${COLORS.accent4}55`,
                borderRadius: 8, padding: "8px 16px", color: COLORS.accent4,
                fontWeight: 700, cursor: "pointer", fontSize: 13,
              }}>⚠ Escalate</button>
            </div>
          </div>

          {/* AI Context Bar */}
          <div style={{
            padding: "10px 24px", background: COLORS.accent + "08",
            borderBottom: `1px solid ${COLORS.accent}22`,
            display: "flex", alignItems: "center", gap: 16,
          }}>
            <span style={{ color: COLORS.accent, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>🤖 AI Context:</span>
            <span style={{ color: COLORS.muted, fontSize: 12 }}>
              {selected.intent === "complaint"
                ? "Customer is frustrated. Recommend empathetic response and offer resolution. Consider compensation."
                : selected.intent === "purchase_inquiry"
                ? "Customer showing buying intent. Good opportunity to convert — highlight key benefits and offer demo."
                : selected.intent === "support"
                ? "Customer needs help. Check order/account status and provide specific resolution steps."
                : selected.intent === "booking"
                ? "Customer wants to book. Confirm availability and provide next steps."
                : selected.intent === "opt_out"
                ? "Customer wants to opt out. Confirm removal from messaging list and comply immediately."
                : "Standard conversation. Bot handled initial exchange — review history for context."}
            </span>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.length === 0 ? (
              <div style={{ textAlign: "center", color: COLORS.muted, padding: 40 }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>💬</div>
                <div style={{ fontSize: 13 }}>No messages in this conversation yet</div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={msg.id || i} style={{ display: "flex", justifyContent: msg.direction === "outbound" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "65%" }}>
                    {/* Sender label */}
                    <div style={{
                      fontSize: 10, fontWeight: 600, marginBottom: 3,
                      color: msg.direction === "outbound"
                        ? (msg.sender === "bot" ? COLORS.accent2 : COLORS.accent3)
                        : COLORS.muted,
                      textAlign: msg.direction === "outbound" ? "right" : "left",
                    }}>
                      {msg.direction === "outbound"
                        ? (msg.sender === "bot" ? "🤖 AI Bot" : "👤 Agent")
                        : "Customer"}
                    </div>
                    <div style={{
                      padding: "12px 16px",
                      background: msg.direction === "outbound"
                        ? (msg.sender === "bot" ? COLORS.accent2 + "33" : COLORS.accent)
                        : COLORS.surface,
                      color: msg.direction === "outbound" && msg.sender !== "bot" ? "#000" : COLORS.text,
                      borderRadius: msg.direction === "outbound" ? "14px 14px 0 14px" : "14px 14px 14px 0",
                      fontSize: 14, lineHeight: 1.5,
                      border: msg.direction === "inbound" ? `1px solid ${COLORS.border}` : 
                             (msg.sender === "bot" ? `1px solid ${COLORS.accent2}44` : "none"),
                    }}>
                      {msg.content}
                    </div>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 6, marginTop: 4,
                      justifyContent: msg.direction === "outbound" ? "flex-end" : "flex-start",
                    }}>
                      <span style={{ color: COLORS.dim, fontSize: 11 }}>{formatTime(msg.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply Box */}
          <div style={{ padding: "16px 24px", background: COLORS.surface, borderTop: `1px solid ${COLORS.border}` }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {["I understand your frustration", "Let me check on that", "Is there anything else I can help with?", "I'll escalate this to our team"].map(s => (
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
                placeholder={isLive ? "Type your reply... (Enter to send via SMS)" : "Type your reply... (Enter to send — demo mode)"}
                rows={3}
                style={{
                  flex: 1, background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                  borderRadius: 10, padding: "12px 14px", color: COLORS.text,
                  fontSize: 14, resize: "none", outline: "none",
                  fontFamily: "'DM Sans', sans-serif",
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
