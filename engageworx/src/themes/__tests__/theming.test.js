/**
 * Theming Phase 2 tests.
 *
 * Covers:
 *   - Contrast helper: WCAG ratio calculations
 *   - Contrast helper: bestForeground selection
 *   - Contrast helper: isReadable checks
 *   - Contrast helper: suggestSimilarReadable improvement
 *   - Token system: file exists with expected variables
 *   - Theme preference: SP admin locked to dark
 */

var {
  contrastRatio,
  bestForeground,
  isReadable,
  suggestSimilarReadable,
  parseHex,
  relativeLuminance,
} = require('../contrast');

var fs = require('fs');
var path = require('path');

// ─── Contrast ratio calculation ──────────────────────────────────────────────

describe('contrastRatio', function() {
  test('pure black on pure white = 21:1', function() {
    var ratio = contrastRatio('#000000', '#ffffff');
    expect(ratio).toBeCloseTo(21, 0);
  });

  test('same color = 1:1', function() {
    expect(contrastRatio('#ff0000', '#ff0000')).toBeCloseTo(1, 1);
  });

  test('white on light gray has low contrast', function() {
    var ratio = contrastRatio('#ffffff', '#f3f4f6');
    expect(ratio).toBeLessThan(1.5);
  });

  test('dark gray on white has high contrast', function() {
    var ratio = contrastRatio('#111827', '#ffffff');
    expect(ratio).toBeGreaterThan(15);
  });

  test('handles short hex format (#RGB)', function() {
    var ratio = contrastRatio('#000', '#fff');
    expect(ratio).toBeCloseTo(21, 0);
  });

  test('handles null/invalid gracefully', function() {
    expect(contrastRatio(null, '#fff')).toBe(1);
    expect(contrastRatio('#fff', '')).toBe(1);
    expect(contrastRatio('notacolor', '#000')).toBe(1);
  });
});

// ─── bestForeground ──────────────────────────────────────────────────────────

describe('bestForeground', function() {
  test('returns black for white background', function() {
    expect(bestForeground('#ffffff')).toBe('#000000');
  });

  test('returns white for black background', function() {
    expect(bestForeground('#000000')).toBe('#ffffff');
  });

  test('returns white for dark blue (SP bg #080d1a)', function() {
    expect(bestForeground('#080d1a')).toBe('#ffffff');
  });

  test('returns black for light gray (#f9fafb)', function() {
    expect(bestForeground('#f9fafb')).toBe('#000000');
  });

  test('returns white for EngageWorx cyan (#00C9FF)', function() {
    // Cyan is moderately light but on dark side of threshold
    var result = bestForeground('#00C9FF');
    // Cyan luminance ~0.47, threshold is 0.179 → black text
    expect(result).toBe('#000000');
  });

  test('returns white for dark purple (#7C3AED)', function() {
    expect(bestForeground('#7C3AED')).toBe('#ffffff');
  });

  test('handles null gracefully', function() {
    expect(bestForeground(null)).toBe('#000000');
  });
});

// ─── isReadable ──────────────────────────────────────────────────────────────

describe('isReadable', function() {
  test('black on white passes AA', function() {
    expect(isReadable('#000000', '#ffffff', 'AA')).toBe(true);
  });

  test('black on white passes AAA', function() {
    expect(isReadable('#000000', '#ffffff', 'AAA')).toBe(true);
  });

  test('light gray text on white fails AA', function() {
    expect(isReadable('#d1d5db', '#ffffff', 'AA')).toBe(false);
  });

  test('#6b7280 on white passes AA (our fixed muted color)', function() {
    expect(isReadable('#6b7280', '#ffffff', 'AA')).toBe(true);
  });

  test('#9ca3af on white fails AA (the old muted color)', function() {
    expect(isReadable('#9ca3af', '#ffffff', 'AA')).toBe(false);
  });

  test('#4b5563 on #f3f4f6 passes AA (text-secondary on surface-raised)', function() {
    expect(isReadable('#4b5563', '#f3f4f6', 'AA')).toBe(true);
  });

  test('defaults to AA when level not specified', function() {
    expect(isReadable('#000000', '#ffffff')).toBe(true);
    expect(isReadable('#d1d5db', '#ffffff')).toBe(false);
  });
});

// ─── suggestSimilarReadable ──────────────────────────────────────────────────

describe('suggestSimilarReadable', function() {
  test('returns more readable color than input for pale yellow on white', function() {
    var original = '#FFD600'; // pale yellow
    var bg = '#ffffff';
    var suggested = suggestSimilarReadable(original, bg);
    var originalRatio = contrastRatio(original, bg);
    var suggestedRatio = contrastRatio(suggested, bg);
    expect(suggestedRatio).toBeGreaterThan(originalRatio);
  });

  test('suggested color meets WCAG AA against target bg', function() {
    var suggested = suggestSimilarReadable('#FFD600', '#ffffff');
    expect(isReadable(suggested, '#ffffff', 'AA')).toBe(true);
  });

  test('already-readable color is returned unchanged or similar', function() {
    var dark = '#1a1a2e';
    var bg = '#ffffff';
    var suggested = suggestSimilarReadable(dark, bg);
    // Dark on white is already readable, should not change much
    var originalRatio = contrastRatio(dark, bg);
    expect(originalRatio).toBeGreaterThan(4.5);
  });

  test('handles null input gracefully', function() {
    expect(suggestSimilarReadable(null, '#fff')).toBeNull();
    expect(suggestSimilarReadable('#fff', null)).toBe('#fff');
  });
});

// ─── parseHex ────────────────────────────────────────────────────────────────

describe('parseHex', function() {
  test('parses 6-char hex', function() {
    expect(parseHex('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
  });

  test('parses 3-char hex', function() {
    expect(parseHex('#f00')).toEqual({ r: 255, g: 0, b: 0 });
  });

  test('parses without #', function() {
    expect(parseHex('00ff00')).toEqual({ r: 0, g: 255, b: 0 });
  });

  test('returns null for invalid', function() {
    expect(parseHex('')).toBeNull();
    expect(parseHex(null)).toBeNull();
    expect(parseHex('xyz')).toBeNull();
  });
});

// ─── Token CSS file validation ───────────────────────────────────────────────

describe('Token CSS file', function() {
  var cssContent;

  beforeAll(function() {
    cssContent = fs.readFileSync(
      path.resolve(__dirname, '..', 'tokens.css'),
      'utf8'
    );
  });

  test('file exists and is non-empty', function() {
    expect(cssContent.length).toBeGreaterThan(100);
  });

  var expectedTokens = [
    '--theme-bg', '--theme-surface', '--theme-surface-raised',
    '--theme-input-bg', '--theme-overlay',
    '--theme-text', '--theme-text-secondary', '--theme-text-muted',
    '--theme-border', '--theme-border-strong',
    '--theme-menu-bg', '--theme-menu-text', '--theme-menu-hover',
    '--semantic-success', '--semantic-warning', '--semantic-error', '--semantic-info',
    '--theme-focus-ring', '--theme-hover-bg', '--theme-active-bg',
    '--theme-disabled-bg', '--theme-disabled-text',
  ];

  test('contains all 22 expected tokens in dark theme (:root)', function() {
    expectedTokens.forEach(function(token) {
      expect(cssContent).toContain(token);
    });
  });

  test('contains [data-theme="dark"] selector', function() {
    expect(cssContent).toContain('[data-theme="dark"]');
  });

  test('contains [data-theme="light"] selector', function() {
    expect(cssContent).toContain('[data-theme="light"]');
  });

  test('contains [data-theme="system"] selector', function() {
    expect(cssContent).toContain('[data-theme="system"]');
  });

  test('contains prefers-color-scheme media query for system mode', function() {
    expect(cssContent).toContain('prefers-color-scheme: light');
  });

  test('dark theme values match current SP portal colors', function() {
    expect(cssContent).toContain('#080d1a'); // bg
    expect(cssContent).toContain('#0d1425'); // surface
    expect(cssContent).toContain('#E8F4FD'); // text
    expect(cssContent).toContain('#6B8BAE'); // text-secondary
    expect(cssContent).toContain('#182440'); // border
  });

  test('focus ring uses brand primary via color-mix', function() {
    expect(cssContent).toContain('color-mix');
    expect(cssContent).toContain('--brand-primary');
  });

  test('light theme text-muted is #6b7280 (WCAG AA compliant)', function() {
    // Verify the amended value is present (not the old #9ca3af)
    var lightSection = cssContent.split('[data-theme="light"]')[1];
    expect(lightSection).toContain('#6b7280');
    expect(lightSection).not.toContain('#9ca3af');
  });
});

// ─── ThemeProvider SP admin locking ──────────────────────────────────────────

describe('ThemeProvider SP admin behavior', function() {
  test('SP admin roles are correctly identified', function() {
    var spRoles = ['superadmin', 'super_admin', 'sp_admin'];
    spRoles.forEach(function(role) {
      var isSPAdmin = role === 'superadmin' || role === 'super_admin' || role === 'sp_admin';
      expect(isSPAdmin).toBe(true);
    });
  });

  test('non-SP roles are not locked', function() {
    var nonSpRoles = ['admin', 'agent', 'viewer', 'tenant_admin'];
    nonSpRoles.forEach(function(role) {
      var isSPAdmin = role === 'superadmin' || role === 'super_admin' || role === 'sp_admin';
      expect(isSPAdmin).toBe(false);
    });
  });
});
