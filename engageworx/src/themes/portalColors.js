// src/themes/portalColors.js
// Shared base palette for portal chrome. These are the super-admin "Service Provider" colors; the
// CSP portal renders on the SAME base so its shell matches the SA shell, each overlaying its own
// brand primary/accent via getThemedColors(). Values mirror TENANTS.serviceProvider.colors in
// App.jsx; App.jsx adopts this module as the single source in Phase 2b (kept in sync until then).
export var SP_BASE_COLORS = {
  primary: '#00C9FF',
  accent: '#E040FB',
  bg: '#080d1a',
  surface: '#0d1425',
  border: '#182440',
  divider: 'rgba(255,255,255,0.2)',
  text: '#E8F4FD',
  muted: '#6B8BAE',
};
