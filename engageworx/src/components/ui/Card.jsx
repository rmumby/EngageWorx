// src/components/ui/Card.jsx — Token-driven surface panel
// Props: children, style, padding (default 22), noBorder

import { useTheme } from '../../ThemeContext';

export default function Card({ children, style, padding, noBorder }) {
  var { theme, isDark } = useTheme();
  var base = {
    background: isDark ? theme.cardBg : theme.surface,
    border: noBorder ? 'none' : ('1px solid ' + (isDark ? theme.cardBorder : theme.border)),
    borderRadius: 14,
    padding: padding !== undefined ? padding : 22,
  };
  return <div style={Object.assign({}, base, style || {})}>{children}</div>;
}
