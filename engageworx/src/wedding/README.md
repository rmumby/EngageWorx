# Wedding Portal — `/weddings/:id` (first frontend page)

Coordinator-side dashboard for the wedding portal. No couple-side auth yet.

## What this lands

- `WeddingDashboard.jsx` — the `/weddings/:id` route component
- `WeddingPortalShell.jsx` — sidebar / freeze banner / topbar layout
- `useWedding.js` — single Supabase fetch hook
- `freeze.js` — pure freeze-state computation
- `derive.js` — pure To Do + Milestones derivation
- `wedding-portal.css` — visual port of `delamere-portal-v4-demo.html`, scoped under `.wp-root`
- `route-mount.example.jsx` — mount snippets for v5 / v6 (reference only)

Smoke test: `/weddings/aaaa0001-0000-0000-0000-000000000001` should render Vicky & Ryan's real data — couple name, 27 May 2026, 60 day guests + 61 evening, 7-of-8 suppliers confirmed, 72% plan complete, milestones, the works.

## Integration steps for Claude Code

1. **Drop the folder in.** Copy `src/wedding/*` into the CRA app's `src/` directory.
2. **Fix the supabase import.** `useWedding.js` imports from `'../supabaseClient'` — adjust to wherever the single shared client actually lives. Per EngageWorx §3, **never** call `createClient` here.
3. **Mount the route.** See `route-mount.example.jsx`. Use whichever react-router version is already in `package.json`.
4. **Verify column names match the live schema.** The fetch assumes:
   - `weddings(id, tenant_id, display_name, wedding_date, freeze_date, plan_pct, meta)`
   - `wedding_plans(wedding_id, ceremony, evening, guests)` — JSONB
   - `wedding_suppliers(wedding_id, status, ...)`
   - `wedding_menu_choices(wedding_id, item_name, ...)`
   - `wedding_venue_configs(tenant_id, freeze_weeks_before, venue_name?, venue_location?)`
   - `tenants(id, name, branding)`
   
   If any of these columns are named differently, update `useWedding.js` and `WeddingDashboard.jsx` together. The hook is the only place that touches the schema.
5. **Run it.** Load `/weddings/aaaa0001-0000-0000-0000-000000000001`.

## What's intentionally not done in this pass

- **Couple-side auth.** No magic-link gating yet. The page assumes the active Supabase session is either (a) a tenant member (coordinator) or (b) eventually a couple session — both are allowed by RLS. If neither, RLS returns nothing and the page shows the "not found / no access" branch cleanly.
- **Custom-domain routing.** `tenants.custom_domain` not consulted. When wired, the shell should refuse to render unless the request host matches.
- **Other nav routes** (Plan, Timings, Suppliers, Menu, Seating, Change Requests, Blog, Documents). All sidebar items except Dashboard are disabled buttons. Each becomes its own component in subsequent sessions.
- **AI Concierge.** Button is disabled. Endpoint and panel ship in a separate session.
- **Editing.** Read-only. The plan and timings editors come later; this first pass is "does the data load and render correctly."
- **Branding from `tenants.branding`.** The CSS uses hardcoded brand tokens. When multi-venue lands, these become per-tenant via inline CSS variables on `.wp-root`.

## Verified against the brief

- `weddings.display_name`, `wedding_date`, `freeze_date`, `plan_pct`, `meta` — used (brief §2)
- `wedding_plans.ceremony / evening / guests` JSONB — read with the keys from the seed (`registrar`, `ceremony_type`, `first_dance`, `sparkler_time`, `day_count`, `eve_count`, `colour_scheme`)
- Freeze state computation matches the demo (`open` / `warning` ≤14d / `frozen` ≥freeze_date) and the brief §6
- Vendor confidentiality: AI Concierge button uses neutral copy. No "Powered by Claude."
- No hardcoded couple/venue strings. Every visible piece of text comes from props or DB.
- Tenant-scoping: every query filters by `wedding_id` or `tenant_id`. RLS is the safety net.

## Per the EngageWorx build cadence

**One suggested optimization (Rob: in or defer):** wedding data fetched inside the component on every mount. Once a second wedding view ships, lift the fetch to a `WeddingProvider` context above the route so navigation between dashboard / plan / timings doesn't refetch. Defer until at least one more view is wired up — premature otherwise.

**One thing AI could streamline that's currently manual:** the To Do list and Key Milestones are currently derived by hand-coded heuristics in `derive.js` (registrar set → done, first dance empty → urgent, etc.). A small Claude call given the wedding state could produce a more nuanced, couple-specific list — "your photographer hasn't confirmed the rain plan yet," "you mentioned wanting a sparkler send-off but haven't given Emma a time" — and would adapt as the data shape evolves without code changes. Out of scope here, but worth a Sonnet endpoint when the couples-side experience matters more.
