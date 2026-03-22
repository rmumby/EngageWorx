// api/intake.js
// EngageWorx lead intake — Vercel serverless function
// Form POST → Claude classifies → Supabase insert → Branded email alert to Rob
//
// ENV VARS:
//   ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
//   RESEND_API_KEY, ALERT_EMAIL (defaults to rob@engwx.com)

const CALENDLY = "https://calendly.com/rob-engwx/30min";

const SIGNATURE = `
<table cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;background:#ffffff;border:1px solid #E8EAF0;border-radius:12px;padding:16px 20px;margin-top:24px;">
  <tr><td style="padding-bottom:14px;">
    <table cellpadding="0" cellspacing="0"><tr valign="middle">
      <td width="44" height="44" style="width:44px;height:44px;min-width:44px;border-radius:10px;background:linear-gradient(135deg,#00BFFF,#A855F7);text-align:center;vertical-align:middle;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;">EW</td>
      <td width="14">&nbsp;</td>
      <td>
        <table cellpadding="0" cellspacing="0"><tr valign="middle">
          <td style="font-family:Arial,sans-serif;font-size:16px;font-weight:600;color:#0D1117;white-space:nowrap;">Rob Mumby</td>
          <td width="10">&nbsp;</td>
          <td style="background:#f5f0ff;border:1px solid #e0d0ff;border-radius:5px;padding:2px 8px;font-family:Arial,sans-serif;font-size:10px;font-weight:600;color:#A855F7;letter-spacing:0.5px;white-space:nowrap;">AI-Powered CX</td>
        </tr></table>
        <div style="font-family:Arial,sans-serif;font-size:12px;color:#6B7280;margin-top:2px;white-space:nowrap;">Founder &amp; CEO, <span style="color:#A855F7;font-weight:600;">EngageWorx</span></div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="border-top:1px solid #E8EAF0;padding-top:12px;padding-bottom:12px;">
    <table cellpadding="0" cellspacing="0"><tr valign="top">
      <td style="padding-right:24px;">
        <div style="font-family:Arial,sans-serif;font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.7px;margin-bottom:3px;">Phone</div>
        <div style="font-family:Arial,sans-serif;font-size:12px;color:#374151;white-space:nowrap;">+1 (786) 982-7800</div>
      </td>
      <td style="padding-right:24px;">
        <div style="font-family:Arial,sans-serif;font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.7px;margin-bottom:3px;">Website</div>
        <a href="https://engwx.com" style="font-family:Arial,sans-serif;font-size:12px;color:#00BFFF;text-decoration:none;font-weight:500;white-space:nowrap;">engwx.com</a>
      </td>
      <td style="padding-right:24px;">
        <div style="font-family:Arial,sans-serif;font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.7px;margin-bottom:3px;">Book a Call</div>
        <a href="${CALENDLY}" style="font-family:Arial,sans-serif;font-size:12px;color:#A855F7;text-decoration:none;font-weight:600;white-space:nowrap;">Schedule 30 min →</a>
      </td>
      <td>
        <div style="font-family:Arial,sans-serif;font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.7px;margin-bottom:3px;">LinkedIn</div>
        <a href="https://linkedin.com/company/engwx" style="font-family:Arial,sans-serif;font-size:12px;color:#00BFFF;text-decoration:none;font-weight:500;white-space:nowrap;">linkedin.com/company/engwx</a>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="border-top:1px solid #E8EAF0;padding-top:10px;">
    <span style="font-family:Arial,sans-serif;font-size:11px;color:#9CA3AF;white-space:nowrap;">
      <span style="color:#00BFFF;">&#9679;</span>
      <span style="color:#A855F7;">&#9679;</span>
      <span style="color:#EC4899;">&#9679;</span>
      &nbsp;SMS &middot; WhatsApp &middot; Email &middot; Voice &middot; RCS &mdash; all in one platform.
    </span>
  </td></tr>
</table>`;

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
      console.warn("Claude classification failed:", e.message);
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

    // ── Step 3: Branded email alert to Rob ──────────────────────────────────
    const urgencyEmoji = { Hot: "🔥", Warm: "⚡", Cold: "❄️" }[classification.urgency] || "📥";
    const alertTo = process.env.ALERT_EMAIL || "rob@engwx.com";

    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "EngageWorx Pipeline <hello@engwx.com>",
          to: [alertTo],
          subject: `${urgencyEmoji} New Lead: ${name}${company ? ` · ${company}` : ""} [${classification.urgency}]`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#070d1a;color:#f1f5f9;border-radius:12px;overflow:hidden;">

              <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px 32px;">
                <div style="font-size:22px;font-weight:800;">⚡ EngageWorx Pipeline</div>
                <div style="font-size:13px;opacity:0.85;margin-top:4px;">New inbound lead — action required</div>
              </div>

              <div style="padding:28px 32px;">
                <div style="font-size:24px;font-weight:800;margin-bottom:4px;">${name}</div>
                <div style="font-size:15px;color:#94a3b8;margin-bottom:20px;">${company || "No company"} &middot; ${email}${phone ? ` &middot; ${phone}` : ""}</div>

                <div style="margin-bottom:24px;">
                  <span style="background:rgba(99,102,241,0.2);color:#a5b4fc;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:700;margin-right:6px;">${classification.type}</span>
                  <span style="background:rgba(245,158,11,0.2);color:#fcd34d;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:700;margin-right:6px;">${urgencyEmoji} ${classification.urgency}</span>
                  ${classification.package !== "Unknown" ? `<span style="background:rgba(245,158,11,0.15);color:#fcd34d;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:700;margin-right:6px;">${classification.package}</span>` : ""}
                  <span style="background:rgba(255,255,255,0.06);color:#64748b;border-radius:6px;padding:4px 12px;font-size:12px;">via ${source}</span>
                </div>

                <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:16px 20px;margin-bottom:16px;">
                  <div style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">💡 AI Summary</div>
                  <div style="font-size:14px;color:#cbd5e1;line-height:1.6;">${classification.summary}</div>
                </div>

                <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:10px;padding:16px 20px;margin-bottom:16px;">
                  <div style="font-size:11px;font-weight:700;color:#10b981;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">⚡ Recommended Next Action</div>
                  <div style="font-size:14px;color:#cbd5e1;line-height:1.6;">&rarr; ${classification.next_action}</div>
                </div>

                <div style="background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.2);border-radius:10px;padding:16px 20px;margin-bottom:24px;">
                  <div style="font-size:11px;font-weight:700;color:#a855f7;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">📅 Book a Call</div>
                  <a href="${CALENDLY}" style="display:inline-block;background:linear-gradient(135deg,#a855f7,#6366f1);color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:700;font-size:14px;">Send Calendly Link &rarr;</a>
                  <div style="margin-top:8px;font-size:11px;color:#64748b;">${CALENDLY}</div>
                </div>

                ${message ? `
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px 20px;margin-bottom:24px;">
                  <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">📝 Their Message</div>
                  <div style="font-size:13px;color:#94a3b8;line-height:1.6;">${message}</div>
                </div>` : ""}

                <a href="https://portal.engwx.com" style="display:block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:8px;font-weight:700;font-size:15px;">
                  View in Pipeline Dashboard &rarr;
                </a>

                ${SIGNATURE}
              </div>

              <div style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#334155;text-align:center;">
                EngageWorx Pipeline &middot; engwx.com &middot; Lead ID: ${leadId || "pending"}
              </div>
            </div>
          `,
        }),
      });
    } catch (emailErr) {
      console.warn("Email alert failed:", emailErr.message);
    }

    return res.status(200).json({ success: true, lead_id: leadId, classification });

  } catch (err) {
    console.error("Intake error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
