// src/BrandLogo.jsx — Renders brand name or logo, white-label aware.
// Uses BrandingContext to determine whether to show EngageWorx or tenant brand.

import { useBranding } from './BrandingContext';
import { useTheme } from './ThemeContext';

export default function BrandLogo({ size, style }) {
  var b = useBranding();
  var { isDark } = useTheme();
  var fontSize = size || 28;
  var textColor = isDark ? '#fff' : '#111827';

  if (b.isWhiteLabel && b.brandLogoUrl) {
    return <img src={b.brandLogoUrl} alt={b.brandName} style={Object.assign({ height: fontSize * 1.2, objectFit: 'contain' }, style || {})} />;
  }

  if (b.isWhiteLabel) {
    return <span style={Object.assign({ fontSize: fontSize, fontWeight: 900, color: textColor }, style || {})}>{b.brandName}</span>;
  }

  // Default EngageWorx branded text
  return <span style={Object.assign({ fontSize: fontSize, fontWeight: 900, color: textColor }, style || {})}>Engage<span style={{ color: b.brandPrimary }}>Worx</span></span>;
}
