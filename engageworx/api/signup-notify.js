../../ api/signup-notify.js
// Called when a new user signs up via the portal
// Writes lead to Supabase pipeline + sends branded alert email to Rob
//
// ENV VARS needed:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY
//   ALERT_EMAIL (defaults to rob@engwx.com)

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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { name, email, company, plan = "Starter $99" } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const displayName = name || email.split("@")[0];
    const alertTo = process.env.ALERT_EMAIL || "rob@engwx.com";

    // ── Step 1: Write to Supabase pipeline ─────────────────────────────────
    let leadId = null;
    try {
      const sbRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/leads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": process.env.SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          "Prefer": "return=representation",
        },
        body: JSON.stringify({
          name: displayName,
          email,
          company: company || null,
          source: "Portal Signup",
          type: "Unknown",
          urgency: "Hot",
          stage: "inquiry",
          package: plan,
          notes: `→ New portal signup — reach out personally within 24hrs\n→ Confirm what they need and which channels\n→ Check if they completed Stripe checkout`,
          ai_summary: `New signup from ${displayName} — hasn't completed onboarding yet. High priority.`,
          ai_next_action: "Send personal welcome email and book a discovery call",
          last_action_at: new Date().toISOString().split("T")[0],
        }),
      });
      const sbData = await sbRes.json();
      leadId = Array.isArray(sbData) ? sbData[0]?.id : sbData?.id;
    } catch (sbErr) {
      console.warn("Supabase insert failed:", sbErr.message);
    }

    // ── Step 2: Alert email to Rob ──────────────────────────────────────────
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "EngageWorx Pipeline <hello@engwx.com>",
        to: [alertTo],
        subject: `🔥 New Signup: ${displayName}${company ? ` · ${company}` : ""} (${plan})`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#070d1a;color:#f1f5f9;border-radius:12px;overflow:hidden;">

            <div style="background:linear-gradient(135deg,#10b981,#06b6d4);padding:24px 32px;">
              <div style="font-size:22px;font-weight:800;">🎉 New Signup</div>
              <div style="font-size:13px;opacity:0.85;margin-top:4px;">Someone just signed up for EngageWorx — hot lead, act fast</div>
            </div>

            <div style="padding:28px 32px;">
              <div style="font-size:24px;font-weight:800;margin-bottom:4px;">${displayName}</div>
              <div style="font-size:15px;color:#94a3b8;margin-bottom:20px;">${company || "No company provided"} &middot; ${email}</div>

              <div style="margin-bottom:20px;">
                <span style="background:rgba(239,68,68,0.2);color:#fca5a5;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:700;margin-right:6px;">🔥 Hot</span>
                <span style="background:rgba(245,158,11,0.2);color:#fcd34d;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:700;margin-right:6px;">${plan}</span>
                <span style="background:rgba(255,255,255,0.06);color:#64748b;border-radius:6px;padding:4px 12px;font-size:12px;">Portal Signup</span>
              </div>

              <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:10px;padding:16px 20px;margin-bottom:24px;">
                <div style="font-size:11px;font-weight:700;color:#10b981;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">⚡ Recommended Next Actions</div>
                <div style="font-size:14px;color:#cbd5e1;line-height:1.8;">
                  &rarr; Send personal welcome email within 2 hours<br/>
                  &rarr; Check if Stripe checkout was completed<br/>
                  &rarr; Book a discovery call to understand their needs<br/>
                  &rarr; Add to pipeline and update stage
                </div>
              </div>

              <a href="https://portal.engwx.com" style="display:block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:8px;font-weight:700;font-size:15px;">
                View in Pipeline Dashboard &rarr;
              </a>
            </div>

            <div style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#334155;text-align:center;">
              EngageWorx Pipeline &middot; engwx.com${leadId ? ` &middot; Lead ID: ${leadId}` : ""}
            </div>
          </div>
        `,
      }),
    });

    return res.status(200).json({ success: true, lead_id: leadId });

  } catch (err) {
    console.error("Signup notify error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
