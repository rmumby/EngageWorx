/**
 * Brand color contrast utility functions.
 *
 * Pure functions for WCAG contrast ratio calculation, foreground color
 * selection, readability checking, and accessible color suggestion.
 *
 * Used by:
 *   - Phase 5 contrast guardrails (brand color save validation)
 *   - Phase 3 components (dynamic foreground on brand-colored backgrounds)
 *   - BrandingEditor (preview contrast warnings)
 */

/**
 * Parse a hex color string to {r, g, b} (0-255).
 * Accepts #RGB, #RRGGBB, or #RRGGBBAA formats.
 */
function parseHex(hex) {
  if (!hex || typeof hex !== 'string') return null;
  var c = hex.replace('#', '');
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  if (c.length < 6) return null;
  var r = parseInt(c.substring(0, 2), 16);
  var g = parseInt(c.substring(2, 4), 16);
  var b = parseInt(c.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return { r: r, g: g, b: b };
}

/**
 * Calculate relative luminance per WCAG 2.1 spec.
 * @param {{r: number, g: number, b: number}} rgb - Color components 0-255
 * @returns {number} Luminance 0-1
 */
function relativeLuminance(rgb) {
  var rs = rgb.r / 255;
  var gs = rgb.g / 255;
  var bs = rgb.b / 255;
  var r = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
  var g = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
  var b = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate WCAG contrast ratio between two colors.
 * @param {string} color1 - Hex color string
 * @param {string} color2 - Hex color string
 * @returns {number} Contrast ratio (1 to 21)
 */
function contrastRatio(color1, color2) {
  var rgb1 = parseHex(color1);
  var rgb2 = parseHex(color2);
  if (!rgb1 || !rgb2) return 1;
  var l1 = relativeLuminance(rgb1);
  var l2 = relativeLuminance(rgb2);
  var lighter = Math.max(l1, l2);
  var darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Pick the best foreground color (black or white) for a given background.
 * @param {string} bgColor - Hex background color
 * @returns {string} '#000000' or '#ffffff'
 */
function bestForeground(bgColor) {
  var rgb = parseHex(bgColor);
  if (!rgb) return '#000000';
  var lum = relativeLuminance(rgb);
  // If background is light (luminance > 0.179), use dark text
  return lum > 0.179 ? '#000000' : '#ffffff';
}

/**
 * Check if a foreground/background pair meets WCAG readability.
 * @param {string} fg - Foreground hex color
 * @param {string} bg - Background hex color
 * @param {'AA'|'AAA'} level - WCAG level (default 'AA')
 * @returns {boolean}
 */
function isReadable(fg, bg, level) {
  var ratio = contrastRatio(fg, bg);
  if (level === 'AAA') return ratio >= 7;
  return ratio >= 4.5; // AA
}

/**
 * Suggest a similar color with better contrast against a target background.
 * Adjusts lightness while preserving hue and saturation.
 * @param {string} brandColor - Original hex color
 * @param {string} targetBg - Target background hex color
 * @returns {string} Suggested hex color with better contrast
 */
function suggestSimilarReadable(brandColor, targetBg) {
  var rgb = parseHex(brandColor);
  var bgRgb = parseHex(targetBg);
  if (!rgb || !bgRgb) return brandColor;

  var bgLum = relativeLuminance(bgRgb);
  var needDarker = bgLum > 0.5; // Light bg → darken the brand color

  // Iteratively adjust brightness until WCAG AA is met (max 20 steps)
  var factor = needDarker ? 0.9 : 1.15;
  var adjusted = { r: rgb.r, g: rgb.g, b: rgb.b };

  for (var i = 0; i < 20; i++) {
    var adjLum = relativeLuminance(adjusted);
    var lighter = Math.max(adjLum, bgLum);
    var darker = Math.min(adjLum, bgLum);
    var ratio = (lighter + 0.05) / (darker + 0.05);
    if (ratio >= 4.5) break;

    if (needDarker) {
      adjusted.r = Math.max(0, Math.round(adjusted.r * factor));
      adjusted.g = Math.max(0, Math.round(adjusted.g * factor));
      adjusted.b = Math.max(0, Math.round(adjusted.b * factor));
    } else {
      adjusted.r = Math.min(255, Math.round(adjusted.r * factor));
      adjusted.g = Math.min(255, Math.round(adjusted.g * factor));
      adjusted.b = Math.min(255, Math.round(adjusted.b * factor));
    }
  }

  var toHex = function(n) { return n.toString(16).padStart(2, '0'); };
  return '#' + toHex(adjusted.r) + toHex(adjusted.g) + toHex(adjusted.b);
}

module.exports = {
  contrastRatio: contrastRatio,
  bestForeground: bestForeground,
  isReadable: isReadable,
  suggestSimilarReadable: suggestSimilarReadable,
  parseHex: parseHex,
  relativeLuminance: relativeLuminance,
};
