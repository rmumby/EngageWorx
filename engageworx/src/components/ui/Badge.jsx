// src/components/ui/Badge.jsx — Status pill
// variant: 'semantic' (neutral) | 'accent' (tenant brand)
// Props: children, variant, style

import { useBranding } from '../../BrandingContext';
import { useTheme } from '../../ThemeContext';

export default function Badge({ children, variant, style }) {
  var b = useBranding();
  var { theme } = useTheme();
  var v = variant || 'semantic';
  var accent = b.brandPrimary || theme.primary;

  var bg, color, border;
  if (v === 'accent') {
    // Brand-relative — tenant accent fill + tint. Intentionally NOT tokenized (white-label).
    bg = accent + '22';
    color = accent;
    border = '1px solid ' + accent + '44';
  } else {
    // semantic — neutral status (theme tokens, mode-flips via data-theme)
    bg = 'var(--theme-surface-raised)';
    color = 'var(--theme-text-secondary)';
    border = '1px solid var(--theme-border-strong)';
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
