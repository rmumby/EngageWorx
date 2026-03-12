import { useState, useEffect, useRef } from "react";

const SCREENS = [
  {
    id: "welcome",
    title: "Welcome",
    subtitle: "EngageWorx Platform Demo",
    narration: "Welcome to EngageWorx — the AI-powered communications platform that lets you engage customers across SMS, email, and voice from a single dashboard. Let me walk you through how it works.",
    visual: "landing",
    cta: "Start the Tour →",
    deepDives: [],
  },
  {
    id: "dashboard",
    title: "Service Provider Dashboard",
    subtitle: "Your command center",
    narration: "This is your service provider dashboard. At a glance, you see total messages sent, revenue generated, active customers, and AI resolution rates. Every metric updates in real-time. You can drill into any customer account with one click.",
    visual: "dashboard",
    cta: "Next: Customer Portal →",
    deepDives: ["How does multi-tenant data isolation work?", "Can I white-label the dashboard?", "What metrics are tracked?"],
  },
  {
    id: "tenant",
    title: "Customer Portal",
    subtitle: "White-label branded experience",
    narration: "When you drill into a customer account, you see their branded portal — their logo, their colors, their domain. They never see EngageWorx. Their team manages campaigns, contacts, and conversations from here. You see everything they see, plus revenue and usage data they don't.",
    visual: "tenant",
    cta: "Next: Campaigns →",
    deepDives: ["How does white-labeling work?", "Can customers manage their own team?", "What access controls are available?"],
  },
  {
    id: "campaigns",
    title: "Campaign Builder",
    subtitle: "Create and send in 60 seconds",
    narration: "Creating a campaign takes about 60 seconds. Pick your audience, write the message — or let AI generate it — choose your channel, schedule it, and go. The Smart Fallback cascade automatically tries the next channel if the first doesn't deliver. SMS fails? It falls back to email. Email bounces? WhatsApp. All automatic.",
    visual: "campaigns",
    cta: "Next: AI Chatbot →",
    deepDives: ["How does Smart Fallback work?", "Can AI write my campaign copy?", "What scheduling options are available?"],
  },
  {
    id: "ai",
    title: "AI Chatbot Studio",
    subtitle: "90%+ automated resolution",
    narration: "This is the real differentiator. Configure an AI agent that handles customer conversations automatically. It classifies intent, detects sentiment, and responds intelligently. When it can't resolve something, it escalates to a human with full context. Most customers see over 90% automated resolution rates, saving 20+ hours per week in support time.",
    visual: "ai",
    cta: "Next: Voice & IVR →",
    deepDives: ["What AI model powers this?", "How do I train it for my business?", "Can it handle multiple languages?"],
  },
  {
    id: "voice",
    title: "Voice & IVR System",
    subtitle: "Replace your call service",
    narration: "Our newest feature — already deployed for a hospitality client. Inbound voice with intelligent IVR routing. During business hours, callers get a professional menu — Press 1 for Sales, Press 2 for Events. After hours, it automatically switches to voicemail with transcription emailed to the team. We replaced their £650/month MoneyPenny service. The same AI brain handles SMS, email, and voice — one platform, one inbox.",
    visual: "voice",
    cta: "Next: Analytics →",
    deepDives: ["How does after-hours handling work?", "Can I port my existing number?", "What does the voicemail email look like?"],
  },
  {
    id: "analytics",
    title: "Analytics Dashboard",
    subtitle: "Data-driven decisions",
    narration: "Everything is measured. Message volume, delivery rates, AI resolution stats, campaign performance, revenue per customer, cost per message. Filter by date, channel, customer, or campaign. Export anything. The service provider sees aggregate data across all customers with drill-down into each account.",
    visual: "analytics",
    cta: "Next: Pricing →",
    deepDives: ["Can I export reports?", "How does revenue tracking work?", "What's the AI resolution metric?"],
  },
  {
    id: "pricing",
    title: "Simple Pricing",
    subtitle: "Start at $99/month",
    narration: "Plans start at $99 per month for Starter — everything you need to begin. Growth at $249 adds more capacity and advanced analytics. Pro at $499 includes white-label branding, API access, and custom integrations. For enterprise, service providers, or high-volume deployments — let's talk. We build custom plans that fit. My number is +1 305 810 8877.",
    visual: "pricing",
    cta: "Start Your Free Trial →",
    deepDives: ["What's included in each plan?", "How does enterprise pricing work?", "Is there a free trial?"],
  },
];

function TypeWriter({ text, speed = 28, onComplete }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const idx = useRef(0);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    idx.current = 0;
    const interval = setInterval(() => {
      if (idx.current < text.length) {
        setDisplayed(text.slice(0, idx.current + 1));
        idx.current++;
      } else {
        setDone(true);
        clearInterval(interval);
        onComplete && onComplete();
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text]);

  return (
    <span>
      {displayed}
      {!done && <span style={{ opacity: 0.5, animation: "blink 1s infinite" }}>|</span>}
    </span>
  );
}

function MetricCard({ label, value, color, icon }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "20px 18px", textAlign: "center" }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color, letterSpacing: -1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function ScreenVisual({ id }) {
  const cardStyle = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 20 };

  if (id === "landing") {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, background: "linear-gradient(135deg, #00C9FF, #E040FB)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18, color: "#000" }}>EW</div>
          <span style={{ fontSize: 24, fontWeight: 900, color: "#E8F4FD" }}>Engage<span style={{ color: "#00C9FF" }}>Worx</span></span>
        </div>
        <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1.15, marginBottom: 12 }}>Smarter conversations.<br /><span style={{ background: "linear-gradient(135deg, #00C9FF, #E040FB)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>One platform.</span></div>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, maxWidth: 400, margin: "0 auto" }}>RCS, SMS, WhatsApp, email and more — one platform, one inbox, one AI brain.</div>
      </div>
    );
  }

  if (id === "dashboard") {
    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          <MetricCard icon="📨" label="Messages" value="1.2M" color="#00C9FF" />
          <MetricCard icon="💰" label="Revenue" value="$89K" color="#00E676" />
          <MetricCard icon="🏢" label="Customers" value="47" color="#E040FB" />
          <MetricCard icon="🤖" label="AI Rate" value="94%" color="#FFD600" />
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#00C9FF", marginBottom: 12 }}>Active Customers</div>
          {["Oakridge Retreat", "TechFlow Inc", "GreenLeaf Agency", "SwiftShip"].map((name, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: ["#FF6B35", "#00C9FF", "#00E676", "#E040FB"][i], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#000" }}>{name.split(" ").map(w => w[0]).join("")}</div>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span>
              </div>
              <span style={{ fontSize: 12, color: "#00E676", background: "rgba(0,230,118,0.1)", padding: "3px 10px", borderRadius: 20 }}>Active</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (id === "tenant") {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, padding: "16px 20px", background: "rgba(255,107,53,0.08)", border: "1px solid rgba(255,107,53,0.2)", borderRadius: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#FF6B35", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#000" }}>DM</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Oakridge Retreat</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>White-label portal • Growth plan</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <MetricCard icon="📱" label="Messages" value="4,821" color="#FF6B35" />
          <MetricCard icon="👥" label="Contacts" value="892" color="#00E676" />
          <MetricCard icon="📣" label="Campaigns" value="12" color="#E040FB" />
        </div>
      </div>
    );
  }

  if (id === "campaigns") {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#00C9FF", marginBottom: 16 }}>New Campaign</div>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Campaign Name</div>
            <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>Spring Open Day Invitation</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Message (AI Generated ✨)</div>
            <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(224,64,251,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 13, lineHeight: 1.6 }}>Hi {'{{first_name}}'}, you're invited to Oakridge Retreat's Spring Open Day on March 22nd! Enjoy guided tours, tastings & exclusive offers. RSVP: reply YES. Msg&data rates apply. Reply STOP to opt out.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {["SMS", "Email", "WhatsApp"].map((ch, i) => (
              <div key={i} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: i === 0 ? "rgba(0,201,255,0.15)" : "rgba(255,255,255,0.05)", color: i === 0 ? "#00C9FF" : "rgba(255,255,255,0.4)", border: `1px solid ${i === 0 ? "rgba(0,201,255,0.3)" : "rgba(255,255,255,0.08)"}` }}>{ch}{i === 0 && " ✓"}</div>
            ))}
            <div style={{ padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "rgba(255,214,0,0.1)", color: "#FFD600", border: "1px solid rgba(255,214,0,0.2)" }}>Smart Fallback ⚡</div>
          </div>
        </div>
      </div>
    );
  }

  if (id === "ai") {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#E040FB", marginBottom: 16 }}>AI Conversation</div>
        {[
          { role: "customer", text: "Hi, I'd like to book a tour of Oakridge Retreat for next Saturday", time: "2:14 PM" },
          { role: "ai", text: "Hello! I'd be happy to help you book a tour. We have two options available for next Saturday: a 10:30 AM guided tour and a 2:00 PM self-guided tour. Which would you prefer?", time: "2:14 PM", badge: "Intent: booking_request • Sentiment: positive" },
          { role: "customer", text: "The 10:30 guided tour please, for 2 people", time: "2:15 PM" },
          { role: "ai", text: "Perfect! I've reserved 2 spots for the guided tour at 10:30 AM on Saturday, March 15th. You'll receive a confirmation email shortly. Is there anything else I can help with?", time: "2:15 PM", badge: "AI Resolved ✓ • No escalation needed" },
        ].map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "customer" ? "flex-end" : "flex-start", marginBottom: 10 }}>
            <div style={{ maxWidth: "80%", padding: "10px 14px", borderRadius: 12, fontSize: 12, lineHeight: 1.6, background: msg.role === "customer" ? "rgba(0,201,255,0.12)" : "rgba(224,64,251,0.08)", border: `1px solid ${msg.role === "customer" ? "rgba(0,201,255,0.2)" : "rgba(224,64,251,0.15)"}` }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>{msg.role === "ai" ? "🤖 AI Agent" : "👤 Customer"} • {msg.time}</div>
              {msg.text}
              {msg.badge && <div style={{ marginTop: 6, fontSize: 9, color: "#00E676", background: "rgba(0,230,118,0.08)", padding: "3px 8px", borderRadius: 6, display: "inline-block" }}>{msg.badge}</div>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (id === "voice") {
    return (
      <div>
        <div style={{ ...cardStyle, marginBottom: 12, borderLeft: "3px solid #FFD600" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#FFD600", marginBottom: 12 }}>📞 IVR Configuration — Oakridge Retreat</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 12, fontStyle: "italic" }}>"Thank you for calling Oakridge Retreat. Please choose from the following options."</div>
          {[
            { digit: "1", name: "Sales", desc: "Book appointments, pricing enquiries" },
            { digit: "2", name: "Events", desc: "Weddings, corporate events" },
            { digit: "3", name: "Beverages", desc: "Bar and drinks menu" },
            { digit: "4", name: "General", desc: "All other enquiries" },
          ].map((d, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,214,0,0.15)", border: "1px solid rgba(255,214,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#FFD600" }}>{d.digit}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{d.name}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{d.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ ...cardStyle, borderLeft: "3px solid #00E676" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#00E676" }}>During Hours (9:30–5:30)</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>IVR menu → route to department</div>
          </div>
          <div style={{ ...cardStyle, borderLeft: "3px solid #FF6B35" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#FF6B35" }}>After Hours</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>Voicemail → transcribe → email team</div>
          </div>
        </div>
      </div>
    );
  }

  if (id === "analytics") {
    const bars = [65, 82, 71, 93, 88, 76, 95, 84, 90, 78, 86, 92];
    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <MetricCard icon="📈" label="Delivery Rate" value="97.2%" color="#00E676" />
          <MetricCard icon="🤖" label="AI Resolved" value="91.4%" color="#E040FB" />
          <MetricCard icon="💬" label="Avg Response" value="1.8s" color="#00C9FF" />
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#00C9FF", marginBottom: 16 }}>Message Volume (Last 12 Months)</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
            {bars.map((h, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: "100%", height: `${h}%`, background: `linear-gradient(180deg, #00C9FF, ${i === bars.length - 1 ? "#E040FB" : "rgba(0,201,255,0.3)"})`, borderRadius: "4px 4px 0 0", minHeight: 4, transition: "height 0.5s" }} />
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)" }}>{["J","F","M","A","M","J","J","A","S","O","N","D"][i]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (id === "pricing") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {[
          { name: "Starter", price: "$99", features: ["1,000 SMS/mo", "SMS + Email", "AI Chatbot", "1 number"] },
          { name: "Growth", price: "$249", featured: true, features: ["5,000 SMS/mo", "SMS + Email", "AI Chatbot", "3 numbers"] },
          { name: "Pro", price: "$499", features: ["20,000 SMS/mo", "All channels + API", "White-label", "10 numbers"] },
        ].map((p, i) => (
          <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: p.featured ? "2px solid #00C9FF" : "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "20px 16px", textAlign: "center", position: "relative" }}>
            {p.featured && <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg, #00C9FF, #E040FB)", color: "#000", padding: "2px 12px", borderRadius: 20, fontSize: 9, fontWeight: 800 }}>POPULAR</div>}
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>{p.name}</div>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, margin: "8px 0" }}>{p.price}<span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>/mo</span></div>
            {p.features.map((f, j) => (
              <div key={j} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", padding: "4px 0" }}>✓ {f}</div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return null;
}

export default function EngageWorxDemo() {
  const [step, setStep] = useState(0);
  const [showDeepDive, setShowDeepDive] = useState(null);
  const [aiResponse, setAiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [customQuestion, setCustomQuestion] = useState("");
  const [narrationDone, setNarrationDone] = useState(false);
  const screen = SCREENS[step];

  const handleDeepDive = async (question) => {
    setShowDeepDive(question);
    setAiLoading(true);
    setAiResponse("");

    try {
      const response = await fetch("/api/demo-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question,
          screenTitle: screen.title,
        }),
      });
      const data = await response.json();
      setAiResponse(data.answer || "Let me get back to you on that.");
    } catch (err) {
      setAiResponse("Great question. I'd love to cover that in more detail on a call. Reach me at +1 (305) 810-8877.");
    }
    setAiLoading(false);
  };

  const progress = ((step + 1) / SCREENS.length) * 100;

  return (
    <div style={{ minHeight: "100vh", background: "#050810", color: "#E8F4FD", fontFamily: "'Segoe UI', -apple-system, sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
        .demo-animate { animation: fadeIn 0.5s ease both; }
        .demo-slide { animation: slideIn 0.4s ease both; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: "linear-gradient(135deg, #00C9FF, #E040FB)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, color: "#000" }}>EW</div>
          <span style={{ fontSize: 15, fontWeight: 800 }}>EngageWorx <span style={{ color: "#00C9FF" }}>Demo</span></span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{step + 1} of {SCREENS.length}</span>
          <div style={{ width: 120, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${progress}%`, height: "100%", background: "linear-gradient(90deg, #00C9FF, #E040FB)", borderRadius: 2, transition: "width 0.4s" }} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", maxWidth: 1100, margin: "0 auto", width: "100%", padding: "24px" }}>
        
        {/* Left: Visual */}
        <div key={screen.id} className="demo-animate" style={{ flex: 1, padding: "0 24px 0 0" }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#00C9FF", marginBottom: 6 }}>{screen.subtitle}</div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1 }}>{screen.title}</div>
          </div>
          <ScreenVisual id={screen.visual} />
        </div>

        {/* Right: Narration + Controls */}
        <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          
          {/* AI Narrator */}
          <div style={{ background: "rgba(0,201,255,0.04)", border: "1px solid rgba(0,201,255,0.15)", borderRadius: 16, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, #00C9FF, #E040FB)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>🤖</div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#00C9FF" }}>AI Demo Guide</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "rgba(255,255,255,0.7)" }}>
              <TypeWriter key={screen.id} text={screen.narration} onComplete={() => setNarrationDone(true)} />
            </div>
          </div>

          {/* Deep Dive Questions */}
          {screen.deepDives.length > 0 && (
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Ask a Question</div>
              {screen.deepDives.map((q, i) => (
                <button key={i} onClick={() => handleDeepDive(q)} style={{ display: "block", width: "100%", textAlign: "left", background: showDeepDive === q ? "rgba(0,201,255,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${showDeepDive === q ? "rgba(0,201,255,0.2)" : "rgba(255,255,255,0.06)"}`, borderRadius: 10, padding: "10px 14px", color: "#E8F4FD", fontSize: 12, cursor: "pointer", marginBottom: 6, fontFamily: "inherit", transition: "all 0.2s" }}>
                  💬 {q}
                </button>
              ))}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input
                  type="text"
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && customQuestion.trim()) { handleDeepDive(customQuestion.trim()); setCustomQuestion(""); } }}
                  placeholder="Ask anything..."
                  style={{ flex: 1, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#E8F4FD", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                />
                <button
                  onClick={() => { if (customQuestion.trim()) { handleDeepDive(customQuestion.trim()); setCustomQuestion(""); } }}
                  disabled={!customQuestion.trim()}
                  style={{ background: customQuestion.trim() ? "linear-gradient(135deg, #00C9FF, #E040FB)" : "rgba(255,255,255,0.05)", border: "none", borderRadius: 10, padding: "10px 16px", color: customQuestion.trim() ? "#000" : "rgba(255,255,255,0.3)", fontWeight: 700, fontSize: 12, cursor: customQuestion.trim() ? "pointer" : "default", fontFamily: "inherit", transition: "all 0.2s" }}
                >Ask</button>
              </div>
            </div>
          )}

          {/* AI Response */}
          {showDeepDive && (
            <div className="demo-slide" style={{ background: "rgba(224,64,251,0.04)", border: "1px solid rgba(224,64,251,0.15)", borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#E040FB", marginBottom: 8 }}>💡 {showDeepDive}</div>
              <div style={{ fontSize: 12, lineHeight: 1.7, color: "rgba(255,255,255,0.7)" }}>
                {aiLoading ? <span style={{ animation: "pulse 1.5s infinite" }}>Thinking...</span> : aiResponse}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
            {step > 0 && (
              <button onClick={() => { setStep(step - 1); setShowDeepDive(null); setAiResponse(""); setCustomQuestion(""); setNarrationDone(false); }} style={{ flex: 1, padding: "14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#E8F4FD", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
            )}
            <button onClick={() => {
              if (step < SCREENS.length - 1) {
                setStep(step + 1);
                setShowDeepDive(null);
                setAiResponse("");
                setCustomQuestion("");
                setNarrationDone(false);
              } else {
                window.open("https://portal.engwx.com", "_blank");
              }
            }} style={{ flex: 2, padding: "14px", borderRadius: 10, background: "linear-gradient(135deg, #00C9FF, #E040FB)", color: "#000", fontSize: 13, fontWeight: 800, cursor: "pointer", border: "none", fontFamily: "inherit" }}>
              {screen.cta}
            </button>
          </div>

          {/* Step indicators */}
          <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
            {SCREENS.map((_, i) => (
              <button key={i} onClick={() => { setStep(i); setShowDeepDive(null); setAiResponse(""); setCustomQuestion(""); setNarrationDone(false); }} style={{ width: i === step ? 24 : 8, height: 8, borderRadius: 4, background: i === step ? "#00C9FF" : i < step ? "rgba(0,201,255,0.3)" : "rgba(255,255,255,0.1)", border: "none", cursor: "pointer", transition: "all 0.3s", padding: 0 }} />
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 24px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>EngageWorx Interactive Demo • www.engwx.com</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>+1 (305) 810-8877 • rob@engwx.com</span>
      </div>
    </div>
  );
}
