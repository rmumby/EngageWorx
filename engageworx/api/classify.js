export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body;
  console.log("Classifying:", message);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 100,
        system: `Classify the intent and sentiment of customer messages.
Return ONLY a JSON object like:
{"intent":"purchase_inquiry|support|complaint|opt_out|general|positive_feedback|booking","sentiment":"positive|neutral|negative|very_negative"}
No explanation, no markdown, no backticks. Just the JSON object.`,
        messages: [{ role: "user", content: message }],
      }),
    });

    const data = await response.json();
    console.log("Anthropic response:", JSON.stringify(data));
    const text = data.content?.[0]?.text || '{"intent":"general","sentiment":"neutral"}';
    const clean = text.replace(/```json|```/g, "").trim();
    const result = JSON.parse(clean);
    res.status(200).json(result);
  } catch (err) {
    console.error("Classify error:", err.message);
    res.status(200).json({ intent: "general", sentiment: "neutral" });
  }
}
