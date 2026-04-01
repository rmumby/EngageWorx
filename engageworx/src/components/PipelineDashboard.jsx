import { useState, useEffect, useCallback } from "react";
import { supabase } from '../supabaseClient';

const STAGES = [
  { id: "inquiry",           label: "Inquiry",          color: "#6366f1", icon: "📥" },
  { id: "demo_shared",       label: "Demo Shared",       color: "#8b5cf6", icon: "🎬" },
  { id: "sandbox_shared",    label: "Sandbox Shared",    color: "#a855f7", icon: "🧪" },
  { id: "opportunity",       label: "Opportunity",       color: "#ec4899", icon: "🔥" },
  { id: "package_selection", label: "Package Selected",  color: "#f59e0b", icon: "📦" },
  { id: "go_live",           label: "Go Live",           color: "#3b82f6", icon: "🚀" },
  { id: "customer",          label: "Customer",          color: "#10b981", icon: "✅" },
  { id: "dormant",           label: "Dormant",           color: "#334155", icon: "😴" },
];

const TYPE_OPTIONS    = ["Direct Business", "White-Label / Reseller", "Agency", "Unknown"];
const PACKAGE_OPTIONS = ["Starter $99", "Growth $249", "Pro $499", "Enterprise"];
const SOURCE_OPTIONS  = ["Website", "LinkedIn", "Referral", "EngageWorx", "Direct", "Event", "Other"];
const CALENDLY        = "https://calendly.com/rob-engwx/30min";
const SP_TENANT_ID    = "c1bc59a8-5235-4921-9755-02514b574387";
const STALE_DAYS      = 5;

const NEXT_ACTIONS = {
  inquiry:           ["Send intro deck", "Book discovery call", "Connect on LinkedIn", "Send personalised video"],
  demo_shared:       ["Follow up within 48hrs", "Ask for feedback", "Offer sandbox access", "Send case study"],
  sandbox_shared:    ["Check sandbox activity", "Schedule walkthrough call", "Address objections", "Send ROI calculator"],
  opportunity:       ["Send formal proposal", "Confirm decision maker", "Agree timeline", "Reference customer intro"],
  package_selection: ["Send order form", "Confirm go-live date", "Intro to onboarding", "Process payment"],
  go_live:           ["Onboarding call booked", "Complete setup checklist", "First message sent", "Training complete"],
  customer:          ["30-day check-in", "Upsell opportunity review", "Case study request", "Referral ask"],
};

function daysSince(d) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}
function fullName(first, last) { return [first, last].filter(Boolean).join(" ").trim(); }
function splitName(name) {
  if (!name) return { first: "", last: "" };
  const parts = name.trim().split(" ");
  return { first: parts[0] || "", last: parts.slice(1).join(" ") || "" };
}

const labelStyle = { fontSize: "11px", fontWeight: 700, color: "#475569", letterSpacing: "0.06em", textTransform: "uppercase" };
const inputStyle = { width: "100%", marginTop: "5px", padding: "9px 11px", borderRadius: "7px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#f1f5f9", fontSize: "13px", outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

function LeadCard({ lead, onSelect, onUrgencyChange }) {
  const stage = STAGES.find((s) => s.id === lead.stage) || STAGES[0];
  const days  = daysSince(lead.last_action_at);
  const stale = days !== null && days >= STALE_DAYS;
  const urgencyColor = { Hot: "#ef4444", Warm: "#f59e0b", Cold: "#64748b" }[lead.urgency] || "#64748b";
  const nextActionOverdue = lead.next_action_date && new Date(lead.next_action_date) < new Date();
  const displayName = lead.company || lead.name;
  const contactName = (lead.name && lead.name !== lead.email && !lead.name.includes('@')) ? lead.name : null;

  return (
    <div
      onClick={() => onSelect(lead)}
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid " + (stale ? "#ef4444" : "rgba(255,255,255,0.08)"), borderLeft: "3px solid " + stage.color, borderRadius: "8px", padding: "14px 16px", cursor: "pointer", marginBottom: "8px", position: "relative", transition: "background 0.15s" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
    >
      <div style={{ position: "absolute", top: 6, right: 8, display: "flex", gap: 4, alignItems: "center" }}>
        {stale && <div style={{ fontSize: "10px", color: "#ef4444", fontFamily: "monospace", fontWeight: 700 }}>{days}d</div>}
        <div style={{ display: "flex", gap: 2 }} onClick={(e) => e.stopPropagation()}>
          {["Hot","Warm","Cold"].map(function(u) {
            var uColor = { Hot: "#ef4444", Warm: "#f59e0b", Cold: "#64748b" }[u];
            var isActive = lead.urgency === u;
            return (
              <span key={u}
                onClick={function(e) { e.stopPropagation(); onUrgencyChange(lead.id, u); }}
                style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, cursor: "pointer", fontWeight: 700, background: isActive ? uColor + "33" : "rgba(255,255,255,0.04)", color: isActive ? uColor : "rgba(255,255,255,0.2)", border: "1px solid " + (isActive ? uColor + "44" : "rgba(255,255,255,0.06)") }}
              >{u}</span>
            );
          })}
        </div>
      </div>
      <div style={{ fontWeight: 700, fontSize: "14px", color: "#f1f5f9", marginBottom: "2px", paddingRight: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
      <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contactName || "—"}</div>
      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "10px", background: "rgba(99,102,241,0.15)", color: "#a5b4fc", padding: "2px 7px", borderRadius: "4px" }}>{lead.type || "Unknown"}</span>
        {lead.urgency && <span style={{ fontSize: "10px", color: urgencyColor, fontWeight: 700 }}>{lead.urgency === "Hot" ? "🔥" : lead.urgency === "Warm" ? "⚡" : "❄️"} {lead.urgency}</span>}
        {lead.package && <span style={{ fontSize: "10px", background: "rgba(245,158,11,0.15)", color: "#fcd34d", padding: "2px 7px", borderRadius: "4px" }}>{lead.package}</span>}
        {lead.contact_count > 0 && <span style={{ fontSize: "10px", background: "rgba(16,185,129,0.15)", color: "#34d399", padding: "2px 7px", borderRadius: "4px" }}>👤 {lead.contact_count}</span>}
      </div>
      {(lead.next_action || lead.next_action_date) && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ fontSize: 11, color: nextActionOverdue ? "#ef4444" : "#94a3b8", fontWeight: nextActionOverdue ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
            ⚡ {lead.next_action || ""}
            {lead.next_action_date && <span style={{ marginLeft: 4, color: nextActionOverdue ? "#ef4444" : "#64748b", fontWeight: 700 }}>· {new Date(lead.next_action_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
          </span>
        </div>
      )}
    </div>
  );
}

function ContactsPanel({ leadId, leadCompany }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showAdd, setShowAdd]   = useState(false);
  const [form, setForm]         = useState({ first_name: "", last_name: "", email: "", phone: "", title: "" });
  const [saving, setSaving]     = useState(false);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("contacts").select("*").eq("pipeline_lead_id", leadId).order("created_at", { ascending: true });
    setContacts(data || []);
    setLoading(false);
  }, [leadId]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const handleAdd = async () => {
    if (!form.first_name) return;
    setSaving(true);
    await supabase.from("contacts").insert({ first_name: form.first_name, last_name: form.last_name || null, email: form.email || null, phone: form.phone || null, title: form.title || null, company_name: leadCompany || null, pipeline_lead_id: leadId, tenant_id: SP_TENANT_ID, status: "active", source: "pipeline" });
    setForm({ first_name: "", last_name: "", email: "", phone: "", title: "" });
    setShowAdd(false);
    fetchContacts();
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this contact?")) return;
    await supabase.from("contacts").delete().eq("id", id);
    fetchContacts();
  };

  return (
    <div style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.15)", borderRadius: "10px", padding: "14px", marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, color: "#34d399" }}>👤 CONTACTS</span>
        <button onClick={() => setShowAdd(!showAdd)} style={{ padding: "4px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", background: "rgba(16,185,129,0.2)", color: "#34d399", border: "1px solid rgba(16,185,129,0.3)" }}>{showAdd ? "Cancel" : "+ Add"}</button>
      </div>
      {showAdd && (
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "12px", marginBottom: "10px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
            <div><label style={{ ...labelStyle, fontSize: "10px" }}>First Name *</label><input style={{ ...inputStyle, marginTop: "3px", padding: "6px 9px", fontSize: "12px" }} value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} placeholder="Jane" /></div>
            <div><label style={{ ...labelStyle, fontSize: "10px" }}>Last Name</label><input style={{ ...inputStyle, marginTop: "3px", padding: "6px 9px", fontSize: "12px" }} value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} placeholder="Smith" /></div>
            <div><label style={{ ...labelStyle, fontSize: "10px" }}>Email</label><input style={{ ...inputStyle, marginTop: "3px", padding: "6px 9px", fontSize: "12px" }} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="jane@co.com" /></div>
            <div><label style={{ ...labelStyle, fontSize: "10px" }}>Phone</label><input style={{ ...inputStyle, marginTop: "3px", padding: "6px 9px", fontSize: "12px" }} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 0000" /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={{ ...labelStyle, fontSize: "10px" }}>Title</label><input style={{ ...inputStyle, marginTop: "3px", padding: "6px 9px", fontSize: "12px" }} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="CEO, VP Sales..." /></div>
          </div>
          <button onClick={handleAdd} disabled={saving || !form.first_name} style={{ padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", background: "#10b981", color: "#fff", border: "none" }}>{saving ? "Saving..." : "Save"}</button>
        </div>
      )}
      {loading ? <div style={{ fontSize: "12px", color: "#475569" }}>Loading...</div>
        : contacts.length === 0 ? <div style={{ fontSize: "12px", color: "#334155" }}>No contacts yet.</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {contacts.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", background: "rgba(255,255,255,0.03)", borderRadius: "7px", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg, #10b981, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, color: "#fff", flexShrink: 0 }}>{(c.first_name || "?")[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#f1f5f9" }}>{c.first_name} {c.last_name || ""}</div>
                  <div style={{ fontSize: "11px", color: "#475569" }}>{[c.title, c.email].filter(Boolean).join(" · ")}</div>
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  {c.email && <a href={"mailto:" + c.email} style={{ padding: "3px 7px", borderRadius: "4px", fontSize: "10px", background: "rgba(99,102,241,0.1)", color: "#a5b4fc", textDecoration: "none" }}>✉</a>}
                  <button onClick={() => handleDelete(c.id)} style={{ padding: "3px 7px", borderRadius: "4px", fontSize: "10px", background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "none", cursor: "pointer" }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

function Modal({ lead, onClose, onSave }) {
  const split = splitName(lead.name);
  const [firstName, setFirstName] = useState(split.first);
  const [lastName, setLastName]   = useState(split.last);
  const [form, setForm]           = useState({ ...lead });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText]       = useState(lead.ai_next_action || "");
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState("");
  const [converting, setConverting]   = useState(false);
  const [convertDone, setConvertDone] = useState(false);
  const [replicating, setReplicating] = useState(false);
  const [sequences, setSequences] = useState([]);
  const [enrolStatus, setEnrolStatus] = useState("");
  useEffect(function() {
    fetch('/api/sequences?action=list&tenant_id=c1bc59a8-5235-4921-9755-02514b574387').then(function(r){ return r.json(); }).then(function(d){ setSequences(d.sequences||[]); }).catch(function(){});
    if (lead.id && !String(lead.id).startsWith('new_')) {
      fetch('/api/sequences?action=status&lead_id=' + lead.id).then(function(r){ return r.json(); }).then(function(d){
        var active = (d.enrolments||[]).filter(function(e){ return e.status==='active'; });
        if (active.length > 0) {
          var names = active.map(function(e){ return e.sequences ? e.sequences.name : ''; }).filter(Boolean).join(', ');
          setEnrolStatus("Enrolled: " + (names || active.length + " sequence(s)"));
        }
      }).catch(function(){});
    }
  }, [lead.id]);
  const stage = STAGES.find((s) => s.id === form.stage) || STAGES[0];
  const isNew = !lead.id || String(lead.id).startsWith("new_");

  const handleAI = async () => {
    setAiLoading(true); setAiText("");
    try {
      const res = await fetch("/api/ai-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 1000,
          messages: [{ role: "user", content: "You are a sharp B2B sales advisor for EngageWorx. Company: " + (form.company || "unknown") + " | Stage: " + stage.label + " | Urgency: " + form.urgency + " | Days stale: " + (daysSince(form.last_action_at) || "unknown") + " | Notes: " + (form.notes || "none") + "\n\nGive 3 specific punchy next actions, each starting with. Then one sentence on key risk or opportunity. No fluff." }],
        }),
      });
      const data = await res.json();
      setAiText((data.content || []).find((b) => b.type === "text")?.text || "No suggestion.");
    } catch (e) { setAiText("Error reaching AI. Try again."); }
    setAiLoading(false);
  };

  const handleSave = async () => {
    setSaveError(""); setSaving(true);
    const payload = { ...form, name: fullName(firstName, lastName) || form.company, ai_next_action: aiText || form.ai_next_action, go_live_date: form.go_live_date || null, last_action_at: form.last_action_at || null, next_action: form.next_action || null, next_action_date: form.next_action_date || null, last_activity_at: new Date().toISOString() };
    delete payload.id;
    delete payload.contact_count;
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
    try {
      if (!isNew) { const { error } = await supabase.from("leads").update(payload).eq("id", lead.id); if (error) throw error; }
      else { const { error } = await supabase.from("leads").insert(payload); if (error) throw error; }
      onSave();
    } catch (err) { setSaveError(err.message || "Save failed."); }
    setSaving(false);
  };

  const handleConvertToSandbox = async () => {
    if (!form.company) { setSaveError("Add a company name first."); return; }
    setConverting(true);
    try {
      const slug = form.company.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-sandbox";
      const { data: tenant, error: tErr } = await supabase.from("tenants").insert({ name: form.company, slug, brand_primary: "#00C9FF", brand_name: form.company, plan: form.package?.includes("Enterprise") ? "enterprise" : form.package?.includes("Pro") ? "pro" : form.package?.includes("Growth") ? "growth" : "starter", status: "trial", channels_enabled: ["sms", "email", "whatsapp"] }).select().single();
      if (tErr) throw tErr;
      await supabase.from("contacts").update({ tenant_id: tenant.id }).eq("pipeline_lead_id", lead.id);
      await supabase.from("leads").update({ stage: "sandbox_shared", last_action_at: new Date().toISOString().split("T")[0], last_activity_at: new Date().toISOString(), notes: (form.notes ? form.notes + "\n" : "") + "Sandbox created, tenant ID: " + tenant.id }).eq("id", lead.id);
      setConvertDone(true); setForm({ ...form, stage: "sandbox_shared" });
    } catch (err) { setSaveError("Conversion failed: " + err.message); }
    setConverting(false);
  };

  const handleReplicateToSPContacts = async () => {
    setReplicating(true);
    try {
      const { data: existing } = await supabase.from("contacts").select("id").eq("pipeline_lead_id", lead.id).eq("tenant_id", SP_TENANT_ID).limit(1);
      if (existing && existing.length > 0) { alert("Already in SP Contacts."); setReplicating(false); return; }
      await supabase.from("contacts").insert({ first_name: firstName || form.company, last_name: lastName || null, email: form.email || null, phone: form.phone || null, company_name: form.company || null, pipeline_lead_id: lead.id, tenant_id: SP_TENANT_ID, status: "active", source: "pipeline" });
      alert(form.company + " added to SP Contacts.");
    } catch (err) { alert("Failed: " + err.message); }
    setReplicating(false);
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this lead?")) return;
    await supabase.from("leads").delete().eq("id", lead.id);
    onSave();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", width: "100%", maxWidth: "660px", maxHeight: "92vh", overflowY: "auto", padding: "28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#f1f5f9" }}>{form.company || fullName(firstName, lastName) || "New Lead"}</div>
            <div style={{ fontSize: "13px", color: "#64748b" }}>{fullName(firstName, lastName) || "No contact name"}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: "22px", cursor: "pointer" }}>X</button>
        </div>

        <div style={{ marginBottom: "18px" }}>
          <label style={labelStyle}>Stage</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
            {STAGES.map((s) => (
              <button key={s.id} onClick={() => setForm({ ...form, stage: s.id, last_action_at: new Date().toISOString().split("T")[0] })}
                style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", background: form.stage === s.id ? s.color : "rgba(255,255,255,0.05)", color: form.stage === s.id ? "#fff" : "#94a3b8", border: "1px solid " + (form.stage === s.id ? s.color : "rgba(255,255,255,0.08)"), transition: "all 0.15s" }}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>Company *</label><input style={inputStyle} value={form.company||""} onChange={e=>setForm({...form,company:e.target.value})} placeholder="Acme Corp" /></div>
          <div><label style={labelStyle}>First Name</label><input style={inputStyle} value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="Jane" /></div>
          <div><label style={labelStyle}>Last Name</label><input style={inputStyle} value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Smith" /></div>
          <div><label style={labelStyle}>Email</label><input style={inputStyle} type="email" value={form.email||""} onChange={e=>setForm({...form,email:e.target.value})} /></div>
          <div><label style={labelStyle}>Phone</label><div style={{ display: 'flex', gap: 4 }}><select style={{ ...inputStyle, width: 80, padding: '9px 6px' }} value={(form.phone||'').startsWith('+') ? (form.phone||'').split(' ')[0] : '+1'} onChange={e => { var num = (form.phone||'').replace(/^\+\d+\s?/,''); setForm({...form, phone: e.target.value + ' ' + num}); }}><option value="+1">🇺🇸 +1</option><option value="+44">🇬🇧 +44</option><option value="+52">🇲🇽 +52</option><option value="+34">🇪🇸 +34</option><option value="+57">🇨🇴 +57</option><option value="+51">🇵🇪 +51</option><option value="+49">🇩🇪 +49</option><option value="+33">🇫🇷 +33</option><option value="+39">🇮🇹 +39</option><option value="+55">🇧🇷 +55</option><option value="+91">🇮🇳 +91</option><option value="+61">🇦🇺 +61</option></select><input style={{ ...inputStyle, flex: 1 }} value={(form.phone||'').replace(/^\+\d+\s?/,'')} onChange={e => { var cc = (form.phone||'').startsWith('+') ? (form.phone||'').split(' ')[0] : '+1'; setForm({...form, phone: cc + ' ' + e.target.value}); }} placeholder="(555) 000-0000" /></div></div>
          <div><label style={labelStyle}>Lead Type</label><select style={inputStyle} value={form.type||"Unknown"} onChange={e=>setForm({...form,type:e.target.value})}>{TYPE_OPTIONS.map(t=><option key={t}>{t}</option>)}</select></div>
          <div>
            <label style={labelStyle}>Urgency</label>
            <select style={inputStyle} value={form.urgency||"Warm"} onChange={e=>setForm({...form,urgency:e.target.value})}>
              <option>Hot</option><option>Warm</option><option>Cold</option>
            </select>
          </div>
          <div><label style={labelStyle}>Package</label><select style={inputStyle} value={form.package||""} onChange={e=>setForm({...form,package:e.target.value})}><option value="">Not selected</option>{PACKAGE_OPTIONS.map(p=><option key={p}>{p}</option>)}</select></div>
          <div><label style={labelStyle}>Source</label><select style={inputStyle} value={form.source||"Website"} onChange={e=>setForm({...form,source:e.target.value})}>{SOURCE_OPTIONS.map(s=><option key={s}>{s}</option>)}</select></div>
          <div><label style={labelStyle}>Go-Live Date</label><input type="date" style={inputStyle} value={form.go_live_date||""} onChange={e=>setForm({...form,go_live_date:e.target.value})} /></div>
          <div><label style={labelStyle}>Last Action</label><input type="date" style={inputStyle} value={form.last_action_at||""} onChange={e=>setForm({...form,last_action_at:e.target.value})} /></div>
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label style={labelStyle}>Notes</label>
          <textarea style={{ ...inputStyle, minHeight: "70px", resize: "vertical" }} value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} />
        </div>

        <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: "10px", padding: "14px", marginBottom: "14px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#a5b4fc", marginBottom: "10px" }}>NEXT ACTION</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", alignItems: "end" }}>
            <div><label style={labelStyle}>Action</label><input style={inputStyle} value={form.next_action||""} onChange={e=>setForm({...form,next_action:e.target.value})} placeholder="e.g. Send proposal, Follow up call..." /></div>
            <div><label style={labelStyle}>Due Date</label><input type="date" style={{ ...inputStyle, width: "160px" }} value={form.next_action_date||""} onChange={e=>setForm({...form,next_action_date:e.target.value})} /></div>
          </div>
          {form.next_action_date && new Date(form.next_action_date) < new Date() && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#ef4444", fontWeight: 700 }}>Overdue: {daysSince(form.next_action_date)} days past due</div>
          )}
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>Quick Actions</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "7px" }}>
            {(NEXT_ACTIONS[form.stage]||[]).map(a=>(
              <button key={a} onClick={()=>setForm({ ...form, next_action: a, next_action_date: new Date(Date.now() + 2*86400000).toISOString().split("T")[0], notes: (form.notes?form.notes+"\n":"")+"-> "+a, last_action_at: new Date().toISOString().split("T")[0] })}
                style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",cursor:"pointer",background:"rgba(99,102,241,0.1)",color:"#a5b4fc",border:"1px solid rgba(99,102,241,0.2)" }}>
                + {a}
              </button>
            ))}
            <a href={CALENDLY + "?name=" + encodeURIComponent(fullName(firstName,lastName)) + "&email=" + encodeURIComponent(form.email||"")} target="_blank" rel="noopener noreferrer"
              style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",background:"rgba(168,85,247,0.1)",color:"#c084fc",border:"1px solid rgba(168,85,247,0.2)",textDecoration:"none" }}>
              Send Calendly
            </a>
          </div>
        </div>

        {!isNew && <ContactsPanel leadId={lead.id} leadCompany={form.company} />}

        {!isNew && (
          <div style={{ marginBottom: "16px" }}>
            <button onClick={handleReplicateToSPContacts} disabled={replicating}
              style={{ width:"100%",padding:"9px",borderRadius:"7px",background:"rgba(99,102,241,0.1)",color:"#a5b4fc",border:"1px solid rgba(99,102,241,0.2)",fontWeight:600,fontSize:"12px",cursor:"pointer" }}>
              {replicating ? "Adding..." : "Replicate Lead to SP Contacts"}
            </button>
          </div>
        )}

        {!isNew && (
          <div style={{ background:"rgba(168,85,247,0.06)",border:"1px solid rgba(168,85,247,0.2)",borderRadius:"10px",padding:"14px",marginBottom:"14px" }}>
            <div style={{ fontSize:"12px",fontWeight:700,color:"#c084fc",marginBottom:"10px" }}>SEQUENCES</div>
            {enrolStatus && <div style={{ marginBottom:8,fontSize:12,color:"#10b981",fontWeight:600 }}>{enrolStatus}</div>}
            <div style={{ display:"flex",gap:"8px",flexWrap:"wrap" }}>
              {sequences.length === 0
                ? <div style={{ fontSize:"12px",color:"#475569" }}>No sequences available.</div>
                : sequences.map(function(s) {
                  return (
                    <button key={s.id} onClick={async function(){
                      setEnrolStatus("Enrolling...");
                      try {
                        var r = await fetch('/api/sequences?action=enrol', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lead_id:lead.id,sequence_id:s.id})});
                        var d = await r.json();
                        setEnrolStatus(d.success ? "Enrolled in: " + s.name : "Error: " + (d.error||"Failed"));
                      } catch(e) { setEnrolStatus("Error: " + e.message); }
                    }} style={{ padding:"6px 12px",borderRadius:"6px",fontSize:"11px",fontWeight:600,cursor:"pointer",background:"rgba(168,85,247,0.15)",color:"#c084fc",border:"1px solid rgba(168,85,247,0.3)" }}>
                      {s.name}
                    </button>
                  );
                })
              }
            </div>
          </div>
        )}

        {!isNew && (
          <div style={{ background:"rgba(16,185,129,0.06)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:"10px",padding:"16px",marginBottom:"16px" }}>
            <div style={{ fontSize:"12px",fontWeight:700,color:"#10b981",marginBottom:"8px" }}>CONVERT TO TENANT</div>
            {convertDone ? (
              <div style={{ fontSize:"13px",color:"#10b981" }}>Tenant created, stage updated to Sandbox Shared.</div>
            ) : (
              <div>
                <div style={{ fontSize:"12px",color:"#475569",marginBottom:"10px" }}>Creates a trial tenant, migrates contacts, moves stage to Sandbox Shared.</div>
                <button onClick={handleConvertToSandbox} disabled={converting||!form.company}
                  style={{ padding:"8px 16px",borderRadius:"7px",background:"rgba(16,185,129,0.2)",color:"#10b981",border:"1px solid rgba(16,185,129,0.3)",fontWeight:700,fontSize:"12px",cursor:"pointer" }}>
                  {converting ? "Converting..." : "Convert to Sandbox"}
                </button>
              </div>
            )}
          </div>
        )}

        <div style={{ background:"rgba(99,102,241,0.08)",border:"1px solid rgba(99,102,241,0.2)",borderRadius:"10px",padding:"16px",marginBottom:"16px" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px" }}>
            <span style={{ fontSize:"12px",fontWeight:700,color:"#a5b4fc" }}>AI SALES ADVISOR</span>
            <button onClick={handleAI} disabled={aiLoading} style={{ padding:"6px 14px",borderRadius:"6px",fontSize:"12px",fontWeight:700,cursor:"pointer",background:aiLoading?"rgba(99,102,241,0.3)":"#6366f1",color:"#fff",border:"none" }}>
              {aiLoading?"Thinking...":"Get Next Actions"}
            </button>
          </div>
          {aiText ? <div style={{ fontSize:"13px",color:"#cbd5e1",lineHeight:1.7,whiteSpace:"pre-wrap" }}>{aiText}</div>
            : <div style={{ fontSize:"12px",color:"#475569" }}>Click to get AI-powered next actions for this lead.</div>}
        </div>

        {saveError && <div style={{ background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:"8px",padding:"10px 14px",marginBottom:"12px",color:"#ef4444",fontSize:"13px" }}>{saveError}</div>}

        <div style={{ display:"flex",gap:"10px" }}>
          <button onClick={handleSave} disabled={saving} style={{ flex:1,padding:"12px",borderRadius:"8px",background:saving?"rgba(99,102,241,0.5)":"#6366f1",color:"#fff",fontWeight:700,fontSize:"14px",border:"none",cursor:"pointer" }}>
            {saving?"Saving...":"Save Lead"}
          </button>
          {!isNew && <button onClick={handleDelete} style={{ padding:"12px 16px",borderRadius:"8px",background:"rgba(239,68,68,0.1)",color:"#ef4444",fontWeight:600,fontSize:"13px",border:"1px solid rgba(239,68,68,0.2)",cursor:"pointer" }}>Delete</button>}
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
  const [showActions, setShowActions] = useState(false);
  const [hideDormant, setHideDormant] = useState(true);

  const fetchLeads = async () => {
    const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (error) console.error("Fetch error:", error);
    const ids = (data || []).map(l => l.id);
    var countMap = {};
    if (ids.length > 0) {
      const { data: contactCounts } = await supabase.from("contacts").select("pipeline_lead_id").in("pipeline_lead_id", ids);
      (contactCounts || []).forEach(c => { countMap[c.pipeline_lead_id] = (countMap[c.pipeline_lead_id] || 0) + 1; });
    }
    setLeads((data || []).map(l => ({ ...l, contact_count: countMap[l.id] || 0 })));
    setLastSync(new Date());
    setLoading(false);
  };

  const handleUrgencyChange = async (leadId, urgency) => {
    await supabase.from("leads").update({ urgency: urgency }).eq("id", leadId);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, urgency: urgency } : l));
  };

  useEffect(() => {
    fetchLeads();
    const channel = supabase.channel("leads-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload) => {
        setLiveFlash(true);
        setTimeout(() => setLiveFlash(false), 2000);
        if (payload.eventType === "INSERT")      setLeads(p => [{ ...payload.new, contact_count: 0 }, ...p]);
        else if (payload.eventType === "UPDATE") setLeads(p => p.map(l => l.id === payload.new.id ? { ...payload.new, contact_count: l.contact_count || 0 } : l));
        else if (payload.eventType === "DELETE") setLeads(p => p.filter(l => l.id !== payload.old.id));
        setLastSync(new Date());
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const newLead = { id: "new_" + Date.now(), name: "", company: "", email: "", phone: "", type: "Unknown", urgency: "Warm", stage: "inquiry", package: "", go_live_date: "", notes: "", source: "Website", last_action_at: new Date().toISOString().split("T")[0], next_action: "", next_action_date: "" };

  const sortedLeads = [...leads].sort((a, b) => {
    var av = a[sortBy] || "", bv = b[sortBy] || "";
    if (sortBy === "urgency") { var ord = {Hot:0,Warm:1,Cold:2}; av = ord[a.urgency]||1; bv = ord[b.urgency]||1; }
    if (sortBy === "stage")   { var ords = STAGES.map(s=>s.id); av = ords.indexOf(a.stage); bv = ords.indexOf(b.stage); }
    if (sortBy === "company") { av = (a.company||a.name||"").toLowerCase(); bv = (b.company||b.name||"").toLowerCase(); }
    if (sortBy === "next_action_date") { av = a.next_action_date || "9999"; bv = b.next_action_date || "9999"; }
    if (typeof av === "string") av = av.toLowerCase();
    if (typeof bv === "string") bv = bv.toLowerCase();
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const filtered = sortedLeads.filter(l => {
    if (hideDormant && l.stage === "dormant") return false;
    if (filterType !== "All" && l.type !== filterType) return false;
    if (search) {
      var q = search.toLowerCase();
      return (l.company||"").toLowerCase().includes(q) || (l.name||"").toLowerCase().includes(q);
    }
    return true;
  });

  var pipeline  = leads.filter(l => l.stage !== "customer" && l.stage !== "dormant").length;
  var customers = leads.filter(l => l.stage === "customer").length;
  var hot       = leads.filter(l => l.urgency === "Hot").length;
  var stale     = leads.filter(l => daysSince(l.last_action_at) >= STALE_DAYS && l.stage !== "dormant").length;
  var overdue   = leads.filter(l => l.next_action_date && new Date(l.next_action_date) < new Date()).length;

  var today = new Date().toISOString().split("T")[0];
  var todayActions = leads.filter(l => l.next_action_date && l.next_action_date <= today);
  var thisWeekEnd = new Date(); thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);
  var weekActions = leads.filter(l => l.next_action_date && l.next_action_date > today && new Date(l.next_action_date) <= thisWeekEnd);
  var staleLeads  = leads.filter(l => daysSince(l.last_action_at) >= STALE_DAYS && l.stage !== "dormant" && l.stage !== "customer");

  return (
    <div style={{ minHeight:"100vh",background:"#070d1a",fontFamily:"'DM Sans','Segoe UI',sans-serif",color:"#f1f5f9" }}>
      <div style={{ padding:"24px 28px 0",borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px" }}>
          <div style={{ display:"flex",alignItems:"center",gap:"12px" }}>
            <div style={{ width:"34px",height:"34px",background:"linear-gradient(135deg,#6366f1,#ec4899)",borderRadius:"9px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"17px" }}>⚡</div>
            <span style={{ fontSize:"17px",fontWeight:800,letterSpacing:"-0.02em" }}>EngageWorx</span>
            <span style={{ fontSize:"11px",color:"#475569",fontFamily:"DM Mono",background:"rgba(255,255,255,0.04)",padding:"2px 8px",borderRadius:"4px",border:"1px solid rgba(255,255,255,0.06)" }}>PIPELINE</span>
            <div style={{ display:"flex",alignItems:"center",gap:"5px" }}>
              <div style={{ width:"7px",height:"7px",borderRadius:"50%",background:liveFlash?"#10b981":"#1e293b",transition:"background 0.3s" }} />
              <span style={{ fontSize:"10px",color:"#334155",fontFamily:"DM Mono" }}>{liveFlash?"LIVE":lastSync?"synced "+lastSync.toLocaleTimeString():"connecting..."}</span>
            </div>
          </div>
          <button onClick={()=>setSelected(newLead)} style={{ padding:"9px 18px",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",border:"none",borderRadius:"8px",color:"#fff",fontWeight:700,fontSize:"13px",cursor:"pointer" }}>+ Add Lead</button>
        </div>

        <div style={{ display:"flex",gap:"28px",marginBottom:"18px" }}>
          {[{l:"Pipeline",v:pipeline,c:"#6366f1"},{l:"Customers",v:customers,c:"#10b981"},{l:"Hot Leads",v:hot,c:hot>0?"#ef4444":"#334155"},{l:"Needs Action",v:stale,c:stale>0?"#f59e0b":"#334155"},{l:"Overdue",v:overdue,c:overdue>0?"#ef4444":"#334155"}].map(k=>(
            <div key={k.l}>
              <div style={{ fontSize:"28px",fontWeight:800,color:k.c,fontFamily:"DM Mono",lineHeight:1 }}>{loading?"—":k.v}</div>
              <div style={{ fontSize:"10px",color:"#475569",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",marginTop:"3px" }}>{k.l}</div>
            </div>
          ))}
        </div>

        <div style={{ display:"flex",gap:"8px",alignItems:"center",paddingBottom:"16px",flexWrap:"wrap" }}>
          <input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{ ...inputStyle,width:"180px",marginTop:0,padding:"7px 11px" }} />
          {["All",...TYPE_OPTIONS].map(t=>(
            <button key={t} onClick={()=>setFilterType(t)} style={{ padding:"6px 12px",borderRadius:"6px",fontSize:"11px",fontWeight:600,cursor:"pointer",background:"rgba(168,85,247,0.15)",color:"#c084fc",border:"1px solid rgba(168,85,247,0.3)" }}>{t}</button>
          ))}
          <div style={{ marginLeft:"auto",display:"flex",gap:"6px",flexWrap:"wrap" }}>
            <button onClick={()=>setShowActions(!showActions)} style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:700,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:showActions?"rgba(99,102,241,0.3)":"rgba(255,255,255,0.03)",color:showActions?"#a5b4fc":"#475569" }}>Actions</button>
            <button onClick={()=>setHideDormant(!hideDormant)} style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.03)",color:"#475569" }}>{hideDormant?"Show Dormant":"Hide Dormant"}</button>
            <button onClick={()=>{ if(sortBy==="company") setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortBy("company");setSortDir("asc");} }} style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:sortBy==="company"?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.03)",color:sortBy==="company"?"#a5b4fc":"#475569" }}>A-Z {sortBy==="company"?(sortDir==="asc"?"^":"v"):""}</button>
            <button onClick={()=>{ if(sortBy==="urgency") setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortBy("urgency");setSortDir("asc");} }} style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:sortBy==="urgency"?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.03)",color:sortBy==="urgency"?"#a5b4fc":"#475569" }}>Urgency</button>
            <button onClick={()=>{ if(sortBy==="stage") setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortBy("stage");setSortDir("asc");} }} style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:sortBy==="stage"?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.03)",color:sortBy==="stage"?"#a5b4fc":"#475569" }}>Stage</button>
            <button onClick={()=>{ if(sortBy==="next_action_date") setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortBy("next_action_date");setSortDir("asc");} }} style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:sortBy==="next_action_date"?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.03)",color:sortBy==="next_action_date"?"#a5b4fc":"#475569" }}>Due Date</button>
            <button onClick={()=>{ if(sortBy==="created_at") setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortBy("created_at");setSortDir("asc");} }} style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:sortBy==="created_at"?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.03)",color:sortBy==="created_at"?"#a5b4fc":"#475569" }}>Date</button>
          </div>
        </div>
      </div>

      {showActions && (
        <div style={{ padding:"16px 28px",borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16 }}>
            <div style={{ background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:10,padding:14 }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#ef4444",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10 }}>Overdue / Due Today ({todayActions.length})</div>
              {todayActions.length === 0
                ? <div style={{ fontSize:12,color:"#334155" }}>All clear</div>
                : todayActions.slice(0,5).map(l => (
                  <div key={l.id} onClick={()=>setSelected(l)} style={{ padding:"8px 10px",background:"rgba(0,0,0,0.2)",borderRadius:7,marginBottom:6,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:12,fontWeight:700,color:"#f1f5f9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160 }}>{l.company||l.name}</div>
                      <div style={{ fontSize:10,color:"#64748b" }}>{l.next_action||"No action set"}</div>
                    </div>
                    <div style={{ fontSize:10,color:"#ef4444",fontWeight:700,flexShrink:0,marginLeft:6 }}>{l.next_action_date}</div>
                  </div>
                ))}
              {todayActions.length > 5 && <div style={{ fontSize:11,color:"#475569",marginTop:4 }}>+{todayActions.length-5} more</div>}
            </div>
            <div style={{ background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:10,padding:14 }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10 }}>This Week ({weekActions.length})</div>
              {weekActions.length === 0
                ? <div style={{ fontSize:12,color:"#334155" }}>Nothing scheduled</div>
                : weekActions.slice(0,5).map(l => (
                  <div key={l.id} onClick={()=>setSelected(l)} style={{ padding:"8px 10px",background:"rgba(0,0,0,0.2)",borderRadius:7,marginBottom:6,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:12,fontWeight:700,color:"#f1f5f9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160 }}>{l.company||l.name}</div>
                      <div style={{ fontSize:10,color:"#64748b" }}>{l.next_action||"No action set"}</div>
                    </div>
                    <div style={{ fontSize:10,color:"#f59e0b",fontWeight:700,flexShrink:0,marginLeft:6 }}>{new Date(l.next_action_date).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</div>
                  </div>
                ))}
              {weekActions.length > 5 && <div style={{ fontSize:11,color:"#475569",marginTop:4 }}>+{weekActions.length-5} more</div>}
            </div>
            <div style={{ background:"rgba(99,102,241,0.06)",border:"1px solid rgba(99,102,241,0.15)",borderRadius:10,padding:14 }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#a5b4fc",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10 }}>Gone Quiet ({staleLeads.length})</div>
              {staleLeads.length === 0
                ? <div style={{ fontSize:12,color:"#334155" }}>All leads active</div>
                : staleLeads.slice(0,5).map(l => (
                  <div key={l.id} onClick={()=>setSelected(l)} style={{ padding:"8px 10px",background:"rgba(0,0,0,0.2)",borderRadius:7,marginBottom:6,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:12,fontWeight:700,color:"#f1f5f9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160 }}>{l.company||l.name}</div>
                      <div style={{ fontSize:10,color:"#64748b" }}>{(STAGES.find(s=>s.id===l.stage)||{}).label||l.stage}</div>
                    </div>
                    <div style={{ fontSize:10,color:"#ef4444",fontWeight:700,flexShrink:0,marginLeft:6 }}>{daysSince(l.last_action_at)}d</div>
                  </div>
                ))}
              {staleLeads.length > 5 && <div style={{ fontSize:11,color:"#475569",marginTop:4 }}>+{staleLeads.length-5} more</div>}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"300px",color:"#334155",fontSize:"14px" }}>Connecting...</div>
      ) : (
        <div style={{ display:"flex",overflowX:"auto",padding:"20px 16px",gap:"12px",minHeight:"calc(100vh - 300px)" }}>
          {STAGES.map(stage => {
            var sl = filtered.filter(l => l.stage === stage.id);
            return (
              <div key={stage.id} style={{ minWidth:"220px",maxWidth:"220px",flexShrink:0 }}>
                <div style={{ display:"flex",alignItems:"center",gap:"7px",marginBottom:"12px",padding:"0 4px" }}>
                  <div style={{ width:"8px",height:"8px",borderRadius:"50%",background:stage.color }} />
                  <span style={{ fontSize:"11px",fontWeight:700,color:"#64748b",letterSpacing:"0.06em",textTransform:"uppercase" }}>{stage.label}</span>
                  <span style={{ marginLeft:"auto",fontSize:"11px",fontFamily:"DM Mono",color:"#334155",background:"rgba(255,255,255,0.04)",padding:"1px 6px",borderRadius:"4px" }}>{sl.length}</span>
                </div>
                <div style={{ background:"rgba(255,255,255,0.02)",borderRadius:"10px",padding:"10px",minHeight:"80px",border:"1px solid rgba(255,255,255,0.04)" }}>
                  {sl.length === 0
                    ? <div style={{ textAlign:"center",padding:"16px 0",fontSize:"11px",color:"#1e293b" }}>Empty</div>
                    : sl.map(lead => <LeadCard key={lead.id} lead={lead} onSelect={setSelected} onUrgencyChange={handleUrgencyChange} />)}
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
