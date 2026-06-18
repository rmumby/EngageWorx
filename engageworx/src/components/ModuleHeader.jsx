// src/components/ModuleHeader.jsx
// Shared page-title header for portal modules — ONE standard size/weight/spacing so module titles
// stop drifting (some were 20–28px, some missing entirely). Theme-aware (text/muted from
// ThemeContext); brand-neutral. The `right` slot holds a module's primary action(s) (e.g. +New X),
// so headers with inline CTAs stay consistent too.
//
// Standard: title 28 / 800 / theme.text, subtitle 14 / theme.muted, 24px bottom margin.
//
// Usage:  <ModuleHeader title="Contacts" subtitle="…" right={<Button …>+ Add Contact</Button>} />

import { useTheme } from '../ThemeContext';

export default function ModuleHeader({ title, subtitle, right, style }) {
  var { theme } = useTheme();
  return (
    <div style={Object.assign({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24 }, style || {})}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: theme.text, fontFamily: "'DM Sans', sans-serif", letterSpacing: '-0.4px', lineHeight: 1.2 }}>{title}</h1>
        {subtitle ? <p style={{ margin: '4px 0 0', fontSize: 14, color: theme.muted, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>{subtitle}</p> : null}
      </div>
      {right ? <div style={{ flexShrink: 0 }}>{right}</div> : null}
    </div>
  );
}
