import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const C = {
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
  { id: "low", label: "Low", desc: "1 – 1,000 messages/month" },
  { id: "medium", label: "Medium", desc: "1,000 – 10,000 messages/month" },
  { id: "high", label: "High", desc: "10,000 – 100,000 messages/month" },
  { id: "very_high", label: "Very High", desc: "100,000+ messages/month" },
];

function StepIndicator({ steps, current }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 32 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: i < current ? C.accent3 : i === current ? C.accent : C.border,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: i <= current ? "#000" : C.dim,
            fontSize: 13, fontWeight: 800,
            transition: "all 0.3s",
            boxShadow: i === current ? `0 0 12px ${C.accent}44` : "none",
          }}>
            {i < current ? "✓" : i + 1}
          </div>
          <div style={{ marginLeft: 8, marginRight: 12 }}>
            <div style={{ color: i <= current ? C.text : C.dim, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{s}</div>
          </div>
          {i < steps.length - 1 && (
            <div style={{
              flex: 1, height: 2, background: i < current ? C.accent3 : C.border,
              marginRight: 12, transition: "background 0.3s",
            }} />
          )}
        </div>
      ))}
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

const inputStyle = {
  width: "100%", background: C.bg, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: "10px 14px", color: C.text, fontSize: 14,
  boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", outline: "none",
};

const selectStyle = { ...inputStyle, appearance: "auto" };

export default function TCRRegistration({ tenantId }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [registration, setRegistration] = useState(null);
  const [activeTab, setActiveTab] = useState("10dlc"); // "10dlc" or "rcs"

  const [form, setForm] = useState({
    // Brand Info (Step 1)
    legalName: "",
    dba: "",
    entityType: "private_profit",
    ein: "",
    vertical: "",
    website: "",
    country: "US",
    state: "",
    city: "",
    zip: "",
    street: "",
    // Contact (Step 2)
    contactFirstName: "",
    contactLastName: "",
    contactEmail: "",
    contactPhone: "",
    contactTitle: "",
    // Campaign Info (Step 3)
    useCase: "customer_care",
    useCaseDescription: "",
    messageVolume: "medium",
    sampleMessage1: "",
    sampleMessage2: "",
    sampleMessage3: "",
    hasOptIn: true,
    optInMethod: "website",
    optInDescription: "",
    hasOptOut: true,
    hasHelp: true,
    hasAgeGated: false,
    hasEmbeddedLinks: true,
    hasEmbeddedPhone: false,
    // RCS (Step 4 if RCS tab)
    rcsAgentName: "",
    rcsDescription: "",
    rcsLogoUrl: "",
    rcsColor: "#00C9FF",
    rcsWebsite: "",
    rcsPrivacyUrl: "",
    rcsTosUrl: "",
  });

  useEffect(() => { loadRegistration(); }, []);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const loadRegistration = async () => {
    try {
      const { data } = await supabase
        .from("tcr_registrations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (data) {
        setRegistration(data);
        if (data.form_data) setForm(prev => ({ ...prev, ...data.form_data }));
      }
    } catch (err) { /* No registration yet */ }
  };

  const saveProgress = async (status = "draft") => {
    setSaving(true);
    try {
      if (registration?.id) {
        await supabase.from("tcr_registrations")
          .update({ form_data: form, status, step, updated_at: new Date().toISOString() })
          .eq("id", registration.id);
      } else {
        const { data } = await supabase.from("tcr_registrations")
          .insert({ tenant_id: null, form_data: form, status, step, type: activeTab })
          .select()
          .single();
        if (data) setRegistration(data);
      }
      showToast(status === "submitted" ? "Registration submitted!" : "Progress saved!");
    } catch (err) {
      showToast("Error: " + err.message, "error");
    }
    setSaving(false);
  };

  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  const submit = async () => {
    setSubmitting(true);
    setSubmitResult(null);

    try {
      // Save form first
      await saveProgress("submitting");

      // Submit to Twilio Trust Hub
      const response = await fetch("/api/tcr-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register_brand",
          formData: form,
          registrationId: registration?.id,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Save the Twilio SIDs back to our registration
        const updateData = {
          status: "submitted",
          form_data: {
            ...form,
            twilio_customer_profile_sid: result.customerProfileSid,
            twilio_end_user_sid: result.endUserSid,
            twilio_address_sid: result.addressSid,
            twilio_status: result.status,
          },
          updated_at: new Date().toISOString(),
        };

        if (registration?.id) {
          await supabase.from("tcr_registrations").update(updateData).eq("id", registration.id);
        }

        setSubmitResult({ success: true, message: result.message });
        setRegistration(prev => ({ ...prev, status: "submitted" }));
        showToast("Registration submitted to Twilio!");
      } else {
        throw new Error(result.error || "Submission failed");
      }
    } catch (err) {
      setSubmitResult({ success: false, message: err.message });
      showToast("Error: " + err.message, "error");
      // Save as draft so they don't lose progress
      await saveProgress("draft");
    }

    setSubmitting(false);
  };

  const steps10DLC = ["Brand Info", "Contact", "Campaign", "Review"];
  const stepsRCS = ["Brand Info", "Contact", "Campaign", "RCS Profile", "Review"];
  const currentSteps = activeTab === "rcs" ? stepsRCS : steps10DLC;

  const canProceed = () => {
    if (step === 0) return form.legalName && form.entityType && form.ein && form.vertical && form.street && form.city && form.state && form.zip;
    if (step === 1) return form.contactFirstName && form.contactLastName && form.contactEmail && form.contactPhone;
    if (step === 2) return form.useCase && form.sampleMessage1 && form.optInDescription;
    if (step === 3 && activeTab === "rcs") return form.rcsAgentName && form.rcsDescription;
    return true;
  };

  // Check if already submitted
  const isSubmitted = registration?.status === "submitted";

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      color: C.text,
    }}>
      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes toastIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        input:focus, textarea:focus, select:focus { outline: none; border-color: ${C.accent} !important; }
      `}</style>

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

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px" }}>
        {/* Header */}
        <div style={{ marginBottom: 28, animation: "slideUp 0.4s ease both" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.accent4 + "15", border: `1px solid ${C.accent4}33`, borderRadius: 20, padding: "5px 14px", marginBottom: 12 }}>
            <span style={{ fontSize: 14 }}>📋</span>
            <span style={{ color: C.accent4, fontSize: 12, fontWeight: 700 }}>Compliance Registration</span>
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, color: C.text }}>Message Registration</h1>
          <p style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>
            Register your brand for A2P 10DLC messaging and RCS Business Messaging
          </p>
        </div>

        {/* Tab Selector */}
        <div style={{ display: "flex", gap: 4, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 4, marginBottom: 28 }}>
          {[
            { id: "10dlc", label: "10DLC / TCR", emoji: "💬", desc: "Required for SMS/MMS" },
            { id: "rcs", label: "RCS Business", emoji: "✨", desc: "Rich messaging" },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setStep(0); }} style={{
              flex: 1, background: activeTab === tab.id ? C.accent + "15" : "transparent",
              border: activeTab === tab.id ? `1px solid ${C.accent}33` : "1px solid transparent",
              borderRadius: 9, padding: "12px 16px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.2s",
            }}>
              <span style={{ fontSize: 18 }}>{tab.emoji}</span>
              <div style={{ textAlign: "left" }}>
                <div style={{ color: activeTab === tab.id ? C.accent : C.text, fontSize: 14, fontWeight: 700 }}>{tab.label}</div>
                <div style={{ color: C.muted, fontSize: 11 }}>{tab.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Status Banner */}
        {isSubmitted && (
          <div style={{
            background: C.accent3 + "11", border: `1px solid ${C.accent3}33`,
            borderRadius: 12, padding: 20, marginBottom: 24, textAlign: "center",
            animation: "slideUp 0.4s ease both",
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
            <div style={{ color: C.accent3, fontSize: 18, fontWeight: 800 }}>Registration Submitted</div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
              Your {activeTab === "rcs" ? "RCS" : "10DLC"} registration is being reviewed. This typically takes 1-3 business days.
              You'll receive an email once approved.
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 16 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ color: C.warning, fontSize: 12, fontWeight: 700 }}>STATUS</div>
                <div style={{
                  background: C.warning + "22", border: `1px solid ${C.warning}44`,
                  borderRadius: 6, padding: "4px 12px", color: C.warning, fontSize: 13, fontWeight: 700, marginTop: 4,
                }}>⏳ Pending Review</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ color: C.muted, fontSize: 12, fontWeight: 700 }}>SUBMITTED</div>
                <div style={{ color: C.text, fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                  {registration?.updated_at ? new Date(registration.updated_at).toLocaleDateString() : "Today"}
                </div>
              </div>
            </div>
            <button onClick={() => { setStep(0); }} style={{
              marginTop: 16, background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "8px 18px", color: C.muted, cursor: "pointer", fontSize: 12,
            }}>View / Edit Registration</button>
          </div>
        )}

        {/* Step Indicator */}
        {!isSubmitted && <StepIndicator steps={currentSteps} current={step} />}

        {/* Form Steps */}
        {!isSubmitted && (
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 16, padding: 28,
            animation: "fadeIn 0.3s ease",
          }}>

            {/* STEP 0: Brand Info */}
            {step === 0 && (
              <div>
                <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Brand Information</h2>
                <p style={{ color: C.muted, fontSize: 13, margin: "0 0 24px" }}>Legal details about your business as registered with the IRS</p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <FieldGroup label="Legal Business Name" required>
                    <input style={inputStyle} value={form.legalName} onChange={e => update("legalName", e.target.value)} placeholder="Acme Corporation, LLC" />
                  </FieldGroup>
                  <FieldGroup label="DBA (Doing Business As)" hint="Leave blank if same as legal name">
                    <input style={inputStyle} value={form.dba} onChange={e => update("dba", e.target.value)} placeholder="Acme Corp" />
                  </FieldGroup>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <FieldGroup label="Entity Type" required>
                    <select style={selectStyle} value={form.entityType} onChange={e => update("entityType", e.target.value)}>
                      {ENTITY_TYPES.map(et => <option key={et.id} value={et.id}>{et.label}</option>)}
                    </select>
                  </FieldGroup>
                  <FieldGroup label="EIN / Tax ID" required hint="9-digit US federal tax ID (XX-XXXXXXX)">
                    <input style={inputStyle} value={form.ein} onChange={e => update("ein", e.target.value)} placeholder="12-3456789" maxLength={10} />
                  </FieldGroup>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <FieldGroup label="Industry / Vertical" required>
                    <select style={selectStyle} value={form.vertical} onChange={e => update("vertical", e.target.value)}>
                      <option value="">Select industry...</option>
                      {VERTICALS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </FieldGroup>
                  <FieldGroup label="Company Website">
                    <input style={inputStyle} value={form.website} onChange={e => update("website", e.target.value)} placeholder="https://example.com" />
                  </FieldGroup>
                </div>

                <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 16, marginBottom: 8 }}>
                  <div style={{ color: C.muted, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>📍 Business Address</div>
                </div>

                <FieldGroup label="Street Address" required>
                  <input style={inputStyle} value={form.street} onChange={e => update("street", e.target.value)} placeholder="123 Main Street, Suite 100" />
                </FieldGroup>

                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
                  <FieldGroup label="City" required>
                    <input style={inputStyle} value={form.city} onChange={e => update("city", e.target.value)} placeholder="Miami" />
                  </FieldGroup>
                  <FieldGroup label="State" required>
                    <input style={inputStyle} value={form.state} onChange={e => update("state", e.target.value)} placeholder="FL" maxLength={2} />
                  </FieldGroup>
                  <FieldGroup label="ZIP Code" required>
                    <input style={inputStyle} value={form.zip} onChange={e => update("zip", e.target.value)} placeholder="33139" maxLength={10} />
                  </FieldGroup>
                </div>
              </div>
            )}

            {/* STEP 1: Contact Info */}
            {step === 1 && (
              <div>
                <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Authorized Contact</h2>
                <p style={{ color: C.muted, fontSize: 13, margin: "0 0 24px" }}>Person authorized to register on behalf of the business</p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <FieldGroup label="First Name" required>
                    <input style={inputStyle} value={form.contactFirstName} onChange={e => update("contactFirstName", e.target.value)} placeholder="John" />
                  </FieldGroup>
                  <FieldGroup label="Last Name" required>
                    <input style={inputStyle} value={form.contactLastName} onChange={e => update("contactLastName", e.target.value)} placeholder="Doe" />
                  </FieldGroup>
                </div>

                <FieldGroup label="Job Title">
                  <input style={inputStyle} value={form.contactTitle} onChange={e => update("contactTitle", e.target.value)} placeholder="Director of Marketing" />
                </FieldGroup>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <FieldGroup label="Email" required>
                    <input type="email" style={inputStyle} value={form.contactEmail} onChange={e => update("contactEmail", e.target.value)} placeholder="john@example.com" />
                  </FieldGroup>
                  <FieldGroup label="Phone" required>
                    <input style={inputStyle} value={form.contactPhone} onChange={e => update("contactPhone", e.target.value)} placeholder="+15551234567" />
                  </FieldGroup>
                </div>

                <div style={{
                  background: C.accent + "08", border: `1px solid ${C.accent}22`,
                  borderRadius: 10, padding: 14, marginTop: 8,
                }}>
                  <div style={{ color: C.accent, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>ℹ️ Why we need this</div>
                  <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
                    The Campaign Registry (TCR) requires an authorized contact to verify your business identity.
                    This person may be contacted to confirm registration details.
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Campaign Info */}
            {step === 2 && (
              <div>
                <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Campaign Details</h2>
                <p style={{ color: C.muted, fontSize: 13, margin: "0 0 24px" }}>Describe how you'll use messaging</p>

                <FieldGroup label="Primary Use Case" required>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {USE_CASES.map(uc => (
                      <div key={uc.id} onClick={() => update("useCase", uc.id)} style={{
                        background: form.useCase === uc.id ? C.accent + "15" : C.bg,
                        border: `1px solid ${form.useCase === uc.id ? C.accent + "55" : C.border}`,
                        borderRadius: 10, padding: "12px 10px", cursor: "pointer",
                        textAlign: "center", transition: "all 0.2s",
                      }}>
                        <div style={{ fontSize: 22, marginBottom: 4 }}>{uc.emoji}</div>
                        <div style={{ color: form.useCase === uc.id ? C.accent : C.text, fontSize: 12, fontWeight: 700 }}>{uc.label}</div>
                        <div style={{ color: C.dim, fontSize: 10, marginTop: 2 }}>{uc.desc}</div>
                      </div>
                    ))}
                  </div>
                </FieldGroup>

                <FieldGroup label="Use Case Description" required hint="Describe what messages you'll send and why">
                  <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 70 }} value={form.useCaseDescription} onChange={e => update("useCaseDescription", e.target.value)}
                    placeholder="e.g., We send appointment reminders, order confirmations, and promotional offers to customers who have opted in through our website checkout process." />
                </FieldGroup>

                <FieldGroup label="Expected Message Volume">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    {MESSAGE_VOLUME.map(mv => (
                      <div key={mv.id} onClick={() => update("messageVolume", mv.id)} style={{
                        background: form.messageVolume === mv.id ? C.accent + "15" : C.bg,
                        border: `1px solid ${form.messageVolume === mv.id ? C.accent + "55" : C.border}`,
                        borderRadius: 8, padding: "10px 8px", cursor: "pointer",
                        textAlign: "center", transition: "all 0.2s",
                      }}>
                        <div style={{ color: form.messageVolume === mv.id ? C.accent : C.text, fontSize: 13, fontWeight: 700 }}>{mv.label}</div>
                        <div style={{ color: C.dim, fontSize: 10, marginTop: 2 }}>{mv.desc}</div>
                      </div>
                    ))}
                  </div>
                </FieldGroup>

                <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 16, marginBottom: 8 }}>
                  <div style={{ color: C.muted, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>📝 Sample Messages (at least 1 required)</div>
                </div>

                <FieldGroup label="Sample Message 1" required>
                  <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 50 }} value={form.sampleMessage1} onChange={e => update("sampleMessage1", e.target.value)}
                    placeholder="Hi {name}! Your order #1234 has shipped and will arrive by Friday. Track it here: {link}. Reply STOP to opt out." />
                </FieldGroup>
                <FieldGroup label="Sample Message 2">
                  <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 50 }} value={form.sampleMessage2} onChange={e => update("sampleMessage2", e.target.value)}
                    placeholder="🎉 Flash Sale! 20% off everything this weekend only. Use code SAVE20. Shop now: {link}. Reply STOP to unsubscribe." />
                </FieldGroup>
                <FieldGroup label="Sample Message 3">
                  <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 50 }} value={form.sampleMessage3} onChange={e => update("sampleMessage3", e.target.value)} placeholder="Optional additional sample..." />
                </FieldGroup>

                <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 16, marginBottom: 8 }}>
                  <div style={{ color: C.muted, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>✅ Compliance & Consent</div>
                </div>

                <FieldGroup label="How do consumers opt-in?" required hint="Describe how customers give consent to receive messages">
                  <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} value={form.optInDescription} onChange={e => update("optInDescription", e.target.value)}
                    placeholder="e.g., Customers opt in by checking a consent checkbox during our website checkout process. The checkbox reads: 'I agree to receive SMS notifications about my order. Message and data rates may apply. Reply STOP to unsubscribe.'" />
                </FieldGroup>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  {[
                    { key: "hasOptOut", label: "STOP opt-out", desc: "Messages include STOP instructions" },
                    { key: "hasHelp", label: "HELP keyword", desc: "HELP returns support info" },
                    { key: "hasEmbeddedLinks", label: "Contains links", desc: "Messages may include URLs" },
                  ].map(item => (
                    <div key={item.key} onClick={() => update(item.key, !form[item.key])} style={{
                      background: form[item.key] ? C.accent3 + "11" : C.bg,
                      border: `1px solid ${form[item.key] ? C.accent3 + "44" : C.border}`,
                      borderRadius: 8, padding: "10px 12px", cursor: "pointer",
                      textAlign: "center", transition: "all 0.2s",
                    }}>
                      <div style={{ color: form[item.key] ? C.accent3 : C.dim, fontSize: 18, marginBottom: 2 }}>{form[item.key] ? "✅" : "⬜"}</div>
                      <div style={{ color: form[item.key] ? C.text : C.muted, fontSize: 11, fontWeight: 700 }}>{item.label}</div>
                      <div style={{ color: C.dim, fontSize: 10, marginTop: 2 }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 3 (RCS only): RCS Profile */}
            {step === 3 && activeTab === "rcs" && (
              <div>
                <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>RCS Business Profile</h2>
                <p style={{ color: C.muted, fontSize: 13, margin: "0 0 24px" }}>Configure your rich messaging agent profile</p>

                <FieldGroup label="RCS Agent Name" required hint="This appears as the sender name in RCS messages">
                  <input style={inputStyle} value={form.rcsAgentName} onChange={e => update("rcsAgentName", e.target.value)} placeholder="Acme Corp" />
                </FieldGroup>

                <FieldGroup label="Agent Description" required hint="Brief description of your RCS messaging use">
                  <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} value={form.rcsDescription} onChange={e => update("rcsDescription", e.target.value)}
                    placeholder="Acme Corp uses RCS to send order updates, promotions, and customer support messages." />
                </FieldGroup>

                <FieldGroup label="Brand Logo URL" hint="Square image, min 224x224px, PNG or JPEG">
                  <input style={inputStyle} value={form.rcsLogoUrl} onChange={e => update("rcsLogoUrl", e.target.value)} placeholder="https://example.com/logo.png" />
                </FieldGroup>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <FieldGroup label="Brand Color" hint="Primary color for your RCS profile">
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input type="color" value={form.rcsColor} onChange={e => update("rcsColor", e.target.value)}
                        style={{ width: 40, height: 36, border: "none", borderRadius: 6, cursor: "pointer", background: "transparent" }} />
                      <input style={{ ...inputStyle, flex: 1 }} value={form.rcsColor} onChange={e => update("rcsColor", e.target.value)} />
                    </div>
                  </FieldGroup>
                  <FieldGroup label="Website">
                    <input style={inputStyle} value={form.rcsWebsite} onChange={e => update("rcsWebsite", e.target.value)} placeholder="https://example.com" />
                  </FieldGroup>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <FieldGroup label="Privacy Policy URL">
                    <input style={inputStyle} value={form.rcsPrivacyUrl} onChange={e => update("rcsPrivacyUrl", e.target.value)} placeholder="https://example.com/privacy" />
                  </FieldGroup>
                  <FieldGroup label="Terms of Service URL">
                    <input style={inputStyle} value={form.rcsTosUrl} onChange={e => update("rcsTosUrl", e.target.value)} placeholder="https://example.com/terms" />
                  </FieldGroup>
                </div>
              </div>
            )}

            {/* Review Step */}
            {((step === 3 && activeTab === "10dlc") || (step === 4 && activeTab === "rcs")) && (
              <div>
                <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Review & Submit</h2>
                <p style={{ color: C.muted, fontSize: 13, margin: "0 0 24px" }}>Verify your information before submitting</p>

                {[
                  {
                    title: "Brand Information", items: [
                      { label: "Legal Name", value: form.legalName },
                      { label: "DBA", value: form.dba || "—" },
                      { label: "Entity Type", value: ENTITY_TYPES.find(e => e.id === form.entityType)?.label },
                      { label: "EIN", value: form.ein },
                      { label: "Industry", value: form.vertical },
                      { label: "Website", value: form.website || "—" },
                      { label: "Address", value: `${form.street}, ${form.city}, ${form.state} ${form.zip}` },
                    ]
                  },
                  {
                    title: "Contact", items: [
                      { label: "Name", value: `${form.contactFirstName} ${form.contactLastName}` },
                      { label: "Title", value: form.contactTitle || "—" },
                      { label: "Email", value: form.contactEmail },
                      { label: "Phone", value: form.contactPhone },
                    ]
                  },
                  {
                    title: "Campaign", items: [
                      { label: "Use Case", value: USE_CASES.find(u => u.id === form.useCase)?.label },
                      { label: "Volume", value: MESSAGE_VOLUME.find(m => m.id === form.messageVolume)?.label },
                      { label: "Sample Message", value: form.sampleMessage1?.slice(0, 80) + (form.sampleMessage1?.length > 80 ? "..." : "") },
                      { label: "Opt-in Method", value: form.optInDescription?.slice(0, 60) + "..." },
                    ]
                  },
                ].map((section, si) => (
                  <div key={si} style={{
                    background: C.bg, border: `1px solid ${C.border}`,
                    borderRadius: 10, padding: 16, marginBottom: 12,
                  }}>
                    <div style={{ color: C.accent, fontSize: 12, fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>{section.title}</div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {section.items.map((item, ii) => (
                        <div key={ii} style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: C.muted, fontSize: 13 }}>{item.label}</span>
                          <span style={{ color: C.text, fontSize: 13, fontWeight: 600, textAlign: "right", maxWidth: "60%" }}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div style={{
                  background: C.warning + "08", border: `1px solid ${C.warning}22`,
                  borderRadius: 10, padding: 14, marginTop: 4,
                }}>
                  <div style={{ color: C.warning, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>⚠️ Before submitting</div>
                  <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.6 }}>
                    Please verify all information is accurate. Incorrect details can delay approval by weeks.
                    Registration typically takes 1-3 business days. A one-time TCR registration fee of $4 and monthly campaign fee of $10 applies (billed by the carrier).
                  </div>
                </div>

                {submitResult && (
                  <div style={{
                    background: submitResult.success ? C.accent3 + "11" : "#FF000011",
                    border: `1px solid ${submitResult.success ? C.accent3 : "#FF0000"}33`,
                    borderRadius: 10, padding: 14, marginTop: 12,
                  }}>
                    <div style={{ color: submitResult.success ? C.accent3 : "#FF6B6B", fontSize: 13, fontWeight: 700 }}>
                      {submitResult.success ? "✅ " : "❌ "}{submitResult.message}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Navigation Buttons */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
              <div>
                {step > 0 && (
                  <button onClick={() => setStep(step - 1)} style={{
                    background: "transparent", border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "10px 20px", color: C.muted,
                    cursor: "pointer", fontSize: 14,
                  }}>← Back</button>
                )}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => saveProgress("draft")} disabled={saving} style={{
                  background: "transparent", border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: "10px 18px", color: C.muted,
                  cursor: "pointer", fontSize: 13,
                }}>
                  {saving ? "Saving..." : "💾 Save Draft"}
                </button>

                {((step < 3 && activeTab === "10dlc") || (step < 4 && activeTab === "rcs")) ? (
                  <button onClick={() => { saveProgress("draft"); setStep(step + 1); }} disabled={!canProceed()} style={{
                    background: canProceed() ? `linear-gradient(135deg, ${C.accent}, ${C.accent2})` : C.border,
                    border: "none", borderRadius: 8, padding: "10px 24px",
                    color: canProceed() ? "#000" : C.dim, fontWeight: 800,
                    cursor: canProceed() ? "pointer" : "not-allowed", fontSize: 14,
                  }}>
                    Continue →
                  </button>
                ) : (
                  <button onClick={submit} disabled={saving || submitting} style={{
                    background: saving || submitting ? C.border : `linear-gradient(135deg, ${C.accent3}, ${C.accent})`,
                    border: "none", borderRadius: 8, padding: "10px 28px",
                    color: saving || submitting ? C.dim : "#000", fontWeight: 800,
                    cursor: saving || submitting ? "not-allowed" : "pointer", fontSize: 14,
                  }}>
                    {submitting ? "⏳ Submitting to Twilio..." : saving ? "Saving..." : "🚀 Submit Registration"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
