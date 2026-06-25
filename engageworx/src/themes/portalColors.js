// src/themes/portalColors.js
// Shared base palette for portal chrome. These are the super-admin "Service Provider" colors; the
// CSP portal renders on the SAME base so its shell matches the SA shell, each overlaying its own
// brand primary/accent via getThemedColors(). Values mirror TENANTS.serviceProvider.colors in
// App.jsx; App.jsx adopts this module as the single source in Phase 2b (kept in sync until then).
export var SP_BASE_COLORS = {
  primary: '#00C9FF',
  accent: '#E040FB',
  bg: '#0D1117',
  surface: '#161B22',
  border: '#30363D',
  divider: '#30363D',
  text: '#F0F6FC',
  muted: '#ABB4BF',
  inputBg: '#FFFFFF',
  inputText: '#0D1117',
  cardBg: '#161B22',
  cardBorder: '#30363D',
};
