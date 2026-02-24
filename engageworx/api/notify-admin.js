// /api/notify-admin.js
// Sends an email to the EngageWorx admin when a new tenant signs up

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { businessName, email, plan, twilioOption } = req.body;

  const ADMIN_EMAIL = "rob@engwx.com";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "EngageWorx <noreply@engwx.com>",
        to: [ADMIN_EMAIL],
        subject: `🆕 New Tenant Signup: ${businessName}`,
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #0f172a; border-radius: 12px; padding: 32px; color: #e2e8f0;">
              <h1 style="color: #0ea5e9; margin: 0 0 8px 0; font-size: 24px;">New Tenant Signup!</h1>
              <p style="color: #94a3b8; margin: 0 0 24px 0;">A new business has signed up for EngageWorx.</p>
              
              <div style="background: #1e293b; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Business Name</td>
                    <td style="padding: 8px 0; color: #e2e8f0; font-size: 14px; font-weight: 600; text-align: right;">${businessName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Email</td>
                    <td style="padding: 8px 0; color: #e2e8f0; font-size: 14px; text-align: right;">${email}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Plan</td>
                    <td style="padding: 8px 0; color: #0ea5e9; font-size: 14px; font-weight: 600; text-align: right;">${plan.charAt(0).toUpperCase() + plan.slice(1)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Twilio</td>
                    <td style="padding: 8px 0; color: #e2e8f0; font-size: 14px; text-align: right;">${twilioOption === "managed" ? "EngageWorx Managed" : "Bring Your Own"}</td>
                  </tr>
                </table>
              </div>
              
              <div style="background: #0c2a3f; border: 1px solid #0ea5e9; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                <p style="color: #94a3b8; font-size: 13px; margin: 0;">
                  ⚡ <strong style="color: #e2e8f0;">Action Required:</strong> Review and approve this tenant in the admin dashboard.
                </p>
              </div>
              
              <a href="https://portal.engwx.com" 
                style="display: inline-block; background: linear-gradient(135deg, #0ea5e9, #0284c7); color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                Open Admin Dashboard →
              </a>
            </div>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to send email");
    }

    const data = await response.json();
    return res.status(200).json({ success: true, id: data.id });

  } catch (error) {
    console.error("Admin notification error:", error);
    return res.status(500).json({ error: error.message });
  }
}
