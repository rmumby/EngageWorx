# Existing Theming Infrastructure

## ThemeContext.js — The Core Theme System

**Location:** `src/ThemeContext.js` (~340 lines)

**What it provides:**
- Two token objects: `DARK` and `LIGHT`, each with 12 keys: `bg`, `surface`, `border`, `text`, `muted`, `primary`, `accent`, `inputBg`, `inputBorder`, `cardBg`, `cardBorder`, `badgeBg`, `mode`
- `ThemeProvider` component wrapping the app
- `useTheme()` hook returning `{ theme, isDark, toggleTheme, setThemeMode }`
- `getThemedColors(brandColors, theme)` function that merges per-tenant brand colors (primary/accent) with the structural theme tokens
- `ThemeToggle` component (a toggle switch in the sidebar)

**How theme mode is determined:**
1. Check `localStorage.getItem('ew_theme_mode')` → 'dark' or 'light'
2. If absent or 'auto', check `window.matchMedia('(prefers-color-scheme: dark')`
3. Default: 'dark'

**How light mode is actually implemented:**
The light mode is NOT implemented via proper tokens flowing through the component tree. Instead, ThemeContext injects a `<style>` element (~300 lines) containing brute-force CSS attribute selectors like:

```css
div[style*="color: #fff"] { color: #111827 !important; }
[style*="background: #080d1a"] { background: #f9fafb !important; }
[style*="background: rgba(0,0,0,0.3)"] { background: #ffffff !important; }
```

This approach:
- Targets literal inline style strings and overrides them with `!important`
- Has ~100 selector rules covering text, backgrounds, borders
- Contains component-specific sections ("LIVE INBOX SPECIFIC", "PIPELINE / LEAD DETAIL")
- Breaks when any color literal changes even slightly
- Cannot handle brand colors (skips accent colors intentionally)
- Only activates on portal hostnames (not landing/blog)

**Body class toggling:**
```js
document.body.classList.toggle('dark-mode', isDark);
document.body.classList.toggle('light-mode', !isDark);
```
These classes exist but are NOT consumed by any CSS file — the attribute selectors do all the work.

---

## BrandingContext.js — Per-Tenant Brand Colors

**Location:** `src/BrandingContext.js`

**What it provides:**
- Sets CSS variables on `:root`: `--brand-primary`, `--brand-secondary`
- Exposes via `useBranding()`: `brandPrimary`, `brandSecondary`, `brandName`, `chatbotName`, `isWhiteLabel`, `brandLogoUrl`
- `setActiveTenantBranding(tenantId)` for CSP drill-down impersonation
- `resetToHostBranding()` to return to host tenant

**How brand resolution works:**
1. On non-platform hostnames (custom domain): RPC `get_tenant_branding_by_domain` → loads brand from DB
2. On platform hostnames (engwx.com, portal.engwx.com, localhost): uses platform defaults
3. CSP impersonation: `setActiveTenantBranding(id)` queries `tenants` for brand fields

**CSS variable consumers:**
- `src/AuthCallback.jsx` — uses `var(--brand-primary)` in button gradients
- `src/ThemeContext.js` — reads computed `--brand-primary` to set body background in light mode
- `src/App.jsx` — sets `--color-primary` / `--color-accent` on drill-down wrapper divs

**Not consumed:** No other component reads from CSS variables. The dominant pattern is passing brand colors through the `C` prop object.

---

## The C Prop Pattern — How Most Components Get Colors

The most common pattern (used by ~40+ components):

```jsx
// Parent (App.jsx, CSPPortal, etc.)
var C = getThemedColors(tenantColors, theme);
<SomeComponent C={C} ... />

// Child
export default function SomeComponent({ C }) {
  var colors = C || { primary: '#00C9FF', accent: '#E040FB', muted: '#6B8BAE', ... };
  return <div style={{ color: colors.muted, background: colors.bg }}>...</div>;
}
```

This pattern is good architecturally — colors flow through props, not globals. But the implementation has problems:
1. Every component has a hardcoded fallback palette (`C || { ... }`) — so components rendered without C revert to dark-mode defaults
2. Components use C for structural colors but still hardcode status/semantic colors inline
3. The C object only has 7-8 keys — components need more tokens than C provides, so they hardcode the rest

---

## Dark Mode Toggle UI

**Location:** `ThemeToggle` component rendered in:
- SP Admin sidebar (App.jsx line 2636)
- CustomerPortal sidebar (App.jsx line 1800)
- CSPPortal sidebar
- AgentPortal sidebar
- MasterAgentPortal sidebar

**Behavior:** Simple toggle switch. Calls `toggleTheme()` which flips between dark/light and persists to localStorage.

---

## What Does NOT Exist

- No `user_profiles.theme_preference` column — preference is client-side only (localStorage)
- No CSS custom properties for structural colors (bg, surface, text, border) — only brand colors
- No Tailwind config or utility classes — all styling is inline `style={{}}` objects
- No CSS/SCSS files with theme variables (except the injected `<style>` in ThemeContext)
- No design token file or shared constants
- No contrast validation or accessibility checking
- No per-component CSS modules or styled-components
- No `prefers-color-scheme` media query in any stylesheet (only JS detection)
