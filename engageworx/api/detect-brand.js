const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Accept url from POST body OR GET query param
  var url = ((req.body && req.body.url) || (req.query && req.query.url) || '').trim();
  if (!url) return res.status(400).json({ error: 'URL is required' });

  // Normalize URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  try {
    // Fetch the website HTML
    var fetchRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EngageWorx/1.0; +https://engwx.com)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!fetchRes.ok) {
      return res.status(422).json({ error: 'Could not fetch website. Please check the URL and try again.' });
    }

    var html = await fetchRes.text();

    // Strip HTML tags to get readable text (keep it under 8000 chars for Claude)
    var text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);

    // Extract meta tags for colors and logo
    var metaOgImage = (html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) || [])[1] || '';
    var metaThemeColor = (html.match(/<meta[^>]+name="theme-color"[^>]+content="([^"]+)"/i) || [])[1] || '';
    var faviconUrl = (html.match(/<link[^>]+rel="[^"]*icon[^"]*"[^>]+href="([^"]+)"/i) || [])[1] || '';
    var logoUrl = (html.match(/<img[^>]+(?:class|id|alt)="[^"]*logo[^"]*"[^>]+src="([^"]+)"/i) || [])[1] || metaOgImage || '';

    // Resolve relative URLs
    var baseUrl = new URL(url);
    if (logoUrl && !logoUrl.startsWith('http')) {
      logoUrl = logoUrl.startsWith('/') ? baseUrl.origin + logoUrl : baseUrl.origin + '/' + logoUrl;
    }
    if (faviconUrl && !faviconUrl.startsWith('http')) {
      faviconUrl = faviconUrl.startsWith('/') ? baseUrl.origin + faviconUrl : baseUrl.origin + '/' + faviconUrl;
    }

    // Extract CSS colors from inline styles
    var colorMatches = html.match(/#[0-9A-Fa-f]{6}/g) || [];
    var colorFreq = {};
    colorMatches.forEach(function(c) {
      var lower = c.toLowerCase();
      // Skip near-black, near-white, and gray colors
      var r = parseInt(lower.slice(1,3),16), g = parseInt(lower.slice(3,5),16), b = parseInt(lower.slice(5,7),16);
      var isGray = Math.abs(r-g) < 20 && Math.abs(g-b) < 20 && Math.abs(r-b) < 20;
      var isBlack = r < 40 && g < 40 && b < 40;
      var isWhite = r > 220 && g > 220 && b > 220;
      if (!isGray && !isBlack && !isWhite) {
        colorFreq[lower] = (colorFreq[lower] || 0) + 1;
      }
    });
    var topColors = Object.entries(colorFreq).sort(function(a,b){ return b[1]-a[1]; }).slice(0,5).map(function(e){ return e[0]; });

    // Call Claude to extract structured brand info
    var anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    var prompt = `You are a brand analyst. Analyze this website content and extract brand information.

URL: ${url}
Theme color from meta tag: ${metaThemeColor || 'not found'}
Top colors found in CSS: ${topColors.join(', ') || 'not found'}
Logo URL found: ${logoUrl || 'not found'}

Website text content:
${text}

Return ONLY a JSON object with these exact fields (no markdown, no backticks):
{
  "name": "Company name",
  "description": "2-3 sentence business description suitable for an AI chatbot knowledge base. Include what they do, who they serve, and key services/products.",
  "primary": "Primary brand color as hex code (e.g. #FF6B35). Use the theme-color meta tag or most prominent non-gray color from CSS.",
  "secondary": "Secondary brand color as hex code. Use the second most prominent color.",
  "logoUrl": "Best logo URL found or empty string",
  "vertical": "One of: Automotive, Beauty/Spa/Salon, Clothing/Apparel, Education, Entertainment, Event Planning, Finance/Banking, Food/Grocery, Public Service, Hotel/Lodging, Medical/Health, Non-profit, Professional Services, Shopping/Retail, Travel/Transportation, Restaurant, Technology, Other",
  "tagline": "Company tagline or motto if found, otherwise empty string",
  "phone": "Phone number if found, otherwise empty string",
  "address": "Business address if found, otherwise empty string",
  "email": "Contact email if found, otherwise empty string"
}`;

    var claudeRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    var responseText = claudeRes.content[0].text.trim();

    // Clean JSON if needed
    responseText = responseText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    var brandData = JSON.parse(responseText);

    // Override logo if Claude didn't find one but we did
    if (!brandData.logoUrl && logoUrl) brandData.logoUrl = logoUrl;

    // Override colors if meta theme-color was found
    if (metaThemeColor && metaThemeColor.startsWith('#')) {
      brandData.primary = brandData.primary || metaThemeColor;
    }

    // Fallbacks
    brandData.primary = brandData.primary || '#00C9FF';
    brandData.secondary = brandData.secondary || '#E040FB';

    return res.status(200).json({ success: true, brand: brandData });

  } catch (err) {
    console.error('[detect-brand] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to detect brand. Please enter details manually.',
    });
  }
};
