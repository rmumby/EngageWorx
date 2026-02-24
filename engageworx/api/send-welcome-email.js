// api/send-welcome-email.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { tenantId } = req.body;

  try {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("*, users(*)")
      .eq("id", tenantId)
      .single();

    const ownerEmail = tenant.users?.find(u => u.role === "owner")?.email;
    if (!ownerEmail) return res.status(400).json({ error: "No owner found" });

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "welcome@engwx.com",
        to: ownerEmail,
        subject: `Welcome to EngageWorx, ${tenant.name}!`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <h1 style="color: #0ea5e9;">Welcome to EngageWorx! 🎉</h1>
            <p style="color: #334155;">Your account for <strong>${tenant.name}</strong> has been approved and is ready to use.</p>
            <h2 style="color: #1e293b;">Getting Started</h2>
            <ol style="color: #334155; line-height: 2;">
              <li>Log in to your portal at <a href="https://portal.engwx.com/${tenant.slug}">portal.engwx.com/${tenant.slug}</a></li>
              <li>Set up your phone number in Settings</li>
              <li>Configure your AI bot responses</li>
              <li>Start your first campaign</li>
            </ol>
            <a href="https://portal.engwx.com/login" 
               style="display: inline-block; background: #0ea5e9; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px;">
              Go to your portal →
            </a>
            <p style="color: #64748b; font-size: 12px; margin-top: 40px;">
              Questions? Reply to this email or visit <a href="https://engwx.com/support">engwx.com/support</a>
            </p>
          </div>
        `,
      }),
    });

    res.status(200).json({ sent: true });
  } catch (err) {
    console.error("Email error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
