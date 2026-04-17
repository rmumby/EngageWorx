// api/detect-branding.js
// Lightweight brand detection — no Claude, no AI. Pure HTML parsing.
// Fast (~1-2s) and reliable. Falls back gracefully at every step.
//
// GET /api/detect-branding?url=https://example.com
// Returns: { primary_color, secondary_color, logo_url, favicon_url, site_name }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var url = ((req.query && req.query.url) || (req.body && req.body.url) || '').trim();
  if (!url) return res.status(400).json({ error: 'url required' });
  if (url.indexOf('http') !== 0) url = 'https://' + url;

  var result = { primary_color: null, secondary_color: null, logo_url: null, favicon_url: null, site_name: null };

  try {
    var r = await fetch(url, {
      headers: { 'User-Agent': 'EngageWorxBot/1.0 (+https://engwx.com)', 'Accept': 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return res.status(200).json(result);
    var html = await r.text();
    var head = html.substring(0, Math.min(html.indexOf('</head>') + 7, 15000)) || html.substring(0, 15000);
    var origin;
    try { origin = new URL(url).origin; } catch (e) { origin = url; }

    // ── Meta tag extraction helpers ──────────────────────────────────────
    function metaContent(nameOrProp) {
      // Handles both name="..." and property="..." with content in either order
      var patterns = [
        new RegExp('<meta[^>]+(?:name|property)=["\']' + nameOrProp + '["\'][^>]+content=["\']([^"\']+)["\']', 'i'),
        new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:name|property)=["\']' + nameOrProp + '["\']', 'i'),
      ];
      for (var i = 0; i < patterns.length; i++) {
        var m = head.match(patterns[i]);
        if (m) return m[1].trim();
      }
      return null;
    }

    function resolveUrl(href) {
      if (!href) return null;
      if (href.indexOf('http') === 0) return href;
      if (href.indexOf('//') === 0) return 'https:' + href;
      if (href.indexOf('/') === 0) return origin + href;
      return origin + '/' + href;
    }

    // ── Site name ────────────────────────────────────────────────────────
    result.site_name = metaContent('og:site_name');
    if (!result.site_name) {
      var titleMatch = head.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) {
        result.site_name = titleMatch[1].trim().replace(/\s*[\-–—|·:]\s*(Home|Welcome|Official|Main).*$/i, '').trim();
      }
    }

    // ── Logo: og:image → apple-touch-icon → logo in <img> → favicon ────
    var ogImage = metaContent('og:image');
    if (ogImage) result.logo_url = resolveUrl(ogImage);

    if (!result.logo_url) {
      var touchIcon = head.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i);
      if (touchIcon) result.logo_url = resolveUrl(touchIcon[1]);
    }
    if (!result.logo_url) {
      var logoImg = head.match(/<img[^>]+(?:class|id|alt)=["'][^"']*logo[^"']*["'][^>]+src=["']([^"']+)["']/i);
      if (logoImg) result.logo_url = resolveUrl(logoImg[1]);
    }

    // ── Favicon ──────────────────────────────────────────────────────────
    var iconLink = head.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i);
    if (iconLink) result.favicon_url = resolveUrl(iconLink[1]);
    else result.favicon_url = origin + '/favicon.ico';

    // ── Colors ───────────────────────────────────────────────────────────
    // Priority 1: explicit meta tags
    var themeColor = metaContent('theme-color') || metaContent('msapplication-TileColor');
    if (themeColor && /^#[0-9a-fA-F]{3,8}$/.test(themeColor)) {
      result.primary_color = themeColor.toLowerCase();
    }

    // Priority 2: most-frequent non-gray hex colors in the HTML
    if (!result.primary_color || !result.secondary_color) {
      var hexMatches = html.match(/#[0-9A-Fa-f]{6}/g) || [];
      var freq = {};
      hexMatches.forEach(function(c) {
        var lc = c.toLowerCase();
        var rv = parseInt(lc.slice(1, 3), 16);
        var gv = parseInt(lc.slice(3, 5), 16);
        var bv = parseInt(lc.slice(5, 7), 16);
        // Skip near-black, near-white, pure grays
        if (rv < 30 && gv < 30 && bv < 30) return;
        if (rv > 225 && gv > 225 && bv > 225) return;
        if (Math.abs(rv - gv) < 15 && Math.abs(gv - bv) < 15 && Math.abs(rv - bv) < 15) return;
        freq[lc] = (freq[lc] || 0) + 1;
      });
      var sorted = Object.entries(freq).sort(function(a, b) { return b[1] - a[1]; });
      if (!result.primary_color && sorted.length > 0) result.primary_color = sorted[0][0];
      if (!result.secondary_color && sorted.length > 1) result.secondary_color = sorted[1][0];
      // If primary was set from meta but secondary wasn't, take the top CSS color
      if (result.primary_color && !result.secondary_color && sorted.length > 0) {
        var candidate = sorted.find(function(e) { return e[0] !== result.primary_color; });
        if (candidate) result.secondary_color = candidate[0];
      }
    }

    return res.status(200).json(result);
  } catch (err) {
    console.warn('[detect-branding] error:', err.message);
    return res.status(200).json(result);
  }
};
