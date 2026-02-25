import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const DEMO_TENANT_ID = "demo-tenant-000";

const C = {
  bg: "#0A0E1A", surface: "#111827", border: "#1e2d45",
  accent: "#00C9FF", accent2: "#E040FB", accent3: "#00E676",
  accent4: "#FF6B35", warning: "#FFD600", text: "#E8F4FD",
  muted: "#6B8BAE", dim: "#3A5068",
};

export default function DemoMode() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [showInAdmin, setShowInAdmin] = useState(true);
  const [demoExists, setDemoExists] = useState(false);

  useEffect(() => {
    checkDemoStatus();
    // Load toggle preference from localStorage
    const pref = localStorage.getItem("engwx_show_demo_in_admin");
    if (pref !== null) setShowInAdmin(pref === "true");
  }, []);

  const checkDemoStatus = async () => {
    try {
      const { data } = await supabase
        .from("contacts").select("id", { count: "exact", head: true })
        .eq("tenant_id", DEMO_TENANT_ID);
      setDemoExists(data !== null);
    } catch {
      // ignore
    }
  };

  const toggleAdminVisibility = (val) => {
    setShowInAdmin(val);
    localStorage.setItem("engwx_show_demo_in_admin", val.toString());
    // Dispatch custom event so other components can listen
    window.dispatchEvent(new CustomEvent("demo-visibility-changed", { detail: { showDemo: val, demoTenantId: DEMO_TENANT_ID } }));
  };

  const seedDemo = async () => {
    if (!window.confirm("This will create a Demo Company tenant and populate it with ~45 contacts, ~28 conversations, ~100+ messages, and 8 campaigns. Real customer data is never touched. Continue?")) return;
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
        setResult({ type: "success", message: `Seeded ${data.results.contacts} contacts, ${data.results.conversations} conversations, ${data.results.messages} messages, ${data.results.campaigns} campaigns under Demo Company tenant` });
        setDemoExists(true);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setResult({ type: "error", message: err.message });
    }
    setLoading(false);
  };

  const clearDemo = async () => {
    if (!window.confirm("This will remove all Demo Company data. Real customer data is never touched. Continue?")) return;
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
        setResult({ type: "success", message: "Demo data cleared! Real customer data untouched." });
        setDemoExists(false);
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
        {demoExists && (
          <span style={{
            background: C.accent3 + "22", border: `1px solid ${C.accent3}44`,
            borderRadius: 4, padding: "2px 8px", fontSize: 10, color: C.accent3, fontWeight: 700,
          }}>ACTIVE</span>
        )}
      </div>
      <p style={{ color: C.muted, fontSize: 13, margin: "0 0 16px", lineHeight: 1.5 }}>
        Creates a dedicated <strong style={{ color: C.accent }}>"Demo Company"</strong> tenant with realistic sample data.
        Real customer data is <strong style={{ color: C.accent3 }}>never touched</strong> — seed and clear as many times as you want.
      </p>

      {/* Admin Visibility Toggle */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: C.bg, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: "12px 16px", marginBottom: 14,
      }}>
        <div>
          <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>Show demo data in Global Admin</div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
            {showInAdmin
              ? "Demo Company data is visible in analytics, tenants, and admin views"
              : "Demo Company data is hidden from admin views — only real customers shown"}
          </div>
        </div>
        <div onClick={() => toggleAdminVisibility(!showInAdmin)} style={{
          width: 44, height: 24, borderRadius: 12,
          background: showInAdmin ? C.accent : C.border,
          cursor: "pointer", position: "relative",
          transition: "background 0.2s",
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: "50%",
            background: "#fff", position: "absolute",
            top: 3, left: showInAdmin ? 23 : 3,
            transition: "left 0.2s",
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          }} />
        </div>
      </div>

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
          🗑 Clear Demo Data
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
        <strong style={{ color: C.muted }}>How it works:</strong> All demo data lives under a "Demo Company" tenant (ID: {DEMO_TENANT_ID}). When you toggle off admin visibility, global analytics and tenant views exclude this tenant. When live customers come aboard, their data is completely separate.
      </div>
    </div>
  );
}
