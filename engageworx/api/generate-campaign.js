// /api/generate-campaign.js
// Proxy for Anthropic API calls to avoid CORS issues from browser

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: `You are an expert marketing campaign builder for EngageWorx, a multi-channel customer communications platform supporting SMS, MMS, WhatsApp, Email, Voice, and RCS.

When given a natural language campaign description, extract and return ONLY a valid JSON object (no markdown, no explanation) with this exact structure:
{
  "name": "Campaign name",
  "estimatedAudience": "e.g. ~12,400 contacts",
  "channels": ["SMS"],
  "sendTime": "e.g. Immediately",
  "estimatedRevenue": "e.g. $8,200 - $14,500",
  "fallbackDelay": "e.g. 24 hours",
  "audienceFilters": ["filter1", "filter2"],
  "messageVariants": [
    {
      "channel": "SMS",
      "message": "Full message text here. Reply STOP to opt out.",
      "cta": "Call to action text"
    }
  ],
  "complianceNotes": "Brief compliance summary including opt-out handling"
}

Be specific and realistic. Generate compelling, professional message copy. Always include "Reply STOP to opt out" in SMS messages. Keep SMS messages under 160 characters when possible.`,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Anthropic API error");
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error("Campaign generation error:", error);
    return res.status(500).json({ error: error.message });
  }
}
