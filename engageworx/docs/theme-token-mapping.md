# Inline-hex → theme-token mapping convention

Reusable convention for the token-consolidation slices. Goal: replace hand-tuned inline
hex / rgba (and `isDark ? darkHex : lightHex` ternaries) in components with theme tokens,
so color is single-sourced and flips correctly across dark / light / system.

## Two valid token surfaces

1. **CSS custom props** — `var(--theme-*)` / `var(--semantic-*)` (defined in `src/themes/tokens.css`,
   22 structural + semantic tokens). **Preferred for new conversions.** They resolve per the
   `data-theme` attribute on `<html>`, so a single `var(--theme-x)` covers both modes and the
   `isDark` ternary disappears. Usable directly in React inline `style={{}}` objects.
2. **JS theme object** — `useTheme().theme.*` (DARK/LIGHT in `ThemeContext.js`). Already mode-correct.
   Keep existing `theme.text` / `theme.muted` refs as-is (they are tokens, not inline hex). Use when a
   value must be computed in JS.

Both are "theme tokens." Don't rewrite an existing `theme.*` ref just to use `var()`; only convert
**inline hex / rgba literals**.

## Canonical mapping

| Inline value (dark / light)                                   | Token                          | Notes |
|---------------------------------------------------------------|--------------------------------|-------|
| subtle/raised surface: `rgba(255,255,255,0.02–0.06)` / `#f3f4f6`,`#f9fafb` | `var(--theme-surface-raised)`  | light exact; dark normalizes to 0.03 |
| hover / inactive-chip bg: `rgba(255,255,255,0.04)` / `rgba(0,0,0,0.04)`     | `var(--theme-hover-bg)`        | |
| subtle border: `rgba(255,255,255,0.06)` / `#e5e7eb`,`#e4e7ec`              | `var(--theme-border)`          | |
| strong border / track-off: `rgba(255,255,255,0.1–0.15)` / `#d1d5db`        | `var(--theme-border-strong)`   | dark 0.1 exact |
| secondary/muted text: `#ccc`,`#374151`,`#4b5563`,`#6b7280`,`#E8F4FD`        | `var(--theme-text-secondary)`  | grey readable on dark surface AND on white input |
| primary text                                                  | `var(--theme-text)` / keep `theme.text` | |
| text-entry surface (inputs/editor): `rgba(0,0,0,0.3)` / `#ffffff`          | `var(--theme-input-bg)` + `var(--theme-input-text)` | **white field in BOTH modes** per the contrast-pass input decision |
| placeholder / disabled text: `rgba(255,255,255,0.25)` / `#9ca3af`          | `var(--theme-text-secondary)` (on a white input) / `var(--theme-text-muted)` (on a themed surface) | pick by the surface it sits on |
| danger fill `#dc2626` ; error text on it `#fff`               | `var(--semantic-error)` ; keep `#fff` | dark error normalizes to `#FF3B30` |
| timestamps / activity times (clock + date strings)           | `var(--theme-timestamp)`       | dedicated token (dark `#E6EDF3` near-white, light `#6B7280`). Do NOT reuse `--theme-disabled-text` — that's shared with receipts/disabled and would overshoot. Receipts/disabled labels stay on `--theme-disabled-text`. |
| success / warning / info                                      | `var(--semantic-success|warning|info)` (+ `-tint` for fills) | none in slice 0 |

## Intentional literal exceptions (DO NOT tokenize)

- **Brand-relative computed colors** — `contrastText()` (`#000`/`#fff`), `accentEdge()` rgbas, and any
  `accent`/`brandPrimary` fill or `accent+'22'`/`+'44'` tint. These are derived from the tenant brand,
  not from the theme; tokenizing them would break white-label.
- **Monochrome primary button** — `#FFFFFF`/`#0D1117` inverted fill (shipped in the contrast pass). The
  inversion is the design; leaving it literal is clearer than forcing a token whose role is inverted.
- **Control affordances** — e.g. the Toggle knob `#fff` (a switch handle is white in both modes).

## Rules

- Color-only. No layout, sizing, or behavior change.
- After collapsing ternaries, **remove now-unused `isDark`** from the `useTheme()` destructure (keep
  `theme` if a brand fallback like `b.brandPrimary || theme.primary` still needs it) to avoid lint.
- Any value that *shifts* under the nearest-token mapping (e.g. dark danger `#dc2626`→`#FF3B30`, a dark
  text-entry surface flipping to white) must be **called out in the slice report** for visual pass — the
  point of consolidation is normalization onto tokens, but the reviewer confirms each shift.
