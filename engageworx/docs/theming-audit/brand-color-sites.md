# Brand Color Application Sites

## Delivery Mechanisms

Brand colors reach the UI through three paths:

1. **C prop (dominant):** `getThemedColors()` merges `tenants.brand_primary` → `C.primary` and `tenants.brand_secondary` → `C.accent`. Passed as prop to ~40 components. Used in inline styles.
2. **CSS variables (limited):** BrandingContext sets `--brand-primary` / `--brand-secondary` on `:root`. Only consumed by AuthCallback.jsx and ThemeContext.js body background.
3. **Direct tenant object (legacy):** Some components (AgentPortal, MasterAgentPortal, TenantManagement) read `tenant.brand.primary` directly from the data object.

## Contrast Validation: NONE

No contrast checking exists anywhere. The `colord` library with a11y plugin is installed in node_modules but never imported. Brand colors are applied blindly in all contexts.

**Risk scenarios with no mitigation:**
- Light brand color (e.g., `#FFD600`) as foreground text on white background in light mode → WCAG failure
- Dark brand color (e.g., `#1A1A2E`) as gradient button background with `color: "#000"` text → unreadable
- ThemeContext's `fixColors()` explicitly SKIPS accent/brand colors during light-mode correction

---

## Application Sites by Category

### A. Gradient Buttons (brand as background)

~25+ buttons across the portal use `linear-gradient(135deg, C.primary, C.accent)` as background with hardcoded `color: "#000"` text. Files:
- App.jsx (login, save, create tenant, invite)
- AIChatbot.js (save KB, primary actions)
- Settings.js (add member, save changes)
- CampaignsModule.js (primary button helper)
- BlogAdmin.jsx, TCRQueue.jsx, WelcomeEmailSettings.jsx

**Problem:** If brand_primary is dark, black text on dark gradient is unreadable. If brand is light, contrast against white surface border may vanish.

### B. Active/Selected State Highlights (brand as tint + text)

Pattern: `background: C.primary + "22"` (low-alpha tint) + `border: C.primary + "55"` + `color: C.primary` (foreground text)

Used in:
- Sidebar nav active items (App.jsx, CustomerPortal, all portals)
- Tab selectors (Settings.js, AIChatbot.js)
- Card selections (CampaignsModule.js audience/schedule)
- Integration provider cards (Settings.js)
- Sequence/filter pills throughout

**Problem:** Brand color used simultaneously as both background tint and foreground text. If brand is too light, text is invisible on any surface.

### C. Text/Links (brand as foreground)

`color: C.primary` used for links, stat values, labels, active indicators in:
- AgentPortal.jsx (~25 sites: commissions, referral URLs, partner labels)
- Settings.js (~10 sites: plan names, webhook URLs, billing links)
- AIChatbot.js (~6 sites: temperature labels, personality names)
- CampaignsModule.js (~8 sites: checkmarks, counts, dates)
- ContactsModule.js, App.jsx, all portal files

**Problem:** On dark surfaces, light brand colors work. On light surfaces (light mode), they may lack contrast.

### D. Border Accents (brand as decorative border)

`borderLeft: 4px solid C.primary` or `border: 1px solid C.primary + "44"`

Used in:
- Tenant row left borders (TenantManagement)
- Sidebar active indicator (3px solid)
- Section containers, info cards

**Low risk:** Decorative borders don't require high contrast.

### E. Toggle Switches (brand as "on" state)

Background of toggle switch track set to `C.primary` when toggled on:
- AIChatbot.js (AI toggles)
- Settings.js (notification toggles, module toggles)
- WelcomeEmailSettings.jsx (email enable)
- BrandingEditor.jsx (powered_by toggle)

**Low risk:** White dot provides contrast regardless of brand color.

### F. Progress Bars and Charts

Solid `C.primary` fill in:
- SetupChecklist.jsx (onboarding progress)
- SequenceRoster.jsx (enrollment progress)
- AnalyticsDashboard.js (channel bars use hardcoded palette, not brand)

### G. Native Input Accents

`accentColor: C.primary` on range inputs and checkboxes:
- AIChatbot.js (sliders)
- CampaignsModule.js (bulk select)

**No risk:** Browser handles contrast for native controls.

### H. Stat Cards / Badges

`<Badge color={C.primary}>` and `<StatCard color={C.primary}>` in:
- App.jsx (platform overview stats)
- CampaignsModule.js (status badges)
- AgentPortal.jsx (commission stats)

These use brand color as both a tinted background and foreground text within the same badge — creating a brand-on-brand-tint pattern with no guaranteed contrast.

### I. Logo / Avatar Backgrounds

Gradient: `linear-gradient(135deg, C.primary, C.accent)` used for tenant logo placeholders:
- TenantManagement cards (App.jsx)
- BrandingEditor.jsx preview
- OnboardingWizard.jsx step 2

Low risk — these are decorative elements with initials text.

---

## Summary

| Usage Pattern | Count | Risk Level |
|---------------|-------|------------|
| Gradient buttons (brand as bg, #000 text) | ~25 | HIGH — dark brands unreadable |
| Active state highlights (brand as tint + text) | ~40 | MEDIUM — light brands invisible |
| Foreground text links/values | ~60 | MEDIUM — mode-dependent contrast |
| Decorative borders | ~15 | LOW |
| Toggle tracks | ~8 | LOW |
| Native input accents | ~5 | NONE (browser handles) |
| Progress bars | ~3 | LOW |
| Logo/avatar gradients | ~5 | LOW |

**Total brand color application sites: ~160+**
