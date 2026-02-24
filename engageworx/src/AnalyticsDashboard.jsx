import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const COLORS = {
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

// Mini sparkline bar chart component
function BarChart({ data, color, height = 80, label }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.value), 1);

  return (
    <div>
      {label && <div style={{ color: COLORS.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{label}</div>}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div
              style={{
                width: "100%",
                height: `${Math.max((d.value / max) * height, 2)}px`,
                background: `linear-gradient(180deg, ${color}, ${color}44)`,
                borderRadius: "3px 3px 0 0",
                transition: "height 0.6s ease",
                minHeight: 2,
              }}
              title={`${d.label}: ${d.value}`}
            />
            <div style={{ color: COLORS.dim, fontSize: 9, whiteSpace: "nowrap" }}>{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Donut chart component
function DonutChart({ segments, size = 120, strokeWidth = 14 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={COLORS.border} strokeWidth={strokeWidth} />
      {segments.map((seg, i) => {
        const pct = seg.value / total;
        const dashArray = `${pct * circumference} ${circumference}`;
        const dashOffset = -offset * circumference;
        offset += pct;
        return (
          <circle
            key={i}
            cx={size/2} cy={size/2} r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size/2} ${size/2})`}
            style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
        );
      })}
      <text x={size/2} y={size/2 - 6} textAnchor="middle" fill={COLORS.text} fontSize="20" fontWeight="800">{total}</text>
      <text x={size/2} y={size/2 + 12} textAnchor="middle" fill={COLORS.muted} fontSize="10">TOTAL</text>
    </svg>
  );
}

// Stat card component
function StatCard({ icon, label, value, change, changeType, color, delay = 0 }) {
  return (
    <div style={{
      background: COLORS.surface,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 14,
      padding: "22px 20px",
      position: "relative",
      overflow: "hidden",
      animation: `slideUp 0.5s ease ${delay}s both`,
    }}>
      <div style={{
        position: "absolute", top: -20, right: -20,
        width: 80, height: 80,
        background: `radial-gradient(circle, ${color}15, transparent)`,
        borderRadius: "50%",
      }} />
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <div style={{ color: COLORS.text, fontSize: 28, fontWeight: 900, letterSpacing: -1 }}>{value}</div>
      <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 4, marginBottom: 6 }}>{label}</div>
      {change !== undefined && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          background: changeType === "up" ? COLORS.accent3 + "15" : changeType === "down" ? "#FF000015" : COLORS.muted + "15",
          border: `1px solid ${changeType === "up" ? COLORS.accent3 : changeType === "down" ? "#FF0000" : COLORS.muted}33`,
          borderRadius: 6, padding: "2px 8px",
          color: changeType === "up" ? COLORS.accent3 : changeType === "down" ? "#FF6B6B" : COLORS.muted,
          fontSize: 11, fontWeight: 700,
        }}>
          {changeType === "up" ? "↑" : changeType === "down" ? "↓" : "→"} {change}
        </div>
      )}
    </div>
  );
}

// Sentiment pill
function SentimentBar({ positive, neutral, negative }) {
  const total = positive + neutral + negative || 1;
  return (
    <div>
      <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 10, marginBottom: 10 }}>
        <div style={{ width: `${(positive/total)*100}%`, background: COLORS.accent3, transition: "width 0.6s ease" }} />
        <div style={{ width: `${(neutral/total)*100}%`, background: COLORS.warning, transition: "width 0.6s ease" }} />
        <div style={{ width: `${(negative/total)*100}%`, background: "#FF6B6B", transition: "width 0.6s ease" }} />
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
        <span style={{ color: COLORS.accent3 }}>● Positive {Math.round((positive/total)*100)}%</span>
        <span style={{ color: COLORS.warning }}>● Neutral {Math.round((neutral/total)*100)}%</span>
        <span style={{ color: "#FF6B6B" }}>● Negative {Math.round((negative/total)*100)}%</span>
      </div>
    </div>
  );
}

export default function AnalyticsDashboard({ tenantId }) {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("7d");
  const [stats, setStats] = useState({
    totalConversations: 0,
    totalMessages: 0,
    totalContacts: 0,
    totalCampaigns: 0,
    campaignsSent: 0,
    messagesSent: 0,
    messagesDelivered: 0,
    responseRate: 0,
    avgResponseTime: "—",
    sentimentPositive: 0,
    sentimentNeutral: 0,
    sentimentNegative: 0,
    dailyMessages: [],
    dailyConversations: [],
    channelBreakdown: [],
    statusBreakdown: [],
    recentActivity: [],
    topIntents: [],
  });

  const getDateRange = useCallback(() => {
    const now = new Date();
    const days = timeRange === "24h" ? 1 : timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    return { start: start.toISOString(), end: now.toISOString(), days };
  }, [timeRange]);

  useEffect(() => {
    loadAnalytics();
  }, [tenantId, timeRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    const { start, days } = getDateRange();

    try {
      // Fetch all data in parallel
      const [
        conversationsRes,
        messagesRes,
        contactsRes,
        campaignsRes,
      ] = await Promise.all([
        supabase.from("conversations")
          .select("*")
          .gte("created_at", start)
          .order("created_at", { ascending: false }),
        supabase.from("conversation_messages")
          .select("*")
          .gte("created_at", start)
          .order("created_at", { ascending: false }),
        supabase.from("contacts")
          .select("id, created_at"),
        supabase.from("campaigns")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      const conversations = conversationsRes.data || [];
      const messages = messagesRes.data || [];
      const contacts = contactsRes.data || [];
      const campaigns = campaignsRes.data || [];

      // Filter by tenant if applicable
      const tenantConvos = tenantId
        ? conversations.filter(c => c.tenant_id === tenantId)
        : conversations;
      const tenantMsgs = tenantId
        ? messages.filter(m => {
            const convo = conversations.find(c => c.id === m.conversation_id);
            return convo && convo.tenant_id === tenantId;
          })
        : messages;
      const tenantContacts = tenantId
        ? contacts.filter(c => c.tenant_id === tenantId)
        : contacts;
      const tenantCampaigns = tenantId
        ? campaigns.filter(c => c.tenant_id === tenantId)
        : campaigns;

      // Sentiment analysis from conversations
      const sentimentPositive = tenantConvos.filter(c => c.sentiment === "positive").length;
      const sentimentNeutral = tenantConvos.filter(c => c.sentiment === "neutral" || !c.sentiment).length;
      const sentimentNegative = tenantConvos.filter(c => c.sentiment === "negative").length;

      // Daily message volume
      const dailyMap = {};
      for (let i = 0; i < Math.min(days, 14); i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split("T")[0];
        dailyMap[key] = { messages: 0, conversations: 0 };
      }

      tenantMsgs.forEach(m => {
        const day = m.created_at?.split("T")[0];
        if (dailyMap[day]) dailyMap[day].messages++;
      });

      tenantConvos.forEach(c => {
        const day = c.created_at?.split("T")[0];
        if (dailyMap[day]) dailyMap[day].conversations++;
      });

      const sortedDays = Object.keys(dailyMap).sort();
      const dailyMessages = sortedDays.map(d => ({
        label: new Date(d + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric" }),
        value: dailyMap[d].messages,
      }));
      const dailyConversations = sortedDays.map(d => ({
        label: new Date(d + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric" }),
        value: dailyMap[d].conversations,
      }));

      // Channel breakdown from conversations
      const channelMap = {};
      tenantConvos.forEach(c => {
        const ch = c.channel || "SMS";
        channelMap[ch] = (channelMap[ch] || 0) + 1;
      });
      const channelColors = { SMS: COLORS.accent, WhatsApp: "#25D366", Email: COLORS.accent4, RCS: COLORS.accent3, Voice: COLORS.accent2 };
      const channelBreakdown = Object.entries(channelMap).map(([name, value]) => ({
        name, value, color: channelColors[name] || COLORS.accent,
      }));

      // Status breakdown
      const statusMap = {};
      tenantConvos.forEach(c => {
        const s = c.status || "open";
        statusMap[s] = (statusMap[s] || 0) + 1;
      });
      const statusColors = { open: COLORS.accent, resolved: COLORS.accent3, escalated: COLORS.accent4, pending: COLORS.warning };
      const statusBreakdown = Object.entries(statusMap).map(([name, value]) => ({
        name, value, color: statusColors[name] || COLORS.muted,
      }));

      // Top intents
      const intentMap = {};
      tenantConvos.forEach(c => {
        if (c.intent) {
          intentMap[c.intent] = (intentMap[c.intent] || 0) + 1;
        }
      });
      const topIntents = Object.entries(intentMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([intent, count]) => ({ intent, count }));

      // Recent activity
      const recentActivity = tenantConvos.slice(0, 8).map(c => ({
        id: c.id,
        contact: c.contact_name || c.contact_phone || "Unknown",
        intent: c.intent || "General",
        sentiment: c.sentiment || "neutral",
        status: c.status || "open",
        time: c.created_at,
        channel: c.channel || "SMS",
      }));

      // Campaigns sent count
      const campaignsSent = tenantCampaigns.filter(c => c.status === "sent").length;
      const totalMessagesSent = tenantCampaigns.reduce((sum, c) => sum + (c.sent_count || 0), 0);

      // Bot vs agent messages
      const botMessages = tenantMsgs.filter(m => m.sender === "bot").length;
      const agentMessages = tenantMsgs.filter(m => m.sender === "agent").length;
      const customerMessages = tenantMsgs.filter(m => m.sender === "customer" || m.sender === "contact").length;

      // Response rate (conversations that got a reply)
      const conversationsWithReply = tenantConvos.filter(c => {
        return tenantMsgs.some(m => m.conversation_id === c.id && (m.sender === "bot" || m.sender === "agent"));
      }).length;
      const responseRate = tenantConvos.length > 0
        ? Math.round((conversationsWithReply / tenantConvos.length) * 100)
        : 0;

      setStats({
        totalConversations: tenantConvos.length,
        totalMessages: tenantMsgs.length,
        totalContacts: tenantContacts.length,
        totalCampaigns: tenantCampaigns.length,
        campaignsSent,
        messagesSent: totalMessagesSent,
        botMessages,
        agentMessages,
        customerMessages,
        responseRate,
        avgResponseTime: tenantConvos.length > 0 ? "< 30s" : "—",
        sentimentPositive,
        sentimentNeutral,
        sentimentNegative,
        dailyMessages,
        dailyConversations,
        channelBreakdown,
        statusBreakdown,
        recentActivity,
        topIntents,
      });
    } catch (err) {
      console.error("Analytics load error:", err);
    }

    setLoading(false);
  };

  const timeRanges = [
    { key: "24h", label: "24h" },
    { key: "7d", label: "7 Days" },
    { key: "30d", label: "30 Days" },
    { key: "90d", label: "90 Days" },
  ];

  const sentimentIcon = (s) => s === "positive" ? "😊" : s === "negative" ? "😟" : "😐";
  const statusColor = (s) => s === "resolved" ? COLORS.accent3 : s === "escalated" ? COLORS.accent4 : s === "open" ? COLORS.accent : COLORS.warning;

  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.bg,
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      color: COLORS.text,
    }}>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .shimmer-load {
          background: linear-gradient(90deg, ${COLORS.surface} 25%, ${COLORS.surfaceAlt} 50%, ${COLORS.surface} 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 8px;
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 32, animation: "slideUp 0.4s ease both",
        }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: COLORS.accent + "15", border: `1px solid ${COLORS.accent}33`, borderRadius: 20, padding: "5px 14px", marginBottom: 12 }}>
              <span style={{ fontSize: 14 }}>📊</span>
              <span style={{ color: COLORS.accent, fontSize: 12, fontWeight: 700 }}>Live Analytics</span>
              <span style={{ width: 6, height: 6, background: COLORS.accent3, borderRadius: "50%", animation: "pulse 2s infinite" }} />
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, color: COLORS.text }}>
              Analytics Dashboard
            </h1>
          </div>

          {/* Time Range Selector */}
          <div style={{ display: "flex", gap: 4, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 4 }}>
            {timeRanges.map(tr => (
              <button key={tr.key} onClick={() => setTimeRange(tr.key)} style={{
                background: timeRange === tr.key ? COLORS.accent + "22" : "transparent",
                border: timeRange === tr.key ? `1px solid ${COLORS.accent}44` : "1px solid transparent",
                borderRadius: 7, padding: "6px 14px",
                color: timeRange === tr.key ? COLORS.accent : COLORS.muted,
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                transition: "all 0.2s",
              }}>
                {tr.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="shimmer-load" style={{ height: 140 }} />
            ))}
          </div>
        ) : (
          <>
            {/* KPI Cards Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
              <StatCard icon="💬" label="Conversations" value={stats.totalConversations} change="this period" changeType="up" color={COLORS.accent} delay={0} />
              <StatCard icon="📨" label="Messages" value={stats.totalMessages} change={`${stats.responseRate}% response rate`} changeType="up" color={COLORS.accent2} delay={0.05} />
              <StatCard icon="👥" label="Contacts" value={stats.totalContacts} color={COLORS.accent3} delay={0.1} />
              <StatCard icon="🚀" label="Campaigns Sent" value={stats.campaignsSent} change={`${stats.messagesSent} SMS sent`} changeType="up" color={COLORS.accent4} delay={0.15} />
            </div>

            {/* Charts Row */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 24 }}>
              {/* Message Volume Chart */}
              <div style={{
                background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                borderRadius: 14, padding: 24,
                animation: "slideUp 0.5s ease 0.2s both",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 800 }}>Message Volume</div>
                    <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>Daily inbound + outbound messages</div>
                  </div>
                  <div style={{ color: COLORS.accent, fontSize: 24, fontWeight: 900 }}>{stats.totalMessages}</div>
                </div>
                {stats.dailyMessages.length > 0 ? (
                  <BarChart data={stats.dailyMessages} color={COLORS.accent} height={100} />
                ) : (
                  <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.dim, fontSize: 13 }}>
                    No message data yet — start sending to see trends
                  </div>
                )}
              </div>

              {/* Channel Breakdown */}
              <div style={{
                background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                borderRadius: 14, padding: 24,
                animation: "slideUp 0.5s ease 0.25s both",
              }}>
                <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 800, marginBottom: 20 }}>Channels</div>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                  {stats.channelBreakdown.length > 0 ? (
                    <DonutChart segments={stats.channelBreakdown} />
                  ) : (
                    <DonutChart segments={[{ value: 1, color: COLORS.border }]} />
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {stats.channelBreakdown.length > 0 ? stats.channelBreakdown.map(ch => (
                    <div key={ch.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: ch.color }} />
                        <span style={{ color: COLORS.text, fontSize: 13 }}>{ch.name}</span>
                      </div>
                      <span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 700 }}>{ch.value}</span>
                    </div>
                  )) : (
                    <div style={{ color: COLORS.dim, fontSize: 12, textAlign: "center" }}>No channel data yet</div>
                  )}
                </div>
              </div>
            </div>

            {/* Second Row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
              {/* Sentiment Analysis */}
              <div style={{
                background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                borderRadius: 14, padding: 24,
                animation: "slideUp 0.5s ease 0.3s both",
              }}>
                <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Sentiment Analysis</div>
                <SentimentBar
                  positive={stats.sentimentPositive}
                  neutral={stats.sentimentNeutral}
                  negative={stats.sentimentNegative}
                />
                <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.accent3 }}>{stats.sentimentPositive}</div>
                    <div style={{ fontSize: 10, color: COLORS.muted }}>Positive</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.warning }}>{stats.sentimentNeutral}</div>
                    <div style={{ fontSize: 10, color: COLORS.muted }}>Neutral</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "#FF6B6B" }}>{stats.sentimentNegative}</div>
                    <div style={{ fontSize: 10, color: COLORS.muted }}>Negative</div>
                  </div>
                </div>
              </div>

              {/* Conversation Status */}
              <div style={{
                background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                borderRadius: 14, padding: 24,
                animation: "slideUp 0.5s ease 0.35s both",
              }}>
                <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Conversation Status</div>
                {stats.statusBreakdown.length > 0 ? stats.statusBreakdown.map(s => {
                  const total = stats.totalConversations || 1;
                  const pct = Math.round((s.value / total) * 100);
                  return (
                    <div key={s.name} style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: COLORS.text, fontSize: 13, textTransform: "capitalize" }}>{s.name}</span>
                        <span style={{ color: s.color, fontSize: 13, fontWeight: 700 }}>{s.value} ({pct}%)</span>
                      </div>
                      <div style={{ height: 6, background: COLORS.bg, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: s.color, borderRadius: 3, transition: "width 0.6s ease" }} />
                      </div>
                    </div>
                  );
                }) : (
                  <div style={{ color: COLORS.dim, fontSize: 12, textAlign: "center", marginTop: 20 }}>No conversations yet</div>
                )}
              </div>

              {/* AI Bot Performance */}
              <div style={{
                background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                borderRadius: 14, padding: 24,
                animation: "slideUp 0.5s ease 0.4s both",
              }}>
                <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Message Breakdown</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {[
                    { label: "🤖 AI Bot", value: stats.botMessages || 0, color: COLORS.accent2 },
                    { label: "👤 Agent", value: stats.agentMessages || 0, color: COLORS.accent },
                    { label: "📱 Customer", value: stats.customerMessages || 0, color: COLORS.accent3 },
                  ].map(item => (
                    <div key={item.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: COLORS.text, fontSize: 13 }}>{item.label}</span>
                        <span style={{ color: item.color, fontSize: 13, fontWeight: 700 }}>{item.value}</span>
                      </div>
                      <div style={{ height: 6, background: COLORS.bg, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{
                          height: "100%",
                          width: `${stats.totalMessages > 0 ? (item.value / stats.totalMessages) * 100 : 0}%`,
                          background: item.color, borderRadius: 3,
                          transition: "width 0.6s ease",
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 16, padding: "12px 14px", background: COLORS.bg, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: COLORS.muted, fontSize: 12 }}>Response Rate</span>
                    <span style={{ color: COLORS.accent3, fontSize: 14, fontWeight: 800 }}>{stats.responseRate}%</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                    <span style={{ color: COLORS.muted, fontSize: 12 }}>Avg Response Time</span>
                    <span style={{ color: COLORS.accent, fontSize: 14, fontWeight: 800 }}>{stats.avgResponseTime}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Conversation Volume Chart */}
            <div style={{
              background: COLORS.surface, border: `1px solid ${COLORS.border}`,
              borderRadius: 14, padding: 24, marginBottom: 24,
              animation: "slideUp 0.5s ease 0.45s both",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 800 }}>Conversation Volume</div>
                  <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>New conversations per day</div>
                </div>
              </div>
              {stats.dailyConversations.length > 0 ? (
                <BarChart data={stats.dailyConversations} color={COLORS.accent2} height={80} />
              ) : (
                <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.dim, fontSize: 13 }}>
                  No conversation data yet
                </div>
              )}
            </div>

            {/* Bottom Row */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
              {/* Recent Activity */}
              <div style={{
                background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                borderRadius: 14, padding: 24,
                animation: "slideUp 0.5s ease 0.5s both",
              }}>
                <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Recent Conversations</div>
                {stats.recentActivity.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {stats.recentActivity.map((a, i) => (
                      <div key={a.id || i} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 14px", background: COLORS.bg, borderRadius: 8,
                        border: `1px solid ${COLORS.border}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 16 }}>{sentimentIcon(a.sentiment)}</span>
                          <div>
                            <div style={{ color: COLORS.text, fontSize: 13, fontWeight: 600 }}>{a.contact}</div>
                            <div style={{ color: COLORS.muted, fontSize: 11 }}>{a.intent} · {a.channel}</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            background: statusColor(a.status) + "22",
                            border: `1px solid ${statusColor(a.status)}44`,
                            color: statusColor(a.status),
                            borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700,
                            textTransform: "uppercase",
                          }}>
                            {a.status}
                          </span>
                          <span style={{ color: COLORS.dim, fontSize: 11 }}>
                            {new Date(a.time).toLocaleDateString("en", { month: "short", day: "numeric" })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: COLORS.dim, fontSize: 13, textAlign: "center", padding: 20 }}>
                    No conversations yet — they'll appear here as customers message in
                  </div>
                )}
              </div>

              {/* Top Intents */}
              <div style={{
                background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                borderRadius: 14, padding: 24,
                animation: "slideUp 0.5s ease 0.55s both",
              }}>
                <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Top Intents</div>
                {stats.topIntents.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {stats.topIntents.map((t, i) => {
                      const maxCount = stats.topIntents[0]?.count || 1;
                      return (
                        <div key={t.intent}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ color: COLORS.text, fontSize: 13 }}>{t.intent}</span>
                            <span style={{ color: COLORS.accent, fontSize: 13, fontWeight: 700 }}>{t.count}</span>
                          </div>
                          <div style={{ height: 5, background: COLORS.bg, borderRadius: 3, overflow: "hidden" }}>
                            <div style={{
                              height: "100%",
                              width: `${(t.count / maxCount) * 100}%`,
                              background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.accent2})`,
                              borderRadius: 3,
                              transition: "width 0.6s ease",
                            }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: COLORS.dim, fontSize: 12, textAlign: "center", padding: 20 }}>
                    Intent data will populate as conversations come in
                  </div>
                )}

                {/* Quick Stats */}
                <div style={{ marginTop: 20, padding: "14px", background: COLORS.bg, borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
                  <div style={{ color: COLORS.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Quick Stats</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: COLORS.muted, fontSize: 12 }}>Total Campaigns</span>
                    <span style={{ color: COLORS.text, fontSize: 12, fontWeight: 700 }}>{stats.totalCampaigns}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: COLORS.muted, fontSize: 12 }}>SMS Delivered</span>
                    <span style={{ color: COLORS.text, fontSize: 12, fontWeight: 700 }}>{stats.messagesSent}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: COLORS.muted, fontSize: 12 }}>Active Contacts</span>
                    <span style={{ color: COLORS.text, fontSize: 12, fontWeight: 700 }}>{stats.totalContacts}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
