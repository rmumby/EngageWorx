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
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [{
          type: 'image',
          source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image }
        }, {
          type: 'text',
          text: 'Extract contact info from this business card or conference badge. Return ONLY valid JSON with fields: name, company, email, phone, title. Use null for missing fields. No explanation, no markdown.'
        }]
      }]
    });
    const text = (response.content || []).find(b => b.type === 'text');
    const jsonMatch = text ? text.text.match(/\{[\s\S]*\}/) : null;
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    res.json({ success: true, contact: parsed });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
};
