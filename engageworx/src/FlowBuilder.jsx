import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const C = {
  bg: "#0A0E1A", surface: "#111827", surfaceAlt: "#1a2235",
  border: "#1e2d45", accent: "#00C9FF", accent2: "#E040FB",
  accent3: "#00E676", accent4: "#FF6B35", warning: "#FFD600",
  text: "#E8F4FD", muted: "#6B8BAE", dim: "#3A5068",
};

const NODE_TYPES = {
  trigger: {
    label: "Triggers", color: C.accent3,
    items: [
      { type: "trigger_inbound", label: "Inbound Message", icon: "📨", desc: "When a customer texts in" },
      { type: "trigger_keyword", label: "Keyword Match", icon: "🔑", desc: "Message contains keyword" },
      { type: "trigger_schedule", label: "Scheduled", icon: "⏰", desc: "Run at a specific time" },
      { type: "trigger_new_contact", label: "New Contact", icon: "👤", desc: "New contact added" },
    ],
  },
  action: {
    label: "Actions", color: C.accent,
    items: [
      { type: "action_sms", label: "Send SMS", icon: "💬", desc: "Send a text message" },
      { type: "action_email", label: "Send Email", icon: "📧", desc: "Send an email" },
      { type: "action_whatsapp", label: "Send WhatsApp", icon: "📱", desc: "Send WhatsApp message" },
      { type: "action_rcs", label: "Send RCS", icon: "✨", desc: "Send RCS message" },
      { type: "action_tag", label: "Add Tag", icon: "🏷️", desc: "Tag the contact" },
      { type: "action_assign", label: "Assign Agent", icon: "👤", desc: "Route to human agent" },
      { type: "action_webhook", label: "Webhook", icon: "🌐", desc: "Call external API" },
    ],
  },
  logic: {
    label: "Logic", color: C.accent2,
    items: [
      { type: "logic_condition", label: "If / Else", icon: "🔀", desc: "Branch on condition" },
      { type: "logic_delay", label: "Wait / Delay", icon: "⏳", desc: "Wait before next step" },
      { type: "logic_ai", label: "AI Classify", icon: "🧠", desc: "AI analyzes message" },
      { type: "logic_split", label: "A/B Split", icon: "📊", desc: "Split for testing" },
    ],
  },
};

const ALL_ITEMS = Object.values(NODE_TYPES).flatMap(c => c.items);
const getDef = (t) => ALL_ITEMS.find(n => n.type === t) || { label: t, icon: "❓" };
const getColor = (t) => t.startsWith("trigger") ? C.accent3 : t.startsWith("action") ? C.accent : C.accent2;
let _id = 1;
const gid = () => `n_${Date.now()}_${_id++}`;

// ── SVG Connection Line ──────────────────────────────
function ConnectionLine({ from, to, nodes }) {
  const a = nodes.find(n => n.id === from);
  const b = nodes.find(n => n.id === to);
  if (!a || !b) return null;
  const x1 = a.x + 110, y1 = a.y + 80;
  const x2 = b.x + 110, y2 = b.y;
  const midY = (y1 + y2) / 2;
  return (
    <path
      d={`M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`}
      fill="none" stroke={C.accent + "66"} strokeWidth={2}
      strokeDasharray="6 3"
    />
  );
}

// ── Flow Node ────────────────────────────────────────
function FlowNode({ node, selected, onMouseDown, onClick, onDelete }) {
  const def = getDef(node.type);
  const color = getColor(node.type);
  const isSel = selected === node.id;
  return (
    <div
      onMouseDown={e => { e.stopPropagation(); onMouseDown(e, node.id); }}
      onClick={e => { e.stopPropagation(); onClick(node.id); }}
      style={{
        position: "absolute", left: node.x, top: node.y, width: 200,
        background: C.surface, border: `2px solid ${isSel ? color : C.border}`,
        borderRadius: 12, cursor: "grab", userSelect: "none",
        boxShadow: isSel ? `0 0 20px ${color}33` : "0 4px 12px rgba(0,0,0,0.3)",
        transition: "box-shadow 0.2s, border-color 0.2s", zIndex: isSel ? 10 : 1,
      }}
    >
      <div style={{
        background: color + "15", borderBottom: `1px solid ${color}33`,
        borderRadius: "10px 10px 0 0", padding: "7px 10px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14 }}>{def.icon}</span>
          <span style={{ color, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {node.type.split("_")[0]}
          </span>
        </div>
        <button onClick={e => { e.stopPropagation(); onDelete(node.id); }} style={{
          background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 11, padding: "2px 4px",
        }}>✕</button>
      </div>
      <div style={{ padding: "8px 10px" }}>
        <div style={{ color: C.text, fontSize: 12, fontWeight: 700 }}>{node.label || def.label}</div>
        {node.config?.message && (
          <div style={{ color: C.muted, fontSize: 10, marginTop: 3, lineHeight: 1.4, maxHeight: 32, overflow: "hidden" }}>
            "{node.config.message.slice(0, 50)}{node.config.message.length > 50 ? "..." : ""}"
          </div>
        )}
        {node.config?.keyword && (
          <div style={{ marginTop: 3 }}>
            <span style={{ background: color + "22", border: `1px solid ${color}33`, borderRadius: 3, padding: "1px 5px", fontSize: 9, color }}>{node.config.keyword}</span>
          </div>
        )}
        {node.config?.delay && <div style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>⏳ {node.config.delay}</div>}
        {node.config?.condition && <div style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>If: {node.config.condition}</div>}
      </div>
      {/* Bottom connector */}
      <div style={{
        position: "absolute", bottom: -7, left: "50%", transform: "translateX(-50%)",
        width: 10, height: 10, borderRadius: "50%", background: C.surface, border: `2px solid ${color}`,
      }} />
      {/* Top connector */}
      {!node.type.startsWith("trigger") && (
        <div style={{
          position: "absolute", top: -7, left: "50%", transform: "translateX(-50%)",
          width: 10, height: 10, borderRadius: "50%", background: C.surface, border: `2px solid ${color}`,
        }} />
      )}
    </div>
  );
}

// ── Config Panel ─────────────────────────────────────
function ConfigPanel({ node, nodes, connections, onChange, onConnect, onDisconnect, onClose }) {
  if (!node) return null;
  const def = getDef(node.type);
  const color = getColor(node.type);
  const cfg = node.config || {};
  const set = (k, v) => onChange(node.id, { ...cfg, [k]: v });

  const inp = {
    width: "100%", background: C.bg, border: `1px solid ${C.border}`,
    borderRadius: 7, padding: "8px 10px", color: C.text, fontSize: 12,
    boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", outline: "none",
  };

  const outgoing = connections.filter(c => c.from === node.id);
  const available = nodes.filter(n => n.id !== node.id && !outgoing.some(c => c.to === n.id));

  return (
    <div style={{
      width: 280, background: C.surface, borderLeft: `1px solid ${C.border}`,
      height: "100%", overflow: "auto", padding: 16, flexShrink: 0,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>{def.icon}</span>
          <span style={{ color: C.text, fontSize: 15, fontWeight: 800 }}>{def.label}</span>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      <div style={{ color: C.muted, fontSize: 11, marginBottom: 16 }}>{def.desc}</div>

      {/* Label */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>Label</label>
        <input style={inp} value={node.label || ""} onChange={e => onChange(node.id, cfg, e.target.value)} placeholder={def.label} />
      </div>

      {/* Type-specific config */}
      {node.type === "trigger_keyword" && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>Keyword</label>
          <input style={inp} value={cfg.keyword || ""} onChange={e => set("keyword", e.target.value)} placeholder="e.g. PROMO, HELP, INFO" />
        </div>
      )}

      {node.type === "trigger_schedule" && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>Schedule</label>
          <select style={inp} value={cfg.schedule || "daily"} onChange={e => set("schedule", e.target.value)}>
            <option value="once">One-time</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <input type="time" style={{ ...inp, marginTop: 6 }} value={cfg.time || "09:00"} onChange={e => set("time", e.target.value)} />
        </div>
      )}

      {(node.type === "action_sms" || node.type === "action_email" || node.type === "action_whatsapp" || node.type === "action_rcs") && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>Message</label>
          <textarea style={{ ...inp, resize: "vertical", minHeight: 70 }} value={cfg.message || ""} onChange={e => set("message", e.target.value)}
            placeholder="Hi {first_name}! Your order is ready. Reply STOP to opt out." />
          <div style={{ color: C.dim, fontSize: 10, marginTop: 3 }}>Use {"{first_name}"}, {"{last_name}"}, {"{phone}"} for personalization</div>
        </div>
      )}

      {node.type === "action_tag" && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>Tag Name</label>
          <input style={inp} value={cfg.tag || ""} onChange={e => set("tag", e.target.value)} placeholder="e.g. VIP, responded, interested" />
        </div>
      )}

      {node.type === "action_webhook" && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>Webhook URL</label>
          <input style={inp} value={cfg.url || ""} onChange={e => set("url", e.target.value)} placeholder="https://api.example.com/hook" />
          <label style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4, marginTop: 8 }}>Method</label>
          <select style={inp} value={cfg.method || "POST"} onChange={e => set("method", e.target.value)}>
            <option value="POST">POST</option>
            <option value="GET">GET</option>
          </select>
        </div>
      )}

      {node.type === "logic_delay" && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>Delay</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input type="number" style={{ ...inp, width: 70 }} value={cfg.delayAmount || 1} onChange={e => set("delayAmount", e.target.value)} min={1} />
            <select style={{ ...inp, flex: 1 }} value={cfg.delayUnit || "hours"} onChange={e => set("delayUnit", e.target.value)}>
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </select>
          </div>
        </div>
      )}

      {node.type === "logic_condition" && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>Condition</label>
          <select style={inp} value={cfg.conditionType || "contains"} onChange={e => set("conditionType", e.target.value)}>
            <option value="contains">Message contains</option>
            <option value="sentiment">Sentiment is</option>
            <option value="tag">Contact has tag</option>
            <option value="replied">Has replied</option>
          </select>
          <input style={{ ...inp, marginTop: 6 }} value={cfg.conditionValue || ""} onChange={e => set("conditionValue", e.target.value)} placeholder="Value..." />
        </div>
      )}

      {node.type === "logic_ai" && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>AI Instructions</label>
          <textarea style={{ ...inp, resize: "vertical", minHeight: 60 }} value={cfg.aiPrompt || ""} onChange={e => set("aiPrompt", e.target.value)}
            placeholder="Classify intent: support, sales, billing, or other" />
        </div>
      )}

      {node.type === "logic_split" && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>Split Ratio</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ color: C.accent, fontSize: 12, fontWeight: 700 }}>A: {cfg.splitA || 50}%</span>
            <input type="range" min={10} max={90} value={cfg.splitA || 50} onChange={e => set("splitA", parseInt(e.target.value))} style={{ flex: 1, accentColor: C.accent }} />
            <span style={{ color: C.accent2, fontSize: 12, fontWeight: 700 }}>B: {100 - (cfg.splitA || 50)}%</span>
          </div>
        </div>
      )}

      {/* Connections */}
      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 12 }}>
        <label style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}>Connect to →</label>
        {outgoing.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
            {outgoing.map(conn => {
              const target = nodes.find(n => n.id === conn.to);
              const tDef = target ? getDef(target.type) : { icon: "?", label: "?" };
              return (
                <div key={conn.to} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: C.bg, borderRadius: 6, padding: "5px 8px",
                }}>
                  <span style={{ color: C.text, fontSize: 11 }}>{tDef.icon} {target?.label || tDef.label}</span>
                  <button onClick={() => onDisconnect(node.id, conn.to)} style={{
                    background: "transparent", border: "none", color: "#FF6B6B", cursor: "pointer", fontSize: 10,
                  }}>Remove</button>
                </div>
              );
            })}
          </div>
        )}
        {available.length > 0 && (
          <select
            onChange={e => { if (e.target.value) { onConnect(node.id, e.target.value); e.target.value = ""; } }}
            style={inp}
            defaultValue=""
          >
            <option value="">+ Add connection...</option>
            {available.map(n => (
              <option key={n.id} value={n.id}>{getDef(n.type).icon} {n.label || getDef(n.type).label}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

// ── MAIN FLOW BUILDER ────────────────────────────────
export default function FlowBuilder({ tenantId }) {
  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selected, setSelected] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [flowName, setFlowName] = useState("My Flow");
  const [flows, setFlows] = useState([]);
  const [currentFlowId, setCurrentFlowId] = useState(null);
  const [toast, setToast] = useState(null);
  const [sidebarTab, setSidebarTab] = useState("nodes"); // "nodes" or "flows"
  const canvasRef = useRef(null);

  useEffect(() => { loadFlows(); }, []);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadFlows = async () => {
    try {
      const { data } = await supabase.from("flows").select("*").order("updated_at", { ascending: false }).limit(20);
      if (data) setFlows(data);
    } catch (err) { console.log("No flows table:", err); }
  };

  const saveFlow = async () => {
    try {
      const flowData = { nodes, connections, name: flowName };
      if (currentFlowId) {
        await supabase.from("flows").update({ flow_data: flowData, name: flowName, updated_at: new Date().toISOString() }).eq("id", currentFlowId);
      } else {
        const { data } = await supabase.from("flows").insert({ tenant_id: null, name: flowName, flow_data: flowData, status: "draft" }).select().single();
        if (data) setCurrentFlowId(data.id);
      }
      loadFlows();
      showToast("Flow saved!");
    } catch (err) {
      showToast("Save error: " + err.message, "error");
    }
  };

  const loadFlow = (flow) => {
    if (flow.flow_data) {
      setNodes(flow.flow_data.nodes || []);
      setConnections(flow.flow_data.connections || []);
      setFlowName(flow.flow_data.name || flow.name || "My Flow");
      setCurrentFlowId(flow.id);
      setSelected(null);
      setSidebarTab("nodes");
    }
  };

  const newFlow = () => {
    setNodes([]);
    setConnections([]);
    setFlowName("New Flow");
    setCurrentFlowId(null);
    setSelected(null);
  };

  const addNode = (type) => {
    const def = getDef(type);
    const x = 300 + Math.random() * 200 - pan.x;
    const y = 100 + nodes.length * 120 - pan.y;
    setNodes(prev => [...prev, { id: gid(), type, x, y, label: def.label, config: {} }]);
  };

  const deleteNode = (id) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setConnections(prev => prev.filter(c => c.from !== id && c.to !== id));
    if (selected === id) setSelected(null);
  };

  const updateNodeConfig = (id, config, label) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, config, ...(label !== undefined ? { label } : {}) } : n));
  };

  const connect = (from, to) => {
    if (!connections.some(c => c.from === from && c.to === to)) {
      setConnections(prev => [...prev, { from, to }]);
    }
  };

  const disconnect = (from, to) => {
    setConnections(prev => prev.filter(c => !(c.from === from && c.to === to)));
  };

  // Drag handlers
  const handleNodeDragStart = (e, id) => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    setDragging(id);
    setDragOffset({ x: e.clientX - node.x - pan.x, y: e.clientY - node.y - pan.y });
  };

  const handleCanvasMouseDown = (e) => {
    if (e.target === canvasRef.current || e.target.tagName === "svg") {
      setSelected(null);
      setPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = useCallback((e) => {
    if (dragging) {
      setNodes(prev => prev.map(n => n.id === dragging ? { ...n, x: e.clientX - dragOffset.x - pan.x, y: e.clientY - dragOffset.y - pan.y } : n));
    }
    if (panning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  }, [dragging, dragOffset, pan, panning, panStart]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setPanning(false);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const selectedNode = nodes.find(n => n.id === selected);

  return (
    <div style={{
      height: "100vh", display: "flex", background: C.bg,
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif", color: C.text, overflow: "hidden",
    }}>
      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes toastIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 2000,
          background: toast.type === "error" ? "#FF000022" : C.accent3 + "22",
          border: `1px solid ${toast.type === "error" ? "#FF000044" : C.accent3 + "44"}`,
          borderRadius: 10, padding: "12px 20px",
          color: toast.type === "error" ? "#FF6B6B" : C.accent3,
          fontSize: 14, fontWeight: 600, animation: "toastIn 0.3s ease",
        }}>
          {toast.type === "error" ? "❌ " : "✅ "}{toast.msg}
        </div>
      )}

      {/* Left Sidebar - Node Palette */}
      <div style={{
        width: 220, background: C.surface, borderRight: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden",
      }}>
        {/* Sidebar Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
          {["nodes", "flows"].map(tab => (
            <button key={tab} onClick={() => setSidebarTab(tab)} style={{
              flex: 1, padding: "10px 8px", background: sidebarTab === tab ? C.accent + "15" : "transparent",
              border: "none", borderBottom: sidebarTab === tab ? `2px solid ${C.accent}` : "2px solid transparent",
              color: sidebarTab === tab ? C.accent : C.muted, fontSize: 12, fontWeight: 700,
              cursor: "pointer", textTransform: "capitalize",
            }}>{tab === "nodes" ? "🧩 Nodes" : "📂 Flows"}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 10 }}>
          {sidebarTab === "nodes" ? (
            Object.entries(NODE_TYPES).map(([key, cat]) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <div style={{ color: cat.color, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, padding: "0 4px" }}>
                  {cat.label}
                </div>
                {cat.items.map(item => (
                  <div key={item.type} onClick={() => addNode(item.type)} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 8px", borderRadius: 7, cursor: "pointer",
                    border: `1px solid transparent`,
                    transition: "all 0.15s",
                    marginBottom: 2,
                  }}
                    onMouseOver={e => { e.currentTarget.style.background = cat.color + "11"; e.currentTarget.style.borderColor = cat.color + "33"; }}
                    onMouseOut={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
                  >
                    <span style={{ fontSize: 15 }}>{item.icon}</span>
                    <div>
                      <div style={{ color: C.text, fontSize: 11, fontWeight: 600 }}>{item.label}</div>
                      <div style={{ color: C.dim, fontSize: 9 }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <div>
              <button onClick={newFlow} style={{
                width: "100%", background: C.accent + "15", border: `1px solid ${C.accent}33`,
                borderRadius: 7, padding: "8px 10px", color: C.accent, fontSize: 12,
                fontWeight: 700, cursor: "pointer", marginBottom: 10,
              }}>+ New Flow</button>
              {flows.map(f => (
                <div key={f.id} onClick={() => loadFlow(f)} style={{
                  padding: "8px 10px", borderRadius: 7, cursor: "pointer",
                  background: currentFlowId === f.id ? C.accent + "11" : "transparent",
                  border: `1px solid ${currentFlowId === f.id ? C.accent + "33" : "transparent"}`,
                  marginBottom: 4, transition: "all 0.15s",
                }}
                  onMouseOver={e => { if (currentFlowId !== f.id) e.currentTarget.style.background = C.surfaceAlt; }}
                  onMouseOut={e => { if (currentFlowId !== f.id) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>{f.name}</div>
                  <div style={{ color: C.dim, fontSize: 10, marginTop: 2 }}>
                    {f.flow_data?.nodes?.length || 0} nodes · {new Date(f.updated_at || f.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
              {flows.length === 0 && (
                <div style={{ color: C.dim, fontSize: 11, textAlign: "center", padding: 16 }}>No saved flows yet</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Toolbar */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "8px 16px", borderBottom: `1px solid ${C.border}`, background: C.surface,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <input
              value={flowName}
              onChange={e => setFlowName(e.target.value)}
              style={{
                background: "transparent", border: "none", color: C.text,
                fontSize: 16, fontWeight: 800, outline: "none", width: 200,
              }}
            />
            <span style={{
              background: C.accent3 + "22", border: `1px solid ${C.accent3}44`,
              borderRadius: 4, padding: "2px 8px", fontSize: 10, color: C.accent3, fontWeight: 700,
            }}>{nodes.length} nodes</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveFlow} style={{
              background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
              border: "none", borderRadius: 7, padding: "7px 18px",
              color: "#000", fontWeight: 800, cursor: "pointer", fontSize: 12,
            }}>💾 Save</button>
          </div>
        </div>

        {/* Canvas Area */}
        <div
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          style={{
            flex: 1, position: "relative", overflow: "hidden", cursor: panning ? "grabbing" : "default",
            backgroundImage: `radial-gradient(${C.border}55 1px, transparent 1px)`,
            backgroundSize: "24px 24px",
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        >
          {/* SVG Connections */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            <g transform={`translate(${pan.x},${pan.y})`}>
              {connections.map((conn, i) => (
                <ConnectionLine key={i} from={conn.from} to={conn.to} nodes={nodes} />
              ))}
            </g>
          </svg>

          {/* Nodes */}
          <div style={{ position: "absolute", left: pan.x, top: pan.y }}>
            {nodes.map(node => (
              <FlowNode
                key={node.id}
                node={node}
                selected={selected}
                onMouseDown={handleNodeDragStart}
                onClick={setSelected}
                onDelete={deleteNode}
              />
            ))}
          </div>

          {/* Empty State */}
          {nodes.length === 0 && (
            <div style={{
              position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
              textAlign: "center", pointerEvents: "none",
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>⚡</div>
              <div style={{ color: C.text, fontSize: 20, fontWeight: 800 }}>Build Your Flow</div>
              <div style={{ color: C.muted, fontSize: 14, marginTop: 6, maxWidth: 300 }}>
                Click nodes from the left panel to add them, then connect them to create automation workflows
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Config */}
      {selectedNode && (
        <ConfigPanel
          node={selectedNode}
          nodes={nodes}
          connections={connections}
          onChange={updateNodeConfig}
          onConnect={connect}
          onDisconnect={disconnect}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
