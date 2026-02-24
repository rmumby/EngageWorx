import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, intent, sentiment, conversationId } = req.body;
  console.log("Generating reply for:", message, "intent:", intent);

  try {
    // Get conversation history
    let conversationHistory = [];
    if (conversationId) {
      const { data: history } = await supabase
        .from("conversation_messages")
        .select("direction, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(10);

      conversationHistory = (history || []).map((m) => ({
        role: m.direction === "inbound" ? "user" : "assistant",
        content: m.content,
      }));
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: `You are a helpful customer service assistant for EngageWorx.
Be concise — this is SMS, keep replies under 160 characters when possible.
Be friendly, professional, and helpful.
Intent detected: ${intent || "general"}
Sentiment detected: ${sentiment || "neutral"}
Never make up information. Never mention being an AI unless directly asked.`,
        messages: [
          ...conversationHistory,
          { role: "user", content: message },
        ],
      }),
    });

    const data = await response.json();
    console.log("Reply data:", JSON.stringify(data));
    const reply = data.content?.[0]?.text ||
      "Thanks for reaching out! We'll get back to you shortly.";

    res.status(200).json({ reply });
  } catch (err) {
    console.error("Respond error:", err.message);
    res.status(200).json({ reply: "Thanks for reaching out! We'll get back to you shortly." });
  }
}
