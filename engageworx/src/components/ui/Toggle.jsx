// src/components/ui/Toggle.jsx — On/off switch, tenant-accent on-state
// Props: checked, onChange, disabled, label, description

import { useBranding } from '../../BrandingContext';
import { useTheme } from '../../ThemeContext';

export default function Toggle({ checked, onChange, disabled, label, description }) {
  var b = useBranding();
  var { theme, isDark } = useTheme();
  var accent = b.brandPrimary || theme.primary;
  var trackBg = checked ? accent : (isDark ? 'rgba(255,255,255,0.15)' : '#d1d5db');

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, opacity: disabled ? 0.5 : 1 }}>
      {(label || description) && (
        <div style={{ flex: 1 }}>
          {label && <div style={{ color: theme.text, fontSize: 14, fontWeight: 600 }}>{label}</div>}
          {description && <div style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>{description}</div>}
        </div>
      )}
      <div
        role="switch"
        aria-checked={!!checked}
        tabIndex={disabled ? -1 : 0}
        onClick={disabled ? undefined : function() { onChange(!checked); }}
        onKeyDown={disabled ? undefined : function(e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(!checked); } }}
        style={{
          width: 44, height: 24, borderRadius: 12, background: trackBg,
          position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s', flexShrink: 0, outline: 'none',
        }}
      >
        <div style={{
          width: 20, height: 20, borderRadius: 10, background: '#fff',
          position: 'absolute', top: 2, left: checked ? 22 : 2,
          transition: 'left 0.2s',
        }} />
      </div>
    </div>
  );
}
