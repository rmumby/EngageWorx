import { useState } from "react";
import DemoMode from './DemoMode';

const C = {
  bg: "#0A0E1A", surface: "#111827", border: "#1e2d45",
  accent: "#00C9FF", accent2: "#E040FB", accent3: "#00E676",
  accent4: "#FF6B35", warning: "#FFD600", text: "#E8F4FD",
  muted: "#6B8BAE", dim: "#3A5068",
};

export default function DemoMode() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const seedDemo = async () => {
    if (!window.confirm("This will add ~45 contacts, ~28 conversations, ~100+ messages, and 8 campaigns to make the portal look populated. Continue?")) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/seed-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed" }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ type: "success", message: `Seeded ${data.results.contacts} contacts, ${data.results.conversations} conversations, ${data.results.messages} messages, ${data.results.campaigns} campaigns` });
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setResult({ type: "error", message: err.message });
    }
    setLoading(false);
  };

  const clearDemo = async () => {
    if (!window.confirm("⚠️ This will DELETE all contacts, conversations, messages, and campaigns. This cannot be undone. Are you sure?")) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/seed-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ type: "success", message: "All demo data cleared!" });
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setResult({ type: "error", message: err.message });
    }
    setLoading(false);
  };

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 14, padding: 24, marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 22 }}>🎭</span>
        <h3 style={{ color: C.text, fontSize: 17, fontWeight: 800, margin: 0 }}>Demo Mode</h3>
      </div>
      <p style={{ color: C.muted, fontSize: 13, margin: "0 0 16px", lineHeight: 1.5 }}>
        Populate the portal with realistic sample data for demos and presentations.
        This adds contacts, conversations, messages, and campaigns so every page looks alive.
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <button onClick={seedDemo} disabled={loading} style={{
          background: loading ? C.border : `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
          border: "none", borderRadius: 8, padding: "10px 20px",
          color: loading ? C.dim : "#000", fontWeight: 800, cursor: loading ? "not-allowed" : "pointer",
          fontSize: 13, flex: 1,
        }}>
          {loading ? "⏳ Working..." : "🚀 Seed Demo Data"}
        </button>
        <button onClick={clearDemo} disabled={loading} style={{
          background: loading ? C.border : "#FF000015",
          border: `1px solid ${loading ? C.border : "#FF000033"}`,
          borderRadius: 8, padding: "10px 20px",
          color: loading ? C.dim : "#FF6B6B", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
          fontSize: 13,
        }}>
          🗑 Clear All Data
        </button>
      </div>

      {result && (
        <div style={{
          background: result.type === "success" ? C.accent3 + "11" : "#FF000011",
          border: `1px solid ${result.type === "success" ? C.accent3 : "#FF0000"}33`,
          borderRadius: 8, padding: 12,
          color: result.type === "success" ? C.accent3 : "#FF6B6B",
          fontSize: 13, fontWeight: 600,
        }}>
          {result.type === "success" ? "✅ " : "❌ "}{result.message}
        </div>
      )}

      <div style={{ marginTop: 12, color: C.dim, fontSize: 11, lineHeight: 1.5 }}>
        <strong style={{ color: C.muted }}>What gets seeded:</strong> ~45 contacts with names, phones, emails & tags • ~28 conversations with varied intents & sentiments • ~100+ messages (customer, bot & agent) • 8 campaigns (sent, draft, sending) with AI-generated content
      </div>
    </div>
  );
}
