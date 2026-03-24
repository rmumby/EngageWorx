import { useState, useEffect, useRef } from "react";

const MOCK_TICKETS = [
  {
    id: "t1", ticketNumber: "TKT-202603-0042", status: "pending_agent", priority: "high",
    escalationReason: "explicit_request", summary: "Customer requesting refund for failed SMS campaign. AI attempted resolution twice.",
    contact: { name: "Sarah Mitchell", email: "sarah@example.com", phone: "+1 (305) 555-0192" },
    channel: "email", assignedAgent: null, createdAt: "2 min ago",
    transcript: [
      { role: "customer", content: "Hi, my SMS campaign failed to send and I need a refund.", sentAt: "10:14 AM" },
      { role: "ai", content: "I'm sorry to hear that. I can see your campaign from March 23rd. Let me look into this for you.", sentAt: "10:14 AM" },
      { role: "customer", content: "I've been waiting 2 days. This is unacceptable. I need to speak to a real person.", sentAt: "10:16 AM" },
      { role: "ai", content: "I'm connecting you with a member of our team now — they'll have full context of our conversation.", sentAt: "10:16 AM", isEscalation: true },
    ]
  },
  {
    id: "t2", ticketNumber: "TKT-202603-0041", status: "agent_active", priority: "medium",
    escalationReason: "complaint", summary: "WhatsApp template rejected by Meta. Customer frustrated with approval delays.",
    contact: { name: "James Okafor", email: "james@growthco.io", phone: "+1 (786) 555-0847" },
    channel: "whatsapp", assignedAgent: "Alex Chen", createdAt: "18 min ago",
    transcript: [
      { role: "customer", content: "My WhatsApp template has been rejected 3 times now. What's going on?", sentAt: "9:58 AM" },
      { role: "ai", content: "WhatsApp template rejections can be frustrating. Can you share the template content so I can review?", sentAt: "9:58 AM" },
      { role: "customer", content: "I've already tried fixing it. Your AI keeps giving me the same advice. I want to escalate this.", sentAt: "10:01 AM" },
      { role: "ai", content: "Understood — I'm handing you to a specialist now.", sentAt: "10:01 AM", isEscalation: true },
      { role: "agent", content: "Hi James, I'm Alex. The issue is the CTA button URL — Meta flags dynamic URLs in utility templates. I can fix this for you now.", sentAt: "10:04 AM" },
    ]
  },
  {
    id: "t3", ticketNumber: "TKT-202603-0040", status: "pending_agent", priority: "critical",
    escalationReason: "data_loss", summary: "Contact list deleted — customer reports 4,200 contacts missing after import.",
    contact: { name: "Marina Costa", email: "marina@retailhub.com", phone: "+1 (305) 555-2341" },
    channel: "sms", assignedAgent: null, createdAt: "34 min ago",
    transcript: [
      { role: "customer", content: "URGENT - All my contacts are gone. 4200 contacts after CSV import. Please help.", sentAt: "9:42 AM" },
      { role: "ai", content: "That sounds very stressful. Can you confirm when the import was run?", sentAt: "9:42 AM" },
      { role: "customer", content: "About an hour ago. They were there, then I refreshed and they're all gone.", sentAt: "9:43 AM" },
      { role: "ai", content: "I'm escalating this as critical priority right now. A specialist will be with you immediately.", sentAt: "9:43 AM", isEscalation: true },
    ]
  },
  {
    id: "t4", ticketNumber: "TKT-202603-0039", status: "resolved", priority: "low",
    escalationReason: "repeat_fail", summary: "Billing invoice question — payment date confusion resolved.",
    contact: { name: "Tom Haverford", email: "tom@pawnee.biz", phone: "+1 (317) 555-0091" },
    channel: "web_chat", assignedAgent: "Sarah Kim", createdAt: "2 hr ago",
    transcript: [
      { role: "customer", content: "When does my next invoice generate?", sentAt: "8:10 AM" },
      { role: "ai", content: "Your billing cycle renews on the 1st of each month. Your next invoice will generate on April 1st.", sentAt: "8:10 AM" },
      { role: "customer", content: "But I signed up on March 15th — why April 1st?", sentAt: "8:12 AM" },
      { role: "ai", content: "New accounts are prorated for the first partial month. Your first full invoice is April 1st.", sentAt: "8:12 AM" },
      { role: "agent", content: "Hi Tom, Sarah here confirming — the AI explanation is correct. I've sent a full breakdown to your email.", sentAt: "8:19 AM" },
      { role: "customer", content: "Perfect, thank you!", sentAt: "8:20 AM" },
    ]
  },
];

const MOCK_AGENTS = [
  { id: "a1", name: "Alex Chen", role: "agent", isAvailable: true, currentTickets: 1, maxTickets: 5 },
  { id: "a2", name: "Sarah Kim", role: "supervisor", isAvailable: true, currentTickets: 0, maxTickets: 8 },
  { id: "a3", name: "Marcus Bell", role: "agent", isAvailable: false, currentTickets: 3, maxTickets: 5 },
  { id: "a4", name: "Priya Nair", role: "agent", isAvailable: true, currentTickets: 2, maxTickets: 5 },
];

const CHANNEL_ICONS = { sms: "💬", mms: "🖼️", whatsapp: "💚", email: "✉️", voice: "📞", rcs: "✨", web_chat: "🌐" };
const PRIORITY_COLORS = { low: "#10b981", medium: "#f59e0b", high: "#f97316", critical: "#ef4444" };
const STATUS_LABELS = { pending_agent: "Pending", agent_active: "Active", resolved: "Resolved", closed: "Closed", pending_upstream: "Upstream" };

export default function AgentInbox({ C: propC, tenants, viewLevel, currentTenantId, demoMode }) {
  const C = propC || {
    primary: "#00C9FF", accent: "#E040FB",
    bg: "#080d1a", surface: "#0d1425", border: "#182440",
    text: "#E8F4FD", muted: "#6B8BAE",
  };

  // Detect light vs dark from background color
  const isDark = !C.bg.startsWith("#f") && !C.bg.startsWith("#e") && !C.bg.startsWith("#d") && C.bg !== "#fff" && C.bg !== "white";
  const overlayA = isDark ? "rgba(255,255,255," : "rgba(0,0,0,";

  const [viewRole, setViewRole] = useState("supervisor");
  const [tickets, setTickets] = useState(MOCK_TICKETS);
  const [selectedTicket, setSelectedTicket] = useState(MOCK_TICKETS[0]);
  const [replyText, setReplyText] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedTicket]);

  const filteredTickets = tickets.filter(t =>
    filterStatus === "all" || t.status === filterStatus
  );
  const pendingCount = tickets.filter(t => t.status === "pending_agent").length;
  const activeCount = tickets.filter(t => t.status === "agent_active").length;

  const acceptTicket = (ticketId) => {
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: "agent_active", assignedAgent: "You" } : t));
    setSelectedTicket(prev => prev?.id === ticketId ? { ...prev, status: "agent_active", assignedAgent: "You" } : prev);
  };

  const resolveTicket = (ticketId) => {
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: "resolved" } : t));
    setSelectedTicket(prev => prev?.id === ticketId ? { ...prev, status: "resolved" } : prev);
  };

  const sendReply = () => {
    if (!replyText.trim() || !selectedTicket) return;
    const newMsg = {
      role: internalNote ? "system" : "agent",
      content: replyText,
      sentAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isInternal: internalNote,
    };
    setTickets(prev => prev.map(t => t.id === selectedTicket.id ? { ...t, transcript: [...t.transcript, newMsg] } : t));
    setSelectedTicket(prev => ({ ...prev, transcript: [...prev.transcript, newMsg] }));
    setReplyText("");
  };

  return (
    // Uses 100% of the space given by the parent — no fixed positioning, no own sidebar
    <div style={{ display: "flex", height: "100vh", background: C.bg, fontFamily: "'DM Sans', system-ui, sans-serif", color: C.text, overflow: "hidden" }}>

      {/* ── Ticket List Panel ── */}
      <div style={{ width: 260, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0, background: C.surface }}>

        <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>🎫 Support Inbox</div>
          <div style={{ display: "flex", gap: 3, background: `${overlayA}0.05)`, borderRadius: 8, padding: 3 }}>
            {["agent", "supervisor", "ew_admin"].map(r => (
              <button key={r} onClick={() => setViewRole(r)} style={{
                flex: 1, padding: "5px 0", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600,
                background: viewRole === r ? `linear-gradient(135deg,${C.primary},${C.accent})` : "transparent",
                color: viewRole === r ? "#fff" : C.muted, transition: "all 0.15s",
              }}>
                {r === "ew_admin" ? "EW" : r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
          {[["Pending", pendingCount, "#f59e0b"], ["Active", activeCount, C.primary], ["Total", tickets.length, C.muted]].map(([label, value, color]) => (
            <div key={label} style={{ flex: 1, textAlign: "center", padding: "6px 4px", background: `${overlayA}0.04)`, borderRadius: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
              <div style={{ fontSize: 10, color: C.muted }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{
            width: "100%", background: `${overlayA}0.06)`, border: `1px solid ${C.border}`,
            borderRadius: 7, padding: "6px 10px", color: C.text, fontSize: 12, outline: "none",
          }}>
            <option value="all">All Tickets</option>
            <option value="pending_agent">Pending</option>
            <option value="agent_active">Active</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredTickets.map(ticket => (
            <div key={ticket.id} onClick={() => setSelectedTicket(ticket)} style={{
              padding: "12px 16px", cursor: "pointer",
              borderBottom: `1px solid ${overlayA}0.04)`,
              background: selectedTicket?.id === ticket.id ? `${C.primary}12` : "transparent",
              borderLeft: selectedTicket?.id === ticket.id ? `3px solid ${C.primary}` : "3px solid transparent",
              transition: "all 0.1s",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: C.primary, fontWeight: 600 }}>{ticket.ticketNumber}</span>
                <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 20, fontWeight: 700, background: `${PRIORITY_COLORS[ticket.priority]}20`, color: PRIORITY_COLORS[ticket.priority] }}>
                  {ticket.priority.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 500, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {ticket.contact.name}
              </div>
              <div style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {ticket.summary}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12 }}>{CHANNEL_ICONS[ticket.channel]}</span>
                <StatusTag status={ticket.status} color={C.primary} />
                <span style={{ fontSize: 10, color: C.muted, marginLeft: "auto" }}>{ticket.createdAt}</span>
              </div>
            </div>
          ))}
        </div>

        {(viewRole === "supervisor" || viewRole === "ew_admin") && (
          <button onClick={() => setShowAgentPanel(!showAgentPanel)} style={{
            padding: "12px 16px", background: `${overlayA}0.03)`, border: "none",
            borderTop: `1px solid ${C.border}`, color: C.muted, cursor: "pointer",
            fontSize: 12, fontWeight: 600, textAlign: "left", fontFamily: "inherit",
          }}>
            👥 Agents {showAgentPanel ? "▲" : "▼"}
          </button>
        )}
      </div>

      {/* ── Ticket Detail ── */}
      {selectedTicket ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

          <div style={{ padding: "14px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.surface, flexShrink: 0 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3, flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{selectedTicket.ticketNumber}</span>
                <StatusTag status={selectedTicket.status} color={C.primary} />
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700, background: `${PRIORITY_COLORS[selectedTicket.priority]}20`, color: PRIORITY_COLORS[selectedTicket.priority] }}>
                  {selectedTicket.priority.toUpperCase()}
                </span>
                <span>{CHANNEL_ICONS[selectedTicket.channel]}</span>
              </div>
              <div style={{ fontSize: 13, color: C.muted }}>
                {selectedTicket.contact.name} · {selectedTicket.contact.email} · {selectedTicket.contact.phone}
                {selectedTicket.assignedAgent && <span style={{ color: C.primary }}> · {selectedTicket.assignedAgent}</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {selectedTicket.status === "pending_agent" && <ActionBtn label="Accept" color={C.primary} onClick={() => acceptTicket(selectedTicket.id)} />}
              {selectedTicket.status === "agent_active" && <>
                <ActionBtn label="Transfer" color={C.muted} onClick={() => {}} />
                <ActionBtn label="✓ Resolve" color="#10b981" onClick={() => resolveTicket(selectedTicket.id)} />
              </>}
              {viewRole === "supervisor" && selectedTicket.status === "agent_active" && (
                <ActionBtn label="👁 Intercept" color="#f59e0b" onClick={() => acceptTicket(selectedTicket.id)} />
              )}
            </div>
          </div>

          <div style={{ margin: "12px 24px 0", padding: "10px 14px", borderRadius: 10, flexShrink: 0, background: `${C.primary}08`, border: `1px solid ${C.primary}25`, fontSize: 13, color: C.muted }}>
            <span style={{ color: C.primary, fontWeight: 600 }}>🤖 AI Summary: </span>
            {selectedTicket.summary}
            <span style={{ marginLeft: 8 }}>· Reason: <span style={{ color: "#f59e0b" }}>{selectedTicket.escalationReason.replace(/_/g, " ")}</span></span>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
            {selectedTicket.transcript.map((msg, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "customer" ? "flex-start" : "flex-end" }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 3, paddingLeft: 4, paddingRight: 4 }}>
                  {msg.role === "customer" ? "👤 Customer" : msg.role === "ai" ? "🤖 AI Agent" : msg.isInternal ? "🔒 Internal" : "🧑‍💻 Agent"}
                  {" · "}{msg.sentAt}
                </div>
                <div style={{
                  maxWidth: "70%", padding: "10px 14px", borderRadius: 12, fontSize: 13, lineHeight: 1.5, color: C.text,
                  background: msg.role === "customer" ? `${overlayA}0.07)`
                    : msg.isEscalation ? "rgba(245,158,11,0.12)"
                    : msg.isInternal ? `${C.primary}10`
                    : msg.role === "ai" ? `${C.primary}18`
                    : "rgba(16,185,129,0.12)",
                  border: msg.isEscalation ? "1px solid rgba(245,158,11,0.3)"
                    : msg.isInternal ? `1px dashed ${C.primary}40` : "none",
                }}>
                  {msg.isEscalation && <div style={{ fontSize: 10, color: "#f59e0b", marginBottom: 4, fontWeight: 600 }}>🚨 ESCALATION TRIGGERED</div>}
                  {msg.isInternal && <div style={{ fontSize: 10, color: C.primary, marginBottom: 4, fontWeight: 600 }}>🔒 INTERNAL NOTE</div>}
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {(selectedTicket.status === "agent_active" || selectedTicket.status === "pending_agent") && (
            <div style={{ padding: "12px 24px 16px", borderTop: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {[[false, "💬 Reply", "#10b981"], [true, "🔒 Internal", C.primary]].map(([val, label, activeColor]) => (
                  <button key={String(val)} onClick={() => setInternalNote(val)} style={{
                    padding: "4px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                    background: internalNote === val ? `${activeColor}20` : `${overlayA}0.05)`,
                    color: internalNote === val ? activeColor : C.muted,
                    fontFamily: "inherit",
                  }}>{label}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                  placeholder={internalNote ? "Internal note — not visible to customer..." : `Reply via ${selectedTicket.channel}...`}
                  rows={3} style={{
                    flex: 1, background: `${overlayA}0.05)`, border: `1px solid ${internalNote ? C.primary + "40" : C.border}`,
                    borderRadius: 10, padding: "10px 14px", color: C.text, fontSize: 13,
                    outline: "none", resize: "none", fontFamily: "inherit",
                  }}
                />
                <button onClick={sendReply} disabled={!replyText.trim()} style={{
                  padding: "0 20px", borderRadius: 10, border: "none", cursor: replyText.trim() ? "pointer" : "default",
                  background: replyText.trim()
                    ? internalNote ? `linear-gradient(135deg,${C.primary},${C.accent})` : "linear-gradient(135deg,#059669,#10b981)"
                    : `${overlayA}0.05)`,
                  color: replyText.trim() ? "#fff" : C.muted,
                  fontWeight: 700, fontSize: 13, alignSelf: "flex-end", height: 44, transition: "all 0.2s",
                  fontFamily: "inherit",
                }}>
                  {internalNote ? "Save" : "Send →"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted }}>
          Select a ticket
        </div>
      )}

      {/* ── Agent Monitor ── */}
      {showAgentPanel && (viewRole === "supervisor" || viewRole === "ew_admin") && (
        <div style={{ width: 210, borderLeft: `1px solid ${C.border}`, padding: 16, overflowY: "auto", flexShrink: 0, background: C.surface }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Agents</div>
          {MOCK_AGENTS.map(agent => (
            <div key={agent.id} style={{ padding: "10px 12px", borderRadius: 10, marginBottom: 8, background: `${overlayA}0.04)`, border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: agent.isAvailable ? "#10b981" : C.muted, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{agent.name}</span>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>{agent.role} · {agent.isAvailable ? "Available" : "Offline"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ flex: 1, height: 4, borderRadius: 2, background: `${overlayA}0.08)` }}>
                  <div style={{ height: "100%", borderRadius: 2, width: `${(agent.currentTickets / agent.maxTickets) * 100}%`, background: agent.currentTickets / agent.maxTickets > 0.7 ? "#f97316" : C.primary, transition: "width 0.3s" }} />
                </div>
                <span style={{ fontSize: 10, color: C.muted }}>{agent.currentTickets}/{agent.maxTickets}</span>
              </div>
            </div>
          ))}
          <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: `${C.primary}08`, border: `1px solid ${C.primary}20` }}>
            <div style={{ fontSize: 11, color: C.primary, fontWeight: 600, marginBottom: 4 }}>📊 Live</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
              Available: {MOCK_AGENTS.filter(a => a.isAvailable).length}/{MOCK_AGENTS.length}<br />
              Pending: {pendingCount}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusTag({ status, color }) {
  const colors = { pending_agent: "#f59e0b", agent_active: "#6366f1", resolved: "#10b981", closed: "#475569", pending_upstream: "#ef4444" };
  const col = colors[status] || "#475569";
  return (
    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 600, background: `${col}20`, color: col }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function ActionBtn({ label, color, onClick }) {
  return (
    <button onClick={onClick} style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: `${color}20`, color, fontWeight: 600, fontSize: 12, transition: "all 0.15s", fontFamily: "inherit" }}>
      {label}
    </button>
  );
}
