// api/intake.js
// EngageWorx lead intake — Vercel serverless function
// Form POST → Claude classifies → Supabase insert → SMS alert to Rob
//
// ENV VARS (Vercel → Settings → Environment Variables):
//   ANTHROPIC_API_KEY         — your Anthropic key
//   SUPABASE_URL              — e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY      — Settings → API → service_role key (not anon)
//   TWILIO_ACCOUNT_SID        — Twilio account SID
//   TWILIO_AUTH_TOKEN         — Twilio auth token
//   TWILIO_FROM_NUMBER        — +17869827800
//   ALERT_TO_NUMBER           — Rob's mobile in E.164 format

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://engwx.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { name, email, phone, company, message, source = "Website" } = req.body;
    if (!name || !email) return res.status(400).json({ error: "Name and email are required" });

    // ── Step 1: Claude classifies the lead ──────────────────────────────────
    let classification = {
      type: "Unknown", urgency: "Warm",
      summary: message || "New inbound enquiry",
      next_action: "Send intro deck and book discovery call",
      package: "Unknown",
    };

    try {
      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 400,
          messages: [{
            role: "user",
            content: `You are a lead qualification assistant for EngageWorx, an AI-powered omnichannel customer communications platform (SMS, WhatsApp, Email, Voice, RCS). Pricing: Starter $99/mo, Growth $249/mo, Pro $499/mo, Enterprise custom.

Classify this inbound lead. Respond ONLY with valid JSON, no preamble, no markdown backticks.

Name: ${name}
Company: ${company || "Unknown"}
Email: ${email}
Message: ${message || "No message provided"}

JSON structure:
{
  "type": "Direct Business" | "White-Label / Reseller" | "Agency" | "Unknown",
  "urgency": "Hot" | "Warm" | "Cold",
  "summary": "One sentence — what they want and why",
  "next_action": "Single most important next action for the founder to take",
  "package": "Starter $99" | "Growth $249" | "Pro $499" | "Enterprise" | "Unknown"
}`,
          }],
        }),
      });
      const claudeData = await claudeRes.json();
      const raw = claudeData.content?.find((b) => b.type === "text")?.text || "{}";
      classification = { ...classification, ...JSON.parse(raw.replace(/```json|```/g, "").trim()) };
    } catch (e) {
      console.warn("Claude classification failed, using defaults:", e.message);
    }

    // ── Step 2: Insert into Supabase ────────────────────────────────────────
    const sbRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        name, email,
        phone: phone || null,
        company: company || null,
        message: message || null,
        source,
        type: classification.type,
        urgency: classification.urgency,
        ai_summary: classification.summary,
        ai_next_action: classification.next_action,
        package: classification.package !== "Unknown" ? classification.package : null,
        stage: "inquiry",
        notes: `→ ${classification.next_action}`,
      }),
    });

    const sbData = await sbRes.json();
    const leadId = Array.isArray(sbData) ? sbData[0]?.id : sbData?.id;

    // ── Step 3: SMS alert to Rob ────────────────────────────────────────────
    if (process.env.TWILIO_ACCOUNT_SID && process.env.ALERT_TO_NUMBER) {
      const emoji = { Hot: "🔥", Warm: "⚡", Cold: "❄️" }[classification.urgency] || "📥";
      const smsBody = [
        `${emoji} New EngageWorx Lead`,
        `${name}${company ? ` · ${company}` : ""}`,
        `${classification.type} · ${classification.urgency}`,
        `→ ${classification.next_action}`,
        email,
      ].join("\n");

      const twilioAuth = Buffer.from(
        `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
      ).toString("base64");

      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${twilioAuth}`,
          },
          body: new URLSearchParams({
            From: process.env.TWILIO_FROM_NUMBER,
            To: process.env.ALERT_TO_NUMBER,
            Body: smsBody,
          }),
        }
      );
    }

    return res.status(200).json({ success: true, lead_id: leadId, classification });
  } catch (err) {
    console.error("Intake error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
