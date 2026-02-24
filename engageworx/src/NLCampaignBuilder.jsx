import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

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
  "Send a promo to all contacts offering 20% off this weekend. Use SMS.",
  "Re-engage customers who haven't been contacted in 30 days with a friendly check-in message.",
  "Send a holiday greeting to all contacts wishing them a great season.",
  "Alert all contacts about our new product launch happening next week.",
  "Win back inactive contacts with a special limited-time offer via SMS.",
];

function Badge({ children, color }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    }}>{children}</span>
  );
}

function CampaignPreview({ campaign, onLaunch, onSaveDraft, launching, contactCount }) {
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
          { label: "Contacts Available", value: `${contactCount} contacts`, icon: "👥" },
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
        <div style={{ color: COLORS.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>📡 Channel Sequence</div>
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
                {ch === "SMS" ? "💬" : ch === "Email" ? "📧" : ch === "WhatsApp" ? "📱" : "📡"} {ch}
              </div>
              {i < campaign.channels.length - 1 && (
                <div style={{ color: COLORS.dim, fontSize: 18 }}>→</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Message Variants */}
      <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ color: COLORS.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>💬 AI-Generated Messages</div>
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
        <button onClick={onLaunch} disabled={launching} style={{
          background: launching ? COLORS.border : `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accent2})`,
          border: "none", borderRadius: 10, padding: "13px 28px",
          color: launching ? COLORS.muted : "#000", fontWeight: 800, cursor: launching ? "not-allowed" : "pointer", fontSize: 15,
          flex: 1, opacity: launching ? 0.7 : 1,
        }}>
          {launching ? "📡 Sending..." : `🚀 Launch Campaign (${contactCount} contacts)`}
        </button>
        <button onClick={onSaveDraft} style={{
          background: COLORS.accent3 + "22", border: `1px solid ${COLORS.accent3}55`,
          borderRadius: 10, padding: "13px 20px",
          color: COLORS.accent3, fontWeight: 700, cursor: "pointer", fontSize: 14,
        }}>
          💾 Save Draft
        </button>
      </div>
    </div>
  );
}

// Campaign history list
function CampaignHistory({ campaigns, onSelect }) {
  if (!campaigns || campaigns.length === 0) return null;

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ color: COLORS.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>
        📋 Recent Campaigns
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {campaigns.map(c => (
          <div key={c.id} onClick={() => onSelect(c)} style={{
            background: COLORS.surface, border: `1px solid ${COLORS.border}`,
            borderRadius: 10, padding: "14px 18px", cursor: "pointer",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            transition: "all 0.2s",
          }}>
            <div>
              <div style={{ color: COLORS.text, fontWeight: 600, fontSize: 14 }}>{c.name}</div>
              <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
                {c.channel || "SMS"} · {c.sent_count || 0} sent · {new Date(c.created_at).toLocaleDateString()}
              </div>
            </div>
            <Badge color={
              c.status === "sent" ? COLORS.accent3 :
              c.status === "draft" ? COLORS.muted :
              c.status === "sending" ? COLORS.accent :
              COLORS.accent4
            }>
              {c.status || "draft"}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NLCampaignBuilder({ tenantId }) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState(null);
  const [thinking, setThinking] = useState("");
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [pastCampaigns, setPastCampaigns] = useState([]);

  // Load contacts and past campaigns from Supabase
  useEffect(() => {
    loadContacts();
    loadCampaigns();
  }, [tenantId]);

  const loadContacts = async () => {
    try {
      let query = supabase.from("contacts").select("id, phone, first_name, last_name");
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data } = await query;
      if (data) setContacts(data);
    } catch (err) {
      console.log("No contacts table or no data:", err);
    }
  };

  const loadCampaigns = async () => {
    try {
      let query = supabase
        .from("campaigns")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data } = await query;
      if (data) setPastCampaigns(data);
    } catch (err) {
      console.log("No campaigns loaded:", err);
    }
  };

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
    setLaunchResult(null);

    let stepIndex = 0;
    const stepInterval = setInterval(() => {
      if (stepIndex < thinkingSteps.length) {
        setThinking(thinkingSteps[stepIndex]);
        stepIndex++;
      }
    }, 600);

    try {
      const response = await fetch("/api/generate-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();
      clearInterval(stepInterval);
      setThinking("");

      if (data.error) throw new Error(data.error);

      const text = data.content?.[0]?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setCampaign(parsed);
    } catch (err) {
      clearInterval(stepInterval);
      setThinking("");
      setError("Could not generate campaign. Please try again.");
    }

    setLoading(false);
  };

  const saveDraft = async () => {
    if (!campaign) return;

    try {
      const { error } = await supabase.from("campaigns").insert({
        tenant_id: tenantId || null,
        name: campaign.name,
        description: prompt,
        channel: campaign.channels?.[0] || "SMS",
        message_template: campaign.messageVariants?.[0]?.message || "",
        audience_filters: campaign.audienceFilters,
        status: "draft",
        sent_count: 0,
        campaign_data: campaign,
      });

      if (error) throw error;
      loadCampaigns();
      setLaunchResult({ type: "success", message: "Campaign saved as draft!" });
    } catch (err) {
      setLaunchResult({ type: "error", message: "Failed to save: " + err.message });
    }
  };

  const launchCampaign = async () => {
    if (!campaign) return;
    setLaunching(true);
    setLaunchResult(null);

    const smsMessage = campaign.messageVariants?.find(v => v.channel === "SMS")?.message
      || campaign.messageVariants?.[0]?.message
      || "Hello from EngageWorx!";

    // Get contacts to send to
    let sendTo = [];

    if (contacts.length > 0) {
      // Use real contacts from Supabase
      sendTo = contacts.map(c => ({
        to: c.phone,
        body: smsMessage,
      }));
    } else {
      // No contacts — save as draft instead
      setLaunching(false);
      setLaunchResult({
        type: "warning",
        message: "No contacts found. Campaign saved as draft. Add contacts to send SMS."
      });
      saveDraft();
      return;
    }

    try {
      // Save campaign to Supabase first
      const { data: savedCampaign, error: saveError } = await supabase
        .from("campaigns")
        .insert({
          tenant_id: tenantId || null,
          name: campaign.name,
          description: prompt,
          channel: campaign.channels?.[0] || "SMS",
          message_template: smsMessage,
          audience_filters: campaign.audienceFilters,
          status: "sending",
          sent_count: 0,
          campaign_data: campaign,
        })
        .select()
        .single();

      if (saveError) throw saveError;

      // Send via API
      const res = await fetch("/api/send-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: savedCampaign?.id,
          tenantId,
          messages: sendTo,
        }),
      });

      const result = await res.json();

      // Update campaign status
      if (savedCampaign?.id) {
        await supabase
          .from("campaigns")
          .update({
            status: "sent",
            sent_count: result.results?.sent || 0,
            sent_at: new Date().toISOString(),
          })
          .eq("id", savedCampaign.id);
      }

      setLaunchResult({
        type: "success",
        message: `Campaign sent! ${result.results?.sent || 0} messages delivered, ${result.results?.failed || 0} failed.`
      });

      loadCampaigns();

    } catch (err) {
      setLaunchResult({ type: "error", message: "Launch failed: " + err.message });
    }

    setLaunching(false);
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
          <h1 style={{ fontSize: 36, fontWeight: 900, margin: "0 0 16px", background: `linear-gradient(135deg, ${COLORS.text}, ${COLORS.accent})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Campaign Builder
          </h1>
          <p style={{ color: COLORS.muted, fontSize: 16, maxWidth: 600, margin: "0 auto", lineHeight: 1.6 }}>
            Describe your campaign in plain English. AI builds it — then send it to {contacts.length > 0 ? `your ${contacts.length} contacts` : "your contacts"} instantly.
          </p>
        </div>

        {/* Input Area */}
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: 28, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ color: COLORS.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
              Describe your campaign
            </div>
            <Badge color={contacts.length > 0 ? COLORS.accent3 : COLORS.muted}>
              {contacts.length > 0 ? `${contacts.length} contacts loaded` : "No contacts yet"}
            </Badge>
          </div>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === "Enter" && e.metaKey && buildCampaign()}
            placeholder="e.g. Send a promo to all contacts offering 20% off this weekend. Keep it friendly and include an opt-out..."
            rows={4}
            style={{
              width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`,
              borderRadius: 12, padding: "16px", color: COLORS.text, fontSize: 15,
              resize: "vertical", boxSizing: "border-box", lineHeight: 1.6,
              fontFamily: "'DM Sans', sans-serif",
              transition: "border-color 0.2s, box-shadow 0.2s",
            }}
          />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
            <div style={{ color: COLORS.dim, fontSize: 12 }}>⌘ + Enter to generate</div>
            <button onClick={buildCampaign} disabled={loading || !prompt.trim()} style={{
              background: loading || !prompt.trim() ? COLORS.border : `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accent2})`,
              border: "none", borderRadius: 10, padding: "13px 32px",
              color: loading || !prompt.trim() ? COLORS.muted : "#000",
              fontWeight: 800, cursor: loading || !prompt.trim() ? "not-allowed" : "pointer",
              fontSize: 15, transition: "all 0.2s",
            }}>
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

        {/* Launch Result */}
        {launchResult && (
          <div style={{
            background: launchResult.type === "success" ? COLORS.accent3 + "11" : launchResult.type === "warning" ? COLORS.accent4 + "11" : "#FF000011",
            border: `1px solid ${launchResult.type === "success" ? COLORS.accent3 : launchResult.type === "warning" ? COLORS.accent4 : "#FF0000"}33`,
            borderRadius: 12, padding: 16, marginBottom: 24,
            color: launchResult.type === "success" ? COLORS.accent3 : launchResult.type === "warning" ? COLORS.accent4 : "#FF6B6B",
            fontSize: 14, fontWeight: 600,
          }}>
            {launchResult.type === "success" ? "✅ " : launchResult.type === "warning" ? "⚠️ " : "❌ "}
            {launchResult.message}
          </div>
        )}

        {/* Generated Campaign */}
        <CampaignPreview
          campaign={campaign}
          onLaunch={launchCampaign}
          onSaveDraft={saveDraft}
          launching={launching}
          contactCount={contacts.length}
        />

        {/* Past Campaigns */}
        <CampaignHistory campaigns={pastCampaigns} onSelect={(c) => {
          if (c.campaign_data) {
            setCampaign(c.campaign_data);
            setPrompt(c.description || "");
          }
        }} />

        {/* Example Prompts */}
        {!campaign && !loading && pastCampaigns.length === 0 && (
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
