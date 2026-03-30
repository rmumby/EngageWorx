import { useState, useEffect, useCallback } from "react";
import { supabase } from '../supabaseClient';
import { useTheme } from '../ThemeContext';

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
const inputStyle = { width: "100%", marginTop: "5px", padding: "9px 11px", borderRadius: "7px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#f1f5f9", fontSize: "13px", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }; // base - overridden by T in dynamic contexts

function LeadCard({ lead, onSelect }) {
  const stage = STAGES.find((s) => s.id === lead.stage) || STAGES[0];
  const days  = daysSince(lead.last_action_at);
  const stale = days !== null && days >= STALE_DAYS;
  const urgencyColor = { Hot: "#ef4444", Warm: "#f59e0b", Cold: "#64748b" }[lead.urgency] || "#64748b";
  const nextActionOverdue = lead.next_action_date && new Date(lead.next_action_date) < new Date();
  return (
    <div onClick={() => onSelect(lead)}
      style={{ background: "var(--bg-card)", border: `1px solid ${stale ? "#ef4444" : "var(--border-color)"}`, borderLeft: `3px solid ${stage.color}`, borderRadius: "8px", padding: "14px 16px", cursor: "pointer", marginBottom: "8px", position: "relative", transition: "background 0.15s" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-card-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-card)")}>
      <div style={{ position: "absolute", top: 6, right: 8, display: "flex", gap: 4, alignItems: "center" }}>
        {stale && <div style={{ fontSize: "10px", color: "#ef4444", fontFamily: "monospace", fontWeight: 700 }}>{days}d stale</div>}
        <div style={{ display: "flex", gap: 2 }} onClick={e => e.stopPropagation()}>
          {["Hot","Warm","Cold"].map(u => (
            <span key={u} onClick={async e => { e.stopPropagation(); await import('../supabaseClient').then(m => m.supabase.from("leads").update({ urgency: u }).eq("id", lead.id)); onSelect({ ...lead, urgency: u }); }}
              style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, cursor: "pointer", fontWeight: 700, background: lead.urgency === u ? ({ Hot:"#ef4444", Warm:"#f59e0b", Cold:"#64748b" }[u] + "33") : "rgba(255,255,255,0.04)", color: lead.urgency === u ? ({ Hot:"#ef4444", Warm:"#f59e0b", Cold:"#64748b" }[u]) : "rgba(255,255,255,0.2)", border: `1px solid ${lead.urgency === u ? ({ Hot:"#ef4444", Warm:"#f59e0b", Cold:"#64748b" }[u] + "44") : "rgba(255,255,255,0.06)"}` }}>
              {u}
            </span>
          ))}
        </div>
      </div>
      <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "2px", paddingRight: stale ? "52px" : 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.company || lead.name}</div>
      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.name || "—"}</div>
      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "10px", background: "rgba(99,102,241,0.15)", color: "#a5b4fc", padding: "2px 7px", borderRadius: "4px" }}>{lead.type || "Unknown"}</span>
        {lead.urgency && <span style={{ fontSize: "10px", color: urgencyColor, fontWeight: 700 }}>{{ Hot:"🔥", Warm:"⚡", Cold:"❄️" }[lead.urgency]} {lead.urgency}</span>}
        {lead.package && <span style={{ fontSize: "10px", background: "rgba(245,158,11,0.15)", color: "#fcd34d", padding: "2px 7px", borderRadius: "4px" }}>{lead.package}</span>}
        {lead.contact_count > 0 && <span style={{ fontSize: "10px", background: "rgba(16,185,129,0.15)", color: "#34d399", padding: "2px 7px", borderRadius: "4px" }}>👤 {lead.contact_count}</span>}
        {lead.sequence_count > 0 && <span style={{ fontSize: "10px", background: "rgba(99,102,241,0.15)", color: "#a5b4fc", padding: "2px 7px", borderRadius: "4px" }}>⚡ {lead.sequence_count}</span>}
      </div>
      {(lead.next_action || lead.next_action_date) && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10 }}>⚡</span>
            <span style={{ fontSize: 11, color: nextActionOverdue ? "#ef4444" : "#94a3b8", fontWeight: nextActionOverdue ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lead.next_action || ""}
              {lead.next_action_date && (
                <span style={{ marginLeft: 4, color: nextActionOverdue ? "#ef4444" : "#64748b", fontWeight: 700 }}>
                  · {new Date(lead.next_action_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function ContactsPanel({ leadId, leadCompany }) {
  const [contacts, setContacts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [form, setForm]           = useState({ first_name: "", last_name: "", email: "", phone: "", title: "" });
  const [saving, setSaving]       = useState(false);

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
    await supabase.from("contacts").insert({
      first_name: form.first_name, last_name: form.last_name || null,
      email: form.email || null, phone: form.phone || null, title: form.title || null,
      company_name: leadCompany || null, pipeline_lead_id: leadId,
      tenant_id: SP_TENANT_ID, status: "active", source: "pipeline",
    });
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
        <span style={{ fontSize: "11px", fontWeight: 700, color: "#34d399", letterSpacing: "0.05em" }}>👤 CONTACTS AT THIS COMPANY</span>
        <button onClick={() => setShowAdd(!showAdd)} style={{ padding: "4px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", background: "rgba(16,185,129,0.2)", color: "#34d399", border: "1px solid rgba(16,185,129,0.3)" }}>
          {showAdd ? "Cancel" : "+ Add Contact"}
        </button>
      </div>
      {showAdd && (
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "12px", marginBottom: "10px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
            <div><label style={{ ...labelStyle, fontSize: "10px" }}>First Name *</label><input style={{ ...inputStyle, marginTop: "3px", padding: "6px 9px", fontSize: "12px" }} value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} placeholder="Jane" /></div>
            <div><label style={{ ...labelStyle, fontSize: "10px" }}>Last Name</label><input style={{ ...inputStyle, marginTop: "3px", padding: "6px 9px", fontSize: "12px" }} value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} placeholder="Smith" /></div>
            <div><label style={{ ...labelStyle, fontSize: "10px" }}>Email</label><input style={{ ...inputStyle, marginTop: "3px", padding: "6px 9px", fontSize: "12px" }} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="jane@company.com" /></div>
            <div><label style={{ ...labelStyle, fontSize: "10px" }}>Phone</label><input style={{ ...inputStyle, marginTop: "3px", padding: "6px 9px", fontSize: "12px" }} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 000 0000" /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={{ ...labelStyle, fontSize: "10px" }}>Title / Role</label><input style={{ ...inputStyle, marginTop: "3px", padding: "6px 9px", fontSize: "12px" }} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="CEO, VP Sales, etc." /></div>
          </div>
          <button onClick={handleAdd} disabled={saving || !form.first_name} style={{ padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", background: "#10b981", color: "#fff", border: "none" }}>
            {saving ? "Saving..." : "Save Contact"}
          </button>
        </div>
      )}
      {loading ? <div style={{ fontSize: "12px", color: "#475569" }}>Loading...</div>
        : contacts.length === 0 ? <div style={{ fontSize: "12px", color: "#334155" }}>No contacts added yet.</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {contacts.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", background: "rgba(255,255,255,0.03)", borderRadius: "7px", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg, #10b981, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, color: "#fff", flexShrink: 0 }}>{(c.first_name?.[0] || "?")}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#f1f5f9" }}>{c.first_name} {c.last_name || ""}</div>
                  <div style={{ fontSize: "11px", color: "#475569" }}>{[c.title, c.email].filter(Boolean).join(" · ")}</div>
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  {c.email && <a href={`mailto:${c.email}`} style={{ padding: "3px 7px", borderRadius: "4px", fontSize: "10px", background: "rgba(99,102,241,0.1)", color: "#a5b4fc", textDecoration: "none" }}>✉</a>}
                  <button onClick={() => handleDelete(c.id)} style={{ padding: "3px 7px", borderRadius: "4px", fontSize: "10px", background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "none", cursor: "pointer" }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

function SequencesPanel({ lead, sequences, onEnrol, onCancel }) {
  const [enrolments, setEnrolments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchEnrolments = useCallback(async () => {
    setLoading(true);
    try {
      var res = await fetch('/api/sequences?action=status&lead_id=' + lead.id);
      var data = await res.json();
      setEnrolments(data.enrolments || []);
    } catch(e) { console.error('fetchEnrolments error:', e); }
    setLoading(false);
  }, [lead.id]);

  useEffect(() => { fetchEnrolments(); }, [fetchEnrolments]);

  const handleEnrol = async (seqId) => {
    await onEnrol(lead.id, seqId);
    fetchEnrolments();
  };

  const handleCancel = async (enrolmentId) => {
    await onCancel(enrolmentId);
    fetchEnrolments();
  };

  const activeEnrolments = enrolments.filter(e => e.status === 'active');
  const pastEnrolments = enrolments.filter(e => e.status !== 'active');
  const enrolledIds = activeEnrolments.map(e => e.sequence_id);
  const availableSequences = sequences.filter(s => !enrolledIds.includes(s.id));

  return (
    <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: "10px", padding: "14px", marginBottom: "16px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: "#a5b4fc", letterSpacing: "0.05em", marginBottom: "12px" }}>⚡ SEQUENCES</div>
      {loading ? <div style={{ fontSize: "12px", color: "#475569" }}>Loading...</div> : (
        <>
          {activeEnrolments.length === 0 && availableSequences.length === 0 && (
            <div style={{ fontSize: "12px", color: "#475569", marginBottom: 10 }}>No sequences available. Create one in the Sequences view.</div>
          )}
          {activeEnrolments.map(e => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 6 }}>
              <div>
                <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{e.sequences?.name || "Sequence"}</div>
                <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>
                  Step {e.current_step} · Active
                  {e.next_step_at && <span> · Next: {new Date(e.next_step_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                </div>
              </div>
              <button onClick={() => handleCancel(e.id)} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "4px 10px", color: "#ef4444", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Cancel</button>
            </div>
          ))}
          {pastEnrolments.map(e => (
            <div key={e.id} style={{ background: "rgba(0,0,0,0.1)", borderRadius: 8, padding: "7px 12px", marginBottom: 4, opacity: 0.5 }}>
              <div style={{ color: "#64748b", fontSize: 12 }}>{e.sequences?.name || "Sequence"} — {e.status}</div>
            </div>
          ))}
          {availableSequences.length > 0 && (
            <div style={{ marginTop: activeEnrolments.length > 0 || pastEnrolments.length > 0 ? 10 : 0 }}>
              <div style={{ fontSize: "10px", color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Enrol in sequence</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {availableSequences.map(seq => (
                  <button key={seq.id} onClick={() => handleEnrol(seq.id)} style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 6, padding: "6px 12px", color: "#a5b4fc", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>+ {seq.name}</button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Modal({ lead, onClose, onSave, sequences, onEnrol, onCancel }) {
  const { first: initFirst, last: initLast } = splitName(lead.name);
  const [firstName, setFirstName]     = useState(initFirst);
  const [lastName, setLastName]       = useState(initLast);
  const [form, setForm]               = useState({ ...lead });
  const [aiLoading, setAiLoading]     = useState(false);
  const [aiText, setAiText]           = useState(lead.ai_next_action || "");
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState("");
  const [converting, setConverting]   = useState(false);
  const [convertDone, setConvertDone] = useState(false);
  const [replicating, setReplicating] = useState(false);
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
          messages: [{ role: "user", content: `You are a sharp B2B sales advisor for EngageWorx — AI-powered omnichannel comms platform (SMS, WhatsApp, Email, Voice, RCS). Pricing: Starter $99, Growth $249, Pro $499, Enterprise.\n\nCompany: ${form.company || "unknown"} | Contact: ${fullName(firstName, lastName)}\nType: ${form.type} | Stage: ${stage.label} | Urgency: ${form.urgency}\nPackage: ${form.package || "not selected"} | Days stale: ${daysSince(form.last_action_at) ?? "unknown"}\nNotes: ${form.notes || "none"}\n\nGive 3 specific punchy next actions, each starting with →. Then one sentence on key risk or opportunity. No fluff.` }],
        }),
      });
      const data = await res.json();
      setAiText(data.content?.find((b) => b.type === "text")?.text || "No suggestion.");
    } catch { setAiText("Error reaching AI. Try again."); }
    setAiLoading(false);
  };

  const handleSave = async () => {
    setSaveError(""); setSaving(true);
    const payload = {
      ...form, name: fullName(firstName, lastName) || form.company,
      ai_next_action: aiText || form.ai_next_action,
      go_live_date: form.go_live_date || null, last_action_at: form.last_action_at || null,
      next_action: form.next_action || null, next_action_date: form.next_action_date || null,
      last_activity_at: new Date().toISOString(),
    };
    delete payload.id;
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
      const { data: tenant, error: tErr } = await supabase.from("tenants").insert({
        name: form.company, slug, brand_primary: "#00C9FF", brand_name: form.company,
        plan: form.package?.includes("Enterprise") ? "enterprise" : form.package?.includes("Pro") ? "pro" : form.package?.includes("Growth") ? "growth" : "starter",
        status: "trial", channels_enabled: ["sms", "email", "whatsapp"],
      }).select().single();
      if (tErr) throw tErr;
      await supabase.from("contacts").update({ tenant_id: tenant.id }).eq("pipeline_lead_id", lead.id);
      await supabase.from("leads").update({
        stage: "sandbox_shared", last_action_at: new Date().toISOString().split("T")[0],
        last_activity_at: new Date().toISOString(),
        notes: (form.notes ? form.notes + "\n" : "") + `→ Sandbox created — tenant ID: ${tenant.id}`,
      }).eq("id", lead.id);
      setConvertDone(true); setForm({ ...form, stage: "sandbox_shared" });
    } catch (err) { setSaveError("Conversion failed: " + err.message); }
    setConverting(false);
  };

  const handleReplicateToSPContacts = async () => {
    setReplicating(true);
    try {
      const { data: existing } = await supabase.from("contacts").select("id").eq("pipeline_lead_id", lead.id).eq("tenant_id", SP_TENANT_ID).limit(1);
      if (existing && existing.length > 0) { alert("Contacts from this lead are already in SP Contacts."); setReplicating(false); return; }
      await supabase.from("contacts").insert({
        first_name: firstName || form.company, last_name: lastName || null,
        email: form.email || null, phone: form.phone || null, company_name: form.company || null,
        pipeline_lead_id: lead.id, tenant_id: SP_TENANT_ID, status: "active", source: "pipeline",
      });
      alert(`✅ ${form.company || fullName(firstName, lastName)} added to SP Contacts.`);
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
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "16px", width: "100%", maxWidth: "660px", maxHeight: "92vh", overflowY: "auto", padding: "28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#f1f5f9" }}>{form.company || fullName(firstName, lastName) || "New Lead"}</div>
            <div style={{ fontSize: "13px", color: "#64748b" }}>{fullName(firstName, lastName) || "No contact name"}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: "22px", cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ marginBottom: "18px" }}>
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>Company *</label><input style={inputStyle} value={form.company||""} onChange={e=>setForm({...form,company:e.target.value})} placeholder="Acme Corp" /></div>
          <div><label style={labelStyle}>First Name</label><input style={inputStyle} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" /></div>
          <div><label style={labelStyle}>Last Name</label><input style={inputStyle} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Smith" /></div>
          <div><label style={labelStyle}>Email</label><input style={inputStyle} type="email" value={form.email||""} onChange={e=>setForm({...form,email:e.target.value})} /></div>
          <div><label style={labelStyle}>Phone</label><input style={inputStyle} value={form.phone||""} onChange={e=>setForm({...form,phone:e.target.value})} /></div>
          <div><label style={labelStyle}>Lead Type</label><select style={inputStyle} value={form.type||"Unknown"} onChange={e=>setForm({...form,type:e.target.value})}>{TYPE_OPTIONS.map(t=><option key={t}>{t}</option>)}</select></div>
          <div>
            <label style={labelStyle}>Urgency</label>
            <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
              <select style={{ ...inputStyle, marginTop: 0, flex: 1 }} value={form.urgency||"Warm"} onChange={e=>setForm({...form,urgency:e.target.value})}>{"Hot,Warm,Cold".split(",").map(u=><option key={u}>{u}</option>)}</select>
              <button onClick={async () => {
                try {
                  const res = await fetch("/api/ai-advisor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ max_tokens: 50, messages: [{ role: "user", content: `Based on this lead, classify urgency as Hot, Warm, or Cold. Reply with ONLY one word.

Company: ${form.company}
Stage: ${form.stage}
Days since last action: ${daysSince(form.last_action_at) ?? "unknown"}
Notes: ${form.notes || "none"}
Last action: ${form.last_action_at || "never"}` }] }) });
                  const data = await res.json();
                  const urgency = (data.content?.find(b => b.type === "text")?.text || "").trim().replace(/[^a-zA-Z]/g, "");
                  const valid = ["Hot","Warm","Cold"].find(u => u.toLowerCase() === urgency.toLowerCase());
                  if (valid) setForm({...form, urgency: valid});
                } catch(e) {}
              }} style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 7, padding: "0 10px", color: "#a5b4fc", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit", flexShrink: 0 }}>✨ AI</button>
            </div>
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
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#a5b4fc", letterSpacing: "0.05em", marginBottom: "10px" }}>⚡ NEXT ACTION</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", alignItems: "end" }}>
            <div>
              <label style={labelStyle}>Action</label>
              <input style={inputStyle} value={form.next_action||""} onChange={e=>setForm({...form,next_action:e.target.value})} placeholder="e.g. Send proposal, Follow up call, Book demo..." />
            </div>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input type="date" style={{ ...inputStyle, width: "160px" }} value={form.next_action_date||""} onChange={e=>setForm({...form,next_action_date:e.target.value})} />
            </div>
          </div>
          {form.next_action_date && new Date(form.next_action_date) < new Date() && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#ef4444", fontWeight: 700 }}>⚠ Overdue — {daysSince(form.next_action_date)} days past due</div>
          )}
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>Quick Actions</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "7px" }}>
            {(NEXT_ACTIONS[form.stage]||[]).map(a=>(
              <button key={a} onClick={()=>setForm({ ...form, next_action: a, next_action_date: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0], notes:(form.notes?form.notes+"\n":"")+`→ ${a}`, last_action_at:new Date().toISOString().split("T")[0] })}
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

        {!isNew && <ContactsPanel leadId={lead.id} leadCompany={form.company} />}
        {!isNew && <SequencesPanel lead={lead} sequences={sequences} onEnrol={onEnrol} onCancel={onCancel} />}

        {!isNew && (
          <div style={{ marginBottom: "16px" }}>
            <button onClick={handleReplicateToSPContacts} disabled={replicating}
              style={{ width: "100%", padding: "9px", borderRadius: "7px", background: "rgba(99,102,241,0.1)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.2)", fontWeight: 600, fontSize: "12px", cursor: "pointer" }}>
              {replicating ? "Adding..." : "📋 Replicate Lead to SP Contacts"}
            </button>
          </div>
        )}

        {!isNew && (
          <div style={{ background:"rgba(16,185,129,0.06)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:"10px",padding:"16px",marginBottom:"16px" }}>
            <div style={{ fontSize:"12px",fontWeight:700,color:"#10b981",letterSpacing:"0.05em",marginBottom:"8px" }}>🧪 CONVERT TO TENANT</div>
            {convertDone ? (
              <div style={{ fontSize:"13px",color:"#10b981" }}>✅ Tenant created — contacts migrated — stage updated to Sandbox Shared.</div>
            ) : (
              <>
                <div style={{ fontSize:"12px",color:"#475569",marginBottom:"10px" }}>Creates a trial tenant, migrates all contacts from this lead to the new tenant, and moves stage to Sandbox Shared.</div>
                <button onClick={handleConvertToSandbox} disabled={converting||!form.company}
                  style={{ padding:"8px 16px",borderRadius:"7px",background:converting?"rgba(16,185,129,0.3)":"rgba(16,185,129,0.2)",color:"#10b981",border:"1px solid rgba(16,185,129,0.3)",fontWeight:700,fontSize:"12px",cursor:converting?"wait":"pointer" }}>
                  {converting ? "Converting..." : "Convert to Sandbox →"}
                </button>
                {!form.company && <div style={{ fontSize:"11px",color:"#475569",marginTop:"6px" }}>Add a company name first.</div>}
              </>
            )}
          </div>
        )}

        <div style={{ background:"rgba(99,102,241,0.08)",border:"1px solid rgba(99,102,241,0.2)",borderRadius:"10px",padding:"16px",marginBottom:"16px" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px" }}>
            <span style={{ fontSize:"12px",fontWeight:700,color:"#a5b4fc",letterSpacing:"0.05em" }}>🤖 AI SALES ADVISOR</span>
            <button onClick={handleAI} disabled={aiLoading} style={{ padding:"6px 14px",borderRadius:"6px",fontSize:"12px",fontWeight:700,cursor:aiLoading?"wait":"pointer",background:aiLoading?"rgba(99,102,241,0.3)":"#6366f1",color:"#fff",border:"none" }}>
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
  const { mode } = useTheme() || { mode: 'dark' };
  const isDark = mode !== 'light';
  const T = {
    bg:         isDark ? '#070d1a'                    : '#f1f5f9',
    cardBg:     isDark ? 'rgba(255,255,255,0.04)'     : '#ffffff',
    cardBorder: isDark ? 'rgba(255,255,255,0.08)'     : '#e2e8f0',
    cardHover:  isDark ? 'rgba(255,255,255,0.08)'     : '#f8fafc',
    colBg:      isDark ? 'rgba(255,255,255,0.02)'     : '#f8fafc',
    colBorder:  isDark ? 'rgba(255,255,255,0.04)'     : '#e2e8f0',
    text:       isDark ? '#f1f5f9'                    : '#0f172a',
    textMuted:  isDark ? '#94a3b8'                    : '#64748b',
    textDim:    isDark ? '#475569'                    : '#94a3b8',
    textFaint:  isDark ? '#334155'                    : '#cbd5e1',
    headerBg:   isDark ? 'transparent'               : '#ffffff',
    headerBorder: isDark ? 'rgba(255,255,255,0.05)'  : '#e2e8f0',
    inputBg:    isDark ? 'rgba(255,255,255,0.05)'     : '#ffffff',
    inputBorder:isDark ? 'rgba(255,255,255,0.1)'      : '#cbd5e1',
    inputText:  isDark ? '#f1f5f9'                    : '#0f172a',
    btnBg:      isDark ? 'rgba(255,255,255,0.03)'     : '#ffffff',
    btnBorder:  isDark ? 'rgba(255,255,255,0.08)'     : '#e2e8f0',
    pillBg:     isDark ? 'rgba(255,255,255,0.04)'     : '#f1f5f9',
    modalBg:    isDark ? '#0f172a'                    : '#ffffff',
    panelBg:    isDark ? 'rgba(0,0,0,0.2)'            : '#f8fafc',
    staleColor: '#ef4444',
  };
  const [leads, setLeads]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selected, setSelected]         = useState(null);
  const [filterType, setFilterType]     = useState("All");
  const [search, setSearch]             = useState("");
  const [sortBy, setSortBy]             = useState("created_at");
  const [sortDir, setSortDir]           = useState("desc");
  const [lastSync, setLastSync]         = useState(null);
  const [liveFlash, setLiveFlash]       = useState(false);
  const [activeView, setActiveView]     = useState("pipeline");
  const [sequences, setSequences]       = useState([]);
  const [sequencesLoading, setSequencesLoading] = useState(false);
  const [showCreateSequence, setShowCreateSequence] = useState(false);
  const [newSequence, setNewSequence]   = useState({ name: "", type: "outreach", lead_type: "all", steps: [] });
  const [processingSeq, setProcessingSeq]   = useState(false);
  const [hideDormant, setHideDormant]       = useState(true);
  const [activeActionView, setActiveActionView] = useState(false);

  const fetchLeads = async () => {
    const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (error) console.error("Fetch error:", error);
    const ids = (data || []).map(l => l.id);
    let countMap = {}; let seqCountMap = {};
    if (ids.length > 0) {
      const { data: contactCounts } = await supabase.from("contacts").select("pipeline_lead_id").in("pipeline_lead_id", ids);
      (contactCounts || []).forEach(c => { countMap[c.pipeline_lead_id] = (countMap[c.pipeline_lead_id] || 0) + 1; });
      try {
        const { data: seqCounts } = await supabase.from("lead_sequences").select("lead_id").eq("status", "active").in("lead_id", ids);
        (seqCounts || []).forEach(s => { seqCountMap[s.lead_id] = (seqCountMap[s.lead_id] || 0) + 1; });
      } catch(e) {}
    }
    setLeads((data || []).map(l => ({ ...l, contact_count: countMap[l.id] || 0, sequence_count: seqCountMap[l.id] || 0 })));
    setLastSync(new Date()); setLoading(false);
  };

  const fetchSequences = async () => {
    setSequencesLoading(true);
    try {
      var res = await fetch('/api/sequences?action=list&tenant_id=' + SP_TENANT_ID);
      var data = await res.json();
      setSequences(data.sequences || []);
    } catch(e) {}
    setSequencesLoading(false);
  };

  const enrolLead = async (leadId, sequenceId) => {
    try {
      var res = await fetch('/api/sequences?action=enrol', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, sequence_id: sequenceId, tenant_id: SP_TENANT_ID })
      });
      var data = await res.json();
      if (!data.success) alert('Failed to enrol: ' + data.error);
      else fetchLeads();
    } catch(e) { alert('Failed to enrol: ' + e.message); }
  };

  const cancelEnrolment = async (enrolmentId) => {
    if (!window.confirm('Cancel this sequence for this lead?')) return;
    try {
      await fetch('/api/sequences?action=cancel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrolment_id: enrolmentId })
      });
      fetchLeads();
    } catch(e) {}
  };

  useEffect(() => {
    fetchLeads(); fetchSequences();
    const channel = supabase.channel("leads-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload) => {
        setLiveFlash(true); setTimeout(() => setLiveFlash(false), 2000);
        if (payload.eventType === "INSERT")      setLeads(p => [{ ...payload.new, contact_count: 0, sequence_count: 0 }, ...p]);
        else if (payload.eventType === "UPDATE") setLeads(p => p.map(l => l.id === payload.new.id ? { ...payload.new, contact_count: l.contact_count || 0, sequence_count: l.sequence_count || 0 } : l));
        else if (payload.eventType === "DELETE") setLeads(p => p.filter(l => l.id !== payload.old.id));
        setLastSync(new Date());
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const newLead = { id:`new_${Date.now()}`,name:"",company:"",email:"",phone:"",type:"Unknown",urgency:"Warm",stage:"inquiry",package:"",go_live_date:"",notes:"",source:"Website",last_action_at:new Date().toISOString().split("T")[0],next_action:"",next_action_date:"" };

  const sortedLeads = [...leads].sort((a, b) => {
    let av = a[sortBy] || "", bv = b[sortBy] || "";
    if (sortBy === "urgency") { const ord = {Hot:0,Warm:1,Cold:2}; av = ord[a.urgency]??1; bv = ord[b.urgency]??1; }
    if (sortBy === "stage")   { const ord = STAGES.map(s=>s.id); av = ord.indexOf(a.stage); bv = ord.indexOf(b.stage); }
    if (sortBy === "company") { av = (a.company||a.name||"").toLowerCase(); bv = (b.company||b.name||"").toLowerCase(); }
    if (sortBy === "next_action_date") { av = a.next_action_date || "9999"; bv = b.next_action_date || "9999"; }
    if (typeof av === "string") av = av.toLowerCase();
    if (typeof bv === "string") bv = bv.toLowerCase();
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const filtered = sortedLeads.filter(l => {
    const mt = filterType === "All" || l.type === filterType;
    const ms = !search || l.company?.toLowerCase().includes(search.toLowerCase()) || l.name?.toLowerCase().includes(search.toLowerCase());
    const md = !hideDormant || l.stage !== "dormant";
    return mt && ms && md;
  });

  const pipeline  = leads.filter(l => l.stage !== "customer").length;
  const customers = leads.filter(l => l.stage === "customer").length;
  const hot       = leads.filter(l => l.urgency === "Hot").length;
  const stale     = leads.filter(l => daysSince(l.last_action_at) >= STALE_DAYS).length;
  const overdue   = leads.filter(l => l.next_action_date && new Date(l.next_action_date) < new Date()).length;

  const SortBtn = ({ field, label }) => (
    <button onClick={() => { if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy(field); setSortDir("asc"); }}}
      style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:sortBy===field?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.03)",color:sortBy===field?"#a5b4fc":"#475569" }}>
      {label} {sortBy===field?(sortDir==="asc"?"↑":"↓"):""}
    </button>
  );

  const createSequence = async () => {
    if (!newSequence.name || newSequence.steps.length === 0) return alert("Name and at least one step required");
    try {
      var res = await fetch('/api/sequences?action=create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newSequence, tenant_id: SP_TENANT_ID })
      });
      var data = await res.json();
      if (data.success) { setShowCreateSequence(false); setNewSequence({ name: "", type: "outreach", lead_type: "all", steps: [] }); fetchSequences(); }
      else alert("Error: " + data.error);
    } catch(e) { alert("Error: " + e.message); }
  };

  return (
    <div className={`pipeline-root${isDark ? "" : " light"}`} style={{ minHeight:"100vh",background:isDark ? "#070d1a" : "#f1f5f9",fontFamily:"'DM Sans','Segoe UI',sans-serif",color:"var(--text-primary)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px;height:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:4px}
        input,select,textarea{font-family:inherit} input::placeholder{color:#334155}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}

        /* ── Light mode overrides ── */
        .pipeline-root { --bg-primary:#070d1a; --bg-card:rgba(255,255,255,0.04); --bg-card-hover:rgba(255,255,255,0.08); --bg-column:rgba(255,255,255,0.02); --border-color:rgba(255,255,255,0.08); --border-column:rgba(255,255,255,0.04); --text-primary:#f1f5f9; --text-muted:#94a3b8; --text-dim:#475569; --text-faint:#334155; }
        .light .pipeline-root { --bg-primary:#f1f5f9; --bg-card:#ffffff; --bg-card-hover:#f8fafc; --bg-column:#f8fafc; --border-color:#e2e8f0; --border-column:#e2e8f0; --text-primary:#1e293b; --text-muted:#64748b; --text-dim:#94a3b8; --text-faint:#cbd5e1; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ padding:"24px 28px 0",borderBottom:"1px solid var(--border-color)" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px" }}>
          <div style={{ display:"flex",alignItems:"center",gap:"12px" }}>
            <div style={{ width:"34px",height:"34px",background:"linear-gradient(135deg,#6366f1,#ec4899)",borderRadius:"9px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"17px" }}>⚡</div>
            <span style={{ fontSize:"17px",fontWeight:800,letterSpacing:"-0.02em" }}>EngageWorx</span>
            <span style={{ fontSize:"11px",color:"#475569",fontFamily:"DM Mono",background:"rgba(255,255,255,0.04)",padding:"2px 8px",borderRadius:"4px",border:"1px solid rgba(255,255,255,0.06)" }}>
              {activeView === "pipeline" ? "PIPELINE" : "SEQUENCES"}
            </span>
            <div style={{ display:"flex",alignItems:"center",gap:"5px" }}>
              <div style={{ width:"7px",height:"7px",borderRadius:"50%",background:liveFlash?"#10b981":"#1e293b",animation:liveFlash?"pulse 0.8s infinite":"none",transition:"background 0.3s" }} />
              <span style={{ fontSize:"10px",color:"#334155",fontFamily:"DM Mono" }}>{liveFlash?"● LIVE UPDATE":lastSync?`synced ${lastSync.toLocaleTimeString()}`:"connecting..."}</span>
            </div>
          </div>
          <div style={{ display:"flex",gap:8 }}>
            <button onClick={() => { const next = activeView === "pipeline" ? "sequences" : "pipeline"; setActiveView(next); if (next === "sequences") fetchSequences(); }}
              style={{ padding:"9px 18px",background:"rgba(99,102,241,0.15)",border:"1px solid rgba(99,102,241,0.3)",borderRadius:"8px",color:"#a5b4fc",fontWeight:700,fontSize:"13px",cursor:"pointer" }}>
              {activeView === "pipeline" ? "⚡ Sequences" : "📈 Pipeline"}
            </button>
            {activeView === "pipeline" && <button onClick={()=>setSelected(newLead)} style={{ padding:"9px 18px",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",border:"none",borderRadius:"8px",color:"#fff",fontWeight:700,fontSize:"13px",cursor:"pointer" }}>+ Add Lead</button>}
            {activeView === "sequences" && <button onClick={() => setShowCreateSequence(!showCreateSequence)} style={{ padding:"9px 18px",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",border:"none",borderRadius:"8px",color:"#fff",fontWeight:700,fontSize:"13px",cursor:"pointer" }}>+ New Sequence</button>}
          </div>
        </div>

        {activeView === "pipeline" && (
          <>
            <div style={{ display:"flex",gap:"28px",marginBottom:"18px" }}>
              {[{l:"Pipeline",v:pipeline,c:"#6366f1"},{l:"Customers",v:customers,c:"#10b981"},{l:"Hot Leads",v:hot,c:hot>0?"#ef4444":"#334155"},{l:"Needs Action",v:stale,c:stale>0?"#f59e0b":"#334155"},{l:"Overdue",v:overdue,c:overdue>0?"#ef4444":"#334155"}].map(k=>(
                <div key={k.l}>
                  <div style={{ fontSize:"28px",fontWeight:800,color:k.c,fontFamily:"DM Mono",lineHeight:1 }}>{loading?"—":k.v}</div>
                  <div style={{ fontSize:"10px",color:"var(--text-dim)",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",marginTop:"3px" }}>{k.l}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex",gap:"8px",alignItems:"center",paddingBottom:"16px",flexWrap:"wrap" }}>
              <input placeholder="Search company or contact..." value={search} onChange={e=>setSearch(e.target.value)} style={{ ...inputStyle,width:"200px",marginTop:0,padding:"7px 11px",background:T.inputBg,border:`1px solid ${T.inputBorder}`,color:T.text }} />
              {["All",...TYPE_OPTIONS].map(t=>(
                <button key={t} onClick={()=>setFilterType(t)} style={{ padding:"6px 12px",borderRadius:"6px",fontSize:"12px",fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:filterType===t?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.03)",color:filterType===t?"#a5b4fc":"#475569" }}>{t}</button>
              ))}
              <div style={{ marginLeft:"auto",display:"flex",gap:"6px",alignItems:"center" }}>
                <button onClick={() => setActiveActionView(!activeActionView)} style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:700,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:activeActionView?"rgba(99,102,241,0.3)":"rgba(255,255,255,0.03)",color:activeActionView?"#a5b4fc":"#475569" }}>📋 Actions</button>
                <button onClick={() => setHideDormant(!hideDormant)} style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:hideDormant?"rgba(255,255,255,0.03)":"rgba(51,65,85,0.4)",color:hideDormant?"#475569":"#94a3b8" }}>{hideDormant ? "😴 Show Dormant" : "😴 Hide Dormant"}</button>
                <span style={{ fontSize:"10px",color:"#334155",fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase" }}>Sort:</span>
                <SortBtn field="company" label="A–Z" />
                <SortBtn field="urgency" label="Urgency" />
                <SortBtn field="stage" label="Stage" />
                <SortBtn field="next_action_date" label="Due Date" />
                <SortBtn field="created_at" label="Date" />
              </div>
            </div>
          </>
        )}

        {activeView === "sequences" && (
          <div style={{ paddingBottom: 16 }}>
            <div style={{ fontSize: 13, color: T.textMuted }}>Automated multi-touch outreach · {sequences.length} sequence{sequences.length !== 1 ? "s" : ""} · Runs daily at 9am UTC</div>
          </div>
        )}
      </div>

      {/* ── DAILY ACTIONS PANEL ── */}
      {activeView === "pipeline" && activeActionView && (() => {
        const today = new Date().toISOString().split("T")[0];
        const todayActions = leads.filter(l => l.next_action_date === today || (l.next_action_date && l.next_action_date < today));
        const thisWeek = new Date(); thisWeek.setDate(thisWeek.getDate() + 7);
        const weekActions = leads.filter(l => l.next_action_date && l.next_action_date > today && new Date(l.next_action_date) <= thisWeek);
        const staleLeads = leads.filter(l => daysSince(l.last_action_at) >= STALE_DAYS && l.stage !== "dormant" && l.stage !== "customer");
        return (
          <div style={{ padding: "16px 28px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>⚡ Overdue / Due Today ({todayActions.length})</div>
                {todayActions.length === 0 ? <div style={{ fontSize: 12, color: "#334155" }}>All clear 🎉</div> : todayActions.slice(0, 5).map(l => (
                  <div key={l.id} onClick={() => setSelected(l)} style={{ padding: "8px 10px", background: "rgba(0,0,0,0.2)", borderRadius: 7, marginBottom: 6, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{l.company || l.name}</div>
                      <div style={{ fontSize: 10, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{l.next_action || "No action set"}</div>
                    </div>
                    <div style={{ fontSize: 10, color: l.next_action_date < today ? "#ef4444" : "#f59e0b", fontWeight: 700, flexShrink: 0, marginLeft: 6 }}>{l.next_action_date}</div>
                  </div>
                ))}
                {todayActions.length > 5 && <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>+{todayActions.length - 5} more</div>}
              </div>
              <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>📅 This Week ({weekActions.length})</div>
                {weekActions.length === 0 ? <div style={{ fontSize: 12, color: "#334155" }}>Nothing scheduled</div> : weekActions.slice(0, 5).map(l => (
                  <div key={l.id} onClick={() => setSelected(l)} style={{ padding: "8px 10px", background: "rgba(0,0,0,0.2)", borderRadius: 7, marginBottom: 6, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{l.company || l.name}</div>
                      <div style={{ fontSize: 10, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{l.next_action || "No action set"}</div>
                    </div>
                    <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, flexShrink: 0, marginLeft: 6 }}>{new Date(l.next_action_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
                  </div>
                ))}
                {weekActions.length > 5 && <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>+{weekActions.length - 5} more</div>}
              </div>
              <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>🧊 Gone Quiet ({staleLeads.length})</div>
                {staleLeads.length === 0 ? <div style={{ fontSize: 12, color: "#334155" }}>All leads active</div> : staleLeads.slice(0, 5).map(l => (
                  <div key={l.id} onClick={() => setSelected(l)} style={{ padding: "8px 10px", background: "rgba(0,0,0,0.2)", borderRadius: 7, marginBottom: 6, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{l.company || l.name}</div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>{STAGES.find(s => s.id === l.stage)?.label || l.stage}</div>
                    </div>
                    <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, flexShrink: 0, marginLeft: 6 }}>{daysSince(l.last_action_at)}d quiet</div>
                  </div>
                ))}
                {staleLeads.length > 5 && <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>+{staleLeads.length - 5} more</div>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── PIPELINE VIEW ── */}
      {activeView === "pipeline" && (
        loading ? (
          <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"300px",color:"#334155",fontSize:"14px" }}>Connecting to Supabase...</div>
        ) : (
          <div style={{ display:"flex",overflowX:"auto",padding:"20px 16px",gap:"12px",minHeight:"calc(100vh - 280px)" }}>
            {STAGES.map(stage => {
              const sl = filtered.filter(l => l.stage === stage.id);
              return (
                <div key={stage.id} style={{ minWidth:"220px",maxWidth:"220px",flexShrink:0 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:"7px",marginBottom:"12px",padding:"0 4px" }}>
                    <div style={{ width:"8px",height:"8px",borderRadius:"50%",background:stage.color }} />
                    <span style={{ fontSize:"11px",fontWeight:700,color:"var(--text-muted)",letterSpacing:"0.06em",textTransform:"uppercase" }}>{stage.label}</span>
                    <span style={{ marginLeft:"auto",fontSize:"11px",fontFamily:"DM Mono",color:"var(--text-faint)",background:"var(--bg-column)",padding:"1px 6px",borderRadius:"4px" }}>{sl.length}</span>
                  </div>
                  <div style={{ background:"var(--bg-column)",borderRadius:"10px",padding:"10px",minHeight:"80px",border:"1px solid var(--border-column)" }}>
                    {sl.length===0 ? <div style={{ textAlign:"center",padding:"16px 0",fontSize:"11px",color:"var(--text-faint)" }}>Empty</div>
                      : sl.map(lead=><LeadCard key={lead.id} lead={lead} onSelect={setSelected} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── SEQUENCES VIEW ── */}
      {activeView === "sequences" && (
        <div style={{ padding: "24px 28px" }}>
          {showCreateSequence && (
            <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 12, padding: 24, marginBottom: 24 }}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Create Sequence</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 16 }}>
                <div><label style={labelStyle}>Sequence Name</label><input value={newSequence.name} onChange={e => setNewSequence({...newSequence, name: e.target.value})} placeholder="e.g. CPExpo Follow-up" style={inputStyle} /></div>
                <div><label style={labelStyle}>Type</label>
                  <select value={newSequence.type} onChange={e => setNewSequence({...newSequence, type: e.target.value})} style={{ ...inputStyle, colorScheme: "dark" }}>
                    <option value="outreach">Outreach</option><option value="follow_up">Follow-up</option><option value="post_demo">Post-Demo</option><option value="onboarding">Onboarding</option>
                  </select>
                </div>
                <div><label style={labelStyle}>Lead Type</label>
                  <select value={newSequence.lead_type} onChange={e => setNewSequence({...newSequence, lead_type: e.target.value})} style={{ ...inputStyle, colorScheme: "dark" }}>
                    <option value="all">All</option><option value="csp">CSP / Reseller</option><option value="direct">Direct Business</option><option value="agent">Agent</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <label style={labelStyle}>Steps — use [FirstName], [Company], [Platform]</label>
                  <button onClick={() => setNewSequence({...newSequence, steps: [...newSequence.steps, { delay_days: 0, channel: "email", subject: "", body_template: "", ai_personalise: true }]})}
                    style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 6, padding: "4px 12px", color: "#a5b4fc", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Add Step</button>
                </div>
                {newSequence.steps.length === 0 && <div style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No steps yet — add your first step above</div>}
                {newSequence.steps.map((step, i) => (
                  <div key={i} style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 16, marginBottom: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "80px 140px 1fr 60px", gap: 10, marginBottom: 10, alignItems: "end" }}>
                      <div>
                        <label style={{ ...labelStyle, fontSize: "10px" }}>Day</label>
                        <input type="number" value={step.delay_days} onChange={e => { var s = [...newSequence.steps]; s[i] = {...s[i], delay_days: parseInt(e.target.value)||0}; setNewSequence({...newSequence, steps: s}); }} style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }} />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, fontSize: "10px" }}>Channel</label>
                        <select value={step.channel} onChange={e => { var s = [...newSequence.steps]; s[i] = {...s[i], channel: e.target.value}; setNewSequence({...newSequence, steps: s}); }} style={{ ...inputStyle, padding: "8px 10px", fontSize: 13, colorScheme: "dark" }}>
                          <option value="email">📧 Email</option><option value="sms">💬 SMS</option>
                        </select>
                      </div>
                      {step.channel === "email" ? (
                        <div><label style={{ ...labelStyle, fontSize: "10px" }}>Subject</label><input value={step.subject} onChange={e => { var s = [...newSequence.steps]; s[i] = {...s[i], subject: e.target.value}; setNewSequence({...newSequence, steps: s}); }} placeholder="Email subject line" style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }} /></div>
                      ) : <div />}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: "#94a3b8", fontSize: 11 }}>
                          <input type="checkbox" checked={step.ai_personalise} onChange={e => { var s = [...newSequence.steps]; s[i] = {...s[i], ai_personalise: e.target.checked}; setNewSequence({...newSequence, steps: s}); }} /> AI
                        </label>
                        <button onClick={() => { var s = newSequence.steps.filter((_, j) => j !== i); setNewSequence({...newSequence, steps: s}); }} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "5px 8px", color: "#ef4444", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>✕</button>
                      </div>
                    </div>
                    <textarea value={step.body_template} onChange={e => { var s = [...newSequence.steps]; s[i] = {...s[i], body_template: e.target.value}; setNewSequence({...newSequence, steps: s}); }}
                      rows={4} placeholder="Hi [FirstName], ..." style={{ ...inputStyle, resize: "vertical", marginTop: 0 }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={createSequence} style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", borderRadius: 8, padding: "10px 22px", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Create Sequence</button>
                <button onClick={() => setShowCreateSequence(false)} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 22px", color: "#94a3b8", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button onClick={async () => {
              if (!window.confirm('Process all due sequence steps now? This will send emails and SMS messages.')) return;
              setProcessingSeq(true);
              try {
                var res = await fetch('/api/sequences?action=process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                var data = await res.json();
                alert('✅ Processed ' + (data.processed || 0) + ' step' + ((data.processed || 0) !== 1 ? 's' : '') + (data.errors > 0 ? '. Errors: ' + data.errors : '.'));
              } catch(e) { alert('Error: ' + e.message); }
              setProcessingSeq(false);
            }} disabled={processingSeq} style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 8, padding: "8px 18px", color: "#a5b4fc", fontWeight: 700, cursor: "pointer", fontSize: 12, fontFamily: "inherit", opacity: processingSeq ? 0.6 : 1 }}>
              {processingSeq ? "Processing..." : "▶ Run Due Steps Now"}
            </button>
          </div>

          {sequencesLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>Loading sequences...</div>
          ) : sequences.length === 0 ? (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No sequences yet</div>
              <div style={{ color: "#64748b", fontSize: 13, marginBottom: 20 }}>Create your first sequence above.</div>
              <button onClick={() => setShowCreateSequence(true)} style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 8, padding: "10px 22px", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>+ Create First Sequence</button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {sequences.map(seq => (
                <div key={seq.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{seq.name}</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <span style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{seq.type}</span>
                        <span style={{ background: "rgba(255,255,255,0.06)", color: "#64748b", borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>{seq.lead_type === "all" ? "All lead types" : seq.lead_type}</span>
                        <span style={{ background: "rgba(255,255,255,0.06)", color: "#64748b", borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>{(seq.sequence_steps || []).length} steps</span>
                      </div>
                    </div>
                    <span style={{ background: "#10b98122", color: "#10b981", border: "1px solid #10b98144", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>● Active</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(seq.sequence_steps || []).sort((a, b) => a.step_number - b.step_number).map((step, i) => (
                      <div key={i} style={{ background: step.channel === "email" ? "rgba(255,107,53,0.1)" : "rgba(0,201,255,0.1)", border: `1px solid ${step.channel === "email" ? "rgba(255,107,53,0.3)" : "rgba(0,201,255,0.3)"}`, borderRadius: 6, padding: "5px 12px", fontSize: 11, color: step.channel === "email" ? "#FF6B35" : "#00C9FF" }}>
                        {step.channel === "email" ? "📧" : "💬"} Day {step.delay_days}{step.subject ? ` — ${step.subject.substring(0, 28)}${step.subject.length > 28 ? "..." : ""}` : ""}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selected && (
        <Modal lead={selected} onClose={() => setSelected(null)} onSave={() => { setSelected(null); fetchLeads(); }}
          sequences={sequences} onEnrol={enrolLead} onCancel={cancelEnrolment} />
      )}
    </div>
  );
}
