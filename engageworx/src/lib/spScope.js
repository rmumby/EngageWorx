// src/lib/spScope.js — Single source of truth for the superadmin (SP) tenant-scope DEFAULT.
//
// Why this exists: several SA surfaces (viewLevel="sp") independently defaulted their tenant
// filter to "all tenants" (Contacts' spTenantFilter='all', Live Inbox's scopeOwnOnly=false,
// Campaigns/Flows with no scope at all). Because conversations/messages/contacts/flows/etc.
// carry a legitimate blanket superadmin RLS grant, an all-tenant UI default leaked live
// cross-tenant customer data into the SA view. The grant is correct; the UI default isn't.
//
// This module centralizes the rule — "an SP surface defaults to the SP tenant, never all-tenant;
// cross-tenant requires an explicit user action" — so every current and future SA surface
// inherits it and can't reintroduce the bleed. It does NOT dictate a control shape: surfaces keep
// their own selector (Contacts' per-tenant dropdown, the binary All/own toggles), and only the
// DEFAULT comes from here. RLS is never touched, and viewLevel="tenant" paths are unaffected.

export const ALL_TENANTS = 'all';

// The SP tenant id — single definition (dedupes the per-file CM_SP_TENANT_ID / LI_SP_TENANT_ID copies).
export const SP_TENANT_ID = process.env.REACT_APP_SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387';

// Per-user localStorage key — never key globally, so one user's "all" choice can't bleed into the
// next login on the shared portal.engwx.com host (mirrors the 46 Labs per-user theme keying).
export function spScopeKey(userId) {
  return 'ew_sp_scope_' + (userId || 'anon');
}

// ── Tenant-id-filter surfaces (a <select> whose value is a tenant_id or ALL_TENANTS) ──
// Returns the tenant_id to default-select. An explicit drill-down (currentTenantId) or saved
// preference always wins; otherwise an SP view defaults to the SP tenant — never all-tenant.
export function defaultScope({ viewLevel, currentTenantId, savedPref }) {
  if (currentTenantId) return currentTenantId;
  if (viewLevel === 'sp') return savedPref || SP_TENANT_ID;
  return null; // non-sp without a currentTenantId: no cross-tenant default (RLS contains it anyway)
}

// The tenant_id to apply as a query filter, or null = no filter (explicit all-tenant).
export function tenantFilter(scope) {
  return (!scope || scope === ALL_TENANTS) ? null : scope;
}

// ── Binary-toggle surfaces (All tenants / own only — Live Inbox, Campaigns, Flows) ──
// Should the surface default to own-tenant scope? Only the SP view defaults scoped (unless the
// user explicitly saved 'all'); csp/tenant keep their prior default — they're non-superadmin, so
// RLS already contains them and there's no bleed to fix.
export function spDefaultsToOwn(viewLevel, savedPref) {
  if (viewLevel !== 'sp') return false;
  return savedPref !== ALL_TENANTS && savedPref !== 'all';
}

// Resolve the tenant_id filter for a binary-toggle surface: a tenant_id, or null = all-tenant.
export function binaryScopeFilter({ scopeOwnOnly, viewLevel, currentTenantId }) {
  if (currentTenantId) return currentTenantId;            // tenant view or SP drilled into a tenant
  if (viewLevel === 'sp') return scopeOwnOnly ? SP_TENANT_ID : null; // own → SP tenant; all → no filter
  return currentTenantId || null;
}

export function readSavedScope(userId) {
  try { return localStorage.getItem(spScopeKey(userId)) || null; } catch (e) { return null; }
}
export function writeSavedScope(userId, value) {
  try { localStorage.setItem(spScopeKey(userId), value || ''); } catch (e) {}
}
