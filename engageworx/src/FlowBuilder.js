import { useState, useRef, useCallback, useEffect } from "react";

// ─── NODE DEFINITIONS ─────────────────────────────────────────────────────────
const NODE_TYPES = {
  triggers: [
    { type: "trigger_message", label: "Message Received", icon: "📩", color: "#00C9FF", desc: "When a message arrives on any channel", category: "trigger" },
    { type: "trigger_keyword", label: "Keyword Match", icon: "🔑", color: "#00C9FF", desc: "When message contains specific keywords", category: "trigger" },
    { type: "trigger_event", label: "Event Trigger", icon: "⚡", color: "#00C9FF", desc: "When a custom event fires", category: "trigger" },
    { type: "trigger_schedule", label: "Scheduled", icon: "📅", color: "#00C9FF", desc: "Run at a specific time or interval", category: "trigger" },
    { type: "trigger_webhook", label: "Webhook", icon: "🔗", color: "#00C9FF", desc: "When an external webhook is received", category: "trigger" },
    { type: "trigger_signup", label: "New Signup", icon: "👤", color: "#00C9FF", desc: "When a new contact is created", category: "trigger" },
  ],
  actions: [
    { type: "action_sms", label: "Send SMS", icon: "💬", color: "#00E676", desc: "Send an SMS message", category: "action" },
    { type: "action_email", label: "Send Email", icon: "📧", color: "#FF6B35", desc: "Send an email message", category: "action" },
    { type: "action_whatsapp", label: "Send WhatsApp", icon: "📱", color: "#25D366", desc: "Send a WhatsApp message", category: "action" },
    { type: "action_rcs", label: "Send RCS", icon: "✨", color: "#7C4DFF", desc: "Send an RCS message", category: "action" },
    { type: "action_tag", label: "Add Tag", icon: "🏷️", color: "#FFD600", desc: "Add a tag to the contact", category: "action" },
    { type: "action_update", label: "Update Contact", icon: "📝", color: "#E040FB", desc: "Update contact properties", category: "action" },
    { type: "action_webhook", label: "Call Webhook", icon: "🌐", color: "#6B8BAE", desc: "Make an HTTP request", category: "action" },
    { type: "action_assign", label: "Assign Agent", icon: "👤", color: "#FF6B35", desc: "Assign to a specific agent", category: "action" },
    { type: "action_campaign", label: "Add to Campaign", icon: "🚀", color: "#00C9FF", desc: "Enroll in a campaign", category: "action" },
  ],
  conditions: [
    { type: "condition_if", label: "If / Else", icon: "🔀", color: "#FFD600", desc: "Branch based on conditions", category: "condition" },
    { type: "condition_ab", label: "A/B Split", icon: "⚖️", color: "#FFD600", desc: "Random percentage split", category: "condition" },
    { type: "condition_time", label: "Time Check", icon: "🕐", color: "#FFD600", desc: "Check time of day or week", category: "condition" },
    { type: "condition_tag", label: "Has Tag?", icon: "🏷️", color: "#FFD600", desc: "Check if contact has a tag", category: "condition" },
    { type: "condition_channel", label: "Channel Check", icon: "📡", color: "#FFD600", desc: "Check message channel", category: "condition" },
  ],
  timing: [
    { type: "delay_wait", label: "Wait", icon: "⏰", color: "#E040FB", desc: "Wait for a specified duration", category: "timing" },
    { type: "delay_until", label: "Wait Until", icon: "📆", color: "#E040FB", desc: "Wait until a specific time", category: "timing" },
    { type: "delay_response", label: "Wait for Reply", icon: "💬", color: "#E040FB", desc: "Pause until customer responds", category: "timing" },
  ],
  end: [
    { type: "end_stop", label: "End Flow", icon: "🏁", color: "#FF3B30", desc: "Stop the automation", category: "end" },
    { type: "end_transfer", label: "Transfer", icon: "↗️", color: "#FF3B30", desc: "Hand off to human agent", category: "end" },
  ],
};

const ALL_NODE_DEFS = Object.values(NODE_TYPES).flat();

// ─── DEMO FLOW ────────────────────────────────────────────────────────────────
function generateDemoFlow() {
  return {
    id: "flow_001",
    name: "Welcome Series Automation",
    status: "active",
    nodes: [
      { id: "n1", type: "trigger_signup", x: 400, y: 60, config: { channel: "any" } },
      { id: "n2", type: "action_sms", x: 400, y: 200, config: { message: "Welcome to EngageWorx! 🎉 Reply HELP for support or MENU for options." } },
      { id: "n3", type: "delay_wait", x: 400, y: 340, config: { duration: 24, unit: "hours" } },
      { id: "n4", type: "condition_if", x: 400, y: 480, config: { field: "replied", operator: "equals", value: "true" } },
      { id: "n5", type: "action_email", x: 200, y: 620, config: { subject: "Getting Started Guide", template: "onboarding_guide" } },
      { id: "n6", type: "action_tag", x: 600, y: 620, config: { tag: "Engaged" } },
      { id: "n7", type: "delay_wait", x: 200, y: 760, config: { duration: 3, unit: "days" } },
      { id: "n8", type: "action_campaign", x: 200, y: 900, config: { campaign: "Product Tour Series" } },
      { id: "n9", type: "action_sms", x: 600, y: 760, config: { message: "Hey! We noticed you haven't explored our platform yet. Need any help getting started?" } },
      { id: "n10", type: "delay_response", x: 600, y: 900, config: { timeout: 48, unit: "hours" } },
      { id: "n11", type: "end_transfer", x: 600, y: 1040, config: { team: "Sales" } },
    ],
    connections: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5", label: "Yes" },
      { from: "n4", to: "n6", label: "No" },
      { from: "n5", to: "n7" },
      { from: "n7", to: "n8" },
      { from: "n6", to: "n9" },
      { from: "n9", to: "n10" },
      { from: "n10", to: "n11" },
    ],
  };
}

const SAVED_FLOWS = [
  { id: "flow_001", name: "Welcome Series Automation", status: "active", nodes: 11, triggers: 482, lastRun: "2 min ago" },
  { id: "flow_002", name: "Cart Abandonment Recovery", status: "active", nodes: 8, triggers: 1247, lastRun: "5 min ago" },
  { id: "flow_003", name: "VIP Customer Nurture", status: "active", nodes: 14, triggers: 89, lastRun: "1 hr ago" },
  { id: "flow_004", name: "Re-engagement Campaign", status: "paused", nodes: 9, triggers: 0, lastRun: "2 days ago" },
  { id: "flow_005", name: "Support Ticket Routing", status: "active", nodes: 12, triggers: 3420, lastRun: "Just now" },
  { id: "flow_006", name: "Birthday Rewards", status: "draft", nodes: 6, triggers: 0, lastRun: "Never" },
];

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function FlowBuilder({ C, tenants, viewLevel = "tenant", currentTenantId }) {
  const [view, setView] = useState("list");
  const [flow, setFlow] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connecting, setConnecting] = useState(null);
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [showPalette, setShowPalette] = useState(true);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [paletteCategory, setPaletteCategory] = useState("all");
  const canvasRef = useRef(null);

  const inputStyle = { width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" };
  const btnPrimary = { background: `linear-gradient(135deg, ${C.primary}, ${C.accent || C.primary})`, border: "none", borderRadius: 8, padding: "8px 16px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" };
  const btnSec = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 16px", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" };

  const loadFlow = (f) => {
    const demo = generateDemoFlow();
    setFlow(demo);
    setNodes(demo.nodes);
    setConnections(demo.connections);
    setSelectedNode(null);
    setView("builder");
  };

  const newFlow = () => {
    const trigger = { id: "n_new_1", type: "trigger_message", x: 400, y: 80, config: {} };
    setFlow({ id: "flow_new", name: "Untitled Flow", status: "draft", nodes: [trigger], connections: [] });
    setNodes([trigger]);
    setConnections([]);
    setSelectedNode(null);
    setView("builder");
  };

  const getNodeDef = (type) => ALL_NODE_DEFS.find(d => d.type === type) || { label: type, icon: "❓", color: "#6B8BAE", desc: "", category: "unknown" };

  const addNode = (typeDef) => {
    const id = `n_${Date.now()}`;
    const cx = (canvasRef.current?.clientWidth || 800) / 2 / zoom - pan.x / zoom;
    const cy = 200 / zoom - pan.y / zoom + nodes.length * 60;
    const newNode = { id, type: typeDef.type, x: Math.round(cx), y: Math.round(cy), config: {} };
    setNodes(prev => [...prev, newNode]);
    setSelectedNode(newNode);
  };

  const deleteNode = (nodeId) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setConnections(prev => prev.filter(c => c.from !== nodeId && c.to !== nodeId));
    if (selectedNode?.id === nodeId) setSelectedNode(null);
  };

  // ─── MOUSE HANDLERS ────
  const handleCanvasMouseDown = (e) => {
    if (e.target === canvasRef.current || e.target.classList.contains("canvas-grid")) {
      setSelectedNode(null);
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };
  const handleCanvasMouseMove = useCallback((e) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
    if (dragging) {
      setNodes(prev => prev.map(n => n.id === dragging ? { ...n, x: (e.clientX - dragOffset.x - pan.x) / zoom, y: (e.clientY - dragOffset.y - pan.y) / zoom } : n));
    }
  }, [isPanning, panStart, dragging, dragOffset, pan, zoom]);
  const handleCanvasMouseUp = () => {
    setIsPanning(false);
    setDragging(null);
    setConnecting(null);
  };

  const handleNodeMouseDown = (e, node) => {
    e.stopPropagation();
    setSelectedNode(node);
    setDragging(node.id);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handlePortClick = (nodeId, portType) => {
    if (portType === "out") {
      setConnecting(nodeId);
    } else if (portType === "in" && connecting && connecting !== nodeId) {
      const exists = connections.some(c => c.from === connecting && c.to === nodeId);
      if (!exists) {
        setConnections(prev => [...prev, { from: connecting, to: nodeId }]);
      }
      setConnecting(null);
    }
  };

  const deleteConnection = (fromId, toId) => {
    setConnections(prev => prev.filter(c => !(c.from === fromId && c.to === toId)));
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoom(prev => Math.max(0.3, Math.min(2, prev + delta)));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener("wheel", handleWheel, { passive: false });
      return () => canvas.removeEventListener("wheel", handleWheel);
    }
  }, []);

  // ─── CONNECTION LINES (SVG) ────
  const renderConnections = () => {
    return connections.map((conn, i) => {
      const fromNode = nodes.find(n => n.id === conn.from);
      const toNode = nodes.find(n => n.id === conn.to);
      if (!fromNode || !toNode) return null;

      const fromDef = getNodeDef(fromNode.type);
      const x1 = fromNode.x + 90;
      const y1 = fromNode.y + 56;
      const x2 = toNode.x + 90;
      const y2 = toNode.y;
      const midY = (y1 + y2) / 2;

      return (
        <g key={i}>
          <path
            d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
            fill="none" stroke={fromDef.color + "66"} strokeWidth={2.5}
            strokeDasharray={conn.label ? "6 3" : "none"}
          />
          {/* Clickable hitbox */}
          <path
            d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
            fill="none" stroke="transparent" strokeWidth={14}
            style={{ cursor: "pointer" }}
            onClick={() => deleteConnection(conn.from, conn.to)}
          />
          {/* Arrow */}
          <polygon
            points={`${x2 - 5},${y2 - 8} ${x2 + 5},${y2 - 8} ${x2},${y2}`}
            fill={fromDef.color + "88"}
          />
          {/* Label */}
          {conn.label && (
            <text x={(x1 + x2) / 2} y={midY - 6} fill={fromDef.color} fontSize={10} fontWeight={700} textAnchor="middle" fontFamily="'DM Sans', sans-serif">{conn.label}</text>
          )}
        </g>
      );
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // FLOW LIST VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "list") {
    return (
      <div style={{ padding: "32px 40px", maxWidth: 1200, fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>Flow Builder</h1>
            <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>Visual automation workflows with drag-and-drop logic</p>
          </div>
          <button onClick={newFlow} style={btnPrimary}>+ Create Flow</button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total Flows", value: SAVED_FLOWS.length, color: C.primary, icon: "⚡" },
            { label: "Active", value: SAVED_FLOWS.filter(f => f.status === "active").length, color: "#00E676", icon: "✅" },
            { label: "Total Triggers", value: SAVED_FLOWS.reduce((s, f) => s + f.triggers, 0).toLocaleString(), color: "#FFD600", icon: "🔔" },
            { label: "Avg Nodes/Flow", value: (SAVED_FLOWS.reduce((s, f) => s + f.nodes, 0) / SAVED_FLOWS.length).toFixed(1), color: "#E040FB", icon: "🔗" },
          ].map((kpi, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.04)", borderTop: `3px solid ${kpi.color}`, borderRadius: 12, padding: "16px 18px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 0.8 }}>{kpi.label}</span>
                <span style={{ fontSize: 14 }}>{kpi.icon}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginTop: 6 }}>{kpi.value}</div>
            </div>
          ))}
        </div>

        {/* Flow Cards */}
        <div style={{ display: "grid", gap: 12 }}>
          {SAVED_FLOWS.map(f => {
            const statusColor = f.status === "active" ? "#00E676" : f.status === "paused" ? "#FFD600" : "#6B8BAE";
            return (
              <div key={f.id} onClick={() => loadFlow(f)} style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                borderLeft: `4px solid ${statusColor}`, borderRadius: 12, padding: "20px 24px",
                display: "grid", gridTemplateColumns: "1fr 100px 100px 120px 100px 100px",
                alignItems: "center", gap: 16, cursor: "pointer", transition: "all 0.2s",
              }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
              >
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{f.name}</div>
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>Last run: {f.lastRun}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>{f.nodes}</div>
                  <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>Nodes</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>{f.triggers.toLocaleString()}</div>
                  <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>Triggers</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <span style={{ background: statusColor + "18", color: statusColor, border: `1px solid ${statusColor}44`, borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
                    {f.status === "active" ? "● Active" : f.status === "paused" ? "⏸ Paused" : "◯ Draft"}
                  </span>
                </div>
                <div style={{ textAlign: "center" }}>
                  <button style={{ ...btnSec, padding: "6px 12px", fontSize: 11 }}>Edit</button>
                </div>
                <div style={{ textAlign: "center" }}>
                  <button style={{ ...btnSec, padding: "6px 12px", fontSize: 11 }}>Clone</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Templates */}
        <div style={{ marginTop: 28 }}>
          <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 700, marginBottom: 14 }}>Templates</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {[
              { name: "Welcome Series", icon: "👋", desc: "Onboard new contacts with a multi-step welcome sequence", nodes: 8 },
              { name: "Cart Recovery", icon: "🛒", desc: "Win back abandoned carts with timed SMS + email follow-ups", nodes: 10 },
              { name: "Re-engagement", icon: "🔄", desc: "Reactivate dormant contacts with progressive messaging", nodes: 7 },
              { name: "Support Routing", icon: "🎯", desc: "Automatically route support tickets based on keywords and sentiment", nodes: 12 },
              { name: "Birthday Rewards", icon: "🎂", desc: "Send personalized birthday offers on the right day", nodes: 5 },
              { name: "Lead Scoring", icon: "📊", desc: "Automatically score and qualify leads based on engagement", nodes: 9 },
            ].map(t => (
              <div key={t.name} onClick={newFlow} style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14, padding: "20px", cursor: "pointer", transition: "all 0.2s",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.primary + "44"; e.currentTarget.style.background = `${C.primary}08`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
              >
                <div style={{ fontSize: 32, marginBottom: 10 }}>{t.icon}</div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{t.name}</div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, lineHeight: 1.4, marginBottom: 10 }}>{t.desc}</div>
                <span style={{ color: C.muted, fontSize: 11 }}>{t.nodes} nodes</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FLOW BUILDER CANVAS
  // ═══════════════════════════════════════════════════════════════════════════
  const nodeDef = selectedNode ? getNodeDef(selectedNode.type) : null;

  const filteredPalette = ALL_NODE_DEFS.filter(d => {
    if (paletteCategory !== "all" && d.category !== paletteCategory) return false;
    if (paletteSearch) return d.label.toLowerCase().includes(paletteSearch.toLowerCase());
    return true;
  });

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'DM Sans', sans-serif", overflow: "hidden" }}
      onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp}
    >
      {/* ═══════════ LEFT: Node Palette ═══════════ */}
      {showPalette && (
        <div style={{ width: 240, borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.15)", flexShrink: 0 }}>
          <div style={{ padding: "14px 12px 8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>Node Palette</span>
              <button onClick={() => setShowPalette(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
            <input value={paletteSearch} onChange={e => setPaletteSearch(e.target.value)} placeholder="Search nodes..." style={{ ...inputStyle, fontSize: 12, padding: "7px 10px", marginBottom: 6 }} />
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {[
                { id: "all", label: "All" },
                { id: "trigger", label: "Triggers" },
                { id: "action", label: "Actions" },
                { id: "condition", label: "Logic" },
                { id: "timing", label: "Timing" },
                { id: "end", label: "End" },
              ].map(cat => (
                <button key={cat.id} onClick={() => setPaletteCategory(cat.id)} style={{
                  background: paletteCategory === cat.id ? `${C.primary}22` : "transparent",
                  border: `1px solid ${paletteCategory === cat.id ? C.primary + "44" : "rgba(255,255,255,0.06)"}`,
                  borderRadius: 4, padding: "2px 7px", fontSize: 9, cursor: "pointer",
                  color: paletteCategory === cat.id ? C.primary : "rgba(255,255,255,0.3)", fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                }}>{cat.label}</button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px 12px" }}>
            {Object.entries(NODE_TYPES).map(([category, typeDefs]) => {
              const filtered = typeDefs.filter(d => {
                if (paletteCategory !== "all" && d.category !== paletteCategory) return false;
                if (paletteSearch) return d.label.toLowerCase().includes(paletteSearch.toLowerCase());
                return true;
              });
              if (filtered.length === 0) return null;
              return (
                <div key={category} style={{ marginBottom: 12 }}>
                  <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, paddingLeft: 4 }}>{category}</div>
                  {filtered.map(d => (
                    <button key={d.type} onClick={() => addNode(d)} style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 10px", borderRadius: 8, border: `1px solid ${d.color}22`,
                      background: `${d.color}08`, cursor: "pointer", marginBottom: 4,
                      textAlign: "left", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.background = `${d.color}18`; e.currentTarget.style.borderColor = `${d.color}44`; }}
                      onMouseLeave={e => { e.currentTarget.style.background = `${d.color}08`; e.currentTarget.style.borderColor = `${d.color}22`; }}
                    >
                      <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{d.icon}</span>
                      <div>
                        <div style={{ color: "#fff", fontSize: 11, fontWeight: 600 }}>{d.label}</div>
                        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, lineHeight: 1.2 }}>{d.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════ CENTER: Canvas ═══════════ */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Toolbar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => { setView("list"); setFlow(null); }} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13 }}>← Back</button>
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.1)" }} />
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{flow?.name || "Untitled Flow"}</span>
            <span style={{ background: "#00E67622", color: "#00E676", border: "1px solid #00E67644", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>● {flow?.status || "draft"}</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!showPalette && <button onClick={() => setShowPalette(true)} style={btnSec}>+ Nodes</button>}
            <button onClick={() => setZoom(prev => Math.min(2, prev + 0.15))} style={{ ...btnSec, padding: "6px 10px" }}>+</button>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, width: 40, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(prev => Math.max(0.3, prev - 0.15))} style={{ ...btnSec, padding: "6px 10px" }}>−</button>
            <button onClick={() => { setZoom(0.85); setPan({ x: 0, y: 0 }); }} style={{ ...btnSec, padding: "6px 10px", fontSize: 11 }}>Reset</button>
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.1)" }} />
            <button style={btnSec}>▶ Test</button>
            <button style={btnPrimary}>💾 Save</button>
          </div>
        </div>

        {/* Canvas */}
        <div ref={canvasRef} onMouseDown={handleCanvasMouseDown} style={{
          width: "100%", height: "100%", cursor: isPanning ? "grabbing" : connecting ? "crosshair" : "grab",
          background: `radial-gradient(circle at 50% 50%, ${C.primary}05 0%, transparent 70%)`,
          position: "relative", overflow: "hidden",
        }}>
          {/* Grid Pattern */}
          <div className="canvas-grid" style={{
            position: "absolute", inset: 0,
            backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)`,
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }} />

          {/* Transform wrapper */}
          <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0", position: "absolute", top: 0, left: 0 }}>
            {/* SVG Connections */}
            <svg style={{ position: "absolute", top: 0, left: 0, width: 2000, height: 2000, pointerEvents: "none", overflow: "visible" }}>
              <g style={{ pointerEvents: "auto" }}>{renderConnections()}</g>
              {/* Active connecting line */}
              {connecting && (
                <line x1={nodes.find(n => n.id === connecting)?.x + 90 || 0} y1={nodes.find(n => n.id === connecting)?.y + 56 || 0}
                  x2={nodes.find(n => n.id === connecting)?.x + 90 || 0} y2={(nodes.find(n => n.id === connecting)?.y || 0) + 100}
                  stroke={C.primary} strokeWidth={2} strokeDasharray="6 3" opacity={0.5}
                />
              )}
            </svg>

            {/* Nodes */}
            {nodes.map(node => {
              const def = getNodeDef(node.type);
              const isSelected = selectedNode?.id === node.id;
              const isConnectTarget = connecting && connecting !== node.id;

              return (
                <div key={node.id} onMouseDown={e => handleNodeMouseDown(e, node)}
                  style={{
                    position: "absolute", left: node.x, top: node.y, width: 180,
                    background: isSelected ? `${def.color}20` : "rgba(15,15,25,0.92)",
                    border: `2px solid ${isSelected ? def.color : isConnectTarget ? C.primary + "88" : def.color + "33"}`,
                    borderRadius: 14, padding: 0, cursor: dragging === node.id ? "grabbing" : "grab",
                    boxShadow: isSelected ? `0 0 20px ${def.color}33` : `0 4px 20px rgba(0,0,0,0.4)`,
                    transition: dragging === node.id ? "none" : "box-shadow 0.2s, border-color 0.2s",
                    userSelect: "none", zIndex: isSelected ? 100 : 1,
                    backdropFilter: "blur(10px)",
                  }}
                >
                  {/* Input port */}
                  {def.category !== "trigger" && (
                    <div onClick={e => { e.stopPropagation(); handlePortClick(node.id, "in"); }}
                      style={{
                        position: "absolute", top: -7, left: "50%", transform: "translateX(-50%)",
                        width: 14, height: 14, borderRadius: "50%",
                        background: isConnectTarget ? C.primary : def.color + "44",
                        border: `2px solid ${isConnectTarget ? C.primary : def.color}`,
                        cursor: "pointer", zIndex: 10,
                      }}
                    />
                  )}

                  {/* Header */}
                  <div style={{
                    background: `${def.color}22`, borderBottom: `1px solid ${def.color}22`,
                    padding: "8px 12px", borderRadius: "12px 12px 0 0",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span style={{ fontSize: 16 }}>{def.icon}</span>
                    <span style={{ color: def.color, fontSize: 11, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{def.label}</span>
                    <span style={{ fontSize: 8, color: def.color + "66", textTransform: "uppercase", letterSpacing: 0.5 }}>{def.category}</span>
                  </div>

                  {/* Body */}
                  <div style={{ padding: "8px 12px 10px" }}>
                    {node.config?.message && (
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, lineHeight: 1.3, overflow: "hidden", maxHeight: 28 }}>{node.config.message.slice(0, 50)}...</div>
                    )}
                    {node.config?.duration && (
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>⏱ {node.config.duration} {node.config.unit}</div>
                    )}
                    {node.config?.field && (
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>If {node.config.field} {node.config.operator} {node.config.value}</div>
                    )}
                    {node.config?.tag && (
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>🏷️ {node.config.tag}</div>
                    )}
                    {node.config?.subject && (
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>📧 {node.config.subject}</div>
                    )}
                    {node.config?.campaign && (
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>🚀 {node.config.campaign}</div>
                    )}
                    {node.config?.team && (
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>↗️ → {node.config.team}</div>
                    )}
                    {!node.config?.message && !node.config?.duration && !node.config?.field && !node.config?.tag && !node.config?.subject && !node.config?.campaign && !node.config?.team && (
                      <div style={{ color: "rgba(255,255,255,0.15)", fontSize: 10, fontStyle: "italic" }}>Click to configure</div>
                    )}
                  </div>

                  {/* Output port */}
                  {def.category !== "end" && (
                    <div onClick={e => { e.stopPropagation(); handlePortClick(node.id, "out"); }}
                      style={{
                        position: "absolute", bottom: -7, left: "50%", transform: "translateX(-50%)",
                        width: 14, height: 14, borderRadius: "50%",
                        background: connecting === node.id ? C.primary : def.color + "44",
                        border: `2px solid ${connecting === node.id ? C.primary : def.color}`,
                        cursor: "pointer", zIndex: 10,
                      }}
                    />
                  )}

                  {/* Branch ports for conditions */}
                  {def.category === "condition" && (
                    <>
                      <div style={{ position: "absolute", bottom: -7, left: "25%", transform: "translateX(-50%)", width: 10, height: 10, borderRadius: "50%", background: "#00E676", border: "2px solid #00E676", cursor: "pointer" }} title="Yes" />
                      <div style={{ position: "absolute", bottom: -7, left: "75%", transform: "translateX(-50%)", width: 10, height: 10, borderRadius: "50%", background: "#FF3B30", border: "2px solid #FF3B30", cursor: "pointer" }} title="No" />
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Connecting indicator */}
          {connecting && (
            <div style={{ position: "absolute", bottom: 60, left: "50%", transform: "translateX(-50%)", background: `${C.primary}22`, border: `1px solid ${C.primary}44`, borderRadius: 10, padding: "8px 18px", color: C.primary, fontSize: 12, fontWeight: 600, backdropFilter: "blur(8px)", zIndex: 20 }}>
              Click a node's input port to connect · Press Esc to cancel
            </div>
          )}

          {/* Canvas stats */}
          <div style={{ position: "absolute", bottom: 12, left: 16, display: "flex", gap: 12, zIndex: 10 }}>
            <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>{nodes.length} nodes</span>
            <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>{connections.length} connections</span>
            <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>Zoom: {Math.round(zoom * 100)}%</span>
          </div>
        </div>
      </div>

      {/* ═══════════ RIGHT: Properties Panel ═══════════ */}
      {selectedNode && (
        <div style={{ width: 300, borderLeft: "1px solid rgba(255,255,255,0.06)", overflowY: "auto", background: "rgba(0,0,0,0.15)", flexShrink: 0 }}>
          <div style={{ padding: "16px" }}>
            {/* Node Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 22 }}>{nodeDef?.icon}</span>
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{nodeDef?.label}</div>
                  <div style={{ color: nodeDef?.color, fontSize: 10, textTransform: "uppercase" }}>{nodeDef?.category}</div>
                </div>
              </div>
              <button onClick={() => deleteNode(selectedNode.id)} style={{ background: "#FF3B3022", border: "1px solid #FF3B3044", borderRadius: 6, padding: "4px 10px", color: "#FF3B30", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>Delete</button>
            </div>

            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginBottom: 16, lineHeight: 1.4 }}>{nodeDef?.desc}</div>

            {/* Node Properties */}
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Node ID</label>
                <div style={{ ...inputStyle, background: "rgba(0,0,0,0.2)", color: "rgba(255,255,255,0.3)", fontFamily: "monospace", fontSize: 11 }}>{selectedNode.id}</div>
              </div>

              {/* Dynamic fields based on type */}
              {(nodeDef?.category === "action" && selectedNode.type.includes("sms")) && (
                <>
                  <div>
                    <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Message</label>
                    <textarea value={selectedNode.config?.message || ""} onChange={e => {
                      const updated = { ...selectedNode, config: { ...selectedNode.config, message: e.target.value } };
                      setNodes(prev => prev.map(n => n.id === selectedNode.id ? updated : n));
                      setSelectedNode(updated);
                    }} rows={4} style={{ ...inputStyle, resize: "vertical" }} placeholder="Enter SMS message..." />
                  </div>
                  <div>
                    <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Sender ID</label>
                    <select style={inputStyle}><option>Default</option><option>+1 (555) 000-1234</option><option>ENGWX</option></select>
                  </div>
                </>
              )}

              {(nodeDef?.category === "action" && selectedNode.type.includes("email")) && (
                <>
                  <div>
                    <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Subject Line</label>
                    <input value={selectedNode.config?.subject || ""} onChange={e => {
                      const updated = { ...selectedNode, config: { ...selectedNode.config, subject: e.target.value } };
                      setNodes(prev => prev.map(n => n.id === selectedNode.id ? updated : n));
                      setSelectedNode(updated);
                    }} style={inputStyle} placeholder="Email subject..." />
                  </div>
                  <div>
                    <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Template</label>
                    <select style={inputStyle}><option>Select template...</option><option>Welcome Email</option><option>Onboarding Guide</option><option>Promotional</option></select>
                  </div>
                </>
              )}

              {nodeDef?.category === "timing" && (
                <>
                  <div>
                    <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Duration</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="number" value={selectedNode.config?.duration || ""} onChange={e => {
                        const updated = { ...selectedNode, config: { ...selectedNode.config, duration: parseInt(e.target.value) } };
                        setNodes(prev => prev.map(n => n.id === selectedNode.id ? updated : n));
                        setSelectedNode(updated);
                      }} style={{ ...inputStyle, width: "50%" }} placeholder="0" />
                      <select value={selectedNode.config?.unit || "hours"} onChange={e => {
                        const updated = { ...selectedNode, config: { ...selectedNode.config, unit: e.target.value } };
                        setNodes(prev => prev.map(n => n.id === selectedNode.id ? updated : n));
                        setSelectedNode(updated);
                      }} style={{ ...inputStyle, width: "50%" }}>
                        <option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {nodeDef?.category === "condition" && (
                <>
                  <div>
                    <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Condition Field</label>
                    <select style={inputStyle} value={selectedNode.config?.field || ""} onChange={e => {
                      const updated = { ...selectedNode, config: { ...selectedNode.config, field: e.target.value } };
                      setNodes(prev => prev.map(n => n.id === selectedNode.id ? updated : n));
                      setSelectedNode(updated);
                    }}>
                      <option value="">Select field...</option>
                      <option value="replied">Has Replied</option>
                      <option value="tag">Has Tag</option>
                      <option value="channel">Channel</option>
                      <option value="open_rate">Open Rate</option>
                      <option value="sentiment">Sentiment Score</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Operator</label>
                      <select style={inputStyle}><option>equals</option><option>not equals</option><option>contains</option><option>greater than</option><option>less than</option></select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Value</label>
                      <input value={selectedNode.config?.value || ""} onChange={e => {
                        const updated = { ...selectedNode, config: { ...selectedNode.config, value: e.target.value } };
                        setNodes(prev => prev.map(n => n.id === selectedNode.id ? updated : n));
                        setSelectedNode(updated);
                      }} style={inputStyle} placeholder="Value" />
                    </div>
                  </div>
                </>
              )}

              {selectedNode.type.includes("tag") && (
                <div>
                  <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Tag Name</label>
                  <select style={inputStyle} value={selectedNode.config?.tag || ""} onChange={e => {
                    const updated = { ...selectedNode, config: { ...selectedNode.config, tag: e.target.value } };
                    setNodes(prev => prev.map(n => n.id === selectedNode.id ? updated : n));
                    setSelectedNode(updated);
                  }}>
                    <option value="">Select tag...</option>
                    {["VIP", "Engaged", "New", "Churned", "Lead", "Prospect", "Active", "Inactive"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}

              {selectedNode.type.includes("campaign") && (
                <div>
                  <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Campaign</label>
                  <select style={inputStyle}><option>Select campaign...</option><option>Product Tour Series</option><option>Spring Flash Sale</option><option>Re-engagement</option></select>
                </div>
              )}

              {selectedNode.type.includes("transfer") && (
                <div>
                  <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Transfer To</label>
                  <select style={inputStyle}><option>Select team...</option><option>Sales</option><option>Support</option><option>Billing</option><option>Technical</option></select>
                </div>
              )}

              {/* Position */}
              <div>
                <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Position</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ ...inputStyle, background: "rgba(0,0,0,0.2)", color: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "monospace" }}>X: {Math.round(selectedNode.x)}</div>
                  <div style={{ ...inputStyle, background: "rgba(0,0,0,0.2)", color: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "monospace" }}>Y: {Math.round(selectedNode.y)}</div>
                </div>
              </div>

              {/* Connections */}
              <div>
                <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Connections</label>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                  <div>In: {connections.filter(c => c.to === selectedNode.id).length}</div>
                  <div>Out: {connections.filter(c => c.from === selectedNode.id).length}</div>
                </div>
              </div>
            </div>

            {/* Connect button */}
            <button onClick={() => setConnecting(selectedNode.id)} style={{ ...btnSec, width: "100%", marginTop: 16 }}>🔗 Connect to another node</button>
          </div>
        </div>
      )}
    </div>
  );
}
