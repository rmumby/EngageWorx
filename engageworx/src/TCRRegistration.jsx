import { useState, useEffect } from "react";

const C = {
  bg: "#0A0E1A", surface: "#111827", surfaceAlt: "#1a2235", border: "#1e2d45",
  accent: "#00C9FF", accent2: "#E040FB", accent3: "#00E676", accent4: "#FF6B35",
  warning: "#FFD600", text: "#E8F4FD", muted: "#6B8BAE", dim: "#3A5068",
};

const USE_CASES = [
  { id: "marketing", label: "Marketing / Promotions", desc: "Promotional messages, sales, discounts", emoji: "📢" },
  { id: "customer_care", label: "Customer Care", desc: "Support, service updates, account info", emoji: "💬" },
  { id: "notifications", label: "Notifications / Alerts", desc: "Order updates, shipping, reminders", emoji: "🔔" },
  { id: "two_factor", label: "Two-Factor Auth (2FA)", desc: "Security codes, verification", emoji: "🔐" },
  { id: "mixed", label: "Mixed / Multiple", desc: "Combination of the above", emoji: "🔀" },
];
const ENTITY_TYPES = [
  { id: "private_profit", label: "Private Company (For-Profit)" },
  { id: "public_profit", label: "Public Company (For-Profit)" },
  { id: "nonprofit", label: "Non-Profit Organization" },
  { id: "government", label: "Government Entity" },
  { id: "sole_proprietor", label: "Sole Proprietor" },
];
const VERTICALS = [
  "Automotive", "Agriculture", "Banking/Finance", "Construction", "Consumer Services",
  "Education", "Energy/Utilities", "Entertainment", "Food/Beverage", "Healthcare",
  "Hospitality", "Insurance", "Legal", "Manufacturing", "Media",
  "Real Estate", "Retail", "Technology", "Telecommunications", "Transportation",
  "Travel", "Other",
];
const MESSAGE_VOLUME = [
  { id: "low", label: "Low", desc: "1 – 1,000/mo" },
  { id: "medium", label: "Medium", desc: "1K – 10K/mo" },
  { id: "high", label: "High", desc: "10K – 100K/mo" },
  { id: "very_high", label: "Very High", desc: "100K+/mo" },
];

function StepIndicator({ steps, current }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 32 }}>
      {steps.map(function(s, i) {
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: i < current ? C.accent3 : i === current ? C.accent : C.border,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: i <= current ? "#000" : C.dim, fontSize: 13, fontWeight: 800,
              boxShadow: i === current ? "0 0 12px " + C.accent + "44" : "none",
            }}>{i < current ? "✓" : i + 1}</div>
            <div style={{ marginLeft: 8, marginRight: 12 }}>
              <div style={{ color: i <= current ? C.text : C.dim, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{s}</div>
            </div>
            {i < steps.length - 1 && <div style={{ flex: 1, height: 2, background: i < current ? C.accent3 : C.border, marginRight: 12 }} />}
          </div>
        );
      })}
    </div>
  );
}

function FieldGroup({ label, required, children, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>
        {label} {required && <span style={{ color: C.accent4 }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ color: C.dim, fontSize: 11, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

var inputStyle = {
  width: "100%", background: C.bg, border: "1px solid " + C.border,
  borderRadius: 8, padding: "10px 14px", color: C.text, fontSize: 14,
  boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", outline: "none",
};
var selectStyle = Object.assign({}, inputStyle, { appearance: "auto" });
var btnPrimary = {
  background: "linear-gradient(135deg, " + C.accent + ", " + C.accent2 + ")",
  border: "none", borderRadius: 8, padding: "10px 24px", color: "#000", fontWeight: 800,
  cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif",
};

export default function TCRRegistration({ tenantId, C: propC }) {
  var colors = propC || C;
  var [step, setStep] = useState(0);
  var [saving, setSaving] = useState(false);
  var [toast, setToast] = useState(null);
  var [existingSub, setExistingSub] = useState(null);

  // AI state
  var [aiGenerating, setAiGenerating] = useState(false);
  var [aiValidating, setAiValidating] = useState(false);
  var [aiScore, setAiScore] = useState(null);
  var [aiIssues, setAiIssues] = useState([]);
  var [aiReviewResult, setAiReviewResult] = useState(null);

  var [form, setForm] = useState({
    legalName: "", dba: "", entityType: "private_profit", ein: "", vertical: "",
    website: "", country: "US", state: "", city: "", zip: "", street: "",
    contactFirstName: "", contactLastName: "", contactEmail: "", contactPhone: "", contactTitle: "",
    useCase: "customer_care", useCaseDescription: "", messageVolume: "medium",
    sampleMessages: [],
    hasOptIn: true, optInMethod: "website", optInDescription: "",
    hasOptOut: true, hasHelp: true, hasAgeGated: false, hasEmbeddedLinks: true, hasEmbeddedPhone: false,
  });

  function showToast(msg, type) { setToast({ msg: msg, type: type || "success" }); setTimeout(function() { setToast(null); }, 3000); }
  function update(key, value) { setForm(function(prev) { return Object.assign({}, prev, { [key]: value }); }); }

  // Prefill on mount
  useEffect(function() {
    if (!tenantId) return;
    fetch("/api/tcr?action=prefill&tenant_id=" + tenantId)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.prefill) {
          setForm(function(prev) {
            var merged = Object.assign({}, prev);
            Object.keys(data.prefill).forEach(function(k) { if (data.prefill[k]) merged[k] = data.prefill[k]; });
            return merged;
          });
        }
        if (data.existing) {
          setExistingSub(data.existing);
          if (data.existing.status === 'pending_review' || data.existing.status === 'submitted' || data.existing.status === 'completed') {
            setStep(3);
          }
        }
      })
      .catch(function() {});
  }, [tenantId]);

  // AI Generate — campaign description + 5 sample messages
  function handleAIGenerate() {
    setAiGenerating(true);
    fetch("/api/tcr?action=generate-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: form.legalName || form.dba,
        vertical: form.vertical,
        useCase: form.useCase,
        businessDescription: form.useCaseDescription,
      }),
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.description) update("useCaseDescription", data.description);
        if (data.sampleMessages) update("sampleMessages", data.sampleMessages);
        showToast("AI generated campaign copy");
      })
      .catch(function(err) { showToast("AI generation failed: " + err.message, "error"); })
      .finally(function() { setAiGenerating(false); });
  }

  // AI Validate — score 0-100
  function handleAIValidate() {
    setAiValidating(true);
    setAiScore(null);
    setAiIssues([]);
    fetch("/api/tcr?action=validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submission: form }),
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        setAiScore(data.score || 0);
        setAiIssues(data.issues || []);
        setAiReviewResult(data);
        if (data.score >= 80) showToast("Validation passed! Score: " + data.score + "/100");
        else showToast("Score: " + data.score + "/100 — fix issues before submitting", "error");
      })
      .catch(function(err) { showToast("Validation failed: " + err.message, "error"); })
      .finally(function() { setAiValidating(false); });
  }

  // Submit draft to SP admin review queue
  function handleSubmitDraft() {
    if (aiScore !== null && aiScore < 80) { showToast("Score must be 80+ to submit", "error"); return; }
    setSaving(true);
    var payload = Object.assign({}, form, {
      tenant_id: tenantId,
      aiReviewResult: aiReviewResult,
    });
    fetch("/api/tcr?action=submit-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          setExistingSub(data.submission);
          setStep(3);
          showToast("Submitted for review!");
        } else {
          showToast("Error: " + (data.error || "Unknown"), "error");
        }
      })
      .catch(function(err) { showToast("Submit failed: " + err.message, "error"); })
      .finally(function() { setSaving(false); });
  }

  var steps = ["Business Info", "Campaign Copy", "Validation", "Submitted"];

  function canProceed() {
    if (step === 0) return form.legalName && form.entityType && form.ein && form.vertical && form.street && form.city && form.state && form.zip && form.contactFirstName && form.contactLastName && form.contactEmail;
    if (step === 1) return form.useCase && form.useCaseDescription && form.sampleMessages.length >= 3 && form.optInDescription;
    if (step === 2) return aiScore !== null && aiScore >= 80;
    return true;
  }

  var isSubmitted = existingSub && (existingSub.status === 'pending_review' || existingSub.status === 'submitted' || existingSub.status === 'brand_pending' || existingSub.status === 'campaign_pending' || existingSub.status === 'completed');

  return (
    <div style={{ padding: "32px 36px" }}>
      <style>{"input:focus, textarea:focus, select:focus { outline: none; border-color: " + C.accent + " !important; }"}</style>

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 2000,
          background: toast.type === "error" ? "#FF000022" : C.accent3 + "22",
          border: "1px solid " + (toast.type === "error" ? "#FF000044" : C.accent3 + "44"),
          borderRadius: 10, padding: "12px 20px",
          color: toast.type === "error" ? "#FF6B6B" : C.accent3,
          fontSize: 14, fontWeight: 600,
        }}>
          {toast.type === "error" ? "❌ " : "✅ "}{toast.msg}
        </div>
      )}

      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, color: C.text }}>A2P 10DLC Registration</h1>
          <p style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>AI-assisted TCR campaign registration</p>
        </div>

        <StepIndicator steps={steps} current={step} />

        {/* ── STEP 0: Business Info (Brand + Contact combined) ────────────── */}
        {step === 0 && (
          <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 16, padding: 28 }}>
            <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Business Information</h2>
            <p style={{ color: C.muted, fontSize: 13, margin: "0 0 24px" }}>Legal details + authorized contact (pre-filled from your profile)</p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FieldGroup label="Legal Business Name" required>
                <input style={inputStyle} value={form.legalName} onChange={function(e) { update("legalName", e.target.value); }} placeholder="Acme Corporation, LLC" />
              </FieldGroup>
              <FieldGroup label="DBA (Doing Business As)">
                <input style={inputStyle} value={form.dba} onChange={function(e) { update("dba", e.target.value); }} placeholder="Acme Corp" />
              </FieldGroup>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FieldGroup label="Entity Type" required>
                <select style={selectStyle} value={form.entityType} onChange={function(e) { update("entityType", e.target.value); }}>
                  {ENTITY_TYPES.map(function(et) { return <option key={et.id} value={et.id}>{et.label}</option>; })}
                </select>
              </FieldGroup>
              <FieldGroup label="EIN / Tax ID" required hint="XX-XXXXXXX">
                <input style={inputStyle} value={form.ein} onChange={function(e) { update("ein", e.target.value); }} placeholder="12-3456789" maxLength={10} />
              </FieldGroup>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FieldGroup label="Industry" required>
                <select style={selectStyle} value={form.vertical} onChange={function(e) { update("vertical", e.target.value); }}>
                  <option value="">Select...</option>
                  {VERTICALS.map(function(v) { return <option key={v} value={v}>{v}</option>; })}
                </select>
              </FieldGroup>
              <FieldGroup label="Website">
                <input style={inputStyle} value={form.website} onChange={function(e) { update("website", e.target.value); }} placeholder="https://example.com" />
              </FieldGroup>
            </div>
            <FieldGroup label="Street Address" required>
              <input style={inputStyle} value={form.street} onChange={function(e) { update("street", e.target.value); }} placeholder="123 Main St" />
            </FieldGroup>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
              <FieldGroup label="City" required>
                <input style={inputStyle} value={form.city} onChange={function(e) { update("city", e.target.value); }} />
              </FieldGroup>
              <FieldGroup label="State" required>
                <input style={inputStyle} value={form.state} onChange={function(e) { update("state", e.target.value); }} maxLength={2} />
              </FieldGroup>
              <FieldGroup label="ZIP" required>
                <input style={inputStyle} value={form.zip} onChange={function(e) { update("zip", e.target.value); }} maxLength={10} />
              </FieldGroup>
            </div>

            <div style={{ borderTop: "1px solid " + C.border, marginTop: 12, paddingTop: 16, marginBottom: 8 }}>
              <div style={{ color: C.muted, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>👤 Authorized Contact</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FieldGroup label="First Name" required>
                <input style={inputStyle} value={form.contactFirstName} onChange={function(e) { update("contactFirstName", e.target.value); }} />
              </FieldGroup>
              <FieldGroup label="Last Name" required>
                <input style={inputStyle} value={form.contactLastName} onChange={function(e) { update("contactLastName", e.target.value); }} />
              </FieldGroup>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <FieldGroup label="Email" required>
                <input type="email" style={inputStyle} value={form.contactEmail} onChange={function(e) { update("contactEmail", e.target.value); }} />
              </FieldGroup>
              <FieldGroup label="Phone">
                <input style={inputStyle} value={form.contactPhone} onChange={function(e) { update("contactPhone", e.target.value); }} />
              </FieldGroup>
              <FieldGroup label="Title">
                <input style={inputStyle} value={form.contactTitle} onChange={function(e) { update("contactTitle", e.target.value); }} />
              </FieldGroup>
            </div>
          </div>
        )}

        {/* ── STEP 1: Campaign Copy (AI-generated) ───────────────────────── */}
        {step === 1 && (
          <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 16, padding: 28 }}>
            <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Campaign Details</h2>
            <p style={{ color: C.muted, fontSize: 13, margin: "0 0 24px" }}>AI will generate compliant copy based on your business — edit as needed</p>

            <FieldGroup label="Primary Use Case" required>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {USE_CASES.map(function(uc) {
                  return (
                    <div key={uc.id} onClick={function() { update("useCase", uc.id); }} style={{
                      background: form.useCase === uc.id ? C.accent + "15" : C.bg,
                      border: "1px solid " + (form.useCase === uc.id ? C.accent + "55" : C.border),
                      borderRadius: 10, padding: "12px 10px", cursor: "pointer", textAlign: "center",
                    }}>
                      <div style={{ fontSize: 22, marginBottom: 4 }}>{uc.emoji}</div>
                      <div style={{ color: form.useCase === uc.id ? C.accent : C.text, fontSize: 12, fontWeight: 700 }}>{uc.label}</div>
                    </div>
                  );
                })}
              </div>
            </FieldGroup>

            <FieldGroup label="Expected Volume">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {MESSAGE_VOLUME.map(function(mv) {
                  return (
                    <div key={mv.id} onClick={function() { update("messageVolume", mv.id); }} style={{
                      background: form.messageVolume === mv.id ? C.accent + "15" : C.bg,
                      border: "1px solid " + (form.messageVolume === mv.id ? C.accent + "55" : C.border),
                      borderRadius: 8, padding: "10px 8px", cursor: "pointer", textAlign: "center",
                    }}>
                      <div style={{ color: form.messageVolume === mv.id ? C.accent : C.text, fontSize: 13, fontWeight: 700 }}>{mv.label}</div>
                      <div style={{ color: C.dim, fontSize: 10, marginTop: 2 }}>{mv.desc}</div>
                    </div>
                  );
                })}
              </div>
            </FieldGroup>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, marginTop: 16, borderTop: "1px solid " + C.border, paddingTop: 16 }}>
              <div style={{ color: C.muted, fontSize: 12, fontWeight: 700 }}>📝 Campaign Description & Sample Messages</div>
              <button onClick={handleAIGenerate} disabled={aiGenerating} style={Object.assign({}, btnPrimary, { padding: "8px 16px", fontSize: 12, opacity: aiGenerating ? 0.6 : 1 })}>
                {aiGenerating ? "⏳ Generating..." : "🤖 Generate with AI"}
              </button>
            </div>

            <FieldGroup label="Campaign Description" required hint="2-3 sentences describing what messages you send and why">
              <textarea style={Object.assign({}, inputStyle, { resize: "vertical", minHeight: 70 })} value={form.useCaseDescription} onChange={function(e) { update("useCaseDescription", e.target.value); }}
                placeholder="Click 'Generate with AI' or describe your messaging use case..." />
            </FieldGroup>

            {(form.sampleMessages || []).map(function(msg, i) {
              return (
                <FieldGroup key={i} label={"Sample Message " + (i + 1)} required={i < 3}>
                  <textarea style={Object.assign({}, inputStyle, { resize: "vertical", minHeight: 50 })} value={msg}
                    onChange={function(e) {
                      var updated = (form.sampleMessages || []).slice();
                      updated[i] = e.target.value;
                      update("sampleMessages", updated);
                    }}
                    placeholder="e.g. CompanyName: Your order has shipped! Track: link. Reply STOP to opt out." />
                  <div style={{ color: C.dim, fontSize: 10, textAlign: "right", marginTop: 2 }}>{(msg || "").length}/160</div>
                </FieldGroup>
              );
            })}
            {(form.sampleMessages || []).length < 5 && (
              <button onClick={function() { update("sampleMessages", (form.sampleMessages || []).concat([""])); }} style={{ background: "transparent", border: "1px dashed " + C.border, borderRadius: 8, padding: "8px 16px", color: C.muted, cursor: "pointer", fontSize: 12, width: "100%", marginBottom: 16 }}>
                + Add Sample Message
              </button>
            )}

            <div style={{ borderTop: "1px solid " + C.border, marginTop: 8, paddingTop: 16, marginBottom: 8 }}>
              <div style={{ color: C.muted, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>✅ Consent & Compliance</div>
            </div>
            <FieldGroup label="How do consumers opt-in?" required>
              <textarea style={Object.assign({}, inputStyle, { resize: "vertical", minHeight: 60 })} value={form.optInDescription} onChange={function(e) { update("optInDescription", e.target.value); }}
                placeholder="e.g. Customers opt in by checking a consent checkbox during checkout..." />
            </FieldGroup>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { key: "hasOptOut", label: "STOP opt-out", desc: "Messages include STOP" },
                { key: "hasHelp", label: "HELP keyword", desc: "HELP returns info" },
                { key: "hasEmbeddedLinks", label: "Contains links", desc: "May include URLs" },
              ].map(function(item) {
                return (
                  <div key={item.key} onClick={function() { update(item.key, !form[item.key]); }} style={{
                    background: form[item.key] ? C.accent3 + "11" : C.bg,
                    border: "1px solid " + (form[item.key] ? C.accent3 + "44" : C.border),
                    borderRadius: 8, padding: "10px 12px", cursor: "pointer", textAlign: "center",
                  }}>
                    <div style={{ color: form[item.key] ? C.accent3 : C.dim, fontSize: 18, marginBottom: 2 }}>{form[item.key] ? "✅" : "⬜"}</div>
                    <div style={{ color: form[item.key] ? C.text : C.muted, fontSize: 11, fontWeight: 700 }}>{item.label}</div>
                    <div style={{ color: C.dim, fontSize: 10, marginTop: 2 }}>{item.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── STEP 2: AI Validation ──────────────────────────────────────── */}
        {step === 2 && (
          <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 16, padding: 28 }}>
            <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>AI Compliance Check</h2>
            <p style={{ color: C.muted, fontSize: 13, margin: "0 0 24px" }}>Claude reviews your submission against TCR rejection patterns. Score must be 80+ to submit.</p>

            {aiScore === null && (
              <div style={{ textAlign: "center", padding: 40 }}>
                <button onClick={handleAIValidate} disabled={aiValidating} style={Object.assign({}, btnPrimary, { padding: "14px 32px", fontSize: 16, opacity: aiValidating ? 0.6 : 1 })}>
                  {aiValidating ? "⏳ Analyzing..." : "🤖 Run Compliance Check"}
                </button>
                <p style={{ color: C.muted, fontSize: 12, marginTop: 12 }}>This checks against common TCR rejection patterns (T04, T25, T40, T50)</p>
              </div>
            )}

            {aiScore !== null && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 28 }}>
                  <div style={{
                    width: 120, height: 120, borderRadius: "50%",
                    background: aiScore >= 80 ? C.accent3 + "22" : C.accent4 + "22",
                    border: "3px solid " + (aiScore >= 80 ? C.accent3 : C.accent4),
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  }}>
                    <div style={{ fontSize: 36, fontWeight: 900, color: aiScore >= 80 ? C.accent3 : C.accent4 }}>{aiScore}</div>
                    <div style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>/ 100</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: aiScore >= 80 ? C.accent3 : C.accent4 }}>
                      {aiScore >= 90 ? "Excellent" : aiScore >= 80 ? "Passing" : aiScore >= 60 ? "Needs Work" : "High Risk"}
                    </div>
                    <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
                      {aiScore >= 80 ? "Ready to submit for review" : "Fix the issues below and re-validate"}
                    </div>
                  </div>
                </div>

                {aiIssues.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ color: C.muted, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Issues Found</div>
                    {aiIssues.map(function(issue, i) {
                      var color = issue.severity === 'error' ? '#FF3B30' : issue.severity === 'warning' ? C.warning : C.accent;
                      return (
                        <div key={i} style={{
                          background: color + "08", border: "1px solid " + color + "22",
                          borderRadius: 8, padding: "10px 14px", marginBottom: 8,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: color, textTransform: "uppercase" }}>
                              {issue.severity === 'error' ? "❌" : issue.severity === 'warning' ? "⚠️" : "ℹ️"} {issue.field}
                            </span>
                          </div>
                          <div style={{ color: C.text, fontSize: 13, marginTop: 4 }}>{issue.message}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={function() { setStep(1); }} style={{ background: "transparent", border: "1px solid " + C.border, borderRadius: 8, padding: "10px 18px", color: C.muted, cursor: "pointer", fontSize: 13 }}>
                    ← Edit Campaign
                  </button>
                  <button onClick={handleAIValidate} disabled={aiValidating} style={{ background: "transparent", border: "1px solid " + C.accent + "44", borderRadius: 8, padding: "10px 18px", color: C.accent, cursor: "pointer", fontSize: 13 }}>
                    {aiValidating ? "Checking..." : "🔄 Re-validate"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Submitted / Status Tracker ─────────────────────────── */}
        {step === 3 && (
          <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 16, padding: 28, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <h2 style={{ color: C.text, fontSize: 24, fontWeight: 900, margin: "0 0 8px" }}>
              {isSubmitted ? "Registration Submitted" : "Ready to Submit"}
            </h2>
            <p style={{ color: C.muted, fontSize: 14 }}>
              {isSubmitted
                ? "Your A2P 10DLC registration is being reviewed. You'll receive an email when approved (typically 1-3 business days)."
                : "Your submission scored " + (aiScore || "--") + "/100. Click below to submit for SP admin review."}
            </p>

            {isSubmitted && existingSub && (
              <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 24, marginBottom: 24 }}>
                {["Submitted", "Brand Review", "Campaign Review", "Approved"].map(function(label, i) {
                  var statusMap = { pending_review: 0, submitted: 1, brand_pending: 1, brand_approved: 2, campaign_pending: 2, campaign_approved: 3, completed: 3, rejected: -1 };
                  var current = statusMap[existingSub.status] || 0;
                  var isRejected = existingSub.status === 'rejected';
                  var done = !isRejected && current > i;
                  var active = !isRejected && current === i;
                  return (
                    <div key={i} style={{ textAlign: "center" }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: "50%", margin: "0 auto 6px",
                        background: isRejected && i === 0 ? "#FF3B3022" : done ? C.accent3 + "22" : active ? C.accent + "22" : C.border + "44",
                        border: "2px solid " + (isRejected && i === 0 ? "#FF3B30" : done ? C.accent3 : active ? C.accent : C.border),
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: done ? C.accent3 : active ? C.accent : C.dim, fontWeight: 800, fontSize: 14,
                      }}>{isRejected && i === 0 ? "✕" : done ? "✓" : i + 1}</div>
                      <div style={{ color: active ? C.accent : done ? C.accent3 : C.dim, fontSize: 11, fontWeight: 700 }}>{label}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {existingSub && existingSub.status === 'rejected' && existingSub.rejection_reason && (
              <div style={{ background: "#FF3B3008", border: "1px solid #FF3B3022", borderRadius: 10, padding: 16, marginTop: 16, textAlign: "left" }}>
                <div style={{ color: "#FF3B30", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Rejection Reason</div>
                <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.6 }}>{existingSub.rejection_reason}</div>
                <button onClick={function() { setStep(1); setAiScore(null); }} style={Object.assign({}, btnPrimary, { marginTop: 12, padding: "8px 16px", fontSize: 12 })}>Edit & Resubmit</button>
              </div>
            )}

            {!isSubmitted && (
              <div style={{ marginTop: 24 }}>
                <button onClick={handleSubmitDraft} disabled={saving} style={Object.assign({}, btnPrimary, { padding: "14px 32px", fontSize: 16, opacity: saving ? 0.6 : 1, background: "linear-gradient(135deg, " + C.accent3 + ", " + C.accent + ")" })}>
                  {saving ? "Submitting..." : "🚀 Submit for Review"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Navigation ─────────────────────────────────────────────────── */}
        {step < 3 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
            <div>
              {step > 0 && (
                <button onClick={function() { setStep(step - 1); }} style={{ background: "transparent", border: "1px solid " + C.border, borderRadius: 8, padding: "10px 20px", color: C.muted, cursor: "pointer", fontSize: 14 }}>← Back</button>
              )}
            </div>
            <div>
              {step < 2 && (
                <button onClick={function() { setStep(step + 1); }} disabled={!canProceed()} style={{
                  background: canProceed() ? "linear-gradient(135deg, " + C.accent + ", " + C.accent2 + ")" : C.border,
                  border: "none", borderRadius: 8, padding: "10px 24px",
                  color: canProceed() ? "#000" : C.dim, fontWeight: 800, cursor: canProceed() ? "pointer" : "not-allowed", fontSize: 14,
                }}>Continue →</button>
              )}
              {step === 2 && aiScore !== null && aiScore >= 80 && (
                <button onClick={function() { setStep(3); }} style={Object.assign({}, btnPrimary, { background: "linear-gradient(135deg, " + C.accent3 + ", " + C.accent + ")" })}>
                  Review & Submit →
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
