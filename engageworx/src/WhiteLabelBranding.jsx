import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

// Default EngageWorx theme
const DEFAULT_BRAND = {
  companyName: "EngageWorx",
  tagline: "AI-Powered Engagement",
  logoUrl: "",
  faviconUrl: "",
  primaryColor: "#00C9FF",
  secondaryColor: "#E040FB",
  accentColor: "#00E676",
  bgColor: "#0A0E1A",
  surfaceColor: "#111827",
  borderColor: "#1e2d45",
  textColor: "#E8F4FD",
  mutedColor: "#6B8BAE",
  sidebarStyle: "dark",       // dark, light, branded
  loginBgStyle: "gradient",   // gradient, solid, image
  loginBgImage: "",
  poweredByVisible: true,
  customCss: "",
  customDomain: "",
};

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

function Toggle({ on, onChange, label, desc }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0" }}>
      <div>
        <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{label}</div>
        {desc && <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{desc}</div>}
      </div>
      <div onClick={onChange} style={{
        width: 44, height: 24, borderRadius: 12,
        background: on ? C.accent3 : C.border,
        cursor: "pointer", position: "relative",
        transition: "background 0.2s",
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: "50%",
          background: "#fff", position: "absolute",
          top: 3, left: on ? 23 : 3,
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }} />
      </div>
    </div>
  );
}

function ColorPicker({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)} style={{
          width: 40, height: 36, border: `1px solid ${C.border}`, borderRadius: 8,
          cursor: "pointer", background: "transparent", padding: 2,
        }} />
        <input value={value} onChange={e => onChange(e.target.value)} style={{
          flex: 1, background: C.bg, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 13,
          fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box",
        }} />
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: value, border: `1px solid ${C.border}`,
        }} />
      </div>
    </div>
  );
}

// Preset brand themes
const PRESETS = [
  { name: "EngageWorx Default", primary: "#00C9FF", secondary: "#E040FB", accent: "#00E676", bg: "#0A0E1A", surface: "#111827" },
  { name: "Ocean Blue", primary: "#0EA5E9", secondary: "#6366F1", accent: "#22D3EE", bg: "#0C1222", surface: "#131D35" },
  { name: "Forest Green", primary: "#10B981", secondary: "#34D399", accent: "#059669", bg: "#0A1410", surface: "#0F1F18" },
  { name: "Royal Purple", primary: "#8B5CF6", secondary: "#A78BFA", accent: "#C084FC", bg: "#110D1F", surface: "#1A1330" },
  { name: "Sunset Orange", primary: "#F97316", secondary: "#FB923C", accent: "#FBBF24", bg: "#1A0E08", surface: "#251810" },
  { name: "Rose Pink", primary: "#F43F5E", secondary: "#FB7185", accent: "#FDA4AF", bg: "#1A0A0F", surface: "#25101A" },
  { name: "Slate Minimal", primary: "#94A3B8", secondary: "#64748B", accent: "#CBD5E1", bg: "#0F172A", surface: "#1E293B" },
  { name: "Light Mode", primary: "#2563EB", secondary: "#7C3AED", accent: "#059669", bg: "#F8FAFC", surface: "#FFFFFF" },
];

// Live portal preview
function PortalPreview({ brand }) {
  const isLight = isLightColor(brand.bgColor);
  const textCol = isLight ? "#1a1a2e" : brand.textColor || "#E8F4FD";
  const mutedCol = isLight ? "#64748B" : brand.mutedColor || "#6B8BAE";
  const borderCol = isLight ? "#E2E8F0" : brand.borderColor || "#1e2d45";
  const surfaceCol = brand.surfaceColor || "#111827";

  return (
    <div style={{
      background: brand.bgColor, borderRadius: 12, overflow: "hidden",
      border: `1px solid ${borderCol}`, boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
      fontSize: 10, fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Sidebar */}
      <div style={{ display: "flex", height: 280 }}>
        <div style={{
          width: 56, background: surfaceCol, borderRight: `1px solid ${borderCol}`,
          padding: "10px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        }}>
          {/* Logo */}
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt="logo" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} onError={e => e.target.style.display = "none"} />
          ) : (
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#000", fontSize: 9, fontWeight: 900,
            }}>{(brand.companyName || "EW").slice(0, 2).toUpperCase()}</div>
          )}

          {/* Nav icons */}
          {["📊", "💬", "📢", "👥", "⚡", "📈", "⚙️"].map((icon, i) => (
            <div key={i} style={{
              width: 28, height: 28, borderRadius: 6,
              background: i === 0 ? brand.primaryColor + "22" : "transparent",
              border: i === 0 ? `1px solid ${brand.primaryColor}44` : "1px solid transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, cursor: "pointer",
            }}>{icon}</div>
          ))}

          {brand.poweredByVisible && (
            <div style={{ marginTop: "auto", fontSize: 6, color: mutedCol, textAlign: "center", lineHeight: 1.2 }}>
              Powered by<br /><span style={{ color: brand.primaryColor, fontWeight: 700 }}>EngageWorx</span>
            </div>
          )}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: 12 }}>
          {/* Header */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ color: textCol, fontSize: 13, fontWeight: 900 }}>{brand.companyName || "Dashboard"}</div>
            <div style={{ color: mutedCol, fontSize: 8 }}>{brand.tagline || "Welcome back"}</div>
          </div>

          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
            {[
              { label: "Messages", val: "12.4K", color: brand.primaryColor },
              { label: "Contacts", val: "3,847", color: brand.secondaryColor },
              { label: "Revenue", val: "$48.2K", color: brand.accentColor },
            ].map((kpi, i) => (
              <div key={i} style={{
                background: surfaceCol, border: `1px solid ${borderCol}`,
                borderRadius: 6, padding: "8px 6px",
              }}>
                <div style={{ color: kpi.color, fontSize: 14, fontWeight: 900 }}>{kpi.val}</div>
                <div style={{ color: mutedCol, fontSize: 7 }}>{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Chart placeholder */}
          <div style={{
            background: surfaceCol, border: `1px solid ${borderCol}`,
            borderRadius: 6, padding: 8, marginBottom: 8,
          }}>
            <div style={{ color: textCol, fontSize: 9, fontWeight: 700, marginBottom: 6 }}>Message Volume</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 50 }}>
              {[40, 65, 50, 80, 60, 90, 75, 55, 85, 70, 95, 80].map((h, i) => (
                <div key={i} style={{
                  flex: 1, height: `${h}%`,
                  background: i === 11 ? brand.primaryColor : brand.primaryColor + "33",
                  borderRadius: "2px 2px 0 0",
                }} />
              ))}
            </div>
          </div>

          {/* Action button */}
          <div style={{
            background: `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
            borderRadius: 6, padding: "6px 10px", textAlign: "center",
            color: "#000", fontSize: 9, fontWeight: 800,
          }}>+ New Campaign</div>
        </div>
      </div>
    </div>
  );
}

// Login page preview
function LoginPreview({ brand }) {
  return (
    <div style={{
      background: brand.loginBgStyle === "gradient"
        ? `linear-gradient(135deg, ${brand.bgColor}, ${brand.primaryColor}15, ${brand.secondaryColor}10)`
        : brand.bgColor,
      borderRadius: 12, overflow: "hidden",
      border: `1px solid ${brand.borderColor || C.border}`,
      boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
      padding: 20, height: 280,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        background: brand.surfaceColor || C.surface,
        border: `1px solid ${brand.borderColor || C.border}`,
        borderRadius: 12, padding: 20, width: "100%", maxWidth: 200,
        textAlign: "center",
      }}>
        {brand.logoUrl ? (
          <img src={brand.logoUrl} alt="logo" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover", marginBottom: 8 }} onError={e => e.target.style.display = "none"} />
        ) : (
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#000", fontSize: 14, fontWeight: 900, margin: "0 auto 8px",
          }}>{(brand.companyName || "EW").slice(0, 2).toUpperCase()}</div>
        )}
        <div style={{ color: brand.textColor || C.text, fontSize: 12, fontWeight: 800, marginBottom: 2 }}>
          {brand.companyName || "EngageWorx"}
        </div>
        <div style={{ color: brand.mutedColor || C.muted, fontSize: 8, marginBottom: 12 }}>
          {brand.tagline || "Sign in to your account"}
        </div>

        {/* Fake inputs */}
        {["Email", "Password"].map(field => (
          <div key={field} style={{
            background: brand.bgColor, border: `1px solid ${brand.borderColor || C.border}`,
            borderRadius: 6, padding: "5px 8px", marginBottom: 6,
            color: brand.mutedColor || C.dim, fontSize: 8, textAlign: "left",
          }}>{field}</div>
        ))}

        <div style={{
          background: `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
          borderRadius: 6, padding: "6px 10px",
          color: "#000", fontSize: 9, fontWeight: 800, marginTop: 4,
        }}>Sign In</div>

        {brand.poweredByVisible && (
          <div style={{ marginTop: 10, fontSize: 7, color: brand.mutedColor || C.dim }}>
            Powered by <span style={{ color: brand.primaryColor, fontWeight: 700 }}>EngageWorx</span>
          </div>
        )}
      </div>
    </div>
  );
}

function isLightColor(hex) {
  if (!hex) return false;
  const c = hex.replace("#", "");
  const r = parseInt(c.substr(0, 2), 16);
  const g = parseInt(c.substr(2, 2), 16);
  const b = parseInt(c.substr(4, 2), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

export default function WhiteLabelBranding({ tenantId }) {
  const [brand, setBrand] = useState({ ...DEFAULT_BRAND });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState("colors");
  const [previewMode, setPreviewMode] = useState("portal"); // portal or login
  const [brandId, setBrandId] = useState(null);
  const fileRef = useRef();

  useEffect(() => { loadBranding(); }, [tenantId]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const update = (key, value) => setBrand(prev => ({ ...prev, [key]: value }));

  const loadBranding = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("tenant_branding")
        .select("*")
        .limit(1)
        .single();
      if (data) {
        setBrandId(data.id);
        if (data.branding) setBrand(prev => ({ ...prev, ...data.branding }));
      }
    } catch (err) { /* No branding yet */ }
    setLoading(false);
  };

  const saveBranding = async () => {
    setSaving(true);
    try {
      if (brandId) {
        await supabase.from("tenant_branding")
          .update({ branding: brand, updated_at: new Date().toISOString() })
          .eq("id", brandId);
      } else {
        const { data } = await supabase.from("tenant_branding")
          .insert({ tenant_id: tenantId || null, branding: brand })
          .select()
          .single();
        if (data) setBrandId(data.id);
      }
      showToast("Branding saved! Changes will apply on next page load.");
    } catch (err) {
      showToast("Error: " + err.message, "error");
    }
    setSaving(false);
  };

  const resetToDefault = () => {
    if (window.confirm("Reset all branding to EngageWorx defaults?")) {
      setBrand({ ...DEFAULT_BRAND });
      showToast("Reset to defaults — save to apply");
    }
  };

  const applyPreset = (preset) => {
    setBrand(prev => ({
      ...prev,
      primaryColor: preset.primary,
      secondaryColor: preset.secondary,
      accentColor: preset.accent,
      bgColor: preset.bg,
      surfaceColor: preset.surface,
      borderColor: preset.bg === "#F8FAFC" ? "#E2E8F0" : "#1e2d45",
      textColor: preset.bg === "#F8FAFC" ? "#1E293B" : "#E8F4FD",
      mutedColor: preset.bg === "#F8FAFC" ? "#64748B" : "#6B8BAE",
    }));
    showToast(`Applied "${preset.name}" theme`);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      update("logoUrl", ev.target.result);
      showToast("Logo uploaded — save to apply");
    };
    reader.readAsDataURL(file);
  };

  const inputStyle = {
    width: "100%", background: C.bg, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: "10px 14px", color: C.text, fontSize: 14,
    boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", outline: "none",
  };

  const tabs = [
    { id: "colors", label: "Colors & Theme", icon: "🎨" },
    { id: "identity", label: "Brand Identity", icon: "🏢" },
    { id: "layout", label: "Layout & Login", icon: "📐" },
    { id: "advanced", label: "Advanced", icon: "⚙️" },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted }}>
        Loading branding settings...
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      color: C.text,
    }}>
      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes toastIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        input:focus, textarea:focus, select:focus { outline: none; border-color: ${C.accent} !important; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 2000,
          background: toast.type === "error" ? "#FF000022" : C.accent3 + "22",
          border: `1px solid ${toast.type === "error" ? "#FF000044" : C.accent3 + "44"}`,
          borderRadius: 10, padding: "12px 20px",
          color: toast.type === "error" ? "#FF6B6B" : C.accent3,
          fontSize: 14, fontWeight: 600, animation: "toastIn 0.3s ease",
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
        }}>
          {toast.type === "error" ? "❌ " : "✅ "}{toast.msg}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, animation: "slideUp 0.4s ease both" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.accent2 + "15", border: `1px solid ${C.accent2}33`, borderRadius: 20, padding: "5px 14px", marginBottom: 12 }}>
              <span style={{ fontSize: 14 }}>🎨</span>
              <span style={{ color: C.accent2, fontSize: 12, fontWeight: 700 }}>White-Label</span>
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, color: C.text }}>Brand Customization</h1>
            <p style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>Make the platform yours — customize colors, logo, and branding for your tenants</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={resetToDefault} style={{
              background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "10px 18px", color: C.muted,
              cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}>↺ Reset</button>
            <button onClick={saveBranding} disabled={saving} style={{
              background: saving ? C.border : `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
              border: "none", borderRadius: 10, padding: "12px 28px",
              color: saving ? C.muted : "#000", fontWeight: 800, cursor: saving ? "not-allowed" : "pointer",
              fontSize: 14,
            }}>
              {saving ? "Saving..." : "💾 Save Branding"}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>
          {/* Left: Settings */}
          <div>
            {/* Tab Nav */}
            <div style={{
              display: "flex", gap: 4, background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: 4, marginBottom: 20, animation: "slideUp 0.4s ease 0.05s both",
            }}>
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                  flex: 1, background: activeTab === tab.id ? C.accent + "15" : "transparent",
                  border: activeTab === tab.id ? `1px solid ${C.accent}33` : "1px solid transparent",
                  borderRadius: 9, padding: "10px 12px", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  transition: "all 0.2s", fontSize: 12,
                  color: activeTab === tab.id ? C.accent : C.muted, fontWeight: 700,
                }}>
                  <span>{tab.icon}</span> {tab.label}
                </button>
              ))}
            </div>

            {/* Colors & Theme Tab */}
            {activeTab === "colors" && (
              <div style={{ animation: "slideUp 0.3s ease both" }}>
                {/* Presets */}
                <div style={{
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: 20, marginBottom: 16,
                }}>
                  <div style={{ color: C.text, fontSize: 15, fontWeight: 800, marginBottom: 12 }}>🎭 Theme Presets</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    {PRESETS.map((p, i) => (
                      <div key={i} onClick={() => applyPreset(p)} style={{
                        background: p.bg, border: `1px solid ${C.border}`,
                        borderRadius: 8, padding: 10, cursor: "pointer",
                        textAlign: "center", transition: "all 0.2s",
                      }}>
                        <div style={{ display: "flex", justifyContent: "center", gap: 3, marginBottom: 6 }}>
                          {[p.primary, p.secondary, p.accent].map((c, ci) => (
                            <div key={ci} style={{ width: 12, height: 12, borderRadius: "50%", background: c }} />
                          ))}
                        </div>
                        <div style={{ color: p.bg === "#F8FAFC" ? "#334155" : "#E8F4FD", fontSize: 9, fontWeight: 700 }}>{p.name}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Custom Colors */}
                <div style={{
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: 20,
                }}>
                  <div style={{ color: C.text, fontSize: 15, fontWeight: 800, marginBottom: 14 }}>🎨 Custom Colors</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                    <ColorPicker label="Primary Color" value={brand.primaryColor} onChange={v => update("primaryColor", v)} />
                    <ColorPicker label="Secondary Color" value={brand.secondaryColor} onChange={v => update("secondaryColor", v)} />
                    <ColorPicker label="Accent Color" value={brand.accentColor} onChange={v => update("accentColor", v)} />
                    <ColorPicker label="Background" value={brand.bgColor} onChange={v => update("bgColor", v)} />
                    <ColorPicker label="Surface / Cards" value={brand.surfaceColor} onChange={v => update("surfaceColor", v)} />
                    <ColorPicker label="Borders" value={brand.borderColor} onChange={v => update("borderColor", v)} />
                    <ColorPicker label="Text Color" value={brand.textColor} onChange={v => update("textColor", v)} />
                    <ColorPicker label="Muted Text" value={brand.mutedColor} onChange={v => update("mutedColor", v)} />
                  </div>
                </div>
              </div>
            )}

            {/* Brand Identity Tab */}
            {activeTab === "identity" && (
              <div style={{ animation: "slideUp 0.3s ease both" }}>
                <div style={{
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: 20, marginBottom: 16,
                }}>
                  <div style={{ color: C.text, fontSize: 15, fontWeight: 800, marginBottom: 14 }}>🏢 Company Info</div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Company Name</label>
                    <input style={inputStyle} value={brand.companyName} onChange={e => update("companyName", e.target.value)} placeholder="Your Company Name" />
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Tagline</label>
                    <input style={inputStyle} value={brand.tagline} onChange={e => update("tagline", e.target.value)} placeholder="AI-Powered Engagement" />
                  </div>
                </div>

                <div style={{
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: 20,
                }}>
                  <div style={{ color: C.text, fontSize: 15, fontWeight: 800, marginBottom: 14 }}>🖼️ Logo & Favicon</div>

                  {/* Logo upload */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Logo</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{
                        width: 64, height: 64, borderRadius: 12,
                        background: brand.logoUrl ? "transparent" : `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
                        border: `1px solid ${C.border}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        overflow: "hidden",
                      }}>
                        {brand.logoUrl ? (
                          <img src={brand.logoUrl} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span style={{ color: "#000", fontSize: 20, fontWeight: 900 }}>{(brand.companyName || "EW").slice(0, 2).toUpperCase()}</span>
                        )}
                      </div>
                      <div>
                        <button onClick={() => fileRef.current?.click()} style={{
                          background: C.accent + "22", border: `1px solid ${C.accent}44`,
                          borderRadius: 8, padding: "8px 14px", color: C.accent,
                          fontWeight: 700, cursor: "pointer", fontSize: 12, marginBottom: 4,
                          display: "block",
                        }}>Upload Logo</button>
                        <div style={{ color: C.dim, fontSize: 10 }}>Square, min 128x128px. PNG, JPG, or SVG.</div>
                      </div>
                    </div>
                    {brand.logoUrl && (
                      <button onClick={() => update("logoUrl", "")} style={{
                        background: "transparent", border: "none", color: "#FF6B6B",
                        fontSize: 11, cursor: "pointer", marginTop: 6,
                      }}>✕ Remove logo</button>
                    )}
                  </div>

                  {/* Logo URL alternative */}
                  <div>
                    <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Or use a Logo URL</label>
                    <input style={inputStyle} value={brand.logoUrl && !brand.logoUrl.startsWith("data:") ? brand.logoUrl : ""} onChange={e => update("logoUrl", e.target.value)} placeholder="https://example.com/logo.png" />
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Favicon URL</label>
                    <input style={inputStyle} value={brand.faviconUrl} onChange={e => update("faviconUrl", e.target.value)} placeholder="https://example.com/favicon.ico" />
                    <div style={{ color: C.dim, fontSize: 10, marginTop: 4 }}>The small icon shown in browser tabs. Must be .ico or .png.</div>
                  </div>
                </div>
              </div>
            )}

            {/* Layout & Login Tab */}
            {activeTab === "layout" && (
              <div style={{ animation: "slideUp 0.3s ease both" }}>
                <div style={{
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: 20, marginBottom: 16,
                }}>
                  <div style={{ color: C.text, fontSize: 15, fontWeight: 800, marginBottom: 14 }}>📐 Sidebar Style</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {[
                      { id: "dark", label: "Dark", desc: "Default dark sidebar", color: "#111827" },
                      { id: "light", label: "Light", desc: "Light sidebar", color: "#F1F5F9" },
                      { id: "branded", label: "Branded", desc: "Uses your primary color", color: brand.primaryColor },
                    ].map(s => (
                      <div key={s.id} onClick={() => update("sidebarStyle", s.id)} style={{
                        background: brand.sidebarStyle === s.id ? C.accent + "15" : C.bg,
                        border: `1px solid ${brand.sidebarStyle === s.id ? C.accent + "55" : C.border}`,
                        borderRadius: 10, padding: 12, cursor: "pointer", textAlign: "center",
                      }}>
                        <div style={{
                          width: 24, height: 40, borderRadius: 4,
                          background: s.color, border: `1px solid ${C.border}`,
                          margin: "0 auto 8px",
                        }} />
                        <div style={{ color: brand.sidebarStyle === s.id ? C.accent : C.text, fontSize: 12, fontWeight: 700 }}>{s.label}</div>
                        <div style={{ color: C.dim, fontSize: 9, marginTop: 2 }}>{s.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: 20,
                }}>
                  <div style={{ color: C.text, fontSize: 15, fontWeight: 800, marginBottom: 14 }}>🔐 Login Page Style</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
                    {[
                      { id: "gradient", label: "Gradient", desc: "Subtle gradient background" },
                      { id: "solid", label: "Solid", desc: "Flat background color" },
                      { id: "image", label: "Custom Image", desc: "Your background image" },
                    ].map(s => (
                      <div key={s.id} onClick={() => update("loginBgStyle", s.id)} style={{
                        background: brand.loginBgStyle === s.id ? C.accent + "15" : C.bg,
                        border: `1px solid ${brand.loginBgStyle === s.id ? C.accent + "55" : C.border}`,
                        borderRadius: 8, padding: "10px 8px", cursor: "pointer", textAlign: "center",
                      }}>
                        <div style={{ color: brand.loginBgStyle === s.id ? C.accent : C.text, fontSize: 11, fontWeight: 700 }}>{s.label}</div>
                        <div style={{ color: C.dim, fontSize: 9, marginTop: 2 }}>{s.desc}</div>
                      </div>
                    ))}
                  </div>

                  {brand.loginBgStyle === "image" && (
                    <div>
                      <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Background Image URL</label>
                      <input style={inputStyle} value={brand.loginBgImage} onChange={e => update("loginBgImage", e.target.value)} placeholder="https://example.com/bg.jpg" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Advanced Tab */}
            {activeTab === "advanced" && (
              <div style={{ animation: "slideUp 0.3s ease both" }}>
                <div style={{
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: 20, marginBottom: 16,
                }}>
                  <div style={{ color: C.text, fontSize: 15, fontWeight: 800, marginBottom: 14 }}>🌐 Custom Domain</div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Custom Domain</label>
                    <input style={inputStyle} value={brand.customDomain} onChange={e => update("customDomain", e.target.value)} placeholder="app.yourcompany.com" />
                    <div style={{ color: C.dim, fontSize: 10, marginTop: 4 }}>
                      Point a CNAME record to your Vercel deployment. Contact support for SSL setup.
                    </div>
                  </div>
                </div>

                <div style={{
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: 20, marginBottom: 16,
                }}>
                  <div style={{ color: C.text, fontSize: 15, fontWeight: 800, marginBottom: 14 }}>⚙️ Branding Options</div>
                  <Toggle
                    on={brand.poweredByVisible}
                    onChange={() => update("poweredByVisible", !brand.poweredByVisible)}
                    label="Show 'Powered by EngageWorx'"
                    desc="Display attribution in sidebar and login page"
                  />
                </div>

                <div style={{
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: 20,
                }}>
                  <div style={{ color: C.text, fontSize: 15, fontWeight: 800, marginBottom: 14 }}>💅 Custom CSS</div>
                  <textarea
                    style={{ ...inputStyle, resize: "vertical", minHeight: 120, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.6 }}
                    value={brand.customCss}
                    onChange={e => update("customCss", e.target.value)}
                    placeholder={`/* Custom CSS overrides */\n.sidebar { border-right: 2px solid gold; }\n.btn-primary { border-radius: 20px; }`}
                  />
                  <div style={{ color: C.dim, fontSize: 10, marginTop: 4 }}>Advanced: inject custom CSS for fine-grained control. Use with caution.</div>
                </div>

                {/* Export / Import */}
                <div style={{
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: 20, marginTop: 16,
                }}>
                  <div style={{ color: C.text, fontSize: 15, fontWeight: 800, marginBottom: 14 }}>📦 Export / Import</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => {
                      const blob = new Blob([JSON.stringify(brand, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${brand.companyName || "brand"}-theme.json`;
                      a.click();
                      showToast("Theme exported!");
                    }} style={{
                      flex: 1, background: C.accent + "22", border: `1px solid ${C.accent}44`,
                      borderRadius: 8, padding: "10px 14px", color: C.accent,
                      fontWeight: 700, cursor: "pointer", fontSize: 12,
                    }}>📤 Export Theme</button>

                    <button onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = ".json";
                      input.onchange = (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          try {
                            const imported = JSON.parse(ev.target.result);
                            setBrand(prev => ({ ...prev, ...imported }));
                            showToast("Theme imported — save to apply!");
                          } catch { showToast("Invalid theme file", "error"); }
                        };
                        reader.readAsText(file);
                      };
                      input.click();
                    }} style={{
                      flex: 1, background: "transparent", border: `1px solid ${C.border}`,
                      borderRadius: 8, padding: "10px 14px", color: C.muted,
                      fontWeight: 700, cursor: "pointer", fontSize: 12,
                    }}>📥 Import Theme</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Live Preview */}
          <div style={{ position: "sticky", top: 24, animation: "slideUp 0.5s ease 0.1s both" }}>
            {/* Preview toggle */}
            <div style={{
              display: "flex", gap: 4, background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: 3, marginBottom: 12,
            }}>
              {[
                { id: "portal", label: "Portal View" },
                { id: "login", label: "Login Page" },
              ].map(pm => (
                <button key={pm.id} onClick={() => setPreviewMode(pm.id)} style={{
                  flex: 1, background: previewMode === pm.id ? C.accent + "15" : "transparent",
                  border: previewMode === pm.id ? `1px solid ${C.accent}33` : "1px solid transparent",
                  borderRadius: 8, padding: "6px 10px", cursor: "pointer",
                  color: previewMode === pm.id ? C.accent : C.muted, fontSize: 11, fontWeight: 700,
                }}>{pm.label}</button>
              ))}
            </div>

            <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, textAlign: "center" }}>
              Live Preview
            </div>

            {previewMode === "portal" ? (
              <PortalPreview brand={brand} />
            ) : (
              <LoginPreview brand={brand} />
            )}

            {/* Color summary */}
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: 14, marginTop: 12,
            }}>
              <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Active Palette</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {[
                  { label: "Primary", color: brand.primaryColor },
                  { label: "Secondary", color: brand.secondaryColor },
                  { label: "Accent", color: brand.accentColor },
                  { label: "BG", color: brand.bgColor },
                  { label: "Surface", color: brand.surfaceColor },
                  { label: "Text", color: brand.textColor },
                ].map((c, i) => (
                  <div key={i} style={{ textAlign: "center" }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 6,
                      background: c.color, border: `1px solid ${C.border}`,
                    }} />
                    <div style={{ fontSize: 7, color: C.dim, marginTop: 2 }}>{c.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Integration note */}
            <div style={{
              background: C.accent + "08", border: `1px solid ${C.accent}22`,
              borderRadius: 10, padding: 12, marginTop: 12,
            }}>
              <div style={{ color: C.accent, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>ℹ️ How it works</div>
              <div style={{ color: C.muted, fontSize: 10, lineHeight: 1.5 }}>
                Saved branding is loaded when the portal starts. Colors override the default theme.
                Each tenant can have their own branding, making the platform look like their own product.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
