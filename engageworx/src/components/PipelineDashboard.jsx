import { useState, useEffect } from "react";
import { supabase } from '../supabaseClient';

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
const CALENDLY = "https://calendly.com/rob-engwx/30min";

function daysSince(d) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

function fullName(first, last) {
  return [first, last].filter(Boolean).join(" ").trim();
}

function splitName(name) {
  if (!name) return { first: "", last: "" };
  const parts = name.trim().split(" ");
  return { first: parts[0] || "", last: parts.slice(1).join(" ") || "" };
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
     <div style={{ fontWeight: 700, fontSize: "14px", color: "#f1f5f9", marginBottom: "2px", paddingRight: stale ? "52px" : 0 }}>{lead.company || lead.name}</div>
<div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>{lead.name}</div>
      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "10px", background: "rgba(99,102,241,0.15)", color: "#a5b4fc", padding: "2px 7px", borderRadius: "4px" }}>{lead.type || "Unknown"}</span>
        {lead.urgency && <span style={{ fontSize: "10px", color: urgencyColor, fontWeight: 700 }}>{{ Hot:"🔥", Warm:"⚡", Cold:"❄️" }[lead.urgency]} {lead.urgency}</span>}
        {lead.package && <span style={{ fontSize: "10px", background: "rgba(245,158,11,0.15)", color: "#fcd34d", padding: "2px 7px", borderRadius: "4px" }}>{lead.package}</span>}
      </div>
    </div>
  );
}

function Modal({ lead, onClose, onSave }) {
  const { first: initFirst, last: initLast } = splitName(lead.name);
  const [firstName, setFirstName]   = useState(initFirst);
  const [lastName, setLastName]     = useState(initLast);
  const [form, setForm]             = useState({ ...lead });
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiText, setAiText]         = useState(lead.ai_next_action || "");
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState("");
  const [converting, setConverting] = useState(false);
  const [convertDone, setConvertDone] = useState(false);
  const stage = STAGES.find((s) => s.id === form.stage) || STAGES[0];

  const handleAI = async () => {
    setAiLoading(true); setAiText("");
    try {
      const res = await fetch("/api/ai-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 1000,
          messages: [{ role: "user", content: `You are a sharp B2B sales advisor for EngageWorx — AI-powered omnichannel comms platform (SMS, WhatsApp, Email, Voice, RCS). Pricing: Starter $99, Growth $249, Pro $499, Enterprise.\n\nLead: ${fullName(firstName, lastName)} at ${form.company || "unknown"}\nType: ${form.type} | Stage: ${stage.label} | Urgency: ${form.urgency}\nPackage: ${form.package || "not selected"} | Days stale: ${daysSince(form.last_action_at) ?? "unknown"}\nNotes: ${form.notes || "none"}\n\nGive 3 specific punchy next actions, each starting with →. Then one sentence on key risk or opportunity. No fluff.` }],
        }),
      });
      const data = await res.json();
      setAiText(data.content?.find((b) => b.type === "text")?.text || "No suggestion.");
    } catch { setAiText("Error reaching AI. Try again."); }
    setAiLoading(false);
  };

  const handleSave = async () => {
    setSaveError("");
    const combined = fullName(firstName, lastName);
    if (!combined) { setSaveError("First name is required."); return; }
    setSaving(true);
    const payload = {
      ...form,
      name: combined,
      ai_next_action: aiText || form.ai_next_action,
      go_live_date: form.go_live_date || null,
      last_action_at: form.last_action_at || null,
    };
    delete payload.id;
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
    try {
      if (lead.id && !String(lead.id).startsWith("new_")) {
        const { error } = await supabase.from("leads").update(payload).eq("id", lead.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("leads").insert(payload);
        if (error) throw error;
      }
      onSave();
    } catch (err) {
      setSaveError(err.message || "Save failed.");
    }
    setSaving(false);
  };

  const handleConvertToSandbox = async () => {
    setConverting(true);
    try {
      const slug = (form.company || fullName(firstName, lastName)).toLowerCase().replace(/[^a-z0-9]/g, "-") + "-sandbox";
      const { error: tErr } = await supabase.from("tenants").insert({
        name: form.company || fullName(firstName, lastName),
        slug,
        brand_primary: "#00C9FF",
        brand_name: form.company || fullName(firstName, lastName),
        plan: form.package?.includes("Enterprise") ? "enterprise" : form.package?.includes("Pro") ? "pro" : form.package?.includes("Growth") ? "growth" : "starter",
        status: "trial",
        channels_enabled: ["sms", "email", "whatsapp"],
      });
      if (tErr) throw tErr;
      // Update lead stage to sandbox_shared
      await supabase.from("leads").update({ stage: "sandbox_shared", last_action_at: new Date().toISOString().split("T")[0], notes: (form.notes ? form.notes + "\n" : "") + "→ Sandbox created in Tenant Management" }).eq("id", lead.id);
      setConvertDone(true);
      setForm({ ...form, stage: "sandbox_shared" });
    } catch (err) {
      setSaveError("Conversion failed: " + err.message);
    }
    setConverting(false);
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this lead?")) return;
    await supabase.from("leads").delete().eq("id", lead.id);
    onSave();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", width: "100%", maxWidth: "640px", maxHeight: "90vh", overflowY: "auto", padding: "28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#f1f5f9" }}>{fullName(firstName, lastName) || "New Lead"}</div>
            <div style={{ fontSize: "13px", color: "#64748b" }}>{form.company || "No company"}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: "22px", cursor: "pointer" }}>✕</button>
        </div>

        {/* Stage */}
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

        {/* Fields */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
          <div><label style={labelStyle}>First Name *</label><input style={inputStyle} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" /></div>
          <div><label style={labelStyle}>Last Name</label><input style={inputStyle} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Smith" /></div>
          <div><label style={labelStyle}>Company</label><input style={inputStyle} value={form.company||""} onChange={e=>setForm({...form,company:e.target.value})} /></div>
          <div><label style={labelStyle}>Email</label><input style={inputStyle} type="email" value={form.email||""} onChange={e=>setForm({...form,email:e.target.value})} /></div>
          <div><label style={labelStyle}>Phone</label><input style={inputStyle} value={form.phone||""} onChange={e=>setForm({...form,phone:e.target.value})} /></div>
          <div><label style={labelStyle}>Lead Type</label><select style={inputStyle} value={form.type||"Unknown"} onChange={e=>setForm({...form,type:e.target.value})}>{TYPE_OPTIONS.map(t=><option key={t}>{t}</option>)}</select></div>
          <div><label style={labelStyle}>Urgency</label><select style={inputStyle} value={form.urgency||"Warm"} onChange={e=>setForm({...form,urgency:e.target.value})}>{"Hot,Warm,Cold".split(",").map(u=><option key={u}>{u}</option>)}</select></div>
          <div><label style={labelStyle}>Package</label><select style={inputStyle} value={form.package||""} onChange={e=>setForm({...form,package:e.target.value})}><option value="">Not selected</option>{PACKAGE_OPTIONS.map(p=><option key={p}>{p}</option>)}</select></div>
          <div><label style={labelStyle}>Source</label><select style={inputStyle} value={form.source||"Website"} onChange={e=>setForm({...form,source:e.target.value})}>{SOURCE_OPTIONS.map(s=><option key={s}>{s}</option>)}</select></div>
          <div><label style={labelStyle}>Go-Live Date</label><input type="date" style={inputStyle} value={form.go_live_date||""} onChange={e=>setForm({...form,go_live_date:e.target.value})} /></div>
          <div><label style={labelStyle}>Last Action</label><input type="date" style={inputStyle} value={form.last_action_at||""} onChange={e=>setForm({...form,last_action_at:e.target.value})} /></div>
        </div>

        <div style={{ marginBottom: "14px" }}>
          <label style={labelStyle}>Notes</label>
          <textarea style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }} value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} />
        </div>

        {/* Quick actions */}
        <div style={{ marginBottom: "20px" }}>
          <label style={labelStyle}>Quick Actions</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "7px" }}>
            {(NEXT_ACTIONS[form.stage]||[]).map(a=>(
              <button key={a} onClick={()=>setForm({...form,notes:(form.notes?form.notes+"\n":"")+`→ ${a}`,last_action_at:new Date().toISOString().split("T")[0]})}
                style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",cursor:"pointer",background:"rgba(99,102,241,0.1)",color:"#a5b4fc",border:"1px solid rgba(99,102,241,0.2)" }}>
                + {a}
              </button>
            ))}
            <a href={`${CALENDLY}?name=${encodeURIComponent(fullName(firstName,lastName))}&email=${encodeURIComponent(form.email||"")}`} target="_blank" rel="noopener noreferrer"
              style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",cursor:"pointer",background:"rgba(168,85,247,0.1)",color:"#c084fc",border:"1px solid rgba(168,85,247,0.2)",textDecoration:"none" }}>
              📅 Send Calendly
            </a>
          </div>
        </div>

        {/* Convert to Sandbox */}
        {lead.id && !String(lead.id).startsWith("new_") && (
          <div style={{ background:"rgba(16,185,129,0.06)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:"10px",padding:"16px",marginBottom:"20px" }}>
            <div style={{ fontSize:"12px",fontWeight:700,color:"#10b981",letterSpacing:"0.05em",marginBottom:"8px" }}>🧪 TENANT MANAGEMENT</div>
            {convertDone ? (
              <div style={{ fontSize:"13px",color:"#10b981" }}>✅ Sandbox created in Tenant Management — stage updated to Sandbox Shared.</div>
            ) : (
              <>
                <div style={{ fontSize:"12px",color:"#475569",marginBottom:"10px" }}>Ready to give this lead a sandbox? Creates a trial tenant and moves them to Sandbox Shared.</div>
                <button onClick={handleConvertToSandbox} disabled={converting||!form.company}
                  style={{ padding:"8px 16px",borderRadius:"7px",background:converting?"rgba(16,185,129,0.3)":"rgba(16,185,129,0.2)",color:"#10b981",border:"1px solid rgba(16,185,129,0.3)",fontWeight:700,fontSize:"12px",cursor:converting?"wait":"pointer" }}>
                  {converting ? "Creating..." : "Convert to Sandbox →"}
                </button>
                {!form.company && <div style={{ fontSize:"11px",color:"#475569",marginTop:"6px" }}>Add a company name first.</div>}
              </>
            )}
          </div>
        )}

        {/* AI Advisor */}
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

        {saveError && <div style={{ background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:"8px",padding:"10px 14px",marginBottom:"14px",color:"#ef4444",fontSize:"13px" }}>{saveError}</div>}

        <div style={{ display:"flex",gap:"10px" }}>
          <button onClick={handleSave} disabled={saving} style={{ flex:1,padding:"12px",borderRadius:"8px",background:saving?"rgba(99,102,241,0.5)":"#6366f1",color:"#fff",fontWeight:700,fontSize:"14px",border:"none",cursor:"pointer" }}>
            {saving?"Saving...":"Save Lead"}
          </button>
          {lead.id && !String(lead.id).startsWith("new_") && (
            <button onClick={handleDelete} style={{ padding:"12px 16px",borderRadius:"8px",background:"rgba(239,68,68,0.1)",color:"#ef4444",fontWeight:600,fontSize:"13px",border:"1px solid rgba(239,68,68,0.2)",cursor:"pointer" }}>Delete</button>
          )}
          <button onClick={onClose} style={{ padding:"12px 16px",borderRadius:"8px",background:"rgba(255,255,255,0.05)",color:"#94a3b8",fontWeight:600,fontSize:"14px",border:"1px solid rgba(255,255,255,0.08)",cursor:"pointer" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function PipelineDashboard() {
  const [leads, setLeads]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null);
  const [filterType, setFilterType] = useState("All");
  const [search, setSearch]         = useState("");
  const [sortBy, setSortBy]         = useState("created_at");
  const [sortDir, setSortDir]       = useState("desc");
  const [lastSync, setLastSync]     = useState(null);
  const [liveFlash, setLiveFlash]   = useState(false);

  const fetchLeads = async () => {
    const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (error) console.error("Fetch error:", error);
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

  const newLead = { id:`new_${Date.now()}`,name:"",company:"",email:"",phone:"",type:"Unknown",urgency:"Warm",stage:"inquiry",package:"",go_live_date:"",notes:"",source:"Website",last_action_at:new Date().toISOString().split("T")[0] };

  // Sort
  const sortedLeads = [...leads].sort((a, b) => {
    let av = a[sortBy] || "", bv = b[sortBy] || "";
    if (sortBy === "urgency") { const ord = {Hot:0,Warm:1,Cold:2}; av = ord[a.urgency]??1; bv = ord[b.urgency]??1; }
    if (sortBy === "stage")   { const ord = STAGES.map(s=>s.id); av = ord.indexOf(a.stage); bv = ord.indexOf(b.stage); }
    if (typeof av === "string") av = av.toLowerCase();
    if (typeof bv === "string") bv = bv.toLowerCase();
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const filtered = sortedLeads.filter(l => {
    const mt = filterType === "All" || l.type === filterType;
    const ms = !search || l.name?.toLowerCase().includes(search.toLowerCase()) || l.company?.toLowerCase().includes(search.toLowerCase());
    return mt && ms;
  });

  const pipeline  = leads.filter(l => l.stage !== "customer").length;
  const customers = leads.filter(l => l.stage === "customer").length;
  const hot       = leads.filter(l => l.urgency === "Hot").length;
  const stale     = leads.filter(l => daysSince(l.last_action_at) >= STALE_DAYS).length;

  const SortBtn = ({ field, label }) => (
    <button onClick={() => { if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy(field); setSortDir("asc"); }}}
      style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:sortBy===field?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.03)",color:sortBy===field?"#a5b4fc":"#475569" }}>
      {label} {sortBy===field?(sortDir==="asc"?"↑":"↓"):""}
    </button>
  );

  return (
    <div style={{ minHeight:"100vh",background:"#070d1a",fontFamily:"'DM Sans','Segoe UI',sans-serif",color:"#f1f5f9" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px;height:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:4px}
        input,select,textarea{font-family:inherit} input::placeholder{color:#334155}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
      `}</style>

      <div style={{ padding:"24px 28px 0",borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px" }}>
          <div style={{ display:"flex",alignItems:"center",gap:"12px" }}>
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
          <input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{ ...inputStyle,width:"160px",marginTop:0,padding:"7px 11px" }} />
          {["All",...TYPE_OPTIONS].map(t=>(
            <button key={t} onClick={()=>setFilterType(t)} style={{ padding:"6px 12px",borderRadius:"6px",fontSize:"12px",fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:filterType===t?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.03)",color:filterType===t?"#a5b4fc":"#475569" }}>{t}</button>
          ))}
          <div style={{ marginLeft:"auto",display:"flex",gap:"6px",alignItems:"center" }}>
            <span style={{ fontSize:"10px",color:"#334155",fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase" }}>Sort:</span>
            <SortBtn field="name" label="A–Z" />
            <SortBtn field="urgency" label="Urgency" />
            <SortBtn field="stage" label="Stage" />
            <SortBtn field="created_at" label="Date" />
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"300px",color:"#334155",fontSize:"14px" }}>Connecting to Supabase...</div>
      ) : (
        <div style={{ display:"flex",overflowX:"auto",padding:"20px 16px",gap:"12px",minHeight:"calc(100vh - 250px)" }}>
          {STAGES.map(stage => {
            const sl = filtered.filter(l => l.stage === stage.id);
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

      {selected && <Modal lead={selected} onClose={()=>setSelected(null)} onSave={()=>{setSelected(null);fetchLeads();}} />}
    </div>
  );
}
