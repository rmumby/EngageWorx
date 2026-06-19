import { useState, useEffect, useCallback } from "react";
import { supabase } from '../supabaseClient';
import { DEMO_LEADS } from '../demoFixtures';
import { useAccentButtonStyle } from './ui/Button';
import ModuleHeader from './ModuleHeader';

// Fallback stages used before DB stages load (or if fetch fails)
var FALLBACK_STAGES = [
  { id: "inquiry",           label: "Inquiry",          color: "#6366f1", icon: "📥", stage_key: "lead",                  stage_type: "lead" },
  { id: "demo_shared",       label: "Demo Shared",       color: "#8b5cf6", icon: "🎬", stage_key: "active_demo_scheduled", stage_type: "active" },
  { id: "sandbox_shared",    label: "Sandbox Shared",    color: "#a855f7", icon: "🧪", stage_key: "active_demo_scheduled", stage_type: "active" },
  { id: "opportunity",       label: "Opportunity",       color: "#ec4899", icon: "🔥", stage_key: "active_qualified",      stage_type: "active" },
  { id: "package_selection", label: "Package Selected",  color: "#f59e0b", icon: "📦", stage_key: "active_negotiating",    stage_type: "active" },
  { id: "go_live",           label: "Go Live",           color: "#3b82f6", icon: "🚀", stage_key: "closed_won",            stage_type: "closed_won" },
  { id: "customer",          label: "Customer",          color: "#10b981", icon: "✅", stage_key: "closed_won",            stage_type: "closed_won" },
  { id: "dormant",           label: "Dormant",           color: "#334155", icon: "😴", stage_key: "closed_lost",           stage_type: "closed_lost" },
];

// Color palette for dynamic stages (assigned by display_order)
var STAGE_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f59e0b', '#3b82f6', '#10b981', '#334155', '#7c3aed', '#06b6d4'];
var STAGE_ICONS = { lead: '📥', active: '🔥', closed_won: '✅', closed_lost: '😴' };

const TYPE_OPTIONS    = ["Direct Business", "White-Label / Reseller", "Agency", "Unknown"];
const PACKAGE_OPTIONS = ["Starter $99", "Growth $249", "Pro $499", "Enterprise"];
const SOURCE_OPTIONS  = ["Website", "LinkedIn", "Referral", "EngageWorx", "Direct", "Event", "Other"];
const CALENDLY        = "https://calendly.com/rob-engwx/30min";
const SP_TENANT_ID    = (process.env.REACT_APP_SP_TENANT_ID || "c1bc59a8-5235-4921-9755-02514b574387");
const STALE_DAYS      = 5;

const NEXT_ACTIONS = {
  lead:                   ["Send intro deck", "Book discovery call", "Connect on LinkedIn", "Send personalised video"],
  active_demo_shared:     ["Follow up within 48hrs", "Ask for feedback", "Offer sandbox access", "Send case study"],
  active_sandbox_shared:  ["Check sandbox activity", "Schedule walkthrough call", "Address objections", "Send ROI calculator"],
  active_qualified:       ["Send formal proposal", "Confirm decision maker", "Agree timeline", "Reference customer intro"],
  active_demo_scheduled:  ["Prep demo deck", "Confirm attendees", "Send calendar invite", "Share pre-demo materials"],
  active_pricing_sent:    ["Send order form", "Confirm go-live date", "Intro to onboarding", "Process payment"],
  active_negotiating:     ["Onboarding call booked", "Complete setup checklist", "First message sent", "Training complete"],
  closed_won:             ["30-day check-in", "Upsell opportunity review", "Case study request", "Referral ask"],
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

function isLightMode() { return typeof document !== 'undefined' && document.body.classList.contains('light-mode'); }
function T() {
  var light = isLightMode();
  return {
    text: light ? '#111827' : '#f1f5f9',
    muted: light ? '#374151' : '#8899aa',
    mutedLight: light ? '#4b5563' : '#9aaabb',
    bg: light ? '#f9fafb' : '#080d1a',
    surface: light ? '#ffffff' : '#0f172a',
    cardBg: light ? '#ffffff' : 'rgba(255,255,255,0.04)',
    cardBorder: light ? '#e5e7eb' : 'rgba(255,255,255,0.08)',
    inputBg: light ? '#ffffff' : 'rgba(255,255,255,0.05)',
    inputBorder: light ? '#d1d5db' : 'rgba(255,255,255,0.1)',
    inputText: light ? '#111827' : '#f1f5f9',
  };
}
// Resolve a lead's stage key — prefer pipeline_stage_id, fall back to legacy stage
function resolveStageKey(lead, stages) {
  if (lead.pipeline_stage_id) {
    var match = stages.find(function(s) { return s.stage_id === lead.pipeline_stage_id; });
    if (match) return match.id;
  }
  return 'lead';
}

// Resolve a lead's stage_type — used for tab filtering
function resolveStageType(lead, stages) {
  if (lead.pipeline_stage_id) {
    var match = stages.find(function(s) { return s.stage_id === lead.pipeline_stage_id; });
    if (match) return match.stage_type;
  }
  return 'lead';
}

function labelStyle() { var t = T(); return { fontSize: "11px", fontWeight: 700, color: t.muted, letterSpacing: "0.06em", textTransform: "uppercase" }; }
function inputStyleFn() { var t = T(); return { width: "100%", marginTop: "5px", padding: "9px 11px", borderRadius: "7px", background: t.inputBg, border: "1px solid " + t.inputBorder, color: t.inputText, fontSize: "13px", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }; }

function LeadCard({ lead, onSelect, onUrgencyChange, stages }) {
  var t = T();
  const stage = stages.find((s) => s.id === resolveStageKey(lead, stages)) || stages[0];
  const days  = daysSince(lead.last_action_at);
  const stale = days !== null && days >= STALE_DAYS;
  const urgencyColor = { Hot: "#ef4444", Warm: "#f59e0b", Cold: "#9aaabb" }[lead.urgency] || "#9aaabb";
  const nextActionOverdue = lead.next_action_date && new Date(lead.next_action_date) < new Date();
  const displayName = lead.company || lead.name;
  const contactName = (lead.name && lead.name !== lead.email && !lead.name.includes('@')) ? lead.name : null;

  return (
    <div
      onClick={() => onSelect(lead)}
      style={{ background: t.cardBg, border: "1px solid " + (stale ? "#ef4444" : t.cardBorder), borderLeft: "3px solid " + stage.color, borderRadius: "8px", padding: "14px 16px", cursor: "pointer", marginBottom: "8px", position: "relative", transition: "background 0.15s" }}
      onMouseEnter={function(e) { e.currentTarget.style.background = isLightMode() ? '#f3f4f6' : 'rgba(255,255,255,0.08)'; }}
      onMouseLeave={function(e) { e.currentTarget.style.background = t.cardBg; }}
    >
      <div style={{ position: "absolute", top: 6, right: 8, display: "flex", gap: 4, alignItems: "center" }}>
        {stale && <div style={{ fontSize: "10px", color: "#ef4444", fontFamily: "monospace", fontWeight: 700 }}>{days}d</div>}
        <div style={{ display: "flex", gap: 2 }} onClick={function(e) { e.stopPropagation(); }}>
          {["Hot","Warm","Cold"].map(function(u) {
            var uColor = { Hot: "#ef4444", Warm: "#f59e0b", Cold: t.mutedLight }[u];
            var isActive = lead.urgency === u;
            return (
              <span key={u}
                onClick={function(e) { e.stopPropagation(); onUrgencyChange(lead.id, u); }}
                style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, cursor: "pointer", fontWeight: 700, background: isActive ? uColor + "33" : (isLightMode() ? '#f3f4f6' : 'rgba(255,255,255,0.04)'), color: isActive ? uColor : t.muted, border: "1px solid " + (isActive ? uColor + "44" : t.cardBorder) }}
              >{u}</span>
            );
          })}
        </div>
      </div>
      <div style={{ fontWeight: 700, fontSize: "14px", color: t.text, marginBottom: "2px", paddingRight: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
      <div style={{ fontSize: "12px", color: t.muted, marginBottom: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contactName || "—"}</div>
      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "10px", background: "rgba(99,102,241,0.15)", color: "#a5b4fc", padding: "2px 7px", borderRadius: "4px" }}>{lead.type || "Unknown"}</span>
        {lead.urgency && <span style={{ fontSize: "10px", color: urgencyColor, fontWeight: 700 }}>{lead.urgency === "Hot" ? "🔥" : lead.urgency === "Warm" ? "⚡" : "❄️"} {lead.urgency}</span>}
        {lead.billing_status === 'abandoned' && <span style={{ fontSize: "10px", background: "rgba(239,68,68,0.15)", color: "#ef4444", padding: "2px 7px", borderRadius: "4px", fontWeight: 700 }}>💳 No Payment</span>}
        {lead.billing_status === 'trial' && <span style={{ fontSize: "10px", background: "rgba(245,158,11,0.15)", color: "#f59e0b", padding: "2px 7px", borderRadius: "4px", fontWeight: 700 }}>🔄 Trial</span>}
        {lead.billing_status === 'paid' && <span style={{ fontSize: "10px", background: "rgba(16,185,129,0.15)", color: "#10b981", padding: "2px 7px", borderRadius: "4px", fontWeight: 700 }}>✅ Paid</span>}
        {lead.package && <span style={{ fontSize: "10px", background: "rgba(245,158,11,0.15)", color: "#fcd34d", padding: "2px 7px", borderRadius: "4px" }}>{lead.package}</span>}
        {lead.contact_count > 0 && <span style={{ fontSize: "10px", background: "rgba(16,185,129,0.15)", color: "#34d399", padding: "2px 7px", borderRadius: "4px" }}>👤 {lead.contact_count}</span>}
        {lead.event_tag && <span style={{ fontSize: "10px", background: "rgba(224,64,251,0.15)", color: "#E040FB", padding: "2px 7px", borderRadius: "4px", fontWeight: 700 }}>🎟️ {lead.event_tag}</span>}
      </div>
      {(lead.next_action || lead.next_action_date) && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ fontSize: 11, color: nextActionOverdue ? "#ef4444" : "#b0bec5", fontWeight: nextActionOverdue ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
            ⚡ {lead.next_action || ""}
            {lead.next_action_date && <span style={{ marginLeft: 4, color: nextActionOverdue ? "#ef4444" : "#9aaabb", fontWeight: 700 }}>· {new Date(lead.next_action_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
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
    try {
      // Check for existing contact by email or phone to avoid duplicates
      var deupKey = form.email || form.phone;
      var existingId = null;
      if (deupKey) {
        var dupCheck = form.email
          ? await supabase.from("contacts").select("id").eq("email", form.email).eq("tenant_id", SP_TENANT_ID).single()
          : await supabase.from("contacts").select("id").eq("phone", form.phone).eq("tenant_id", SP_TENANT_ID).single();
        if (dupCheck.data) existingId = dupCheck.data.id;
      }
      var contactPayload = {
        first_name: form.first_name, last_name: form.last_name || null,
        email: form.email || null, phone: form.phone || null,
        title: form.title || null, company_name: leadCompany || null,
        pipeline_lead_id: leadId, tenant_id: SP_TENANT_ID,
        status: "active", source: "pipeline",
      };
      if (existingId) {
        // Update existing — no duplicate
        await supabase.from("contacts").update(contactPayload).eq("id", existingId);
      } else {
        await supabase.from("contacts").insert(contactPayload);
      }
      setForm({ first_name: "", last_name: "", email: "", phone: "", title: "" });
      setShowAdd(false);
      fetchContacts();
    } catch(e) { console.error("Add contact error:", e); }
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
            <div><label style={{ ...labelStyle(), fontSize: "10px" }}>First Name *</label><input style={{ ...inputStyleFn(), marginTop: "3px", padding: "6px 9px", fontSize: "12px" }} value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} placeholder="Jane" /></div>
            <div><label style={{ ...labelStyle(), fontSize: "10px" }}>Last Name</label><input style={{ ...inputStyleFn(), marginTop: "3px", padding: "6px 9px", fontSize: "12px" }} value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} placeholder="Smith" /></div>
            <div><label style={{ ...labelStyle(), fontSize: "10px" }}>Email</label><input style={{ ...inputStyleFn(), marginTop: "3px", padding: "6px 9px", fontSize: "12px" }} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="jane@co.com" /></div>
            <div><label style={{ ...labelStyle(), fontSize: "10px" }}>Phone</label><input style={{ ...inputStyleFn(), marginTop: "3px", padding: "6px 9px", fontSize: "12px" }} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 0000" /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={{ ...labelStyle(), fontSize: "10px" }}>Title</label><input style={{ ...inputStyleFn(), marginTop: "3px", padding: "6px 9px", fontSize: "12px" }} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="CEO, VP Sales..." /></div>
          </div>
          <button onClick={handleAdd} disabled={saving || !form.first_name} style={{ padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", background: "#10b981", color: "#fff", border: "none" }}>{saving ? "Saving..." : "Save"}</button>
        </div>
      )}
      {loading ? <div style={{ fontSize: "12px", color: "#8899aa" }}>Loading...</div>
        : contacts.length === 0 ? <div style={{ fontSize: "12px", color: "#334155" }}>No contacts yet.</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {contacts.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", background: "rgba(255,255,255,0.03)", borderRadius: "7px", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg, #10b981, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, color: "#fff", flexShrink: 0 }}>{(c.first_name || "?")[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#f1f5f9" }}>{c.first_name} {c.last_name || ""}</div>
                  <div style={{ fontSize: "11px", color: "#8899aa" }}>{[c.title, c.email].filter(Boolean).join(" · ")}</div>
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

function Modal({ lead, onClose, onSave, tenantId, stages }) {
  var t = T();
  const split = splitName(lead.name);
  const [firstName, setFirstName] = useState(split.first);
  const [lastName, setLastName]   = useState(split.last);
  const [form, setForm]           = useState({ ...lead });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText]       = useState(lead.ai_next_action || "");
  const [aiActions, setAiActions] = useState([]);
  const [aiRisk, setAiRisk]       = useState("");
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState("");
  const [converting, setConverting]   = useState(false);
  const [convertDone, setConvertDone] = useState(false);
  const [replicating, setReplicating] = useState(false);
  const [sequences, setSequences] = useState([]);
  const [enrolStatus, setEnrolStatus] = useState("");
  useEffect(function() {
    var seqTenant = lead.tenant_id || tenantId;
    if (seqTenant) {
      fetch('/api/sequences?action=list&tenant_id=' + seqTenant).then(function(r){ return r.json(); }).then(function(d){ setSequences(d.sequences||[]); }).catch(function(){});
    }
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
  const stage = stages.find((s) => s.id === form.stage) || stages[0];
  const isNew = !lead.id || String(lead.id).startsWith("new_");

  const handleAI = async () => {
    // Grounded advisor reads the lead's SAVED context server-side, so it needs a persisted lead.
    if (isNew || !lead.id) { setAiActions([]); setAiRisk(""); setAiText("Save the lead first — the advisor reads its saved CRM context."); return; }
    setAiLoading(true); setAiText(""); setAiActions([]); setAiRisk("");
    try {
      const _s = await supabase.auth.getSession();
      const _tok = _s && _s.data && _s.data.session ? _s.data.session.access_token : "";
      const res = await fetch("/api/sales-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + _tok },
        body: JSON.stringify({ lead_id: lead.id }),
      });
      if (!res.ok) throw new Error("advisor " + res.status);
      const data = await res.json();
      const acts = Array.isArray(data.actions) ? data.actions : [];
      const rk = data.risk || "";
      setAiActions(acts); setAiRisk(rk);
      // Flattened summary persists into lead.ai_next_action on save (handleSave reads aiText).
      setAiText([acts.map((a, i) => (i + 1) + ". " + a).join("\n"), rk ? "Risk: " + rk : ""].filter(Boolean).join("\n\n") || "No suggestion.");
    } catch (e) { setAiText("Error reaching AI. Try again."); }
    setAiLoading(false);
  };

  const handleSave = async () => {
    setSaveError(""); setSaving(true);
    const payload = { ...form, name: fullName(firstName, lastName) || form.company, ai_next_action: aiText || form.ai_next_action, go_live_date: form.go_live_date || null, last_action_at: form.last_action_at || null, next_action: form.next_action || null, next_action_date: form.next_action_date || null, last_activity_at: new Date().toISOString() };
    delete payload.id;
    delete payload.contact_count;
    // Map form.stage (stage_key string) to pipeline_stage_id (UUID); remove dropped 'stage' column
    if (payload.stage) {
      var matchedStage = stages.find(function(s) { return s.id === payload.stage; });
      payload.pipeline_stage_id = matchedStage ? matchedStage.stage_id : null;
      // Advancing to a non-lead stage implicitly qualifies the lead (keeps cron-stale-leads in sync)
      if (matchedStage && matchedStage.stage_type !== 'lead') {
        payload.qualified = true;
      }
      delete payload.stage;
    }
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
    try {
      if (!isNew) { const { error } = await supabase.from("leads").update(payload).eq("id", lead.id); if (error) throw error; }
      else {
        if (!tenantId) { setSaveError("No tenant context — cannot create lead."); setSaving(false); return; }
        const { error } = await supabase.from("leads").insert({ ...payload, tenant_id: tenantId });
        if (error) throw error;
      }
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
        // This is the "Convert to Sandbox" action — set the sandbox flag explicitly (it was
        // omitted, so converts were landing is_sandbox=false), respect the XOR, and write the
        // tier explicitly instead of leaning on the 'direct' default.
        is_sandbox: true, is_demo: false, customer_type: "direct", tenant_type: "direct"
      }).select().single();
      if (tErr) throw tErr;

      // Migrate all pipeline contacts to the new tenant — no duplicates
      var { data: pipelineContacts } = await supabase.from("contacts").select("*").eq("pipeline_lead_id", lead.id);
      for (var pc of (pipelineContacts || [])) {
        // Check if contact already exists in tenant by email or phone
        var existing = null;
        if (pc.email) {
          var ec = await supabase.from("contacts").select("id").eq("email", pc.email).eq("tenant_id", tenant.id).single();
          if (ec.data) existing = ec.data.id;
        }
        if (!existing && pc.phone) {
          var pc2 = await supabase.from("contacts").select("id").eq("phone", pc.phone).eq("tenant_id", tenant.id).single();
          if (pc2.data) existing = pc2.data.id;
        }
        if (existing) {
          await supabase.from("contacts").update({ tenant_id: tenant.id, pipeline_lead_id: lead.id }).eq("id", existing);
        } else {
          await supabase.from("contacts").update({ tenant_id: tenant.id }).eq("id", pc.id);
        }
      }

      var sandboxStage = stages.find(function(s) { return s.id === 'active_sandbox_shared'; });
      await supabase.from("leads").update({
        pipeline_stage_id: sandboxStage ? sandboxStage.stage_id : null,
        qualified: true,
        last_action_at: new Date().toISOString().split("T")[0],
        last_activity_at: new Date().toISOString(),
        notes: (form.notes ? form.notes + "\n" : "") + "Sandbox created, tenant ID: " + tenant.id
      }).eq("id", lead.id);

      setConvertDone(true);
      setForm({ ...form, stage: sandboxStage ? sandboxStage.id : "active_sandbox_shared" });
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
    if (!window.confirm("Delete this lead and all its sequence enrollments?")) return;
    try {
      // Clean up FK dependencies before deleting the lead
      await supabase.from('lead_sequences').delete().eq('lead_id', lead.id);
      await supabase.from('lead_sequence_events').delete().eq('lead_id', lead.id);
      await supabase.from('sent_emails').delete().eq('lead_id', lead.id);
      await supabase.from('contacts').update({ pipeline_lead_id: null }).eq('pipeline_lead_id', lead.id);
      var { error } = await supabase.from("leads").delete().eq("id", lead.id);
      if (error) throw error;
      onSave();
    } catch (err) {
      alert('Delete failed: ' + (err.message || 'Unknown error'));
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: t.surface, border: "1px solid " + t.cardBorder, borderRadius: "16px", width: "100%", maxWidth: "660px", maxHeight: "92vh", overflowY: "auto", padding: "28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: t.text }}>{form.company || fullName(firstName, lastName) || "New Lead"}</div>
            <div style={{ fontSize: "13px", color: t.muted }}>{fullName(firstName, lastName) || "No contact name"}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: t.muted, fontSize: "22px", cursor: "pointer" }}>X</button>
        </div>

        <div style={{ marginBottom: "18px" }}>
          <label style={labelStyle()}>Stage</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
            {stages.map((s) => (
              <button key={s.id} onClick={() => setForm({ ...form, stage: s.id, last_action_at: new Date().toISOString().split("T")[0] })}
                style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", background: form.stage === s.id ? s.color : "rgba(255,255,255,0.05)", color: form.stage === s.id ? "#fff" : "#b0bec5", border: "1px solid " + (form.stage === s.id ? s.color : "rgba(255,255,255,0.08)"), transition: "all 0.15s" }}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle()}>Company *</label><input style={inputStyleFn()} value={form.company||""} onChange={e=>setForm({...form,company:e.target.value})} placeholder="Acme Corp" /></div>
          <div><label style={labelStyle()}>First Name</label><input style={inputStyleFn()} value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="Jane" /></div>
          <div><label style={labelStyle()}>Last Name</label><input style={inputStyleFn()} value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Smith" /></div>
          <div><label style={labelStyle()}>Email</label><input style={inputStyleFn()} type="email" value={form.email||""} onChange={e=>setForm({...form,email:e.target.value})} /></div>
          <div>
  <label style={labelStyle()}>Phone</label>
  <div style={{ display: 'flex', gap: 4 }}>
    <select
      style={{ ...inputStyleFn(), width: 'auto', paddingRight: 8 }}
      value={(form.phone||'').startsWith('+') ? (form.phone||'').split(' ')[0] : '+1'}
      onChange={e => {
        const num = (form.phone||'').replace(/^\+\d+\s?/, '');
        setForm({...form, phone: e.target.value + ' ' + num});
      }}
    >
      <option value="+1">🇺🇸 +1</option>
      <option value="+44">🇬🇧 +44</option>
      <option value="+61">🇦🇺 +61</option>
      <option value="+64">🇳🇿 +64</option>
      <option value="+353">🇮🇪 +353</option>
      <option value="+49">🇩🇪 +49</option>
      <option value="+33">🇫🇷 +33</option>
      <option value="+34">🇪🇸 +34</option>
      <option value="+39">🇮🇹 +39</option>
      <option value="+31">🇳🇱 +31</option>
      <option value="+32">🇧🇪 +32</option>
      <option value="+41">🇨🇭 +41</option>
      <option value="+43">🇦🇹 +43</option>
      <option value="+46">🇸🇪 +46</option>
      <option value="+47">🇳🇴 +47</option>
      <option value="+45">🇩🇰 +45</option>
      <option value="+358">🇫🇮 +358</option>
      <option value="+351">🇵🇹 +351</option>
      <option value="+30">🇬🇷 +30</option>
      <option value="+48">🇵🇱 +48</option>
      <option value="+420">🇨🇿 +420</option>
      <option value="+36">🇭🇺 +36</option>
      <option value="+40">🇷🇴 +40</option>
      <option value="+380">🇺🇦 +380</option>
      <option value="+7">🇷🇺 +7</option>
      <option value="+90">🇹🇷 +90</option>
      <option value="+972">🇮🇱 +972</option>
      <option value="+971">🇦🇪 +971</option>
      <option value="+966">🇸🇦 +966</option>
      <option value="+974">🇶🇦 +974</option>
      <option value="+965">🇰🇼 +965</option>
      <option value="+973">🇧🇭 +973</option>
      <option value="+968">🇴🇲 +968</option>
      <option value="+91">🇮🇳 +91</option>
      <option value="+92">🇵🇰 +92</option>
      <option value="+880">🇧🇩 +880</option>
      <option value="+94">🇱🇰 +94</option>
      <option value="+65">🇸🇬 +65</option>
      <option value="+60">🇲🇾 +60</option>
      <option value="+63">🇵🇭 +63</option>
      <option value="+66">🇹🇭 +66</option>
      <option value="+62">🇮🇩 +62</option>
      <option value="+84">🇻🇳 +84</option>
      <option value="+82">🇰🇷 +82</option>
      <option value="+81">🇯🇵 +81</option>
      <option value="+86">🇨🇳 +86</option>
      <option value="+852">🇭🇰 +852</option>
      <option value="+886">🇹🇼 +886</option>
      <option value="+55">🇧🇷 +55</option>
      <option value="+52">🇲🇽 +52</option>
      <option value="+54">🇦🇷 +54</option>
      <option value="+56">🇨🇱 +56</option>
      <option value="+57">🇨🇴 +57</option>
      <option value="+51">🇵🇪 +51</option>
      <option value="+58">🇻🇪 +58</option>
      <option value="+593">🇪🇨 +593</option>
      <option value="+598">🇺🇾 +598</option>
      <option value="+595">🇵🇾 +595</option>
      <option value="+591">🇧🇴 +591</option>
      <option value="+27">🇿🇦 +27</option>
      <option value="+234">🇳🇬 +234</option>
      <option value="+254">🇰🇪 +254</option>
      <option value="+233">🇬🇭 +233</option>
      <option value="+255">🇹🇿 +255</option>
      <option value="+256">🇺🇬 +256</option>
      <option value="+251">🇪🇹 +251</option>
      <option value="+212">🇲🇦 +212</option>
      <option value="+216">🇹🇳 +216</option>
      <option value="+213">🇩🇿 +213</option>
      <option value="+20">🇪🇬 +20</option>
    </select>
    <input
      style={{ ...inputStyleFn(), flex: 1 }}
      value={(form.phone||'').replace(/^\+\d+\s?/, '')}
      onChange={e => {
        const cc = (form.phone||'').startsWith('+') ? (form.phone||'').split(' ')[0] : '+1';
        setForm({...form, phone: cc + ' ' + e.target.value});
      }}
      placeholder="(555) 000-0000"
    />
  </div>
</div>
          <div><label style={labelStyle()}>Lead Type</label><select style={inputStyleFn()} value={form.type||"Unknown"} onChange={e=>setForm({...form,type:e.target.value})}>{TYPE_OPTIONS.map(t=><option key={t}>{t}</option>)}</select></div>
          <div>
            <label style={labelStyle()}>Urgency</label>
            <select style={inputStyleFn()} value={form.urgency||"Warm"} onChange={e=>setForm({...form,urgency:e.target.value})}>
              <option>Hot</option><option>Warm</option><option>Cold</option>
            </select>
          </div>
          <div><label style={labelStyle()}>Package</label><select style={inputStyleFn()} value={form.package||""} onChange={e=>setForm({...form,package:e.target.value})}><option value="">Not selected</option>{PACKAGE_OPTIONS.map(p=><option key={p}>{p}</option>)}</select></div>
          <div><label style={labelStyle()}>Source</label><select style={inputStyleFn()} value={form.source||"Website"} onChange={e=>setForm({...form,source:e.target.value})}>{SOURCE_OPTIONS.map(s=><option key={s}>{s}</option>)}</select></div>
          <div><label style={labelStyle()}>Go-Live Date</label><input type="date" style={inputStyleFn()} value={form.go_live_date||""} onChange={e=>setForm({...form,go_live_date:e.target.value})} /></div>
          <div><label style={labelStyle()}>Last Action</label><input type="date" style={inputStyleFn()} value={form.last_action_at||""} onChange={e=>setForm({...form,last_action_at:e.target.value})} /></div>
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label style={labelStyle()}>Notes</label>
          <textarea style={{ ...inputStyleFn(), minHeight: "70px", resize: "vertical" }} value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} />
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: form.auto_sequence_opt_out ? "#f59e0b" : t.muted }}>
            <input type="checkbox" checked={!!form.auto_sequence_opt_out} onChange={function(e) { setForm(Object.assign({}, form, { auto_sequence_opt_out: e.target.checked })); }} style={{ accentColor: "#f59e0b" }} />
            Exclude from auto-enrollment sequences
          </label>
        </div>

        <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: "10px", padding: "14px", marginBottom: "14px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#a5b4fc", marginBottom: "10px" }}>NEXT ACTION</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", alignItems: "end" }}>
            <div><label style={labelStyle()}>Action</label><input style={inputStyleFn()} value={form.next_action||""} onChange={e=>setForm({...form,next_action:e.target.value})} placeholder="e.g. Send proposal, Follow up call..." /></div>
            <div><label style={labelStyle()}>Due Date</label><input type="date" style={{ ...inputStyleFn(), width: "160px" }} value={form.next_action_date||""} onChange={e=>setForm({...form,next_action_date:e.target.value})} /></div>
          </div>
          {form.next_action_date && new Date(form.next_action_date) < new Date() && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#ef4444", fontWeight: 700 }}>Overdue: {daysSince(form.next_action_date)} days past due</div>
          )}
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle()}>Quick Actions</label>
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
                ? <div style={{ fontSize:"12px",color:"#8899aa" }}>No sequences available.</div>
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
                <div style={{ fontSize:"12px",color:"#8899aa",marginBottom:"10px" }}>Creates a trial tenant, migrates contacts, moves stage to Sandbox Shared.</div>
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
          {(aiActions.length > 0 || aiRisk) ? (
            <div>
              {aiActions.length > 0 && (
                <ol style={{ margin:"0 0 8px",paddingLeft:"18px",fontSize:"13px",color:"#cbd5e1",lineHeight:1.7 }}>
                  {aiActions.map((a, i) => <li key={i}>{a}</li>)}
                </ol>
              )}
              {aiRisk && <div style={{ fontSize:"12px",color:"#fca5a5",lineHeight:1.6 }}><strong style={{ color:"#f87171" }}>Risk / opportunity:</strong> {aiRisk}</div>}
            </div>
          ) : aiText ? <div style={{ fontSize:"13px",color:"#cbd5e1",lineHeight:1.7,whiteSpace:"pre-wrap" }}>{aiText}</div>
            : <div style={{ fontSize:"12px",color:"#8899aa" }}>Click to get AI-powered next actions for this lead.</div>}
        </div>

        {saveError && <div style={{ background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:"8px",padding:"10px 14px",marginBottom:"12px",color:"#ef4444",fontSize:"13px" }}>{saveError}</div>}

        <div style={{ display:"flex",gap:"10px",flexWrap:"wrap" }}>
          <button onClick={handleSave} disabled={saving} style={{ flex:1,padding:"12px",borderRadius:"8px",background:saving?"rgba(99,102,241,0.5)":"#6366f1",color:"#fff",fontWeight:700,fontSize:"14px",border:"none",cursor:"pointer" }}>
            {saving?"Saving...":"Save Lead"}
          </button>
          {!isNew && (function() {
            var currentStage = stages.find(function(s) { return s.id === form.stage; });
            var isWon = currentStage && currentStage.stage_type === 'closed_won';
            var alreadyConverted = lead.converted_tenant_id;
            if (isWon && !alreadyConverted) {
              return <button onClick={function() {
                if (typeof window !== 'undefined' && window.__openInviteTenantFromLead) {
                  window.__openInviteTenantFromLead({
                    pipeline_lead_id: lead.id,
                    tenant_name: form.company || '',
                    admin_full_name: (firstName + ' ' + lastName).trim(),
                    admin_email: form.email || '',
                    phone_number: form.phone || '',
                    website: form.website || '',
                    notes: form.notes || '',
                  });
                  onClose();
                } else {
                  alert('Navigate to Tenant Management to invite this lead as a tenant.');
                }
              }} style={{ padding:"12px 16px",borderRadius:"8px",background:"rgba(16,185,129,0.15)",color:"#10b981",fontWeight:700,fontSize:"13px",border:"1px solid rgba(16,185,129,0.3)",cursor:"pointer" }}>Convert to Tenant</button>;
            }
            if (alreadyConverted) {
              return <span style={{ padding:"12px 16px",borderRadius:"8px",background:"rgba(16,185,129,0.08)",color:"#6b7280",fontSize:"12px",fontWeight:600 }}>Converted</span>;
            }
            return null;
          })()}
          {!isNew && <button onClick={handleDelete} style={{ padding:"12px 16px",borderRadius:"8px",background:"rgba(239,68,68,0.1)",color:"#ef4444",fontWeight:600,fontSize:"13px",border:"1px solid rgba(239,68,68,0.2)",cursor:"pointer" }}>Delete</button>}
          <button onClick={onClose} style={{ padding:"12px 16px",borderRadius:"8px",background:"rgba(255,255,255,0.05)",color:"#b0bec5",fontWeight:600,fontSize:"14px",border:"1px solid rgba(255,255,255,0.08)",cursor:"pointer" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function PipelineDashboard({ C, tenantId, demoMode, isSuperAdmin }) {
  const btnAccent = useAccentButtonStyle(); // brand fill + WCAG contrast (replaces the hardcoded indigo/purple gradient CTA)
  var bg = C ? C.bg : '#070d1a';
  var surface = C ? C.surface : 'rgba(255,255,255,0.04)';
  var text = C ? C.text : '#f1f5f9';
  var muted = C ? C.muted : '#94a3b8';
  var border = C ? C.border : 'rgba(255,255,255,0.08)';
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
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState('pipeline'); // 'pipeline' (unified lead→active) | 'archived'
  const [showClosed, setShowClosed] = useState(false);  // toggle: append closed_won/closed_lost columns
  const [groupBy, setGroupBy] = useState('stage'); // 'stage' | 'company'
  const [validateOpen, setValidateOpen] = useState(false);
  const [validateBusy, setValidateBusy] = useState(null);
  const [qualSeqStep, setQualSeqStep] = useState({}); // lead_id → current_step
  const [STAGES, setSTAGES] = useState(FALLBACK_STAGES);

  // Load pipeline_stages from DB for this tenant
  useEffect(function() {
    if (demoMode || !tenantId) return;
    supabase.from('pipeline_stages').select('id, stage_key, display_name, stage_type, display_order, auto_advance')
      .eq('tenant_id', tenantId).order('display_order', { ascending: true })
      .then(function(result) {
        if (result.data && result.data.length > 0) {
          var mapped = result.data.map(function(s, i) {
            return { id: s.stage_key, label: s.display_name, color: STAGE_COLORS[i % STAGE_COLORS.length], icon: STAGE_ICONS[s.stage_type] || '•', stage_id: s.id, stage_type: s.stage_type, auto_advance: s.auto_advance };
          });
          setSTAGES(mapped);
        }
      });
  }, [tenantId, demoMode]);

  const fetchLeads = async () => {
    if (demoMode) { setLeads(DEMO_LEADS); setLastSync(new Date()); setLoading(false); return; }
    if (!tenantId) { setLeads([]); setLoading(false); return; }
    const { data, error } = await supabase.from("leads").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
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
    if (demoMode || !tenantId) return;
    const channel = supabase.channel("leads-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload) => {
        var row = payload.new || payload.old;
        if (row && row.tenant_id !== tenantId) return;
        setLiveFlash(true);
        setTimeout(() => setLiveFlash(false), 2000);
        if (payload.eventType === "INSERT")      setLeads(p => [{ ...payload.new, contact_count: 0 }, ...p]);
        else if (payload.eventType === "UPDATE") setLeads(p => p.map(l => l.id === payload.new.id ? { ...payload.new, contact_count: l.contact_count || 0 } : l));
        else if (payload.eventType === "DELETE") setLeads(p => p.filter(l => l.id !== payload.old.id));
        setLastSync(new Date());
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [tenantId, demoMode]);

  const newLead = { id: "new_" + Date.now(), name: "", company: "", email: "", phone: "", type: "Unknown", urgency: "Warm", package: "", go_live_date: "", notes: "", source: "Website", last_action_at: new Date().toISOString().split("T")[0], next_action: "", next_action_date: "" };

  const sortedLeads = [...leads].sort((a, b) => {
    var av = a[sortBy] || "", bv = b[sortBy] || "";
    if (sortBy === "urgency") { var ord = {Hot:0,Warm:1,Cold:2}; av = ord[a.urgency]||1; bv = ord[b.urgency]||1; }
    if (sortBy === "stage")   { var ords = STAGES.map(s=>s.id); av = ords.indexOf(resolveStageKey(a, STAGES)); bv = ords.indexOf(resolveStageKey(b, STAGES)); }
    if (sortBy === "company") { av = (a.company||a.name||"").toLowerCase(); bv = (b.company||b.name||"").toLowerCase(); }
    if (sortBy === "next_action_date") { av = a.next_action_date || "9999"; bv = b.next_action_date || "9999"; }
    if (typeof av === "string") av = av.toLowerCase();
    if (typeof bv === "string") bv = bv.toLowerCase();
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const filtered = sortedLeads.filter(l => {
    // Unified pipeline (lead→active funnel) + a separate archived view. Closed stages
    // (closed_won/closed_lost) appear only when the Show-closed toggle is on.
    var st = resolveStageType(l, STAGES);
    if (viewMode === 'archived') { if (!l.archived) return false; }
    else { // 'pipeline'
      if (l.archived) return false;
      var isClosed = (st === 'closed_won' || st === 'closed_lost');
      if (isClosed && !showClosed) return false;
    }
    // hideDormant hides closed_lost — but an explicit Show-closed overrides it.
    if (hideDormant && !showClosed && resolveStageKey(l, STAGES) === 'closed_lost') return false;
    if (filterType !== "All" && l.type !== filterType) return false;
    if (search) {
      var q = search.toLowerCase();
      return (l.company||"").toLowerCase().includes(q) || (l.name||"").toLowerCase().includes(q);
    }
    return true;
  });

  var pipeline  = leads.filter(function(l) { var sk = resolveStageKey(l, STAGES); return sk !== 'closed_won' && sk !== 'closed_lost'; }).length;
  var customers = leads.filter(function(l) { return resolveStageKey(l, STAGES) === 'closed_won'; }).length;
  var hot       = leads.filter(l => l.urgency === "Hot").length;
  var stale     = leads.filter(function(l) { return daysSince(l.last_action_at) >= STALE_DAYS && resolveStageKey(l, STAGES) !== 'closed_lost'; }).length;
  var overdue   = leads.filter(l => l.next_action_date && new Date(l.next_action_date) < new Date()).length;

  // Unified board columns: lead + active stages always; closed appended only when toggled.
  // STAGES is already tenant-scoped and display_order-ordered, so the lead stage is first.
  var boardStages = (viewMode === 'archived') ? STAGES : STAGES.filter(function(s) {
    if (s.stage_type === 'lead' || s.stage_type === 'active') return true;
    return (s.stage_type === 'closed_won' || s.stage_type === 'closed_lost') && showClosed;
  });
  var closedWonCount  = leads.filter(function(l) { return !l.archived && resolveStageType(l, STAGES) === 'closed_won'; }).length;
  var closedLostCount = leads.filter(function(l) { return !l.archived && resolveStageType(l, STAGES) === 'closed_lost'; }).length;
  var wonStage  = STAGES.find(function(s) { return s.stage_type === 'closed_won'; });
  var lostStage = STAGES.find(function(s) { return s.stage_type === 'closed_lost'; });
  // Tenant-specific closed-stage labels (no hardcoded names), with live counts on the toggle.
  var closedToggleLabel = (showClosed ? '▾ Hide closed' : '▸ Show closed')
    + ' (' + ((wonStage && wonStage.label) || 'Won') + ' ' + closedWonCount
    + ' · ' + ((lostStage && lostStage.label) || 'Lost') + ' ' + closedLostCount + ')';

  var today = new Date().toISOString().split("T")[0];
  var todayActions = leads.filter(l => l.next_action_date && l.next_action_date <= today);
  var thisWeekEnd = new Date(); thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);
  var weekActions = leads.filter(l => l.next_action_date && l.next_action_date > today && new Date(l.next_action_date) <= thisWeekEnd);
  var staleLeads  = leads.filter(function(l) { var sk = resolveStageKey(l, STAGES); return daysSince(l.last_action_at) >= STALE_DAYS && sk !== 'closed_lost' && sk !== 'closed_won'; });

  return (
    <div style={{ minHeight:"100vh",background:bg,fontFamily:"inherit",color:text }}>
      <div style={{ padding:"24px 28px 0",borderBottom:"1px solid " + border }}>
        <ModuleHeader title="Pipeline" subtitle="Track leads through every stage, from first touch to close." right={(
          <div style={{ display:"flex",alignItems:"center",gap:"12px" }}>
            <div style={{ display:"flex",alignItems:"center",gap:"5px" }}>
              <div style={{ width:"7px",height:"7px",borderRadius:"50%",background:liveFlash?"#10b981":"#1e293b",transition:"background 0.3s" }} />
              <span style={{ fontSize:"10px",color:"#334155",fontFamily:"ui-monospace, 'SF Mono', Menlo, monospace" }}>{liveFlash?"LIVE":lastSync?"synced "+lastSync.toLocaleTimeString():"connecting..."}</span>
            </div>
            <button onClick={()=>setSelected(newLead)} style={{ ...btnAccent, padding:"9px 18px", borderRadius:"8px", fontSize:"13px" }}>+ Add Lead</button>
          </div>
        )} />

        <div style={{ display:"flex",gap:"28px",marginBottom:"18px" }}>
          {[{l:"Pipeline",v:pipeline,c:"#6366f1"},{l:"Customers",v:customers,c:"#10b981"},{l:"Hot Leads",v:hot,c:hot>0?"#ef4444":"#334155"},{l:"Needs Action",v:stale,c:stale>0?"#f59e0b":"#334155"},{l:"Overdue",v:overdue,c:overdue>0?"#ef4444":"#334155"}].map(k=>(
            <div key={k.l}>
              <div style={{ fontSize:"28px",fontWeight:800,color:k.c,fontFamily:"ui-monospace, 'SF Mono', Menlo, monospace",lineHeight:1 }}>{loading?"—":k.v}</div>
              <div style={{ fontSize:"10px",color:"#8899aa",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",marginTop:"3px" }}>{k.l}</div>
            </div>
          ))}
        </div>

        <div style={{ display:"flex",gap:"8px",alignItems:"center",paddingBottom:"16px",flexWrap:"wrap" }}>
          <input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{ ...inputStyleFn(),width:"180px",marginTop:0,padding:"7px 11px" }} />
          {["All",...TYPE_OPTIONS].map(t=>(
            <button key={t} onClick={()=>setFilterType(t)} style={{ padding:"6px 12px",borderRadius:"6px",fontSize:"11px",fontWeight:600,cursor:"pointer",background:"rgba(168,85,247,0.15)",color:"#c084fc",border:"1px solid rgba(168,85,247,0.3)" }}>{t}</button>
          ))}
          <div style={{ marginLeft:"auto",display:"flex",gap:"6px",flexWrap:"wrap" }}>
            <button onClick={()=>setShowActions(!showActions)} style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:700,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:showActions?"rgba(99,102,241,0.3)":"rgba(255,255,255,0.03)",color:showActions?"#a5b4fc":"#8899aa" }}>Actions</button>
            <button onClick={()=>setHideDormant(!hideDormant)} style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.03)",color:"#8899aa" }}>{hideDormant?"Show Dormant":"Hide Dormant"}</button>
            <div style={{ display: "inline-flex", gap: 0, borderRadius: 6, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
              {[
                { id: "pipeline", label: "📊 Pipeline", count: leads.filter(function(l) { var st = resolveStageType(l, STAGES); return !l.archived && (st === 'lead' || st === 'active'); }).length },
                { id: "archived", label: "📦 Archived", count: leads.filter(l => l.archived).length },
              ].map((tab, i) => (
                <button key={tab.id} onClick={() => { setViewMode(tab.id); setShowArchived(tab.id === 'archived'); }} style={{
                  padding: "5px 12px", fontSize: "11px", fontWeight: 700, cursor: "pointer",
                  border: "none", borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
                  background: viewMode === tab.id ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.03)",
                  color: viewMode === tab.id ? "#a5b4fc" : "#8899aa",
                }}>{tab.label} ({tab.count})</button>
              ))}
            </div>
            {viewMode === 'pipeline' && (
              <button onClick={() => setShowClosed(!showClosed)} style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:700,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background: showClosed ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.03)", color: showClosed ? "#a5b4fc" : "#8899aa" }}>{closedToggleLabel}</button>
            )}
            <div style={{ display: "inline-flex", gap: 0, borderRadius: 6, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", marginLeft: 4 }}>
              {[{ id: 'stage', label: '📋 Stage' }, { id: 'company', label: '🏢 Company' }].map(function(g, i) {
                return <button key={g.id} onClick={function() { setGroupBy(g.id); }} style={{
                  padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  border: 'none', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  background: groupBy === g.id ? 'rgba(224,64,251,0.18)' : 'rgba(255,255,255,0.03)',
                  color: groupBy === g.id ? '#E040FB' : '#475569',
                }}>{g.label}</button>;
              })}
            </div>
            {isSuperAdmin && <button onClick={() => setValidateOpen(true)} style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:700,cursor:"pointer",border:"1px solid rgba(99,102,241,0.4)",background:"rgba(99,102,241,0.15)",color:"#a5b4fc",marginLeft:4 }}>🔍 Validate Existing</button>}
            <button onClick={()=>{ if(sortBy==="company") setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortBy("company");setSortDir("asc");} }} style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:sortBy==="company"?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.03)",color:sortBy==="company"?"#a5b4fc":"#8899aa" }}>A-Z {sortBy==="company"?(sortDir==="asc"?"^":"v"):""}</button>
            <button onClick={()=>{ if(sortBy==="urgency") setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortBy("urgency");setSortDir("asc");} }} style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:sortBy==="urgency"?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.03)",color:sortBy==="urgency"?"#a5b4fc":"#8899aa" }}>Urgency</button>
            <button onClick={()=>{ if(sortBy==="stage") setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortBy("stage");setSortDir("asc");} }} style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:sortBy==="stage"?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.03)",color:sortBy==="stage"?"#a5b4fc":"#8899aa" }}>Stage</button>
            <button onClick={()=>{ if(sortBy==="next_action_date") setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortBy("next_action_date");setSortDir("asc");} }} style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:sortBy==="next_action_date"?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.03)",color:sortBy==="next_action_date"?"#a5b4fc":"#8899aa" }}>Due Date</button>
            <button onClick={()=>{ if(sortBy==="created_at") setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortBy("created_at");setSortDir("asc");} }} style={{ padding:"5px 10px",borderRadius:"5px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:sortBy==="created_at"?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.03)",color:sortBy==="created_at"?"#a5b4fc":"#8899aa" }}>Date</button>
          </div>
        </div>
      </div>

      {showActions && (
        <div style={{ padding:"16px 28px",borderBottom:"1px solid " + border }}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16 }}>
            <div style={{ background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:10,padding:14 }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#ef4444",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10 }}>Overdue / Due Today ({todayActions.length})</div>
              {todayActions.length === 0
                ? <div style={{ fontSize:12,color:"#334155" }}>All clear</div>
                : todayActions.slice(0,5).map(l => (
                  <div key={l.id} onClick={()=>setSelected(l)} style={{ padding:"8px 10px",background:"rgba(0,0,0,0.2)",borderRadius:7,marginBottom:6,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:12,fontWeight:700,color:"#f1f5f9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160 }}>{l.company||l.name}</div>
                      <div style={{ fontSize:10,color:"#9aaabb" }}>{l.next_action||"No action set"}</div>
                    </div>
                    <div style={{ fontSize:10,color:"#ef4444",fontWeight:700,flexShrink:0,marginLeft:6 }}>{l.next_action_date}</div>
                  </div>
                ))}
              {todayActions.length > 5 && <div style={{ fontSize:11,color:"#8899aa",marginTop:4 }}>+{todayActions.length-5} more</div>}
            </div>
            <div style={{ background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:10,padding:14 }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10 }}>This Week ({weekActions.length})</div>
              {weekActions.length === 0
                ? <div style={{ fontSize:12,color:"#334155" }}>Nothing scheduled</div>
                : weekActions.slice(0,5).map(l => (
                  <div key={l.id} onClick={()=>setSelected(l)} style={{ padding:"8px 10px",background:"rgba(0,0,0,0.2)",borderRadius:7,marginBottom:6,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:12,fontWeight:700,color:"#f1f5f9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160 }}>{l.company||l.name}</div>
                      <div style={{ fontSize:10,color:"#9aaabb" }}>{l.next_action||"No action set"}</div>
                    </div>
                    <div style={{ fontSize:10,color:"#f59e0b",fontWeight:700,flexShrink:0,marginLeft:6 }}>{new Date(l.next_action_date).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</div>
                  </div>
                ))}
              {weekActions.length > 5 && <div style={{ fontSize:11,color:"#8899aa",marginTop:4 }}>+{weekActions.length-5} more</div>}
            </div>
            <div style={{ background:"rgba(99,102,241,0.06)",border:"1px solid rgba(99,102,241,0.15)",borderRadius:10,padding:14 }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#a5b4fc",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10 }}>Gone Quiet ({staleLeads.length})</div>
              {staleLeads.length === 0
                ? <div style={{ fontSize:12,color:"#334155" }}>All leads active</div>
                : staleLeads.slice(0,5).map(l => (
                  <div key={l.id} onClick={()=>setSelected(l)} style={{ padding:"8px 10px",background:"rgba(0,0,0,0.2)",borderRadius:7,marginBottom:6,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:12,fontWeight:700,color:"#f1f5f9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160 }}>{l.company||l.name}</div>
                      <div style={{ fontSize:10,color:"#9aaabb" }}>{(STAGES.find(function(s){return s.id===resolveStageKey(l,STAGES);})||{}).label||''}</div>
                    </div>
                    <div style={{ fontSize:10,color:"#ef4444",fontWeight:700,flexShrink:0,marginLeft:6 }}>{daysSince(l.last_action_at)}d</div>
                  </div>
                ))}
              {staleLeads.length > 5 && <div style={{ fontSize:11,color:"#8899aa",marginTop:4 }}>+{staleLeads.length-5} more</div>}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"300px",color:"#334155",fontSize:"14px" }}>Connecting...</div>
      ) : groupBy === 'company' ? (
        (function() {
          // Group leads by company; leads without a company bucket under "_solo" and render individually.
          var groups = {};
          var solo = [];
          filtered.forEach(function(l) {
            var co = (l.company || '').trim();
            if (!co) { solo.push(l); return; }
            if (!groups[co]) groups[co] = [];
            groups[co].push(l);
          });
          var orderedCompanies = Object.keys(groups).sort(function(a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
          if (orderedCompanies.length === 0 && solo.length === 0) {
            return <div style={{ padding: 40, textAlign: 'center', color: '#475569', fontSize: 13 }}>No leads to show.</div>;
          }
          return (
            <div style={{ padding: '20px 28px', display: 'grid', gap: 14, background: bg }}>
              {orderedCompanies.map(function(co) {
                var rows = groups[co];
                var stageCounts = {};
                rows.forEach(function(r) { var sk = resolveStageKey(r, STAGES); stageCounts[sk] = (stageCounts[sk] || 0) + 1; });
                return (
                  <div key={co} style={{ background: surface, border: '1px solid ' + border, borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>🏢 {co}</div>
                      <span style={{ fontSize: 11, color: '#64748b', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 4 }}>{rows.length} {rows.length === 1 ? 'lead' : 'leads'}</span>
                      {Object.keys(stageCounts).sort().map(function(sid) {
                        var stage = STAGES.find(function(s) { return s.id === sid; }) || { color: '#94a3b8', label: sid, icon: '•' };
                        return <span key={sid} style={{ fontSize: 10, fontWeight: 700, color: stage.color, background: stage.color + '18', border: '1px solid ' + stage.color + '55', padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{stage.label} · {stageCounts[sid]}</span>;
                      })}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                      {rows.map(function(lead) { return <LeadCard key={lead.id} lead={lead} onSelect={setSelected} onUrgencyChange={handleUrgencyChange} stages={STAGES} />; })}
                    </div>
                  </div>
                );
              })}
              {solo.length > 0 && (
                <div style={{ background: surface, border: '1px dashed ' + border, borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>👤 Individual contacts (no company)</div>
                    <span style={{ fontSize: 11, color: '#64748b', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 4 }}>{solo.length}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                    {solo.map(function(lead) { return <LeadCard key={lead.id} lead={lead} onSelect={setSelected} onUrgencyChange={handleUrgencyChange} stages={STAGES} />; })}
                  </div>
                </div>
              )}
            </div>
          );
        })()
      ) : (
        <div style={{ display:"flex",overflowX:"auto",padding:"20px 16px",gap:"12px",minHeight:"calc(100vh - 300px)",background:bg }}>
          {boardStages.map(stage => {
            var sl = filtered.filter(function(l) { return resolveStageKey(l, STAGES) === stage.id; });
            return (
              <div key={stage.id} style={{ minWidth:"220px",maxWidth:"220px",flexShrink:0 }}>
                <div style={{ display:"flex",alignItems:"center",gap:"7px",marginBottom:"12px",padding:"0 4px" }}>
                  <div style={{ width:"8px",height:"8px",borderRadius:"50%",background:stage.color }} />
                  <span style={{ fontSize:"11px",fontWeight:700,color:"#9aaabb",letterSpacing:"0.06em",textTransform:"uppercase" }}>{stage.label}</span>
                  <span style={{ marginLeft:"auto",fontSize:"11px",fontFamily:"ui-monospace, 'SF Mono', Menlo, monospace",color:"#334155",background:"rgba(255,255,255,0.04)",padding:"1px 6px",borderRadius:"4px" }}>{sl.length}</span>
                </div>
                <div style={{ background:surface,borderRadius:"10px",padding:"10px",minHeight:"80px",border:"1px solid " + border }}>
                  {sl.length === 0
                    ? <div style={{ textAlign:"center",padding:"16px 0",fontSize:"11px",color:"#1e293b" }}>Empty</div>
                    : sl.map(lead => <LeadCard key={lead.id} lead={lead} onSelect={setSelected} onUrgencyChange={handleUrgencyChange} stages={STAGES} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && <Modal lead={selected} tenantId={tenantId} onClose={()=>setSelected(null)} onSave={()=>{setSelected(null);fetchLeads();}} stages={STAGES} />}

      {validateOpen && <ValidateExistingModal
        leads={leads.filter(function(l) { return !l.archived && resolveStageType(l, STAGES) === 'lead'; })}
        tenantId={tenantId}
        busy={validateBusy}
        setBusy={setValidateBusy}
        onClose={function() { setValidateOpen(false); }}
        onRefresh={function() { fetchLeads(); }}
      />}
    </div>
  );
}

// ── Validate Existing modal — SP admin only ────────────────────────────────
function ValidateExistingModal({ leads, tenantId, busy, setBusy, onClose, onRefresh }) {
  var [selection, setSelection] = useState({});
  async function markAsReal(lead) {
    setBusy('real_' + lead.id);
    try {
      var realStage = stages.find(function(s) { return s.id === 'lead'; });
      await supabase.from('leads').update({ qualified: true, prospect_stage: null, pipeline_stage_id: realStage ? realStage.stage_id : null }).eq('id', lead.id);
      await supabase.from('lead_sequences').update({ status: 'cancelled' }).eq('lead_id', lead.id).eq('status', 'active');
      onRefresh();
    } catch(e) { alert('Error: ' + e.message); }
    setBusy(null);
  }
  async function archiveLead(lead) {
    setBusy('arch_' + lead.id);
    try {
      await supabase.from('leads').update({ archived: true }).eq('id', lead.id);
      onRefresh();
    } catch(e) { alert('Error: ' + e.message); }
    setBusy(null);
  }
  async function sendQualSeq(lead) {
    setBusy('seq_' + lead.id);
    try {
      var seqRes = await supabase.from('sequences').select('id').or('tenant_id.eq.' + lead.tenant_id + ',tenant_id.eq.' + (process.env.REACT_APP_SP_TENANT_ID || process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387') + '').ilike('name', '%contact qualification%').limit(1);
      if (!seqRes.data || seqRes.data.length === 0) { alert('No Contact Qualification sequence found. Create one in the master SP tenant first.'); setBusy(null); return; }
      var fs = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', seqRes.data[0].id).eq('step_number', 1).single();
      var delay = (fs.data && fs.data.delay_days) || 0;
      var nextAt = new Date(Date.now() + delay * 86400000).toISOString();
      await supabase.from('lead_sequences').upsert({
        tenant_id: lead.tenant_id, lead_id: lead.id, sequence_id: seqRes.data[0].id,
        current_step: 0, status: 'active', enrolled_at: new Date().toISOString(), next_step_at: nextAt,
      }, { onConflict: 'lead_id,sequence_id' });
      onRefresh();
    } catch(e) { alert('Error: ' + e.message); }
    setBusy(null);
  }
  async function bulk(action) {
    var ids = Object.keys(selection).filter(function(k) { return selection[k]; });
    if (ids.length === 0) { alert('Select at least one lead first.'); return; }
    if (!window.confirm(action.replace('_', ' ').toUpperCase() + ' ' + ids.length + ' lead(s)?')) return;
    setBusy('bulk');
    try {
      if (action === 'archive') {
        await supabase.from('leads').update({ archived: true }).in('id', ids);
      } else if (action === 'send_seq') {
        for (var id of ids) { var ld = leads.find(function(l) { return l.id === id; }); if (ld) await sendQualSeqInner(ld); }
      }
      onRefresh();
      setSelection({});
    } catch(e) { alert('Error: ' + e.message); }
    setBusy(null);
  }
  async function sendQualSeqInner(lead) {
    var seqRes = await supabase.from('sequences').select('id').or('tenant_id.eq.' + lead.tenant_id + ',tenant_id.eq.' + (process.env.REACT_APP_SP_TENANT_ID || process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387') + '').ilike('name', '%contact qualification%').limit(1);
    if (!seqRes.data || seqRes.data.length === 0) return;
    var fs = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', seqRes.data[0].id).eq('step_number', 1).single();
    var delay = (fs.data && fs.data.delay_days) || 0;
    var nextAt = new Date(Date.now() + delay * 86400000).toISOString();
    await supabase.from('lead_sequences').upsert({
      tenant_id: lead.tenant_id, lead_id: lead.id, sequence_id: seqRes.data[0].id,
      current_step: 0, status: 'active', enrolled_at: new Date().toISOString(), next_step_at: nextAt,
    }, { onConflict: 'lead_id,sequence_id' });
  }
  var allSelected = leads.length > 0 && leads.every(function(l) { return selection[l.id]; });
  return (
    <div onClick={function(e) { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, width: '100%', maxWidth: 900, maxHeight: '88vh', overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ color: '#fff', margin: 0, fontSize: 20, fontWeight: 800 }}>🔍 Validate Existing Leads</h2>
            <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 13 }}>{leads.length} lead-stage, unarchived lead(s) awaiting review</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>

        {leads.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={function() { bulk('send_seq'); }} disabled={busy === 'bulk'} style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 6, padding: '6px 12px', color: '#a5b4fc', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>📤 Send Sequence to Selected</button>
            <button onClick={function() { bulk('archive'); }} disabled={busy === 'bulk'} style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 6, padding: '6px 12px', color: '#fbbf24', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>📦 Archive Selected</button>
            <div style={{ flex: 1 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={allSelected} onChange={function() {
                if (allSelected) setSelection({});
                else { var all = {}; leads.forEach(function(l) { all[l.id] = true; }); setSelection(all); }
              }} /> Select all
            </label>
          </div>
        )}

        {leads.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>✅ No leads at intake stage to review.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {leads.map(function(l) {
              var sel = !!selection[l.id];
              return (
                <div key={l.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid ' + (sel ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'), borderRadius: 8, padding: '10px 14px', display: 'grid', gridTemplateColumns: '30px 1fr 140px 140px', gap: 12, alignItems: 'center' }}>
                  <input type="checkbox" checked={sel} onChange={function(e) { setSelection(function(p) { return Object.assign({}, p, { [l.id]: e.target.checked }); }); }} />
                  <div>
                    <div style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 700 }}>{l.name || '(no name)'}</div>
                    <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                      {l.company ? l.company + ' · ' : ''}{l.email || 'no email'}{l.phone ? ' · ' + l.phone : ' · no phone'}
                    </div>
                    {l.notes && <div style={{ color: '#475569', fontSize: 11, marginTop: 4, fontStyle: 'italic', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.notes}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={function() { markAsReal(l); }} disabled={busy === 'real_' + l.id} style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', borderRadius: 5, padding: '5px 8px', color: '#34d399', fontSize: 11, fontWeight: 700, cursor: 'pointer', flex: 1 }}>{busy === 'real_' + l.id ? '...' : '✓ Real'}</button>
                    <button onClick={function() { sendQualSeq(l); }} disabled={busy === 'seq_' + l.id} style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 5, padding: '5px 8px', color: '#a5b4fc', fontSize: 11, fontWeight: 700, cursor: 'pointer', flex: 1 }}>{busy === 'seq_' + l.id ? '...' : '📤 Send'}</button>
                  </div>
                  <button onClick={function() { archiveLead(l); }} disabled={busy === 'arch_' + l.id} style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 5, padding: '5px 10px', color: '#fbbf24', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{busy === 'arch_' + l.id ? '...' : '📦 Archive'}</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
