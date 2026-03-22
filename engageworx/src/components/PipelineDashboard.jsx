import { useState, useEffect } from "react";
import { supabase } from '../supabaseClient';
import { useState, useEffect } from "react";
import { supabase } from '../supabaseClient';

const STAGES = [

const STAGES = [
  { id: "inquiry",           label: "Inquiry",          color: "#6366f1", icon: "📥" },
  { id: "demo_shared",       label: "Demo Shared",       color: "#8b5cf6", icon: "🎬" },
  { id: "sandbox_shared",    label: "Sandbox Shared",    color: "#a855f7", icon: "🧪" },
  { id: "opportunity",       label: "Opportunity",       color: "#ec4899", icon: "🔥" },
  { id: "package_selection", label: "Package Selected",  color: "#f59e0b", icon: "📦" },
  { id: "go_live",           label: "Go Live",           color: "#3b82f6", icon: "🚀" },
  { id: "customer",          label: "Customer",          color: "#10b981", icon: "✅" },
];

const TYPE_OPTIONS    = ["Direct Business", "White-Label / Reseller", "Agency", "Unknown"];
const PACKAGE_OPTIONS = ["Starter $99", "Growth $249", "Pro $499", "Enterprise"];
const SOURCE_OPTIONS  = ["Website", "LinkedIn", "Referral", "EngageWorx", "Direct", "Event", "Other"];

const NEXT_ACTIONS = {
  inquiry:           ["Send intro deck", "Book discovery call", "Connect on LinkedIn", "Send personalised video"],
  demo_shared:       ["Follow up within 48hrs", "Ask for feedback", "Offer sandbox access", "Send case study"],
  sandbox_shared:    ["Check sandbox activity", "Schedule walkthrough call", "Address objections", "Send ROI calculator"],
  opportunity:       ["Send formal proposal", "Confirm decision maker", "Agree timeline", "Reference customer intro"],
  package_selection: ["Send order form", "Confirm go-live date", "Intro to onboarding", "Process payment"],
  go_live:           ["Onboarding call booked", "Complete setup checklist", "First message sent", "Training complete"],
  customer:          ["30-day check-in", "Upsell opportunity review", "Case study request", "Referral ask"],
};

const STALE_DAYS = 5;

function daysSince(d) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

const labelStyle = { fontSize: "11px", fontWeight: 700, color: "#475569", letterSpacing: "0.06em", textTransform: "uppercase" };
const inputStyle = { width: "100%", marginTop: "5px", padding: "9px 11px", borderRadius: "7px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#f1f5f9", fontSize: "13px", outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

function LeadCard({ lead, onSelect }) {
  const stage = STAGES.find((s) => s.id === lead.stage) || STAGES[0];
  const days  = daysSince(lead.last_action_at);
  const stale = days !== null && days >= STALE_DAYS;
  const urgencyColor = { Hot: "#ef4444", Warm: "#f59e0b", Cold: "#64748b" }[lead.urgency] || "#64748b";

  return (
    <div onClick={() => onSelect(lead)}
      style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${stale ? "#ef4444" : "rgba(255,255,255,0.08)"}`, borderLeft: `3px solid ${stage.color}`, borderRadius: "8px", padding: "14px 16px", cursor: "pointer", marginBottom: "8px", position: "relative", transition: "background 0.15s" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}>
      {stale && <div style={{ position: "absolute", top: 8, right: 8, fontSize: "10px", color: "#ef4444", fontFamily: "monospace", fontWeight: 700 }}>{days}d stale</div>}
      <div style={{ fontWeight: 700, fontSize: "14px", color: "#f1f5f9", marginBottom: "2px", paddingRight: stale ? "52px" : 0 }}>{lead.name}</div>
      <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>{lead.company || "—"}</div>
      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "10px", background: "rgba(99,102,241,0.15)", color: "#a5b4fc", padding: "2px 7px", borderRadius: "4px" }}>{lead.type || "Unknown"}</span>
        {lead.urgency && <span style={{ fontSize: "10px", color: urgencyColor, fontWeight: 700 }}>{{ Hot:"🔥",Warm:"⚡",Cold:"❄️" }[lead.urgency]} {lead.urgency}</span>}
        {lead.package && <span style={{ fontSize: "10px", background: "rgba(245,158,11,0.15)", color: "#fcd34d", padding: "2px 7px", borderRadius: "4px" }}>{lead.package}</span>}
      </div>
    </div>
  );
}

function Modal({ lead, onClose, onSave, onDelete }) {
  const [form, setForm]     = useState({ ...lead });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState(lead.ai_next_action || "");
  const [saving, setSaving] = useState(false);
  const stage = STAGES.find((s) => s.id === form.stage) || STAGES[0];

  const handleAI = async () => {
    setAiLoading(true); setAiText("");
    try {
      // Call via proxy to avoid CORS — /api/ai-advisor routes through Vercel serverless
      const res = await fetch("/api/ai-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 1000,
          messages: [{ role: "user", content: `You are a sharp B2B sales advisor for EngageWorx — AI-powered omnichannel comms platform (SMS, WhatsApp, Email, Voice, RCS). Pricing: Starter $99, Growth $249, Pro $499, Enterprise.\n\nLead: ${form.name} at ${form.company || "unknown"}\nType: ${form.type} | Stage: ${stage.label} | Urgency: ${form.urgency}\nPackage: ${form.package || "not selected"} | Days stale: ${daysSince(form.last_action_at) ?? "unknown"}\nNotes: ${form.notes || "none"}\n\nGive 3 specific punchy next actions, each starting with →. Then one sentence on key risk or opportunity. No fluff.` }],
        }),
      });
      const data = await res.json();
      setAiText(data.content?.find((b) => b.type === "text")?.text || "No suggestion.");
    } catch { setAiText("Error reaching AI. Try again."); }
    setAiLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave({ ...form, ai_next_action: aiText || form.ai_next_action });
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", width: "100%", maxWidth: "620px", maxHeight: "90vh", overflowY: "auto", padding: "28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#f1f5f9" }}>{form.name || "New Lead"}</div>
            <div style={{ fontSize: "13px", color: "#64748b" }}>{form.company || "No company"}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: "22px", cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={labelStyle}>Stage</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
            {STAGES.map((s) => (
              <button key={s.id} onClick={() => setForm({ ...form, stage: s.id, last_action_at: new Date().toISOString().split("T")[0] })}
                style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", background: form.stage === s.id ? s.color : "rgba(255,255,255,0.05)", color: form.stage === s.id ? "#fff" : "#94a3b8", border: `1px solid ${form.stage === s.id ? s.color : "rgba(255,255,255,0.08)"}`, transition: "all 0.15s" }}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
          {[["name","Name","text"],["company","Company","text"],["email","Email","email"],["phone","Phone","text"]].map(([f,l,t]) => (
            <div key={f}><label style={labelStyle}>{l}</label><input style={inputStyle} type={t} value={form[f]||""} onChange={(e)=>setForm({...form,[f]:e.target.value})} /></div>
          ))}
          <div><label style={labelStyle}>Lead Type</label><select style={inputStyle} value={form.type||""} onChange={(e)=>setForm({...form,type:e.target.value})}>{TYPE_OPTIONS.map(t=><option key={t}>{t}</option>)}</select></div>
          <div><label style={labelStyle}>Urgency</label><select style={inputStyle} value={form.urgency||"Warm"} onChange={(e)=>setForm({...form,urgency:e.target.value})}>{"Hot,Warm,Cold".split(",").map(u=><option key={u}>{u}</option>)}</select></div>
          <div><label style={labelStyle}>Package</label><select style={inputStyle} value={form.package||""} onChange={(e)=>setForm({...form,package:e.target.value})}><option value="">Not selected</option>{PACKAGE_OPTIONS.map(p=><option key={p}>{p}</option>)}</select></div>
          <div><label style={labelStyle}>Source</label><select style={inputStyle} value={form.source||"Website"} onChange={(e)=>setForm({...form,source:e.target.value})}>{SOURCE_OPTIONS.map(s=><option key={s}>{s}</option>)}</select></div>
          <div><label style={labelStyle}>Go-Live Date</label><input type="date" style={inputStyle} value={form.go_live_date||""} onChange={(e)=>setForm({...form,go_live_date:e.target.value})} /></div>
          <div><label style={labelStyle}>Last Action</label><input type="date" style={inputStyle} value={form.last_action_at||""} onChange={(e)=>setForm({...form,last_action_at:e.target.value})} /></div>
        </div>

        <div style={{ marginBottom: "14px" }}>
          <label style={labelStyle}>Notes</label>
          <textarea style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }} value={form.notes||""} onChange={(e)=>setForm({...form,notes:e.target.value})} />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={labelStyle}>Quick Actions</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "7px" }}>
            {(NEXT_ACTIONS[form.stage]||[]).map(a=>(
              <button key={a} onClick={()=>setForm({...form,notes:(form.notes?form.notes+"\n":"")+`→ ${a}`,last_action_at:new Date().toISOString().split("T")[0]})}
                style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",cursor:"pointer",background:"rgba(99,102,241,0.1)",color:"#a5b4fc",border:"1px solid rgba(99,102,241,0.2)" }}>
                + {a}
              </button>
            ))}
          </div>
        </div>

        <div style={{ background:"rgba(99,102,241,0.08)",border:"1px solid rgba(99,102,241,0.2)",borderRadius:"10px",padding:"16px",marginBottom:"20px" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px" }}>
            <span style={{ fontSize:"12px",fontWeight:700,color:"#a5b4fc",letterSpacing:"0.05em" }}>⚡ AI SALES ADVISOR</span>
            <button onClick={handleAI} disabled={aiLoading} style={{ padding:"6px 14px",borderRadius:"6px",fontSize:"12px",fontWeight:700,cursor:aiLoading?"wait":"pointer",background:aiLoading?"rgba(99,102,241,0.3)":"#6366f1",color:"#fff",border:"none" }}>
              {aiLoading?"Thinking...":"Get Next Actions"}
            </button>
          </div>
          {aiText
            ? <div style={{ fontSize:"13px",color:"#cbd5e1",lineHeight:1.7,whiteSpace:"pre-wrap" }}>{aiText}</div>
            : <div style={{ fontSize:"12px",color:"#475569" }}>Click to get AI-powered next actions for this lead.</div>}
        </div>

        <div style={{ display:"flex",gap:"10px" }}>
          <button onClick={handleSave} disabled={saving} style={{ flex:1,padding:"12px",borderRadius:"8px",background:saving?"rgba(99,102,241,0.5)":"#6366f1",color:"#fff",fontWeight:700,fontSize:"14px",border:"none",cursor:"pointer" }}>
            {saving?"Saving...":"Save Lead"}
          </button>
          {lead.id && !String(lead.id).startsWith("new_") && (
            <button onClick={()=>onDelete(lead.id)} style={{ padding:"12px 16px",borderRadius:"8px",background:"rgba(239,68,68,0.1)",color:"#ef4444",fontWeight:600,fontSize:"13px",border:"1px solid rgba(239,68,68,0.2)",cursor:"pointer" }}>Delete</button>
          )}
          <button onClick={onClose} style={{ padding:"12px 16px",borderRadius:"8px",background:"rgba(255,255,255,0.05)",color:"#94a3b8",fontWeight:600,fontSize:"14px",border:"1px solid rgba(255,255,255,0.08)",cursor:"pointer" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function PipelineDashboard() {
  const [leads, setLeads]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [filterType, setFilterType] = useState("All");
  const [search, setSearch]     = useState("");
  const [lastSync, setLastSync] = useState(null);
  const [liveFlash, setLiveFlash] = useState(false);

  const fetchLeads = async () => {
    const { data } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    setLeads(data || []);
    setLastSync(new Date());
    setLoading(false);
  };

  useEffect(() => {
    fetchLeads();
    const channel = supabase.channel("leads-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload) => {
        setLiveFlash(true);
        setTimeout(() => setLiveFlash(false), 2000);
        if (payload.eventType === "INSERT")      setLeads(p => [payload.new, ...p]);
        else if (payload.eventType === "UPDATE") setLeads(p => p.map(l => l.id === payload.new.id ? payload.new : l));
        else if (payload.eventType === "DELETE") setLeads(p => p.filter(l => l.id !== payload.old.id));
        setLastSync(new Date());
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const handleSave = async (updated) => {
    if (updated.id && !String(updated.id).startsWith("new_")) {
      await supabase.from("leads").update(updated).eq("id", updated.id);
    } else {
      const { id, ...rest } = updated;
      await supabase.from("leads").insert(rest);
    }
    setSelected(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this lead?")) return;
    await supabase.from("leads").delete().eq("id", id);
    setSelected(null);
  };

  const newLead = { id: `new_${Date.now()}`, name:"", company:"", email:"", phone:"", type:"Unknown", urgency:"Warm", stage:"inquiry", package:"", go_live_date:"", notes:"", source:"Website", last_action_at: new Date().toISOString().split("T")[0] };

  const filtered = leads.filter(l => {
    const mt = filterType === "All" || l.type === filterType;
    const ms = !search || l.name?.toLowerCase().includes(search.toLowerCase()) || l.company?.toLowerCase().includes(search.toLowerCase());
    return mt && ms;
  });

  const pipeline = leads.filter(l => l.stage !== "customer").length;
  const customers = leads.filter(l => l.stage === "customer").length;
  const hot       = leads.filter(l => l.urgency === "Hot").length;
  const stale     = leads.filter(l => daysSince(l.last_action_at) >= STALE_DAYS).length;

  return (
    <div style={{ minHeight:"100vh", background:"#070d1a", fontFamily:"'DM Sans','Segoe UI',sans-serif", color:"#f1f5f9" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px;height:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:4px}
        input,select,textarea{font-family:inherit} input::placeholder{color:#334155}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
      `}</style>

      <div style={{ padding:"24px 28px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
            <div style={{ width:"34px",height:"34px",background:"linear-gradient(135deg,#6366f1,#ec4899)",borderRadius:"9px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"17px" }}>⚡</div>
            <span style={{ fontSize:"17px",fontWeight:800,letterSpacing:"-0.02em" }}>EngageWorx</span>
            <span style={{ fontSize:"11px",color:"#475569",fontFamily:"DM Mono",background:"rgba(255,255,255,0.04)",padding:"2px 8px",borderRadius:"4px",border:"1px solid rgba(255,255,255,0.06)" }}>PIPELINE</span>
            <div style={{ display:"flex",alignItems:"center",gap:"5px" }}>
              <div style={{ width:"7px",height:"7px",borderRadius:"50%",background:liveFlash?"#10b981":"#1e293b",animation:liveFlash?"pulse 0.8s infinite":"none",transition:"background 0.3s" }} />
              <span style={{ fontSize:"10px",color:"#334155",fontFamily:"DM Mono" }}>{liveFlash?"● LIVE UPDATE":lastSync?`synced ${lastSync.toLocaleTimeString()}`:"connecting..."}</span>
            </div>
          </div>
          <button onClick={()=>setSelected(newLead)} style={{ padding:"9px 18px",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",border:"none",borderRadius:"8px",color:"#fff",fontWeight:700,fontSize:"13px",cursor:"pointer" }}>+ Add Lead</button>
        </div>

        <div style={{ display:"flex",gap:"28px",marginBottom:"18px" }}>
          {[{l:"Pipeline",v:pipeline,c:"#6366f1"},{l:"Customers",v:customers,c:"#10b981"},{l:"Hot Leads",v:hot,c:hot>0?"#ef4444":"#334155"},{l:"Needs Action",v:stale,c:stale>0?"#f59e0b":"#334155"}].map(k=>(
            <div key={k.l}>
              <div style={{ fontSize:"28px",fontWeight:800,color:k.c,fontFamily:"DM Mono",lineHeight:1 }}>{loading?"—":k.v}</div>
              <div style={{ fontSize:"10px",color:"#475569",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",marginTop:"3px" }}>{k.l}</div>
            </div>
          ))}
        </div>

        <div style={{ display:"flex",gap:"8px",alignItems:"center",paddingBottom:"16px",flexWrap:"wrap" }}>
          <input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{ ...inputStyle,width:"180px",marginTop:0,padding:"7px 11px" }} />
          {["All",...TYPE_OPTIONS].map(t=>(
            <button key={t} onClick={()=>setFilterType(t)} style={{ padding:"6px 12px",borderRadius:"6px",fontSize:"12px",fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:filterType===t?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.03)",color:filterType===t?"#a5b4fc":"#475569" }}>{t}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"300px",color:"#334155",fontSize:"14px" }}>Connecting to Supabase...</div>
      ) : (
        <div style={{ display:"flex",overflowX:"auto",padding:"20px 16px",gap:"12px",minHeight:"calc(100vh - 230px)" }}>
          {STAGES.map(stage=>{
            const sl = filtered.filter(l=>l.stage===stage.id);
            return (
              <div key={stage.id} style={{ minWidth:"220px",maxWidth:"220px",flexShrink:0 }}>
                <div style={{ display:"flex",alignItems:"center",gap:"7px",marginBottom:"12px",padding:"0 4px" }}>
                  <div style={{ width:"8px",height:"8px",borderRadius:"50%",background:stage.color }} />
                  <span style={{ fontSize:"11px",fontWeight:700,color:"#64748b",letterSpacing:"0.06em",textTransform:"uppercase" }}>{stage.label}</span>
                  <span style={{ marginLeft:"auto",fontSize:"11px",fontFamily:"DM Mono",color:"#334155",background:"rgba(255,255,255,0.04)",padding:"1px 6px",borderRadius:"4px" }}>{sl.length}</span>
                </div>
                <div style={{ background:"rgba(255,255,255,0.02)",borderRadius:"10px",padding:"10px",minHeight:"80px",border:"1px solid rgba(255,255,255,0.04)" }}>
                  {sl.length===0
                    ? <div style={{ textAlign:"center",padding:"16px 0",fontSize:"11px",color:"#1e293b" }}>Empty</div>
                    : sl.map(lead=><LeadCard key={lead.id} lead={lead} onSelect={setSelected} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && <Modal lead={selected} onClose={()=>setSelected(null)} onSave={handleSave} onDelete={handleDelete} />}
    </div>
  );
}
