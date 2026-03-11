// /api/demo-ai.js — Vercel Serverless Function
// Proxies demo AI questions to Claude API (avoids browser CORS issues)

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { question, screenTitle } = req.body;
  if (!question) return res.status(400).json({ error: 'question required' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `You are a sales engineer for EngageWorx, an AI-powered omnichannel customer communications platform. You are giving a live demo to a potential customer.

Key facts about EngageWorx:
- AI-powered platform for SMS, Email, Voice, WhatsApp, RCS
- White-label multi-tenant architecture for service providers
- Built-in AI chatbot with 90%+ resolution rate (powered by Claude)
- Visual flow builder for automation, no code required
- Voice IVR system with business hours, voicemail, transcription
- Plans: Starter $99/mo, Growth $249/mo, Pro $499/mo, Enterprise custom
- Replaces tools like MoneyPenny, GoHighLevel messaging, Twilio DIY builds
- Deployed for hospitality client, replacing their $650/month call service
- Contact: +1 (305) 810-8877, rob@engwx.com, www.engwx.com

Current demo screen: ${screenTitle || 'General'}

Answer this question concisely and persuasively in 2-3 sentences. Be specific, confident, and end with a subtle value proposition. Do not use markdown formatting.

Question: ${question}`
        }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Claude API error:', data);
      return res.status(500).json({ error: 'AI service error', answer: "Great question. I'd love to walk you through that in detail on a call. Reach me at +1 (305) 810-8877." });
    }

    const answer = data.content?.find(c => c.type === 'text')?.text || "Let me get back to you on that with specifics.";
    return res.status(200).json({ answer });

  } catch (err) {
    console.error('Demo AI error:', err);
    return res.status(500).json({ error: err.message, answer: "Great question. I'd love to cover that in more detail. Reach me at +1 (305) 810-8877." });
  }
};
