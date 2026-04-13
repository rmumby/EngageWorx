module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { image, mediaType } = req.body;
    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: [{
          type: 'image',
          source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image }
        }, {
          type: 'text',
          text: 'Extract contact details from this image. It may be a physical business card, a photo of a badge, a LinkedIn profile screenshot, or a digital card (Blinq, HiHello, etc).\n\nReturn ONLY valid JSON — no markdown, no prose — with these exact keys:\n{\n  "first_name": string|null,\n  "last_name": string|null,\n  "name": string|null,\n  "email": string|null,\n  "phone": string|null (E.164 preferred, otherwise raw),\n  "company": string|null,\n  "title": string|null,\n  "website": string|null (full URL with https:// if possible),\n  "linkedin_url": string|null (full URL)\n}\n\nRules:\n- "name" must always be the best full display name ("first_name last_name" if both known).\n- If the image shows a LinkedIn profile, prefer the headline as "title" and the employer from Experience as "company".\n- Use null (not empty strings) for anything not clearly visible.\n- Strip social handles of @ prefixes. Expand shortened URLs if obvious (e.g. "linkedin.com/in/jane" → "https://linkedin.com/in/jane").'
        }]
      }]
    });
    const text = (response.content || []).find(b => b.type === 'text');
    const jsonMatch = text ? text.text.match(/\{[\s\S]*\}/) : null;
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    if (!parsed.name && (parsed.first_name || parsed.last_name)) {
      parsed.name = [parsed.first_name, parsed.last_name].filter(Boolean).join(' ').trim() || null;
    }
    res.json({ success: true, contact: parsed });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
};
