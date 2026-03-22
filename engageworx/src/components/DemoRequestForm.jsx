// src/components/DemoRequestForm.jsx
// Drop this into your LandingPage contact section
// Replace your existing contact form OR add this as the primary CTA

import { useState } from "react";

const PACKAGES = ["Not sure yet", "Starter $99/mo", "Growth $249/mo", "Pro $499/mo", "Enterprise"];
const USE_CASES = ["Restaurant / Hospitality", "Healthcare", "Retail / E-commerce", "Professional Services", "Agency / Reseller", "Other"];

export default function DemoRequestForm({ onSuccess }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", useCase: "", package: "", message: "" });
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [result, setResult] = useState(null);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name || !form.email) return;
    setStatus("loading");

    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          source: "Website Demo Request",
          message: `Use case: ${form.useCase}\nPackage interest: ${form.package}\n\n${form.message}`,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResult(data.classification);
        setStatus("success");
        onSuccess?.();
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div style={wrapStyle}>
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>✅</div>
          <h3 style={{ color: "#f1f5f9", fontSize: "22px", fontWeight: 800, margin: "0 0 8px" }}>
            Got it, {form.name.split(" ")[0]}!
          </h3>
          <p style={{ color: "#94a3b8", fontSize: "15px", margin: "0 0 24px", lineHeight: 1.6 }}>
            We'll be in touch within a few hours. In the meantime, here's what we think you need:
          </p>
          <a href="https://calendly.com/rob-engwx/30min" target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-block", background: "linear-gradient(135deg, #a855f7, #6366f1)", color: "#fff", textDecoration: "none", padding: "12px 28px", borderRadius: "8px", fontWeight: 700, fontSize: "14px", marginBottom: "24px" }}>
            📅 Book a 30-min call now →
          </a>
          {result && (
            <div style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "12px", padding: "20px", textAlign: "left" }}>
              <div style={{ fontSize: "12px", color: "#6366f1", fontWeight: 700, letterSpacing: "0.06em", marginBottom: "12px" }}>YOUR SUGGESTED FIT</div>
              <div style={{ color: "#e2e8f0", fontSize: "14px", lineHeight: 1.7 }}>
                <div>📦 <strong>Package:</strong> {result.package || result.estimated_package}</div>
                <div>💡 <strong>Summary:</strong> {result.summary}</div>
                <div>⚡ <strong>Next:</strong> {result.next_action || result.suggested_next_action}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <div style={{ marginBottom: "28px" }}>
        <h2 style={{ color: "#f1f5f9", fontSize: "26px", fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
          Book a Demo
        </h2>
        <p style={{ color: "#64748b", fontSize: "14px", margin: 0 }}>
          No sales pressure. We'll show you the platform and answer your questions.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        <div>
          <label style={labelStyle}>Full Name *</label>
          <input style={inputStyle} placeholder="Jane Smith" value={form.name} onChange={set("name")} />
        </div>
        <div>
          <label style={labelStyle}>Work Email *</label>
          <input style={inputStyle} type="email" placeholder="jane@company.com" value={form.email} onChange={set("email")} />
        </div>
        <div>
          <label style={labelStyle}>Phone</label>
          <input style={inputStyle} placeholder="+1 (305) 000-0000" value={form.phone} onChange={set("phone")} />
        </div>
        <div>
          <label style={labelStyle}>Company</label>
          <input style={inputStyle} placeholder="Acme Corp" value={form.company} onChange={set("company")} />
        </div>
        <div>
          <label style={labelStyle}>Industry / Use Case</label>
          <select style={inputStyle} value={form.useCase} onChange={set("useCase")}>
            <option value="">Select one...</option>
            {USE_CASES.map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Package Interest</label>
          <select style={inputStyle} value={form.package} onChange={set("package")}>
            <option value="">Select one...</option>
            {PACKAGES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <label style={labelStyle}>Anything else we should know?</label>
        <textarea style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
          placeholder="Tell us about your current setup, team size, or specific channels you need..."
          value={form.message} onChange={set("message")} />
      </div>

      <button
        onClick={handleSubmit}
        disabled={status === "loading" || !form.name || !form.email}
        style={{
          width: "100%", padding: "14px", borderRadius: "10px", border: "none",
          background: status === "loading" ? "rgba(99,102,241,0.5)" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
          color: "#fff", fontWeight: 800, fontSize: "15px", cursor: status === "loading" ? "wait" : "pointer",
          letterSpacing: "0.01em", transition: "opacity 0.2s",
        }}>
        {status === "loading" ? "Sending..." : "Request My Demo →"}
      </button>

      {status === "error" && (
        <p style={{ color: "#ef4444", fontSize: "13px", textAlign: "center", marginTop: "12px" }}>
          Something went wrong. Email us directly at hello@engwx.com
        </p>
      )}

      <p style={{ color: "#334155", fontSize: "11px", textAlign: "center", marginTop: "14px" }}>
        No spam. We'll contact you within 4 business hours.
      </p>
    </div>
  );
}

const wrapStyle = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "16px",
  padding: "32px",
  maxWidth: "620px",
  width: "100%",
  fontFamily: "'DM Sans', sans-serif",
};

const labelStyle = {
  display: "block",
  fontSize: "11px",
  fontWeight: 700,
  color: "#475569",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  marginBottom: "5px",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#f1f5f9",
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};
