// src/components/ui/Button.jsx — Shared button with auto-contrast text
// Variants: primary (brand color), secondary (subtle), ghost (transparent), danger (red)
// Text color auto-calculated via WCAG relative luminance for readable contrast.

import { useBranding } from '../../BrandingContext';
import { useTheme } from '../../ThemeContext';

// WCAG 2.1 relative luminance: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
// sRGB channel → linear: apply gamma decompression, then weight R/G/B per spec.
function hexToRgb(hex) {
  var h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function srgbToLinear(c) {
  var s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex) {
  var rgb = hexToRgb(hex);
  return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
}

// Returns '#fff' or '#000' for readable text on the given background color.
// Threshold 0.179 gives 4.5:1 contrast ratio against both choices per WCAG AA.
function contrastText(bgHex) {
  return relativeLuminance(bgHex) > 0.179 ? '#000' : '#fff';
}

// Exported so other components can use the same logic without importing the full Button
export { contrastText, relativeLuminance };

// Shared flat-accent button STYLE (brand fill + WCAG auto-contrast text) — same computation as the
// `accent` variant below. For modules that style their own <button> via a reused style const: point
// that const at this hook to drop gradients and match Button.jsx, without inlining <Button> at every
// call site. `overrides` lets a module keep its own padding/fontSize/etc.
export function useAccentButtonStyle(overrides) {
  var b = useBranding();
  var { theme } = useTheme();
  var brandColor = b.brandPrimary || theme.primary;
  return Object.assign({
    background: brandColor,
    color: contrastText(brandColor),
    border: 'none',
    borderRadius: 10,
    padding: '10px 20px',
    fontWeight: 700,
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    cursor: 'pointer',
  }, overrides || {});
}

// Theme-aware SECONDARY button style (subtle fill, switches light↔dark). Replaces dark-tuned
// rgba(255,255,255,…) consts that wash out on light backgrounds.
export function useSecondaryButtonStyle(overrides) {
  var { isDark } = useTheme();
  return Object.assign({
    background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    color: isDark ? '#E8F4FD' : '#374151',
    border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.12)' : '#d1d5db'),
    borderRadius: 10,
    padding: '10px 20px',
    fontWeight: 600,
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    cursor: 'pointer',
  }, overrides || {});
}

// Theme-aware GHOST button style (transparent, muted text) for text/icon buttons (✕, ← Back, Clear, ★).
export function useGhostButtonStyle(overrides) {
  var { isDark, theme } = useTheme();
  return Object.assign({
    background: 'transparent',
    color: isDark ? theme.muted : '#4b5563',
    border: 'none',
    borderRadius: 8,
    padding: '8px 12px',
    fontWeight: 600,
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    cursor: 'pointer',
  }, overrides || {});
}

// Theme-aware OUTLINE button style (transparent + border) — e.g. Sandbox / Demo / +New Tenant (task 3).
export function useOutlineButtonStyle(overrides) {
  var { isDark, theme } = useTheme();
  return Object.assign({
    background: 'transparent',
    color: isDark ? theme.muted : '#4b5563',
    border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.12)' : '#d1d5db'),
    borderRadius: 10,
    padding: '10px 20px',
    fontWeight: 600,
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    cursor: 'pointer',
  }, overrides || {});
}

// Theme-aware SEGMENTED-control item styling (tabs / filter chips) — NOT a button variant. Returns an
// (active) => style fn so it can be used inside .map() without violating rules-of-hooks. Active = brand
// fill + WCAG-contrast text; inactive = theme-aware subtle. Fixes the dark-tuned wash on light.
export function useSegmentedStyles() {
  var b = useBranding();
  var { isDark, theme } = useTheme();
  var brand = b.brandPrimary || theme.primary;
  return function (active) {
    return active
      ? { background: brand, color: contrastText(brand), border: '1px solid ' + brand }
      : { background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', color: isDark ? theme.muted : '#4b5563', border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.08)' : '#e4e7ec') };
  };
}

var BASE = {
  border: 'none',
  borderRadius: 8,
  padding: '10px 20px',
  fontWeight: 700,
  fontSize: 13,
  fontFamily: "'DM Sans', sans-serif",
  cursor: 'pointer',
  transition: 'opacity 0.15s',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  lineHeight: 1.3,
  textDecoration: 'none',
  boxSizing: 'border-box',
};

export default function Button({ variant, onClick, disabled, children, style, type, href, target, rel, title, className }) {
  var b = useBranding();
  var { theme, isDark } = useTheme();
  var v = variant || 'primary';
  var cls = (v === 'primary' ? 'ew-btn-primary' : '') + (className ? ' ' + className : '') || undefined;

  var brandColor = b.brandPrimary || theme.primary;
  var bg, color, border;

  if (v === 'primary') {
    bg = isDark ? '#ffffff' : '#000000';
    color = isDark ? '#000000' : '#ffffff';
    border = 'none';
  } else if (v === 'secondary') {
    bg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
    color = isDark ? '#ccc' : '#374151';
    border = '1px solid ' + (isDark ? 'rgba(255,255,255,0.1)' : '#d1d5db');
  } else if (v === 'accent') {
    bg = brandColor;
    color = contrastText(brandColor);
    border = 'none';
  } else if (v === 'ghost') {
    bg = 'transparent';
    color = isDark ? theme.muted : '#4b5563';
    border = 'none';
  } else if (v === 'outline') {
    bg = 'transparent';
    color = isDark ? theme.muted : '#4b5563';
    border = '1px solid ' + (isDark ? 'rgba(255,255,255,0.12)' : '#d1d5db');
  } else if (v === 'subtle') {
    bg = 'transparent';
    color = isDark ? theme.muted : '#4b5563';
    border = 'none';
  } else if (v === 'danger') {
    bg = '#dc2626';
    color = '#fff';
    border = 'none';
  }

  var merged = Object.assign({}, BASE, {
    background: bg,
    color: color,
    border: border,
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }, style || {});

  if (href) {
    return (
      <a href={href} target={target} rel={rel} title={title}
        className={cls} style={merged}
        onClick={disabled ? function(e) { e.preventDefault(); } : onClick}
      >{children}</a>
    );
  }

  return (
    <button type={type || 'button'} onClick={onClick} disabled={disabled} title={title}
      className={cls} style={merged}
    >{children}</button>
  );
}
