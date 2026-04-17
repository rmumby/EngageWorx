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

    // ── Color utilities ──────────────────────────────────────────────────
    function hexToRgb(hex) {
      return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
    }
    function rgbToHsl(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      var max = Math.max(r, g, b), min = Math.min(r, g, b);
      var h = 0, s = 0, l = (max + min) / 2;
      if (max !== min) {
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
      }
      return { h: h * 360, s: s * 100, l: l * 100 };
    }
    function isBrandWorthy(hex) {
      var c = hexToRgb(hex);
      // Filter near-black (including dark text defaults like #0a0a0a, #111, #1a1a1a)
      if (c.r < 35 && c.g < 35 && c.b < 35) return false;
      // Filter near-white
      if (c.r > 225 && c.g > 225 && c.b > 225) return false;
      // Filter pure grays (low saturation AND mid-range lightness)
      var hsl = rgbToHsl(c.r, c.g, c.b);
      if (hsl.s < 8) return false;
      return true;
    }
    function hueDiff(hex1, hex2) {
      var h1 = rgbToHsl(hexToRgb(hex1).r, hexToRgb(hex1).g, hexToRgb(hex1).b).h;
      var h2 = rgbToHsl(hexToRgb(hex2).r, hexToRgb(hex2).g, hexToRgb(hex2).b).h;
      var diff = Math.abs(h1 - h2);
      return diff > 180 ? 360 - diff : diff;
    }

    // ── Colors ───────────────────────────────────────────────────────────
    // Priority 1: explicit meta tags
    var themeColor = metaContent('theme-color') || metaContent('msapplication-TileColor');
    if (themeColor && /^#[0-9a-fA-F]{3,8}$/.test(themeColor) && isBrandWorthy(themeColor.length === 4
        ? '#' + themeColor[1] + themeColor[1] + themeColor[2] + themeColor[2] + themeColor[3] + themeColor[3]
        : themeColor)) {
      result.primary_color = themeColor.toLowerCase();
    }

    // Priority 2: CSS from <style>, inline style=, and :root — NOT <script>
    var cleanedHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

    // Source 2a: stylesheet content
    var styleContent = '';
    (cleanedHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || []).forEach(function(b) { styleContent += b + ' '; });
    (cleanedHtml.match(/style=["'][^"']+["']/gi) || []).forEach(function(s) { styleContent += s + ' '; });
    (cleanedHtml.match(/:root\s*\{[^}]+\}/gi) || []).forEach(function(b) { styleContent += b + ' '; });

    // Source 2b: button / CTA / link / a / nav elements — weight these higher as brand indicators
    var ctaContent = '';
    (cleanedHtml.match(/<(?:a|button|nav|header)[^>]+style=["'][^"']+["']/gi) || []).forEach(function(s) { ctaContent += s + ' '; });
    // class-based brand colors (bg-primary, btn-primary, text-brand, etc.)
    (cleanedHtml.match(/(?:bg|text|border|btn|brand|primary|accent|cta)[-_]?(?:color)?["'\s:;]*#[0-9A-Fa-f]{6}/gi) || []).forEach(function(s) { ctaContent += s + ' '; });

    function collectHex(source, weightMultiplier) {
      var matches = source.match(/#[0-9A-Fa-f]{6}/g) || [];
      var freq = {};
      matches.forEach(function(c) {
        var lc = c.toLowerCase();
        if (!isBrandWorthy(lc)) return;
        freq[lc] = (freq[lc] || 0) + (weightMultiplier || 1);
      });
      return freq;
    }

    // Merge with CTA colors weighted 3x
    var styleFreq = collectHex(styleContent, 1);
    var ctaFreq = collectHex(ctaContent, 3);
    var merged = Object.assign({}, styleFreq);
    Object.keys(ctaFreq).forEach(function(k) { merged[k] = (merged[k] || 0) + ctaFreq[k]; });

    var sorted = Object.entries(merged).sort(function(a, b) { return b[1] - a[1]; });

    if (!result.primary_color && sorted.length > 0) result.primary_color = sorted[0][0];
    // Secondary must be visually distinct from primary (>30 deg hue difference)
    if (result.primary_color) {
      for (var si = 0; si < sorted.length; si++) {
        var cand = sorted[si][0];
        if (cand === result.primary_color) continue;
        if (hueDiff(result.primary_color, cand) > 30) {
          result.secondary_color = cand;
          break;
        }
      }
      // If no distinct secondary found, take the first non-identical color
      if (!result.secondary_color) {
        var fallbackCand = sorted.find(function(e) { return e[0] !== result.primary_color; });
        if (fallbackCand) result.secondary_color = fallbackCand[0];
      }
    }

    return res.status(200).json(result);
  } catch (err) {
    console.warn('[detect-branding] error:', err.message);
    return res.status(200).json(result);
  }
};
