# Theming Audit — Findings

Audit date: 2026-05-23

---

## A. Scale of Work

| Metric | Count |
|--------|-------|
| Total hardcoded color occurrences (src/) | ~4,268 |
| Unique color values in use | ~120 |
| RED components (heavily hardcoded, no CSS var usage, would break on theme switch) | 22 |
| YELLOW components (uses C prop or has few hardcoded, but still needs CSS var migration) | 37 |
| GREEN components (infrastructure or pure data — no styling to migrate) | 3 |
| Components using ThemeContext | 3 (App.jsx, CSPPortal, HelpDeskModule) |
| Components using BrandingContext | 2 (BrandLogo, App.jsx) |
| Components accepting C prop | ~40+ |
| Brand color application sites | ~160+ |
| Email templates needing brand injection | 6 (customer-facing) |

---

## B. Top 10 Highest-Impact Components

These are RED-status AND user-facing daily. They set the visual perception of "does theming work."

| Priority | Component | Status | Hardcoded | Why Critical |
|----------|-----------|--------|-----------|-------------|
| 1 | **App.jsx (SP sidebar + shell)** | RED | 307 | Every SP admin sees this every session. Contains sidebar, nav, login screen. |
| 2 | **LiveInboxV2.js** | RED | 141 | Primary daily-use tool. Message bubbles, conversation list, compose. |
| 3 | **Settings.js** | RED | 152 | Visited by every tenant admin. Channels, billing, team all live here. |
| 4 | **PipelineDashboard.jsx** | RED | 155 | SP's primary CRM view. Kanban columns, lead cards, detail modals. |
| 5 | **ContactsModule.js** | RED | 125 | Daily contact management. Table, detail panel, VIP indicators. |
| 6 | **AIChatbot.js** | RED | 96 | Chatbot config visited during onboarding and ongoing tuning. |
| 7 | **CampaignsModule.js** | RED | 139 | Campaign creation wizard and list. Complex multi-step UI. |
| 8 | **CSPPortal.jsx** | RED | 47 | CSP partners' entire portal shell. Already uses ThemeContext structurally. |
| 9 | **AgentPortal.jsx** | RED | 134 | Agent partners' portal. Own dark-only getColors() with no ThemeContext. |
| 10 | **OnboardingWizard.jsx** | RED | 58 | First impression for new tenants. Full-screen, no theme awareness. |

---

## C. Five Trickiest Patterns

### 1. The Brute-Force Light Mode Override (~300 CSS lines)

ThemeContext.js injects a `<style>` element with attribute selectors like `[style*="color: #fff"] { color: #111827 !important; }`. This targets literal inline style strings. Any migration to a proper token system must:
- Remove these overrides (they'll conflict)
- Ensure every component actually reads from tokens (not just receives C prop while still hardcoding)
- Handle the transition period where some components are migrated and some aren't

### 2. Brand-on-Brand-Tint Active States

The pattern `background: C.primary + "22"` with `color: C.primary` means the brand color is used simultaneously as a low-opacity background AND as foreground text on that background. Converting this to tokens requires a separate `--brand-tint` variable that guarantees contrast against `--brand-text`:
- Dark mode: `--brand-tint: brand_primary at 13% opacity on dark surface` → readable
- Light mode: `--brand-tint: brand_primary at 8% opacity on white surface` → may need darker brand text

### 3. Gradient Buttons with Fixed Text Color

`linear-gradient(135deg, C.primary, C.accent)` with `color: "#000"` assumes both brand colors are light enough for black text to be readable. A proper system needs:
- Compute luminance of the gradient midpoint
- Choose white or black text based on contrast ratio
- Can't be done in pure CSS — needs a JS utility at render time

### 4. Semantic Color Maps (STATUS_COLORS, CHANNEL_COLORS, TAG_COLORS)

~8 components define local constant objects mapping states to colors:
```js
var STATUS_COLORS = { active: '#00E676', paused: '#FFD600', error: '#FF3B30', ... };
```
These are NOT theme-structural (they shouldn't change between dark/light). But they DO need to work on both dark and light surfaces. Currently they're chosen for dark backgrounds — some (like `#FFD600` on white) have contrast issues in light mode. Need a semantic token layer that provides mode-appropriate variants.

### 5. AgentPortal / MasterAgentPortal Own Color Systems

These portals define their own `getColors()` function that returns a dark-only palette and passes it as C to children. They don't participate in ThemeContext at all. Converting them requires:
- Removing `getColors()` 
- Wiring them through `getThemedColors()` like CSPPortal does
- But their brand color override logic (merging tenant brand into the palette) must be preserved
- Risk: if the children they render (HelpDeskModule, etc.) start expecting ThemeContext, the portal shell must provide it

---

## D. Recommended Variable Taxonomy

22 CSS custom properties, organized in three layers.

**CONSTRAINT: SP Admin Preservation.** The default (dark) values MUST resolve to the current EngageWorx SP admin dark theme pixel-for-pixel. Dark mode is the default; light mode is opt-in for tenants only. SP admin does NOT get a theme toggle.

### Layer 1: Theme Structural (switch between dark/light)

| Variable | Dark (DEFAULT — matches current SP look) | Light (opt-in for tenants) | Usage |
|----------|------|-------|-------|
| `--theme-bg` | `#080d1a` | `#f9fafb` | Page background |
| `--theme-surface` | `#0d1425` | `#ffffff` | Cards, panels, modals |
| `--theme-surface-alt` | `rgba(255,255,255,0.03)` | `#f3f4f6` | Alternate surface (hover, nested) |
| `--theme-border` | `#182440` | `#e5e7eb` | All borders and dividers |
| `--theme-text` | `#E8F4FD` | `#111827` | Primary text |
| `--theme-text-muted` | `#6B8BAE` | `#4b5563` | Secondary/label text |
| `--theme-text-faint` | `rgba(255,255,255,0.4)` | `#9ca3af` | Placeholder, disabled text |
| `--theme-input-bg` | `rgba(0,0,0,0.3)` | `#ffffff` | Input backgrounds |
| `--theme-input-border` | `rgba(255,255,255,0.1)` | `#d1d5db` | Input borders |
| `--theme-overlay` | `rgba(0,0,0,0.6)` | `rgba(0,0,0,0.3)` | Modal/drawer backdrop |

**Note:** Dark values above are extracted directly from the current hardcoded values in App.jsx, ThemeContext.js DARK object, and the inline styles throughout the SP portal. They are not approximations — they ARE the current SP admin look.

### Layer 2: Brand (per-tenant, applied as accents)

| Variable | Source | Usage |
|----------|--------|-------|
| `--brand-primary` | `tenants.brand_primary` | Links, active states, primary buttons |
| `--brand-secondary` | `tenants.brand_secondary` | Gradient endpoints, secondary accents |
| `--brand-tint` | Computed: primary at 13%/8% alpha | Active state backgrounds |
| `--brand-on-primary` | Computed: `#000` or `#fff` by luminance | Text on brand-colored backgrounds |

### Layer 3: Semantic (fixed intent, mode-appropriate value)

| Variable | Dark | Light | Usage |
|----------|------|-------|-------|
| `--semantic-success` | `#00E676` | `#059669` | Active, connected, approved |
| `--semantic-warning` | `#FFD600` | `#d97706` | Pending, trial, caution |
| `--semantic-error` | `#FF3B30` | `#dc2626` | Failed, suspended, urgent |
| `--semantic-info` | `#0ea5e9` | `#0284c7` | Informational, neutral highlights |
| `--semantic-success-tint` | `rgba(0,230,118,0.12)` | `rgba(5,150,105,0.08)` | Success background |
| `--semantic-warning-tint` | `rgba(255,214,0,0.12)` | `rgba(217,119,6,0.08)` | Warning background |
| `--semantic-error-tint` | `rgba(255,59,48,0.12)` | `rgba(220,38,38,0.08)` | Error background |
| `--semantic-info-tint` | `rgba(14,165,233,0.12)` | `rgba(2,132,199,0.08)` | Info background |

---

## E. Effort Estimates

### Phase 2: Token System + Base Themes
- Define CSS variables in a root stylesheet
- Create `useThemeTokens()` hook that returns the variables as a JS object (for inline styles)
- Wire into ThemeContext (toggle sets `data-theme` attribute, CSS responds)
- Remove brute-force light mode CSS overrides from ThemeContext.js
- Update `getThemedColors()` to return the full token set

**Estimate:** 6-8 hours

### Phase 3: Component Migration

**Top 10 impact components (must be pixel-perfect):**
- App.jsx shell/sidebar/login: 4 hours
- LiveInboxV2: 3 hours
- Settings.js: 3 hours
- PipelineDashboard: 3 hours
- ContactsModule: 2 hours
- AIChatbot: 2 hours
- CampaignsModule: 3 hours
- CSPPortal: 1 hour (mostly ready)
- AgentPortal + MasterAgentPortal: 3 hours (need to remove getColors)
- OnboardingWizard: 2 hours

**Subtotal top 10:** 26 hours

**Everything else (YELLOW + remaining RED):**
- 28 YELLOW components averaging 30 min each: 14 hours
- Remaining RED (demo, signup, landing, email setup, etc.): 8 hours

**Subtotal rest:** 22 hours

**Phase 3 total:** ~48 hours

### Phase 4: User Preference UI + Persistence
- Add `theme_preference` column to `user_profiles` (text: 'auto'|'dark'|'light')
- On login, load preference from profile instead of localStorage
- Settings → Appearance section with 3-option selector
- Sync to localStorage for immediate switch + persist to DB

**Estimate:** 3-4 hours

### Phase 5: Contrast Guardrails
- Import `colord` with a11y plugin
- Add `computeBrandOnPrimary(brandColor)` utility → returns '#000' or '#fff'
- BrandingEditor: warn if saved brand color has < 4.5:1 contrast on current theme surfaces
- Runtime: compute `--brand-on-primary` from `--brand-primary` on theme/brand change
- Gradient buttons: replace hardcoded `color: "#000"` with `var(--brand-on-primary)`

**Estimate:** 4-5 hours

---

## F. Risks

1. **Brute-force CSS removal is a cliff.** The current light mode CSS overrides handle hundreds of edge cases. Removing them before ALL components are migrated will cause a worse light mode than today. Need a migration strategy: perhaps keep overrides as a safety net and remove selector-by-selector as each component is verified.

2. **Brand color contrast is an unsolved product decision.** What happens when a tenant saves a brand color that fails contrast? Options: (a) reject/warn at save time, (b) auto-adjust at render time, (c) let it break with a "your brand color may be hard to read" advisory. Needs Rob's input.

3. **Public pages (LandingPage, SignupPage, Blog) may not need dark/light switching.** These are marketing assets designed with a specific dark aesthetic. Forcing them into a token system may be counterproductive. Rob should decide: do these participate in theming, or stay as-is?

4. **Semantic color maps are a judgment call.** STATUS_COLORS, TAG_COLORS, CHANNEL_COLORS are domain-specific. Do they stay hardcoded (with mode-appropriate variants) or become configurable per-tenant? Hardcoded-with-variants is simpler; configurable adds config surface nobody asked for.

5. **The C prop pattern works but scales poorly.** With 22+ tokens, passing a C object through 4-5 levels of component hierarchy is tedious. May want to switch to a React context or CSS variable approach where components read directly from `:root` vars. But that's a bigger architectural shift — the C prop is a working pattern today.

6. **AgentPortal / MasterAgentPortal divergence.** These define their own color systems independently. If they're low-traffic (fewer users than the main portal), they could be migrated last or even left dark-only with a "dark mode only for partner portals" product decision.

7. **Email templates are a separate track.** They can't use CSS variables. The recommendation (shared `buildEmailShell` helper with dynamic brand injection) is a separate effort from the portal theming work. Don't conflate them.

---

## G. SP Admin Preservation — Specific Risks

**Constraint:** The SP admin portal experience (current dark look — `#080d1a` bg, `#E8F4FD` text, `#00C9FF`/`#E040FB` accents) must remain visually IDENTICAL after shipping. SP admin does NOT get a theme toggle.

### Components where variable-driven version risks visual drift

| Component | Risk | Pattern | Preservation strategy |
|-----------|------|---------|----------------------|
| **App.jsx sidebar** | LOW | Uses `C.surface` for bg, `C.border` for divider — both already match DARK tokens | Default values = current values. No drift. |
| **App.jsx SuperAdminDashboard** | MEDIUM | `TENANTS` demo fixtures have per-tenant color objects hardcoded (`#FF6B35`, `#00E676`, `#7C4DFF`). These are DATA, not theme. | Keep as data literals — they represent tenant brands, not the SP theme. Do not tokenize. |
| **PipelineDashboard stage columns** | MEDIUM | `STAGE_COLORS` map assigns specific colors per pipeline stage (`inquiry=#6366f1`, `customer=#00E676`, etc.). SP sees these daily. | These are semantic domain colors, not theme tokens. Keep as constants. Verify they pass contrast on `--theme-surface`. |
| **AgentPortal / MasterAgentPortal** | HIGH | Define their own `getColors()` with a custom dark palette that differs slightly from the SP dark: uses `#FFD600`/`#FF6B35` as primary/accent instead of `#00C9FF`/`#E040FB`. | These portals' brand overrides are intentional (agent = gold, master_agent = pink). The token system must preserve per-portal-type brand injection. Their structural colors (bg/surface/text) should use the same DARK tokens. |
| **Gradient buttons** | MEDIUM | SP admin buttons use `linear-gradient(135deg, #00C9FF, #E040FB)` — this is `brand_primary → brand_secondary`. After tokenization, the SP tenant's brand colors produce the same gradient. | Ensure SP tenant row in DB has `brand_primary='#00C9FF'`, `brand_secondary='#E040FB'`. Gradient reads from `--brand-primary` → `--brand-secondary`. Pixel-identical. |
| **Login screen** | LOW | Already reads from `getThemedColors()` which merges SP brand. BrandLogo renders "EngageWorx" in brand color. | No change needed — already brand-driven. |
| **ThemeContext light mode CSS overrides** | HIGH | The ~300-line `<style>` block only activates for `!isDark`. SP admin is always dark, so these never fire for SP. But if removal is premature, light-mode tenants break. | Phase strategy: keep the overrides during migration, gate them with `[data-theme="light"]` selector. SP admin never has `data-theme="light"`, so overrides never fire for SP. Remove overrides only AFTER all components are migrated. |

### Hardcoded patterns that embed SP-specific assumptions

1. **`background: "rgba(255,255,255,0.03)"`** — This is "slightly lighter than the dark surface." It works because the surface IS dark. Variable: `--theme-surface-alt`. Dark value = `rgba(255,255,255,0.03)` (same as today). Light value = `#f3f4f6`. SP admin sees exactly the same value.

2. **`border: "1px solid rgba(255,255,255,0.08)"`** — Semi-transparent white border assumes dark bg. Variable: `--theme-border`. Dark value = `rgba(255,255,255,0.08)` → resolves to the same soft border on `#0d1425`. Could also use `#182440` (the opaque equivalent, used interchangeably today). Recommend standardizing on `#182440` for the dark token to avoid alpha-compositing variance.

3. **`color: "rgba(255,255,255,0.4)"`** — Label text. Currently used for "UPPERCASE LABEL" styles in Settings, AIChatbot, etc. Variable: `--theme-text-faint`. Dark value must be this exact alpha-white. SP admin: pixel-identical.

4. **`background: "rgba(0,0,0,0.3)"`** — Input field backgrounds. These are "darker than the surface" in dark mode. Variable: `--theme-input-bg`. Dark = `rgba(0,0,0,0.3)` (exact match). SP admin: pixel-identical.

5. **The "badge" pattern: `background: color + "22", border: color + "44", color: color`** — This is used everywhere for status/channel badges. It's NOT a theme token — it's a formula applied to a semantic or brand color. The formula itself must be preserved as a utility (e.g., `tintedBadge(color)` → `{ bg, border, text }`). SP admin sees exact same computed values because the formula input (the color) doesn't change.

### Verification plan for SP preservation

After Phase 2 (token system) and before Phase 3 (component migration):
1. Screenshot the SP admin portal at: Dashboard, TenantManagement, Pipeline, Live Inbox, Settings, AI Chatbot
2. Apply tokens to those components
3. Re-screenshot
4. Pixel-diff. Any delta > 1px = regression, must match original.

SP admin never opts into light mode, so the only risk is that replacing hardcoded values with variables that resolve to the SAME hardcoded values introduces rounding, alpha compositing differences, or specificity conflicts. The verification gate catches this.
