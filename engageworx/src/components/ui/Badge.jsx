// src/components/ui/Badge.jsx — Status pill
// variant: 'semantic' (neutral) | 'accent' (tenant brand)
// Props: children, variant, style

import { useBranding } from '../../BrandingContext';
import { useTheme } from '../../ThemeContext';

export default function Badge({ children, variant, style }) {
  var b = useBranding();
  var { theme, isDark } = useTheme();
  var v = variant || 'semantic';
  var accent = b.brandPrimary || theme.primary;

  var bg, color, border;
  if (v === 'accent') {
    bg = accent + '22';
    color = accent;
    border = '1px solid ' + accent + '44';
  } else {
    // semantic — neutral status
    bg = isDark ? 'rgba(255,255,255,0.06)' : '#f3f4f6';
    color = isDark ? theme.muted : '#4b5563';
    border = '1px solid ' + (isDark ? 'rgba(255,255,255,0.1)' : '#d1d5db');
  }

  return (
    <span style={Object.assign({
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 6,
      fontSize: 11, fontWeight: 600, lineHeight: 1.5,
      background: bg, color: color, border: border,
      whiteSpace: 'nowrap',
    }, style || {})}>
      {children}
    </span>
  );
}
