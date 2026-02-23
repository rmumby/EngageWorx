import { useState } from "react";

const COLORS = {
  bg: "#0A0E1A",
  surface: "#111827",
  surfaceAlt: "#1a2235",
  border: "#1e2d45",
  accent: "#00C9FF",
  accent2: "#E040FB",
  accent3: "#00E676",
  accent4: "#FF6B35",
  text: "#E8F4FD",
  muted: "#6B8BAE",
  dim: "#3A5068",
};

const EXAMPLES = [
  "Send a promo to customers who bought running shoes in the last 90 days but haven't opened our last 3 messages. Try WhatsApp first, fall back to SMS.",
  "Re-engage customers who signed up over 6 months ago but haven't purchased. Offer 20% off via email, follow up with SMS after 2 days if no open.",
  "Send a birthday message to all contacts with a birthday this week across all channels they prefer.",
  "Alert VIP customers about our flash sale starting tomorrow — use RCS if available, otherwise WhatsApp. Send at their local 10am.",
  "Win back churned customers who haven't engaged in 60 days. Start gentle with email, escalate to SMS after 3 days.",
];

function Badge({ children, color }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    }}>{children}</span>
  );
}

function CampaignPreview({ campaign }) {
  if (!campaign) return null;

  const channelColors = {
    WhatsApp: "#25D366", SMS: COLORS.accent, RCS: COLORS.accent3,
    Email: COLORS.accent4, MMS: "#7C4DFF", Voice: COLORS.accent2,
  };

  return (
    <div style={{
      background: COLORS.surface, border: `1px solid ${COLORS.accent}44`,
      borderRadius: 16, padding: 28, marginTop: 24,
      boxShadow: `0 0 40px ${COLORS.accent}15`,
      animation: "fadeIn 0.4s ease",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 20 }}>✨</span>
            <span style={{ color: COLORS.accent, fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: 1 }}>AI Generated Campaign</span>
          </div>
          <h2 style={{ color: COLORS.text, margin: 0, fontSize: 22, fontWeight: 800 }}>{campaign.name}</h2>
        </div>
        <Badge color={COLORS.accent3}>Ready to Launch</Badge>
      </div>

      {/* Campaign Overview */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Est. Audience", value: campaign.estimatedAudience, icon: "👥" },
          { label: "Channels", value: campaign.channels?.join(" → "), icon: "📡" },
          { label: "Send Time", value: campaign.sendTime, icon: "⏰" },
          { label: "Est. Revenue", value: campaign.estimatedRevenue, icon: "💰" },
        ].map(s => (
          <div key={s.label} style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 18, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 15 }}>{s.value}</div>
            <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Audience Segment */}
      <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ color: COLORS.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>🎯 Audience Segment</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {campaign.audienceFilters?.map((f, i) => (
            <span key={i} style={{ background: COLORS.accent + "15", border: `1px solid ${COLORS.accent}33`, borderRadius: 6, padding: "5px 12px", color: COLORS.accent, fontSize: 12 }}>
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Channel Sequence */}
      <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ color: COLORS.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>📡 Channel Sequence & Fallback</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {campaign.channels?.map((ch, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                background: (channelColors[ch] || COLORS.accent) + "22",
                border: `1px solid ${(channelColors[ch] || COLORS.accent)}55`,
                borderRadius: 8, padding: "8px 16px",
                color: channelColors[ch] || COLORS.accent,
                fontWeight: 700, fontSize: 13,
              }}>
                {ch === "WhatsApp" ? "📱" : ch === "SMS" ? "💬" : ch === "Email" ? "📧" : ch === "RCS" ? "✨" : "📞"} {ch}
              </div>
              {i < campaign.channels.length - 1 && (
                <div style={{ color: COLORS.dim, fontSize: 18 }}>→</div>
              )}
            </div>
          ))}
          {campaign.fallbackDelay && (
            <span style={{ color: COLORS.muted, fontSize: 12, marginLeft: 8 }}>
              ({campaign.fallbackDelay} between attempts)
            </span>
          )}
        </div>
      </div>

      {/* Message Variants */}
      <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ color: COLORS.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>💬 AI-Generated Message Variants</div>
        <div style={{ display: "grid", gap: 12 }}>
          {campaign.messageVariants?.map((v, i) => (
            <div key={i} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <Badge color={channelColors[v.channel] || COLORS.accent}>{v.channel}</Badge>
                <span style={{ color: COLORS.muted, fontSize: 11 }}>Variant {i + 1}</span>
              </div>
              <p style={{ color: COLORS.text, fontSize: 13, margin: 0, lineHeight: 1.6 }}>{v.message}</p>
              {v.cta && (
                <div style={{ marginTop: 10, display: "inline-block", background: COLORS.accent + "22", border: `1px solid ${COLORS.accent}44`, borderRadius: 5, padding: "4px 12px", color: COLORS.accent, fontSize: 12 }}>
                  CTA: {v.cta}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Compliance */}
      {campaign.complianceNotes && (
        <div style={{ background: COLORS.accent3 + "11", border: `1px solid ${COLORS.accent3}33`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ color: COLORS.accent3, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>✅ Compliance Check</div>
          <p style={{ color: COLORS.text, fontSize: 13, margin: 0 }}>{campaign.complianceNotes}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        <button style={{
          background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accent2})`,
          border: "none", borderRadius: 10, padding: "13px 28px",
          color: "#000", fontWeight: 800, cursor: "pointer", fontSize: 15,
          flex: 1,
        }}>
          🚀 Launch Campaign
        </button>
        <button style={{
          background: COLORS.accent3 + "22", border: `1px solid ${COLORS.accent3}55`,
          borderRadius: 10, padding: "13px 20px",
          color: COLORS.accent3, fontWeight: 700, cursor: "pointer", fontSize: 14,
        }}>
          💾 Save Draft
        </button>
        <button style={{
          background: "transparent", border: `1px solid ${COLORS.border}`,
          borderRadius: 10, padding: "13px 20px",
          color: COLORS.muted, cursor: "pointer", fontSize: 14,
        }}>
          ✏️ Edit
        </button>
      </div>
    </div>
  );
}

export default function NLCampaignBuilder() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState(null);
  const [thinking, setThinking] = useState("");

  const thinkingSteps = [
    "🧠 Parsing your campaign intent...",
    "🎯 Identifying audience segments...",
    "📡 Selecting optimal channels...",
    "💬 Generating message variants...",
    "⏰ Calculating send-time optimization...",
    "✅ Running compliance check...",
    "🚀 Finalizing campaign structure...",
  ];

  const buildCampaign = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setCampaign(null);

    // Animate thinking steps
    let stepIndex = 0;
    const stepInterval = setInterval(() => {
      if (stepIndex < thinkingSteps.length) {
        setThinking(thinkingSteps[stepIndex]);
        stepIndex++;
      }
    }, 600);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `You are an expert marketing campaign builder for EngageWorx, a multi-channel customer communications platform supporting SMS, MMS, WhatsApp, Email, Voice, and RCS.

When given a natural language campaign description, extract and return ONLY a valid JSON object (no markdown, no explanation) with this exact structure:
{
  "name": "Campaign name",
  "estimatedAudience": "e.g. ~12,400 contacts",
  "channels": ["WhatsApp", "SMS"],
  "sendTime": "e.g. Today at 10am local time",
  "estimatedRevenue": "e.g. $8,200 - $14,500",
  "fallbackDelay": "e.g. 24 hours",
  "audienceFilters": ["filter1", "filter2", "filter3"],
  "messageVariants": [
    {
      "channel": "WhatsApp",
      "message": "Full message text here",
      "cta": "Call to action text"
    },
    {
      "channel": "SMS",
      "message": "Shorter SMS version",
      "cta": "Shop Now"
    }
  ],
  "complianceNotes": "Brief compliance summary including opt-out handling and relevant regulations"
}

Be specific and realistic. Generate compelling, professional message copy. Always include opt-out language. Channel order should reflect the fallback sequence requested.`,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await response.json();
      clearInterval(stepInterval);
      setThinking("");

      const text = data.content?.[0]?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setCampaign(parsed);
    } catch (err) {
      clearInterval(stepInterval);
      setThinking("");
      setError("Could not generate campaign. Please check your API connection and try again.");
    }

    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", background: COLORS.bg,
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      color: COLORS.text,
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        textarea:focus { outline: none; border-color: ${COLORS.accent} !important; box-shadow: 0 0 0 3px ${COLORS.accent}22; }
        textarea::placeholder { color: ${COLORS.dim}; }
      `}</style>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: COLORS.accent + "15", border: `1px solid ${COLORS.accent}33`, borderRadius: 20, padding: "6px 16px", marginBottom: 20 }}>
            <span style={{ fontSize: 16 }}>✨</span>
            <span style={{ color: COLORS.accent, fontSize: 13, fontWeight: 700 }}>AI-Powered · EngageWorx</span>
          </div>
          <h1 style={{ fontSize: 42, fontWeight: 900, margin: "0 0 16px", background: `linear-gradient(135deg, ${COLORS.text}, ${COLORS.accent})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Natural Language Campaign Builder
          </h1>
          <p style={{ color: COLORS.muted, fontSize: 17, maxWidth: 600, margin: "0 auto", lineHeight: 1.6 }}>
            Describe your campaign in plain English. AI builds it instantly — audience, channels, messages, timing, and compliance.
          </p>
        </div>

        {/* Input Area */}
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: 28, marginBottom: 24 }}>
          <div style={{ color: COLORS.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
            Describe your campaign
          </div>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === "Enter" && e.metaKey && buildCampaign()}
            placeholder="e.g. Send a promo to customers who bought in the last 90 days but haven't opened our last 3 emails. Try WhatsApp first, fall back to SMS after 24 hours..."
            rows={4}
            style={{
              width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`,
              borderRadius: 12, padding: "16px", color: COLORS.text, fontSize: 15,
              resize: "vertical", boxSizing: "border-box", lineHeight: 1.6,
              transition: "border-color 0.2s, box-shadow 0.2s",
            }}
          />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
            <div style={{ color: COLORS.dim, fontSize: 12 }}>
              ⌘ + Enter to generate
            </div>
            <button
              onClick={buildCampaign}
              disabled={loading || !prompt.trim()}
              style={{
                background: loading || !prompt.trim()
                  ? COLORS.border
                  : `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accent2})`,
                border: "none", borderRadius: 10, padding: "13px 32px",
                color: loading || !prompt.trim() ? COLORS.muted : "#000",
                fontWeight: 800, cursor: loading || !prompt.trim() ? "not-allowed" : "pointer",
                fontSize: 15, transition: "all 0.2s",
              }}
            >
              {loading ? "Building..." : "✨ Build Campaign"}
            </button>
          </div>
        </div>

        {/* Thinking Indicator */}
        {loading && thinking && (
          <div style={{
            background: COLORS.surface, border: `1px solid ${COLORS.accent}33`,
            borderRadius: 12, padding: "16px 20px", marginBottom: 24,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{ width: 8, height: 8, background: COLORS.accent, borderRadius: "50%", animation: "pulse 1s infinite" }} />
            <span style={{ color: COLORS.accent, fontSize: 14, fontWeight: 600 }}>{thinking}</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: "#FF000011", border: "1px solid #FF000033", borderRadius: 12, padding: 16, marginBottom: 24, color: "#FF6B6B", fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* Generated Campaign */}
        <CampaignPreview campaign={campaign} />

        {/* Example Prompts */}
        {!campaign && !loading && (
          <div style={{ marginTop: 40 }}>
            <div style={{ color: COLORS.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 16, textAlign: "center" }}>
              Try these examples
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {EXAMPLES.map((ex, i) => (
                <button key={i} onClick={() => setPrompt(ex)} style={{
                  background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                  borderRadius: 10, padding: "14px 18px", color: COLORS.muted,
                  cursor: "pointer", fontSize: 13, textAlign: "left", lineHeight: 1.5,
                  transition: "all 0.2s",
                  ":hover": { borderColor: COLORS.accent },
                }}>
                  <span style={{ color: COLORS.accent, marginRight: 8 }}>→</span>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
